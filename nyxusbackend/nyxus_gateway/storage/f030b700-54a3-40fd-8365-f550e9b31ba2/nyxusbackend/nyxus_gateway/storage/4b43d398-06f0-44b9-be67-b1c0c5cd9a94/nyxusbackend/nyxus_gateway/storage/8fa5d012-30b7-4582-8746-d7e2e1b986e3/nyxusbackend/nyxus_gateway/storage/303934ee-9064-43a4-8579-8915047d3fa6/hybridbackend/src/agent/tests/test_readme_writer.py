from types import SimpleNamespace

import pytest

from readme_writer import write_readme_answer


def test_readme_writer_receives_specialist_instructions_and_returns_markdown():
    calls = []

    class FakeModel:
        def invoke(self, messages):
            calls.append(messages)
            return SimpleNamespace(content="# Clear answer\n\nDetails.")

    result = write_readme_answer(FakeModel(), "Explain the setup", "Evidence.")

    assert result == "# Clear answer\n\nDetails."
    assert len(calls[0]) == 2
    assert "professional README writer" in calls[0][0].content
    assert "Explain the setup" in calls[0][1].content
    assert "Evidence." in calls[0][1].content


def test_readme_writer_rejects_empty_markdown():
    class EmptyModel:
        def invoke(self, messages):
            return SimpleNamespace(content="  ")

    with pytest.raises(ValueError, match="empty Markdown"):
        write_readme_answer(EmptyModel(), "Question", "Answer")
