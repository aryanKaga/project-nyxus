from types import SimpleNamespace

import pytest
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

import agent_loop
from agent_loop import ProviderChatModel
from llm_provider.models import GeminiAdapter


class FakeGeminiAdapter:
    model = "gemini-3.5-flash-lite"

    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def generate_chat(self, **kwargs):
        self.calls.append(kwargs)
        return next(self.responses)


def test_gemini_adapter_uses_google_genai_sdk():
    adapter = GeminiAdapter(api_key="test-key")

    assert adapter._use_google_genai is True


def test_agent_model_uses_gemini_provider_instance(monkeypatch):
    created = []

    class FakeProvider:
        model = "gemini-3.5-flash-lite"

    def fake_llm(provider, api_key, model):
        created.append((provider, api_key, model))
        return FakeProvider()

    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
    monkeypatch.setattr(agent_loop, "LLM", fake_llm)

    model = agent_loop._make_model({
        "provider": "gemini",
        "name": "gemini-3.5-flash-lite",
        "api_key_env": "GOOGLE_API_KEY",
    })

    assert created == [("gemini", "test-key", "gemini-3.5-flash-lite")]
    assert model.adapter.model == "gemini-3.5-flash-lite"


def test_provider_model_converts_gemini_function_calls():
    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[
                    SimpleNamespace(
                        text=None,
                        function_call=SimpleNamespace(
                            name="search",
                            args={"query": "authentication"},
                        ),
                        thought_signature=b"opaque-signature",
                    )
                ])
            )
        ]
    )
    adapter = FakeGeminiAdapter([response])
    model = ProviderChatModel(adapter=adapter).bind_tools([
        {
            "name": "search",
            "description": "Search the repository.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            },
        }
    ])

    result = model.invoke([
        SystemMessage(content="Use tools for code facts."),
        HumanMessage(content="Find authentication."),
    ])

    assert result.tool_calls[0]["name"] == "search"
    assert result.tool_calls[0]["args"] == {"query": "authentication"}
    signature = result.additional_kwargs["gemini_thought_signatures"][
        result.tool_calls[0]["id"]
    ]
    assert signature == b"opaque-signature"
    assert adapter.calls[0]["system_instruction"] == "Use tools for code facts."
    assert adapter.calls[0]["tools"][0]["name"] == "search"
    assert "additionalProperties" not in str(adapter.calls[0]["tools"])


def test_provider_model_waits_35_seconds_then_retries_rate_limited_request(monkeypatch):
    class RateLimitError(Exception):
        code = 429

    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[SimpleNamespace(text="Recovered.")])
            )
        ]
    )

    class RateLimitedAdapter:
        model = "gemini-3.5-flash-lite"

        def __init__(self):
            self.calls = 0

        def generate_chat(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                raise RateLimitError("Too many requests")
            return response

    adapter = RateLimitedAdapter()
    delays = []
    monkeypatch.setattr(agent_loop.time, "sleep", delays.append)

    result = ProviderChatModel(adapter=adapter).invoke([
        HumanMessage(content="Continue."),
    ])

    assert result.content == "Recovered."
    assert adapter.calls == 2
    assert delays == [35]


def test_provider_model_does_not_delay_non_rate_limit_errors(monkeypatch):
    class ProviderError(Exception):
        code = 500

    class FailingAdapter:
        model = "gemini-3.5-flash-lite"

        def generate_chat(self, **kwargs):
            raise ProviderError("Internal server error")

    delays = []
    monkeypatch.setattr(agent_loop.time, "sleep", delays.append)

    with pytest.raises(ProviderError):
        ProviderChatModel(adapter=FailingAdapter()).invoke([
            HumanMessage(content="Continue."),
        ])

    assert delays == []


def test_provider_model_serializes_tool_results_for_followup():
    function_response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[
                    SimpleNamespace(
                        text=None,
                        function_call=SimpleNamespace(
                            name="search",
                            args={"query": "authentication"},
                        ),
                        thought_signature=b"preserve-this-signature",
                    )
                ])
            )
        ]
    )
    final_response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[
                    SimpleNamespace(
                        text="Found it in auth.py:20.",
                        function_call=None,
                        thought_signature=None,
                    )
                ])
            )
        ]
    )
    adapter = FakeGeminiAdapter([function_response, final_response])
    model = ProviderChatModel(adapter=adapter).bind_tools([
        {
            "name": "search",
            "description": "Search the repository.",
            "parameters": {"type": "object", "properties": {}},
        }
    ])

    tool_call_response = model.invoke([
        HumanMessage(content="Where is authentication?"),
    ])
    tool_call_id = tool_call_response.tool_calls[0]["id"]
    result = model.invoke([
        HumanMessage(content="Where is authentication?"),
        tool_call_response,
        ToolMessage(
            content="auth.py:20",
            tool_call_id=tool_call_id,
            name="search",
        ),
    ])

    function_call_part = adapter.calls[1]["contents"][1]["parts"][0]
    assert function_call_part["function_call"]["name"] == "search"
    assert function_call_part["thought_signature"] == b"preserve-this-signature"
    assert adapter.calls[1]["contents"][2]["role"] == "user"
    assert (
        adapter.calls[1]["contents"][2]["parts"][0]["function_response"]["name"]
        == "search"
    )
    assert result.content == "Found it in auth.py:20."
