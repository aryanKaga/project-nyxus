import asyncio
from datetime import datetime, timezone
import hashlib
import logging
import os
from pathlib import Path
import threading
import time
import uuid
from typing import Any, Optional

from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, HTTPException, Response, status
from kubernetes import client, config
from kubernetes.client.exceptions import ApiException
from kubernetes.config.config_exception import ConfigException
from prometheus_client import Counter, Gauge, Histogram, make_asgi_app
from pydantic import BaseModel, Field
import socketio

# -------------------- Load Environment --------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "atlas-credentials.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cluster_gateway")

# -------------------- Configuration --------------------
NAMESPACE = (os.getenv("AGENT_NAMESPACE") or os.getenv("NAMESPACE") or "Nyxus").strip('\'"')
AGENT_IMAGE = (os.getenv("AGENT_IMAGE") or "nyxus-hybridbackend:latest").strip('\'"')
AGENT_PORT = int(os.getenv("AGENT_PORT") or os.getenv("PORT") or "3000")
MAX_ACTIVE_PODS = int(os.getenv("MAX_ACTIVE_PODS") or "10")
KUBE_CONTEXT = (os.getenv("KUBE_CONTEXT") or "").strip('\'" ') or None

AGENT_SECRET_NAME = (os.getenv("AGENT_SECRET_NAME") or "").strip('\'" ') or None
READY_TIMEOUT = float(os.getenv("READY_TIMEOUT") or "90")
RESUME_TIMEOUT = float(os.getenv("RESUME_TIMEOUT") or "30")
IDLE_TIMEOUT_SECONDS = float(os.getenv("IDLE_TIMEOUT_SECONDS") or "1200")  # 20 minutes idle timeout

GATEWAY_HOST = os.getenv("GATEWAY_HOST", "0.0.0.0")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", "5000"))

# -------------------- Fast API & Socket.IO Gateway --------------------
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    max_http_buffer_size=100 * 1024 * 1024,
)
app = FastAPI(title="Nyxus Cluster Gateway", version="0.4.0")
app.mount("/metrics", make_asgi_app())

CREATE_LOCK = threading.Lock()               # capacity check + create (global, short)
_KEY_LOCKS: dict[str, threading.Lock] = {}   # runtime_id -> lock (per workspace)
_KEY_LOCKS_GUARD = threading.Lock()          # protects _KEY_LOCKS itself
RESUMED: dict[str, tuple[str, int]] = {}     # runtime_id -> (pod_uid, restart_count)

# Mapping client connections to runtimes
# client_sid -> {"runtime_id": str, "user_id": str, "workspace_id": str, "api_key": str}
client_sessions: dict[str, dict[str, str]] = {}
# runtime_id -> set of client_sids
runtime_clients: dict[str, set[str]] = {}
# runtime_id -> socketio.AsyncClient
upstream_agents: dict[str, socketio.AsyncClient] = {}
_upstream_locks: dict[str, asyncio.Lock] = {}
# runtime_id -> epoch timestamp of last active interaction
runtime_last_active: dict[str, float] = {}


def touch_runtime_activity(runtime_id: str) -> None:
    if runtime_id:
        runtime_last_active[runtime_id] = time.time()

# -------------------- Metrics --------------------
AGENT_REQUESTS = Counter(
    "nyxus_agent_requests_total", "Requests forwarded to agents", ["runtime_id", "outcome"]
)
AGENT_REQUEST_DURATION = Histogram(
    "nyxus_agent_request_duration_seconds", "Agent response time", ["runtime_id"]
)
ACTIVE_AGENT_PODS = Gauge("nyxus_active_agent_pods", "Non-terminal Nyxus agent Pods")
PODS_CREATED = Counter("nyxus_agent_pods_created_total", "Agent Pod creation attempts")
RESUMES = Counter("nyxus_workspace_resumes_total", "workspace_resume calls", ["outcome"])

# -------------------- Kubernetes client --------------------
_core_api: Optional[client.CoreV1Api] = None


