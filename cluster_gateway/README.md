# Nyxus FastAPI Kubernetes runtime-manager boilerplate

## What it does

- Creates one agent Pod plus a private ClusterIP Service per runtime.
- Checks a configured active-Pod limit before creation.
- Lists and inspects runtime Pods, including readiness and restart counts.
- Forwards JSON to the agent's `POST /chat` endpoint once its Pod is Ready.
- Deletes runtime Pods and Services.
- Exposes Prometheus metrics at `/metrics`.

## Prerequisites

- A Kubernetes cluster and a namespace dedicated to agent Pods.
- An agent image that listens on `0.0.0.0:8000` and implements `GET /health` and `POST /chat`.
- The gateway must be able to resolve Kubernetes Service DNS; for this sample, run the gateway inside the cluster. A local gateway can manage the API with kubeconfig, but generally will not resolve `*.svc.cluster.local` or reach Pod networking by default.

## Setup for local development

```bash
kubectl apply -f agent-namespace-and-quota.yaml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export KUBE_CONTEXT=your-context-name
export AGENT_IMAGE=your-registry/nyxus-agent:v1
export AGENT_NAMESPACE=nyxus-agents
export MAX_ACTIVE_PODS=10
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

For the request-forwarding endpoint, run the FastAPI gateway inside the Kubernetes cluster (or adapt the target URL to a reachable private endpoint). The local process can still use a kubeconfig context to create resources, but Kubernetes Service DNS is normally only resolvable from inside the cluster.

## Apply RBAC for an in-cluster gateway

Adjust the ServiceAccount namespace in `gateway-rbac.yaml` to match where your gateway Deployment runs, then apply it:

```bash
kubectl apply -f gateway-rbac.yaml
```

Set `serviceAccountName: nyxus-gateway` on the gateway Deployment's Pod template. The gateway Deployment should run in the namespace used in the RoleBinding subject (the example uses `default`). The Role grants access to Pods and Services only in `nyxus-agents`.

## Try it

```bash
# Create a runtime
curl -X POST http://localhost:8000/runtimes \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"workspace-123"}'

# List agent Pods (copy runtime_id from create response)
curl http://localhost:8000/runtimes
curl http://localhost:8000/runtimes/RUNTIME_ID

# Send a request after the agent becomes Ready
curl -X POST http://localhost:8000/runtimes/RUNTIME_ID/requests \
  -H 'Content-Type: application/json' \
  -d '{"payload":{"message":"hello"}}'

# Request deletion
curl -X DELETE http://localhost:8000/runtimes/RUNTIME_ID

# Prometheus metrics
curl http://localhost:8000/metrics
```

## Important limitations

- The Python lock protects a single Uvicorn process only. Keep `--workers 1` for this demo; the Kubernetes ResourceQuota is the cluster-side backstop. For multiple replicas, implement atomic admission/locking in a shared store and keep the quota.
- The quota applies to all Pods in `nyxus-agents`; keep that namespace dedicated to agent Pods. The quota manifest hard-codes 10 Pods; change it with your desired limit.
- The sample forwards ordinary JSON request/response traffic, not streaming tokens or Socket.IO. Adapt `send_request` to your streaming protocol if your agents stream responses.
- Prometheus metrics with one label series per runtime are suitable only for a small demo; at larger scale, put per-runtime details in structured logs or a database and keep metric labels low-cardinality.
- Store workspace/runtime ownership durably and authenticate API callers before exposing this API. This sample is a starter, not a production-ready multi-tenant control plane.
