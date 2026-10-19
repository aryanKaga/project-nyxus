import time

import pytest

from timeouts import (
    AgentTimeoutError,
    check_deadline,
    remaining_seconds,
    task_deadline,
)


def test_task_deadline_raises_when_total_budget_is_exceeded():
    with pytest.raises(AgentTimeoutError, match="time limit"):
        with task_deadline(0.01):
            time.sleep(0.02)


def test_nested_task_deadline_preserves_outer_deadline():
    with task_deadline(1):
        check_deadline()
        assert 0 < remaining_seconds() <= 1


def test_expired_deadline_blocks_followup_work():
    with pytest.raises(AgentTimeoutError):
        with task_deadline(0.01):
            time.sleep(0.02)
            check_deadline()