def get_core_api() -> client.CoreV1Api:
    global _core_api
    if _core_api is not None:
        return _core_api
    try:
        if os.getenv("KUBERNETES_SERVICE_HOST"):
            config.load_incluster_config()
        else:
            config.load_kube_config(context=KUBE_CONTEXT)
        _core_api = client.CoreV1Api()
        # Loading credentials only prepares the client; make a harmless API
        # request so we know the configured cluster is reachable before using it.
        _core_api.get_api_resources()
        logger.info("Successfully connected to Kubernetes cluster%s", f" using context {KUBE_CONTEXT}" if KUBE_CONTEXT else "")
        return _core_api
    except Exception as exc:
        raise HTTPException(
            503, f"Could not load Kubernetes credentials or connect to cluster: {exc}"
        )


class LazyCoreApi:
    def __getattr__(self, name):
        return getattr(get_core_api(), name)


core = LazyCoreApi()


# -------------------- Models --------------------
class WorkspaceRef(BaseModel):
    user_id: str = Field(min_length=1, max_length=200)
    workspace_id: str = Field(min_length=1, max_length=200)
    api_key: str = Field(default="default", min_length=1)


class WorkspaceRequest(WorkspaceRef):
    payload: dict[str, Any] = Field(default_factory=dict)


# -------------------- Identity / mapping --------------------
def authenticate(ref: WorkspaceRef) -> None:
    if not ref.api_key.strip():
        raise HTTPException(401, "Invalid API key.")


def runtime_id_for(user_id: str, workspace_id: str) -> str:
    """Deterministic: same (user, workspace) -> same runtime_id."""
    return hashlib.sha256(f"{user_id}\x00{workspace_id}".encode()).hexdigest()[:32]


def key_lock(runtime_id: str) -> threading.Lock:
    with _KEY_LOCKS_GUARD:
        return _KEY_LOCKS.setdefault(runtime_id, threading.Lock())


def runtime_labels(runtime_id: str) -> dict[str, str]:
    return {"app": "nyxus-agent", "runtime-id": runtime_id}


# -------------------- Pod helpers --------------------
def runtime_pods() -> list[client.V1Pod]:
    return core.list_namespaced_pod(namespace=NAMESPACE, label_selector="app=nyxus-agent").items


def is_active(pod: client.V1Pod) -> bool:
    return (pod.status.phase if pod.status else None) not in ("Succeeded", "Failed")


def is_terminating(pod: client.V1Pod) -> bool:
    return pod.metadata.deletion_timestamp is not None


def pod_is_ready(pod: client.V1Pod) -> bool:
    conditions = (pod.status.conditions or []) if pod.status else []
    return any(c.type == "Ready" and c.status == "True" for c in conditions)


def restart_total(pod: client.V1Pod) -> int:
    statuses = (pod.status.container_statuses or []) if pod.status else []
    return sum(s.restart_count for s in statuses)


def count_active_pods() -> int:
    try:
        return sum(1 for p in runtime_pods() if is_active(p) and not is_terminating(p))
    except Exception:
        return 0


def _gauge_value() -> float:
    try:
        return count_active_pods()
    except Exception:
        return float("nan")


ACTIVE_AGENT_PODS.set_function(_gauge_value)


def serialize_pod(pod: client.V1Pod) -> dict[str, Any]:
    return {
        "pod_name": pod.metadata.name,
        "pod_uid": pod.metadata.uid,
        "runtime_id": (pod.metadata.labels or {}).get("runtime-id"),
        "phase": pod.status.phase if pod.status else None,
        "ready": pod_is_ready(pod),
        "node": pod.spec.node_name if pod.spec else None,
        "pod_ip": pod.status.pod_ip if pod.status else None,
        "created_at": (
            pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None
        ),
        "restart_count": restart_total(pod),
    }


def _delete_pod_safely(pod_name: str) -> None:
    try:
        core.delete_namespaced_pod(
            name=pod_name,
            namespace=NAMESPACE,
            propagation_policy="Background",
            grace_period_seconds=0,
        )
        logger.info("Deleted pod %s", pod_name)
    except ApiException as exc:
        if exc.status != 404:
            logger.warning("Failed to delete pod %s: %s", pod_name, exc)


