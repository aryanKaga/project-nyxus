"""Check the gateway and request a workspace agent runtime."""

import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_USER_ID = "123"
DEFAULT_WORKSPACE_ID = "b56e9a20-688d-4bd9-9fe0-965541354be8"
DEFAULT_API_KEY = "abc@123"


def request_json(url, method="GET", payload=None, timeout=180):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
            return response.status, json.loads(response_body)
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(response_body)
        except json.JSONDecodeError:
            details = response_body
        return error.code, details


def main():
    parser = argparse.ArgumentParser(
        description="Check the cluster gateway and start or resume an agent Pod."
    )
    parser.add_argument(
        "--url",
        default=os.getenv("NYXUS_GATEWAY_URL", "http://127.0.0.1:5000"),
        help="Gateway base URL (default: %(default)s)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.getenv("NYXUS_GATEWAY_TIMEOUT", "180")),
        help="HTTP timeout in seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--user-id", default=os.getenv("NYXUS_USER_ID", DEFAULT_USER_ID)
    )
    parser.add_argument(
        "--workspace-id",
        default=os.getenv("NYXUS_WORKSPACE_ID", DEFAULT_WORKSPACE_ID),
    )
    parser.add_argument(
        "--api-key", default=os.getenv("NYXUS_API_KEY", DEFAULT_API_KEY)
    )
    args = parser.parse_args()

    missing = [
        name
        for name, value in (
            ("--user-id / NYXUS_USER_ID", args.user_id),
            ("--workspace-id / NYXUS_WORKSPACE_ID", args.workspace_id),
            ("--api-key / NYXUS_API_KEY", args.api_key),
        )
        if not value
    ]
    if missing:
        parser.error("provide " + ", ".join(missing))

    base_url = args.url.rstrip("/")
    gateway_responded = False
    try:
        status_code, runtimes = request_json(
            f"{base_url}/runtimes", timeout=args.timeout
        )
        gateway_responded = True
        print(f"GET /runtimes: HTTP {status_code}")
        if status_code < 200 or status_code >= 300:
            print(json.dumps(runtimes, indent=2))
            return 1
        print(
            f"Namespace: {runtimes.get('namespace')}; "
            f"active Pods: {runtimes.get('active_pod_count')}"
        )

        status_code, result = request_json(
            f"{base_url}/workspaces/resume",
            method="POST",
            payload={
                "user_id": args.user_id,
                "workspace_id": args.workspace_id,
                "api_key": args.api_key,
            },
            timeout=args.timeout,
        )
        print(f"POST /workspaces/resume: HTTP {status_code}")
        print(json.dumps(result, indent=2))

        if status_code < 200 or status_code >= 300:
            return 1
        resume = result.get("resume")
        if isinstance(resume, dict) and not resume.get("ok", False):
            return 1
        return 0
    except TimeoutError as error:
        if gateway_responded:
            print(
                f"Gateway responded, but the workspace-resume request exceeded "
                f"the {args.timeout:g}s timeout. It may still be waiting for the Pod to become ready.",
                file=sys.stderr,
            )
        else:
            print(f"Timed out connecting to gateway at {base_url}: {error}", file=sys.stderr)
        return 1
    except URLError as error:
        print(f"Could not reach gateway at {base_url}: {error}", file=sys.stderr)
        return 1
    except (ValueError, json.JSONDecodeError) as error:
        print(f"Gateway returned an invalid JSON response: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
