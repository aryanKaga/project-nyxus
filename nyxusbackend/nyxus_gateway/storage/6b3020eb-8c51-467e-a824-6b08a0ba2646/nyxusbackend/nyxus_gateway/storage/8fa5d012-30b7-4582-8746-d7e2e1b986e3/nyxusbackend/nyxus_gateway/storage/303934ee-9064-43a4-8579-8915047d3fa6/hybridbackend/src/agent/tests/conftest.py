import sys
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = AGENT_DIR.parents[1]
for import_path in (PROJECT_DIR, AGENT_DIR):
    if str(import_path) not in sys.path:
        sys.path.insert(0, str(import_path))