def check_container_fatal_state(pod: client.V1Pod) -> str | None:
    """Detect unrecoverable container startup failures early without waiting for timeout."""
    statuses = (pod.status.container_statuses or []) if pod.status else []
    for s in statuses:
        if s.state:
            if s.state.waiting and s.state.waiting.reason in (
                "CrashLoopBackOff",
                "ImagePullBackOff",
                "ErrImagePull",
                "CreateContainerConfigError",
                "InvalidImageName",
            ):
                return f"{s.state.waiting.reason}: {s.state.waiting.message or 'container failed to start'}"
            if s.state.terminated and s.state.terminated.exit_code != 0:
                msg = s.state.terminated.message or s.state.terminated.reason or "unknown"
                return f"Container {s.name} terminated with exit code {s.state.terminated.exit_code} ({msg})"
    return None


def probe_pod_readiness(pod_ip: str) -> tuple[int, dict[str, Any] | None]:
    """Perform a direct check against the pod's /ready endpoint."""
    try:
        with httpx.Client(timeout=1.0) as client_http:
            resp = client_http.get(f"http://{pod_ip}:{AGENT_PORT}/ready")
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            return resp.status_code, data
    except Exception:
        return 0, None


def pod_age_seconds(pod: client.V1Pod) -> float:
    if pod.metadata and pod.metadata.creation_timestamp:
        now = datetime.now(timezone.utc)
        return (now - pod.metadata.creation_timestamp).total_seconds()
    return 0.0


def find_usable_pod(runtime_id: str) -> client.V1Pod | None:
    pods = core.list_namespaced_pod(
        namespace=NAMESPACE, label_selector=f"app=nyxus-agent,runtime-id={runtime_id}"
    ).items
    live = []
    for p in pods:
        if is_terminating(p):
            continue
        if not is_active(p):
            _delete_pod_safely(p.metadata.name)
            continue

        # If pod has fatal container state (CrashLoop, etc.), clean it up
        if check_container_fatal_state(p):
            logger.warning("Cleaning up pod %s with fatal container error", p.metadata.name)
            _delete_pod_safely(p.metadata.name)
            continue

        # If pod is older than READY_TIMEOUT and is STILL not ready, it is a stuck zombie pod
        if not pod_is_ready(p) and pod_age_seconds(p) > READY_TIMEOUT:
            logger.warning(
                "Cleaning up stale unready pod %s (age %.1fs > %ss)",
                p.metadata.name,
                pod_age_seconds(p),
                READY_TIMEOUT,
            )
            _delete_pod_safely(p.metadata.name)
            continue

        live.append(p)

    live.sort(key=lambda p: p.metadata.creation_timestamp, reverse=True)
    return live[0] if live else None


def agent_base_url(pod: client.V1Pod) -> str:
    ip = pod.status.pod_ip if pod.status else None
    if not ip:
        raise HTTPException(503, "Agent Pod has no IP yet.")
    return f"http://{ip}:{AGENT_PORT}"


