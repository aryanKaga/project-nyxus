"""Restore a previously uploaded workspace archive from persistent storage."""
from pathlib import Path

from ingestion.workspace_receiver import unpack_workspace_archive


def load_workspace(workspace_id, api_key, storage_root, store):
    document = store.get_workspace(api_key, workspace_id)
    if document is None:
        return None

    storage = Path(storage_root).resolve()
    workspace = (storage / workspace_id).resolve()
    try:
        workspace.relative_to(storage)
    except ValueError:
        return None
    if workspace.is_dir():
        return {
            "workspace_id": workspace_id,
            "workspace_path": workspace,
            "file_count": document["file_count"],
        }

    archive = store.read_workspace_archive(document)
    result = unpack_workspace_archive(
        archive,
        storage,
        workspace_id=workspace_id,
    )
    return {
        **result,
        "workspace_path": storage / workspace_id,
    }
