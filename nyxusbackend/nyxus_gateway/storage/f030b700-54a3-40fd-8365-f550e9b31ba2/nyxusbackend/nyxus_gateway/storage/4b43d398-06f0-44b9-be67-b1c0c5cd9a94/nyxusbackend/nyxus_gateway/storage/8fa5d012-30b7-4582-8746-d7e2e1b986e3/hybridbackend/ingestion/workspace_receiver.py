import io
import os
import shutil
import stat
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath


MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024


class ArchiveError(ValueError):
    pass


def _safe_member_path(root, name):
    if not name or "\x00" in name or "\\" in name:
        raise ArchiveError("The archive contains an invalid path.")

    member = PurePosixPath(name)
    if member.is_absolute() or any(part in ("", ".", "..") for part in member.parts):
        raise ArchiveError("The archive contains a path outside the workspace.")

    destination = root.joinpath(*member.parts)
    if os.path.commonpath((str(root), str(destination))) != str(root):
        raise ArchiveError("The archive contains a path outside the workspace.")
    return destination


def unpack_workspace_archive(archive_bytes, storage_root, workspace_id=None):
    if not isinstance(archive_bytes, bytes) or not archive_bytes:
        raise ArchiveError("A non-empty ZIP archive is required.")
    if len(archive_bytes) > MAX_ARCHIVE_BYTES:
        raise ArchiveError("The compressed workspace is larger than the server limit.")

    storage = Path(storage_root).resolve()
    storage.mkdir(parents=True, exist_ok=True)
    workspace_id = workspace_id or str(uuid.uuid4())
    try:
        if str(uuid.UUID(workspace_id)) != workspace_id:
            raise ValueError
    except (AttributeError, TypeError, ValueError) as error:
        raise ArchiveError("The workspace id is invalid.") from error
    temporary_root = Path(tempfile.mkdtemp(prefix=".upload-", dir=storage))
    final_root = storage / workspace_id
    if final_root.exists():
        shutil.rmtree(temporary_root, ignore_errors=True)
        raise ArchiveError("The workspace already exists in local storage.")

    try:
        try:
            archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
        except (OSError, zipfile.BadZipFile) as error:
            raise ArchiveError("The uploaded workspace is not a valid ZIP archive.") from error

        with archive:
            entries = archive.infolist()
            unpacked_size = sum(entry.file_size for entry in entries)
            if unpacked_size > MAX_UNPACKED_BYTES:
                raise ArchiveError("The uncompressed workspace is larger than the server limit.")

            seen_paths = set()
            symlink_entries = []
            file_count = 0
            for entry in entries:
                destination = _safe_member_path(temporary_root, entry.filename)
                relative = destination.relative_to(temporary_root).as_posix()
                if relative in seen_paths:
                    raise ArchiveError("The archive contains duplicate file paths.")
                seen_paths.add(relative)
                if entry.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue

                mode = entry.external_attr >> 16
                if stat.S_ISLNK(mode):
                    symlink_entries.append((entry, destination))
                    continue

                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry) as source, destination.open("wb") as target:
                    shutil.copyfileobj(source, target)
                permissions = mode & 0o777
                if permissions:
                    destination.chmod(permissions)
                file_count += 1

            for entry, destination in symlink_entries:
                target = archive.read(entry).decode("utf-8")
                if not target or os.path.isabs(target) or "\x00" in target or "\\" in target:
                    raise ArchiveError("The archive contains an unsafe symbolic link.")
                resolved_target = (destination.parent / target).resolve()
                if os.path.commonpath((str(temporary_root), str(resolved_target))) != str(temporary_root):
                    raise ArchiveError("The archive contains a symbolic link outside the workspace.")
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.symlink_to(target)
                file_count += 1

        temporary_root.rename(final_root)
        return {"workspace_id": workspace_id, "file_count": file_count}
    except Exception:
        shutil.rmtree(temporary_root, ignore_errors=True)
        raise