def create_pod(ref: WorkspaceRef, runtime_id: str) -> None:
    current = count_active_pods()
    if current >= MAX_ACTIVE_PODS:
        raise HTTPException(429, f"Agent capacity reached ({current}/{MAX_ACTIVE_PODS} active Pods).")

    name = f"agent-{runtime_id[:12]}-{uuid.uuid4().hex[:5]}"
    env = [
        client.V1EnvVar(name="CONTAINER_WORKSPACE_ID", value=ref.workspace_id),
        client.V1EnvVar(name="CONTAINER_USER_ID", value=ref.user_id),
        client.V1EnvVar(name="WORKSPACE_ID", value=ref.workspace_id),
        client.V1EnvVar(name="USER_ID", value=ref.user_id),
        client.V1EnvVar(name="RUNTIME_ID", value=runtime_id),
        client.V1EnvVar(name="PORT", value=str(AGENT_PORT)),
        client.V1EnvVar(name="NYXUS_PORT", value=str(AGENT_PORT)),
        client.V1EnvVar(name="NYXUS_HOST", value="0.0.0.0"),
        client.V1EnvVar(name="NYXUS_API_KEY", value=ref.api_key),
    ]

    env_from = []
    if AGENT_SECRET_NAME:
        env_from.append(
            client.V1EnvFromSource(secret_ref=client.V1SecretEnvSource(name=AGENT_SECRET_NAME))
        )
    else:
        # Fallback to local environment credentials if secret is omitted
        if os.getenv("MONGODB_URI"):
            env.append(client.V1EnvVar(name="MONGODB_URI", value=os.getenv("MONGODB_URI")))
        if os.getenv("GOOGLE_API_KEY"):
            env.append(client.V1EnvVar(name="GOOGLE_API_KEY", value=os.getenv("GOOGLE_API_KEY")))

    pod = client.V1Pod(
        metadata=client.V1ObjectMeta(
            name=name,
            labels=runtime_labels(runtime_id),
            annotations={"nyxus/workspace-id": ref.workspace_id, "nyxus/user-id": ref.user_id},
        ),
        spec=client.V1PodSpec(
            restart_policy="Always",
            containers=[
                client.V1Container(
                    name="agent",
                    image=AGENT_IMAGE,
                    image_pull_policy="IfNotPresent",
                    ports=[client.V1ContainerPort(container_port=AGENT_PORT, name="http-socketio")],
                    env=env,
                    env_from=env_from if env_from else None,
                    resources=client.V1ResourceRequirements(
                        requests={"cpu": "50m", "memory": "128Mi"},
                        limits={"cpu": "2000m", "memory": "4Gi"},
                    ),
                    liveness_probe=client.V1Probe(
                        http_get=client.V1HTTPGetAction(path="/live", port=AGENT_PORT),
                        initial_delay_seconds=10,
                        period_seconds=10,
                    ),
                    readiness_probe=client.V1Probe(
                        http_get=client.V1HTTPGetAction(path="/ready", port=AGENT_PORT),
                        initial_delay_seconds=5,
                        period_seconds=5,
                    ),
                )
            ],
        ),
    )
    PODS_CREATED.inc()
    try:
        core.create_namespaced_pod(namespace=NAMESPACE, body=pod)
        logger.info("Created agent pod %s for runtime %s", name, runtime_id)
    except ApiException as exc:
        body = (exc.body or str(exc)).lower()
        if exc.status == 403 and "exceeded quota" in body:
            raise HTTPException(429, "Kubernetes agent Pod quota reached.") from exc
        raise HTTPException(
            exc.status if exc.status and 400 <= exc.status < 600 else 502,
            exc.body or "Kubernetes API error while creating runtime.",
        ) from exc


def wait_until_ready(runtime_id: str) -> client.V1Pod:
    deadline = time.monotonic() + READY_TIMEOUT
    last_pod = None
    while time.monotonic() < deadline:
        pod = find_usable_pod(runtime_id)
        if not pod:
            break
        last_pod = pod
        if pod_is_ready(pod) and pod.status.pod_ip:
            return pod

        # 1. Fast fail on container crash / image pull failure
        fatal_msg = check_container_fatal_state(pod)
        if fatal_msg:
            _delete_pod_safely(pod.metadata.name)
            raise HTTPException(502, f"Agent Pod container failed: {fatal_msg}")

        # 2. If pod has an IP and is running, query /ready for fast failure (e.g. Workspace not found)
        if pod.status and pod.status.pod_ip:
            status_code, resp_data = probe_pod_readiness(pod.status.pod_ip)
            if status_code == 404:
                err_detail = (resp_data or {}).get("error") or "Workspace not found in MongoDB."
                _delete_pod_safely(pod.metadata.name)
                raise HTTPException(404, f"Workspace not found: {err_detail}")
            elif status_code == 500 and resp_data and "NOT_FOUND" in str(resp_data.get("error", "")):
                _delete_pod_safely(pod.metadata.name)
                raise HTTPException(404, f"Workspace not found: {resp_data.get('error')}")

        time.sleep(1)

    # If we timed out, clean up the stuck pod so next request won't inherit it
    if last_pod:
        logger.warning(
            "Agent Pod %s did not become ready within %ss; deleting stuck pod.",
            last_pod.metadata.name,
            READY_TIMEOUT,
        )
        _delete_pod_safely(last_pod.metadata.name)

    raise HTTPException(504, f"Agent Pod did not become ready within {READY_TIMEOUT}s.")


