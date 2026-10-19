"""Canonical path resolution for the agent and its target repository."""
from pathlib import Path


AGENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = AGENT_DIR.parents[1]


def _resolve(path, default):
    resolved = default if path is None else Path(path)
    if not resolved.is_absolute():
        resolved = Path.cwd() / resolved
    return resolved.resolve()


def resolve_agent_dir(agent_dir=None):
    return _resolve(agent_dir, AGENT_DIR)


def resolve_repo_root(root=None):
    return _resolve(root, REPO_ROOT)
