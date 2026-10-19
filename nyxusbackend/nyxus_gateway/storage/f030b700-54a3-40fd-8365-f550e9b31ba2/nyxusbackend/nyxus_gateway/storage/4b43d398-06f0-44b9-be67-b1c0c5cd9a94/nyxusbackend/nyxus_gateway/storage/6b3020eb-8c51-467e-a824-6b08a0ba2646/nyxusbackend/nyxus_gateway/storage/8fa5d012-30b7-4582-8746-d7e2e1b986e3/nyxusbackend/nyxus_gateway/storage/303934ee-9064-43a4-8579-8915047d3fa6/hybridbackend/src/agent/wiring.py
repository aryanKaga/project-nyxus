from skills_loader import SkillRegistry
from tools.codegraph_wrapper import ToolRuntime
from paths import AGENT_DIR, REPO_ROOT

skills = SkillRegistry(AGENT_DIR)
rt = ToolRuntime(AGENT_DIR, root=REPO_ROOT, skills=skills, llm_call=None)

system_prompt = skills.system_prompt()   # base.md + skill index
tools = rt.tool_definitions()            # includes use_skill, digest, scratchpad

print(tools)