# Directory Creation Behavior

The system automatically creates necessary directories—even if they do not exist—using `parents=True, exist_ok=True` (`server.py:79`). This behavior serves two key purposes:

1. **Guaranteed File Creation**: Python's `.touch()` method fails with a `FileNotFoundError` if the parent directory (such as `.workspace-activity/`) is missing from the disk. Creating the directory first ensures the target path is valid before the marker file is touched.
2. **Resilience & Fresh State**: Because workspaces can be created dynamically, storage volumes can be ephemeral, and background cleanup processes may occasionally prune the `.workspace-activity` folder or empty subdirectories, on-the-fly creation ensures that touching a workspace never crashes due to a missing folder structure.