def ensure_runtime(ref: WorkspaceRef, force_resume: bool = False) -> tuple[client.V1Pod, bool, dict | None]:
    runtime_id = runtime_id_for(ref.user_id, ref.workspace_id)
    with key_lock(runtime_id):
        if force_resume:
            existing = find_usable_pod(runtime_id)
            if existing:
                _delete_pod_safely(existing.metadata.name)

        created = False
        if find_usable_pod(runtime_id) is None:
            with CREATE_LOCK:
                create_pod(ref, runtime_id)
            created = True

        pod = wait_until_ready(runtime_id)
        touch_runtime_activity(runtime_id)
        return pod, created, None


# -------------------- Upstream Agent Pod Client --------------------
async def get_or_connect_agent(runtime_id: str, pod: client.V1Pod) -> socketio.AsyncClient:
    """Maintain an active Socket.IO connection to the agent Pod and relay events downstream."""
    lock = _upstream_locks.setdefault(runtime_id, asyncio.Lock())
    async with lock:
        existing = upstream_agents.get(runtime_id)
        if existing and existing.connected:
            return existing

        agent_sio = socketio.AsyncClient(reconnection=True, logger=False)

        # Event names that the agent server emits to clients
        FORWARD_EVENTS = [
            "assistant_start",
            "assistant_progress",
            "assistant_chunk",
            "flow_event",
            "architecture_diagram",
            "agent_trace",
            "readme_answer",
            "assistant_end",
            "assistant_error",
        ]

        for event_name in FORWARD_EVENTS:
            def _bind_forwarder(evt):
                async def forward_to_clients(data=None):
                    clients = list(runtime_clients.get(runtime_id, set()))
                    for client_sid in clients:
                        try:
                            await sio.emit(evt, data, to=client_sid)
                        except Exception:
                            pass
                return forward_to_clients

            agent_sio.on(event_name, _bind_forwarder(event_name))

        base_url = agent_base_url(pod)
        logger.info("Connecting gateway to agent pod at %s for runtime %s...", base_url, runtime_id)
        for attempt in range(4):
            try:
                await agent_sio.connect(base_url, wait_timeout=10)
                break
            except Exception as exc:
                if attempt == 3:
                    raise HTTPException(502, f"Could not connect to agent pod at {base_url}: {exc}")
                await asyncio.sleep(1.5)

        upstream_agents[runtime_id] = agent_sio
        return agent_sio


# -------------------- Socket.IO Gateway Event Handlers --------------------
@sio.on("connect")
async def gateway_connect(sid, environ, auth=None):
    logger.info("Client connected to Gateway: %s", sid)
    return True


@sio.on("disconnect")
async def gateway_disconnect(sid, *args):
    logger.info("Client disconnected from Gateway: %s", sid)
    session = client_sessions.pop(sid, None)
    if session:
        runtime_id = session.get("runtime_id")
        if runtime_id and runtime_id in runtime_clients:
            runtime_clients[runtime_id].discard(sid)
            if not runtime_clients[runtime_id]:
                runtime_clients.pop(runtime_id, None)
            touch_runtime_activity(runtime_id)


