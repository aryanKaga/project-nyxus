import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from ingestion.workspace_loader import load_workspace


class FakeStore:
    def __init__(self, archive, document=True):
        self.archive = archive
        self.document = (
            {"archive_id": "stored", "file_count": 1}
            if document
            else None
        )

    def get_workspace(self, api_key, workspace_id):
        return self.document

    def read_workspace_archive(self, document):
        return self.archive


def make_zip():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("src/app.py", "print('restored')")
    return output.getvalue()


class WorkspaceLoaderTests(unittest.TestCase):
    def test_restores_archive_under_the_existing_workspace_id(self):
        workspace_id = "c3d9f5a6-bac3-47e8-9d68-2c8e6f617265"
        with tempfile.TemporaryDirectory() as storage:
            result = load_workspace(
                workspace_id,
                "api-key",
                storage,
                FakeStore(make_zip()),
            )

            self.assertEqual(result["workspace_id"], workspace_id)
            self.assertEqual(
                (Path(storage) / workspace_id / "src" / "app.py").read_text(),
                "print('restored')",
            )

    def test_unknown_workspace_id_is_not_loaded(self):
        with tempfile.TemporaryDirectory() as storage:
            result = load_workspace(
                "unknown",
                "api-key",
                storage,
                FakeStore(make_zip(), document=False),
            )

            self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
