"""Sanity check: run before using the agent.   python check.py [repo_root]

Verifies that skills parse, every tool a skill requires is available, and
shows what the model will see. Does not call codegraph.
"""
import sys

from paths import AGENT_DIR, resolve_repo_root
from skills_loader import SkillRegistry
from tools.codegraph_wrapper import ToolRuntime

root = resolve_repo_root(sys.argv[1] if len(sys.argv) > 1 else None)
skills = SkillRegistry(AGENT_DIR)
rt = ToolRuntime(AGENT_DIR, root=root, skills=skills)

problems = skills.validate(rt.tool_names())
if problems:
    print("PROBLEMS:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

print(f"OK: {len(skills.names())} skills, {len(rt.tool_names())} tools")
print("\n--- skill index (goes in system prompt) ---")
print(skills.index())
print("\n--- tools ---")
for d in rt.tool_definitions():
    print(" -", d["name"])
