import io
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from workspace_receiver import ArchiveError, unpack_workspace_archive


def make_zip(entries):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        for name, contents, *mode in entries:
            info = zipfile.ZipInfo(name)
            if mode:
                info.external_attr = mode[0] << 16
            archive.writestr(info, contents)
    return stream.getvalue()


class WorkspaceReceiverTests(unittest.TestCase):
    def test_unpacks_files_to_a_new_workspace_directory(self):
        with tempfile.TemporaryDirectory() as storage:
            result = unpack_workspace_archive(
                make_zip([("src/app.js", b"hello"), (".gitignore", b"node_modules/")]),
                storage,
            )

            workspace = Path(storage) / result["workspace_id"]
            self.assertEqual((workspace / "src/app.js").read_bytes(), b"hello")
            self.assertEqual((workspace / ".gitignore").read_bytes(), b"node_modules/")
            self.assertEqual(result["file_count"], 2)

    def test_rejects_paths_that_escape_the_workspace(self):
        with tempfile.TemporaryDirectory() as storage:
            with self.assertRaisesRegex(ArchiveError, "outside the workspace"):
                unpack_workspace_archive(make_zip([("../outside.txt", b"no")]), storage)

    def test_rejects_corrupt_archives(self):
        with tempfile.TemporaryDirectory() as storage:
            with self.assertRaisesRegex(ArchiveError, "valid ZIP archive"):
                unpack_workspace_archive(b"not a zip", storage)

    def test_rejects_symlinks_that_escape_the_workspace(self):
        with tempfile.TemporaryDirectory() as storage:
            with self.assertRaisesRegex(ArchiveError, "symbolic link outside"):
                unpack_workspace_archive(
                    make_zip([("link", b"../../outside", 0o120777)]),
                    storage,
                )

    def test_preserves_executable_file_permissions(self):
        with tempfile.TemporaryDirectory() as storage:
            result = unpack_workspace_archive(
                make_zip([("bin/tool", b"#!/bin/sh\n", 0o100755)]),
                storage,
            )
            executable = Path(storage) / result["workspace_id"] / "bin/tool"
            self.assertTrue(stat.S_IMODE(executable.stat().st_mode) & stat.S_IXUSR)


if __name__ == "__main__":
    unittest.main()