@sio.on("workspace_resume")
async def gateway_workspace_resume(sid, data):
    """Client asks to resume a workspace session."""
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid request payload."}

    user_id = data.get("user_id") or data.get("userId")
    workspace_id = data.get("workspace_id") or data.get("workspaceId")
    api_key = data.get("apiKey") or data.get("apikey") or user_id or "default"

    if not user_id or not workspace_id:
        return {"ok": False, "error": "user_id and workspace_id are required."}

    ref = WorkspaceRef(user_id=user_id, workspace_id=workspace_id, api_key=api_key)
    runtime_id = runtime_id_for(ref.user_id, ref.workspace_id)
    touch_runtime_activity(runtime_id)

    # Register client mapping
    client_sessions[sid] = {
        "runtime_id": runtime_id,
        "user_id": user_id,
        "workspace_id": workspace_id,
        "api_key": api_key,
    }
    runtime_clients.setdefault(runtime_id, set()).add(sid)

    try:
        # 1. Ensure Pod is running and ready
        pod, created, _ = await asyncio.to_thread(ensure_runtime, ref)

        # 2. Connect to agent Pod over Socket.IO
        agent_client = await get_or_connect_agent(runtime_id, pod)

        # 3. Call workspace_resume on the agent pod
        ack = await agent_client.call("workspace_resume", data, timeout=RESUME_TIMEOUT)
        if not isinstance(ack, dict):
            ack = {"ok": False, "error": "Invalid acknowledgment from agent pod."}

        ack["runtime_id"] = runtime_id
        ack["pod_created"] = created
        RESUMES.labels("ok" if ack.get("ok") else "rejected").inc()
        return ack
    except Exception as exc:
        RESUMES.labels("unreachable").inc()
        logger.exception("Error resuming workspace in gateway")
        return {"ok": False, "error": f"Failed to resume workspace pod: {exc}"}


@sio.on("chat")
async def gateway_chat(sid, data):
    print('sid is',sid,'and data is',data)
    """Client sends a chat message."""
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid chat request."}

    session = client_sessions.get(sid)
    runtime_id = session.get("runtime_id") if session else None

    # Fallback to payload identifiers if session isn't registered
    if not runtime_id:
        user_id = data.get("user_id")
        workspace_id = data.get("workspace_id")
        if user_id and workspace_id:
            runtime_id = runtime_id_for(user_id, workspace_id)
            api_key = data.get("apiKey") or user_id or "default"
            client_sessions[sid] = {
                "runtime_id": runtime_id,
                "user_id": user_id,
                "workspace_id": workspace_id,
                "api_key": api_key,
            }
            print(client_sessions[sid])
            runtime_clients.setdefault(runtime_id, set()).add(sid)

    if not runtime_id:
        return {"ok": False, "error": "Workspace is not resumed yet. Emit workspace_resume first."}

    touch_runtime_activity(runtime_id)
    try:
        pod = find_usable_pod(runtime_id)
        if not pod or not pod_is_ready(pod):
            user_id = session.get("user_id") if session else data.get("user_id", "")
            workspace_id = session.get("workspace_id") if session else data.get("workspace_id", "")
            api_key = session.get("api_key") if session else data.get("apiKey", "default")
            ref = WorkspaceRef(user_id=user_id, workspace_id=workspace_id, api_key=api_key)
            pod, _, _ = await asyncio.to_thread(ensure_runtime, ref)
        print('found pod and now sending request')
        agent_client = await get_or_connect_agent(runtime_id, pod)
        ack = await agent_client.call("chat", data, timeout=30)
        return ack
    except Exception as exc:
        logger.exception("Error forwarding chat request to agent pod")
        return {"ok": False, "error": f"Agent connection failed: {exc}"}


