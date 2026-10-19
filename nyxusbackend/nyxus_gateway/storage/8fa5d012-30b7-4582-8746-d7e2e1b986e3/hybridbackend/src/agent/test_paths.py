import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from paths import AGENT_DIR, REPO_ROOT, resolve_agent_dir, resolve_repo_root


class PathResolutionTests(unittest.TestCase):
    def test_defaults_are_independent_of_the_working_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch("pathlib.Path.cwd", return_value=Path(temporary)):
                self.assertEqual(resolve_agent_dir(), AGENT_DIR)
                self.assertEqual(resolve_repo_root(), REPO_ROOT)

    def test_relative_overrides_are_resolved_from_the_working_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            working_directory = Path(temporary)
            with patch("pathlib.Path.cwd", return_value=working_directory):
                self.assertEqual(
                    resolve_agent_dir("agent-assets"),
                    (working_directory / "agent-assets").resolve(),
                )
                self.assertEqual(
                    resolve_repo_root("target-repo"),
                    (working_directory / "target-repo").resolve(),
                )


if __name__ == "__main__":
    unittest.main()
