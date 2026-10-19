from abc import ABC,abstractmethod
from typing import Optional


class BaseLLM(ABC):
    "This is the base LLM that will be implemented further"
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    @abstractmethod
    def generate(self, prompt: str) -> str:
        pass


class OpenAIAdapter(BaseLLM):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        super().__init__(api_key, model)

        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)

    def generate(self, prompt: str,stream = False) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content or ""


class AnthropicAdapter(BaseLLM):

    def __init__(
        self, api_key: str, model: str = "claude-sonnet-4-5"
    ):
        super().__init__(api_key, model)

        from anthropic import Anthropic
        self.client = Anthropic(api_key=api_key)

    def generate(self, prompt: str,stream:bool = False) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            block.text
            for block in response.content
            if block.type == "text"
        )


class GeminiAdapter(BaseLLM):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        super().__init__(api_key, model)

        try:
            from google import genai
            self.client = genai.Client(api_key=api_key)
            self._use_google_genai = True
        except ImportError:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            self.client = genai
            self._use_google_genai = False

    def generate(self, prompt: str, stream: bool = False) -> str:
        if self._use_google_genai:
           
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
            )
            if hasattr(response, "text") and response.text:
                return response.text

            text_parts = []
            for candidate in getattr(response, "candidates", []) or []:
                for part in getattr(candidate, "content", {}).get("parts", []) or []:
                    if hasattr(part, "text"):
                        text_parts.append(part.text)
            return "".join(text_parts)

        model = self.client.GenerativeModel(self.model)
        response = model.generate_content(prompt)
        return getattr(response, "text", "")





class LLM:
    _providers = {
        "openai": OpenAIAdapter,
        "anthropic": AnthropicAdapter,
        "gemini": GeminiAdapter,
    }

    def __new__(
        cls,
        provider: str,
        api_key: str,
        model: Optional[str] = None,
    ):
        provider_class = cls._providers.get(provider.lower())

        if provider_class is None:
            raise ValueError(f"Unsupported provider: {provider}")

        kwargs = {"api_key": api_key}
        if model is not None:
            kwargs["model"] = model

        return provider_class(**kwargs)

    @classmethod
    def register(cls, name: str, adapter: type[BaseLLM]):
        cls._providers[name.lower()] = adapter

    