@sio.on("workspace_archive")
async def gateway_workspace_archive(sid, data):
    """Client uploads a zipped workspace archive."""
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid archive request."}

    user_id = data.get("user_id") or data.get("userId")
    workspace_id = data.get("workspace_id") or data.get("workspaceId")
    api_key = data.get("apiKey") or user_id or "default"

    if not user_id or not workspace_id:
        return {"ok": False, "error": "user_id and workspace_id are required."}

    ref = WorkspaceRef(user_id=user_id, workspace_id=workspace_id, api_key=api_key)
    runtime_id = runtime_id_for(ref.user_id, ref.workspace_id)
    touch_runtime_activity(runtime_id)

    client_sessions[sid] = {
        "runtime_id": runtime_id,
        "user_id": user_id,
        "workspace_id": workspace_id,
        "api_key": api_key,
    }
    runtime_clients.setdefault(runtime_id, set()).add(sid)

    try:
        pod, _, _ = await asyncio.to_thread(ensure_runtime, ref)
        agent_client = await get_or_connect_agent(runtime_id, pod)
        ack = await agent_client.call("workspace_archive", data, timeout=60)
        return ack
    except Exception as exc:
        logger.exception("Error forwarding workspace archive")
        return {"ok": False, "error": f"Failed to upload workspace archive: {exc}"}


@sio.on("architecture_diagram_status")
async def gateway_architecture_diagram_status(sid, data):
    """Client notifies rendering status of architecture diagram."""
    session = client_sessions.get(sid)
    if session and session.get("runtime_id"):
        agent_client = upstream_agents.get(session["runtime_id"])
        if agent_client and agent_client.connected:
            try:
                return await agent_client.call("architecture_diagram_status", data, timeout=10)
            except Exception:
                pass
    return {"ok": True}


# -------------------- REST API Endpoints --------------------
@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "gateway_version": "0.4.0",
        "namespace": NAMESPACE,
        "active_pods": count_active_pods(),
        "active_clients": len(client_sessions),
    }


@app.post("/workspaces/resume")
async def resume_workspace_rest(ref: WorkspaceRef) -> dict[str, Any]:
    """HTTP endpoint to spawn/resume a workspace Pod and get its connection info."""
    authenticate(ref)
    pod, created, _ = await asyncio.to_thread(ensure_runtime, ref)
    runtime_id = runtime_id_for(ref.user_id, ref.workspace_id)
    agent_client = await get_or_connect_agent(runtime_id, pod)
    ack = await agent_client.call(
        "workspace_resume",
        {"workspace_id": ref.workspace_id, "user_id": ref.user_id, "apiKey": ref.api_key},
        timeout=RESUME_TIMEOUT,
    )
    return {
        "runtime_id": runtime_id,
        "pod_created": created,
        "pod": serialize_pod(pod),
        "agent_url": agent_base_url(pod),
        "resume": ack,
    }


@app.post("/workspaces/requests")
async def send_request_rest(req: WorkspaceRequest) -> dict[str, Any]:
    """HTTP endpoint to forward a payload to the agent's POST /chat endpoint."""
    authenticate(req)
    runtime_id = runtime_id_for(req.user_id, req.workspace_id)
    pod, created, _ = await asyncio.to_thread(ensure_runtime, req)

    body = {
        **req.payload,
        "workspace_id": req.workspace_id,
        "user_id": req.user_id,
        "apiKey": req.api_key,
    }
    if "prompt" not in body and "message" in body:
        body["prompt"] = body["message"]

    target = f"{agent_base_url(pod)}/chat"
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=120.0) as http:
            response = await http.post(target, json=body)
        AGENT_REQUEST_DURATION.labels(runtime_id).observe(time.perf_counter() - started)
        if not response.is_success:
            AGENT_REQUESTS.labels(runtime_id, "agent_error").inc()
            raise HTTPException(502, f"Agent returned HTTP {response.status_code}: {response.text[:500]}")
        AGENT_REQUESTS.labels(runtime_id, "success").inc()
        try:
            result = response.json()
        except ValueError:
            result = {"text": response.text}
        return {
            "runtime_id": runtime_id,
            "pod_created": created,
            "result": result,
        }
    except httpx.RequestError as exc:
        AGENT_REQUESTS.labels(runtime_id, "connection_error").inc()
        raise HTTPException(502, f"Could not reach agent: {exc}") from exc


@app.get("/runtimes")
def list_runtimes() -> dict[str, Any]:
    pods = runtime_pods()
    active = sum(1 for p in pods if is_active(p) and not is_terminating(p))
    return {
        "namespace": NAMESPACE,
        "active_pod_count": active,
        "max_active_pods": MAX_ACTIVE_PODS,
        "runtimes": [serialize_pod(p) for p in pods],
    }


