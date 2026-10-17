"""Loads skills from skills/ according to config.yaml.

Only name + description go into the system prompt. The full SKILL.md is
returned when the agent calls use_skill(name).

Requires: PyYAML.
"""
import yaml

from paths import resolve_agent_dir


def _split_frontmatter(text):
    if not text.startswith("---"):
        raise ValueError("SKILL.md must start with '---' frontmatter")
    _, meta, body = text.split("---", 2)
    return yaml.safe_load(meta), body.strip()


class SkillRegistry:
    def __init__(self, agent_dir=None):
        agent_dir = resolve_agent_dir(agent_dir)
        cfg = yaml.safe_load((agent_dir / "config.yaml").read_text())
        self._dir = agent_dir / "skills"
        self._base = (self._dir / "base.md").read_text()
        self._skills = {}

        for name in cfg["skills"]:
            path = self._dir / name / "SKILL.md"
            if not path.exists():
                raise FileNotFoundError(f"enabled skill has no file: {path}")
            meta, body = _split_frontmatter(path.read_text())
            if meta.get("name") != name:
                raise ValueError(f"{path}: frontmatter name must be '{name}'")
            if not meta.get("description"):
                raise ValueError(f"{path}: description is required")
            self._skills[name] = {"meta": meta, "body": body}

    def names(self):
        return list(self._skills)

    def index(self):
        return "\n".join(
            f"- {n}: {s['meta']['description']}" for n, s in self._skills.items()
        )

    def system_prompt(self):
        return self._base.replace("{{SKILL_INDEX}}", self.index())

    def get(self, name):
        skill = self._skills.get(name)
        if skill is None:
            return None
        return f"# Skill: {name}\n\n{skill['body']}"

    def required_tools(self, name):
        return list(self._skills[name]["meta"].get("requires_tools", []))

    def validate(self, available_tools):
        """Return a list of problems (empty list means OK)."""
        problems = []
        for name in self._skills:
            for tool in self.required_tools(name):
                if tool not in available_tools:
                    problems.append(f"skill '{name}' requires unavailable tool '{tool}'")
        return problems
