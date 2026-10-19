"""Cooperative wall-clock deadlines for a single agent task."""
from contextlib import contextmanager
from contextvars import ContextVar
import time


class AgentTimeoutError(TimeoutError):
    pass


_deadline = ContextVar("agent_deadline", default=None)


def remaining_seconds():
    deadline = _deadline.get()
    if deadline is None:
        return None
    return max(0.0, deadline - time.monotonic())


def check_deadline():
    remaining = remaining_seconds()
    if remaining is not None and remaining <= 0:
        raise AgentTimeoutError("The agent task exceeded its configured time limit.")


@contextmanager
def task_deadline(timeout_seconds):
    if timeout_seconds is None:
        yield
        return
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than zero.")
    token = _deadline.set(time.monotonic() + timeout_seconds)
    try:
        check_deadline()
        yield
        check_deadline()
    finally:
        _deadline.reset(token)