@app.get("/runtimes/{runtime_id}")
def get_runtime(runtime_id: str) -> dict[str, Any]:
    pod = find_usable_pod(runtime_id)
    if not pod:
        raise HTTPException(404, "Runtime Pod not found.")
    return serialize_pod(pod)


@app.delete("/runtimes/{runtime_id}")
async def delete_runtime(runtime_id: str) -> dict[str, str]:
    """Delete the agent Pod(s) and close upstream connection."""
    with key_lock(runtime_id):
        pods = core.list_namespaced_pod(
            namespace=NAMESPACE, label_selector=f"app=nyxus-agent,runtime-id={runtime_id}"
        ).items
        if not pods:
            raise HTTPException(404, "Runtime Pod not found.")
        try:
            for p in pods:
                core.delete_namespaced_pod(
                    name=p.metadata.name, namespace=NAMESPACE, propagation_policy="Foreground"
                )
        except ApiException as exc:
            raise HTTPException(
                exc.status if exc.status and 400 <= exc.status < 600 else 502,
                exc.body or "Kubernetes API error while deleting runtime.",
            ) from exc

        agent_sio = upstream_agents.pop(runtime_id, None)
        if agent_sio and agent_sio.connected:
            await agent_sio.disconnect()
        runtime_last_active.pop(runtime_id, None)
        RESUMED.pop(runtime_id, None)

    return {"runtime_id": runtime_id, "status": "deletion_requested"}


# -------------------- Idle Pod Reaper --------------------
async def idle_pod_reaper_loop() -> None:
    """Periodically monitors agent pods and deletes any pod idle for >= IDLE_TIMEOUT_SECONDS."""
    logger.info(
        "Idle pod reaper initialized (timeout: %.0fs / %.1fm)",
        IDLE_TIMEOUT_SECONDS,
        IDLE_TIMEOUT_SECONDS / 60,
    )
    while True:
        try:
            await asyncio.sleep(60)
            now = time.time()
            pods = await asyncio.to_thread(runtime_pods)
            for pod in pods:
                if is_terminating(pod):
                    continue
                labels = pod.metadata.labels or {}
                runtime_id = labels.get("runtime-id")
                if not runtime_id:
                    continue

                # If there are active client WebSocket connections to this runtime, update activity and skip
                if runtime_clients.get(runtime_id):
                    touch_runtime_activity(runtime_id)
                    continue

                last_active = runtime_last_active.get(runtime_id)
                if last_active is None:
                    # Fallback to pod creation timestamp or now
                    if pod.metadata and pod.metadata.creation_timestamp:
                        last_active = pod.metadata.creation_timestamp.timestamp()
                    else:
                        last_active = now
                    runtime_last_active[runtime_id] = last_active

                idle_duration = now - last_active
                if idle_duration >= IDLE_TIMEOUT_SECONDS:
                    logger.info(
                        "Idle reaper: pod %s (runtime %s) idle for %.0fs (>= %ss); deleting pod.",
                        pod.metadata.name,
                        runtime_id,
                        idle_duration,
                        IDLE_TIMEOUT_SECONDS,
                    )
                    with key_lock(runtime_id):
                        await asyncio.to_thread(_delete_pod_safely, pod.metadata.name)
                        agent_sio = upstream_agents.pop(runtime_id, None)
                        if agent_sio and agent_sio.connected:
                            try:
                                await agent_sio.disconnect()
                            except Exception:
                                pass
                        runtime_last_active.pop(runtime_id, None)
                        RESUMED.pop(runtime_id, None)
        except Exception:
            logger.exception("Unexpected error in idle_pod_reaper_loop")


@app.on_event("startup")
async def on_gateway_startup():
    asyncio.create_task(idle_pod_reaper_loop())


# -------------------- ASGI App Mount --------------------
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(asgi_app, host=GATEWAY_HOST, port=GATEWAY_PORT)
