from __future__ import annotations

import sys
import types

from tools import llm_client


class _FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = _FakeMessage(content)


class _FakeOpenAIResponse:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(content)]


def test_llm_client_missing_class_api_key_falls_back(monkeypatch) -> None:
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    result = llm_client.run_grounded_chat_completion(system_prompt='system', user_prompt='user')

    assert result['llm_used'] is False
    assert result['fallback_used'] is True
    assert result['class_llm_used'] is True
    assert result['llm_error_type'] == 'missing_api_key'
    assert result['llm_model'] == llm_client.DEFAULT_CLASS_MODEL


def test_llm_client_mocked_class_llm_success(monkeypatch) -> None:
    monkeypatch.setenv('CLASS_LLM_API_KEY', 'class-test-secret')
    monkeypatch.setenv('LLM_MODEL', 'gpt-4o-mini')
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)

    class FakeCompletions:
        def create(self, **kwargs):
            return _FakeOpenAIResponse('Class grounded answer')

    class FakeChat:
        def __init__(self) -> None:
            self.completions = FakeCompletions()

    class FakeOpenAIClient:
        def __init__(self, **kwargs) -> None:
            self.chat = FakeChat()

    fake_module = types.SimpleNamespace(OpenAI=FakeOpenAIClient)
    monkeypatch.setitem(sys.modules, 'openai', fake_module)

    result = llm_client.run_grounded_chat_completion(system_prompt='system', user_prompt='user')

    assert result['llm_used'] is True
    assert result['fallback_used'] is False
    assert result['class_llm_used'] is True
    assert result['answer'] == 'Class grounded answer'
    assert result['llm_model'] == 'gpt-4o-mini'


def test_llm_client_class_api_error_falls_back(monkeypatch) -> None:
    monkeypatch.setenv('CLASS_LLM_API_KEY', 'class-test-secret')
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)

    class FakeOpenAIError(Exception):
        status_code = 500

    class FakeCompletions:
        def create(self, **kwargs):
            raise FakeOpenAIError('provider error for key class-test-secret')

    class FakeChat:
        def __init__(self) -> None:
            self.completions = FakeCompletions()

    class FakeOpenAIClient:
        def __init__(self, **kwargs) -> None:
            self.chat = FakeChat()

    fake_module = types.SimpleNamespace(OpenAI=FakeOpenAIClient)
    monkeypatch.setitem(sys.modules, 'openai', fake_module)

    result = llm_client.run_grounded_chat_completion(system_prompt='system', user_prompt='user')

    assert result['llm_used'] is False
    assert result['fallback_used'] is True
    assert result['class_llm_used'] is True
    assert result['llm_error_type'] == 'api_error'
    assert 'class-test-secret' not in result['llm_error_message']


def test_invalid_anthropic_key_does_not_block_class_path(monkeypatch) -> None:
    monkeypatch.setenv('CLASS_LLM_API_KEY', 'class-test-secret')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'invalid-anthropic-key')

    class FakeCompletions:
        def create(self, **kwargs):
            return _FakeOpenAIResponse('Class path answer')

    class FakeChat:
        def __init__(self) -> None:
            self.completions = FakeCompletions()

    class FakeOpenAIClient:
        def __init__(self, **kwargs) -> None:
            self.chat = FakeChat()

    fake_module = types.SimpleNamespace(OpenAI=FakeOpenAIClient)
    monkeypatch.setitem(sys.modules, 'openai', fake_module)

    result = llm_client.run_grounded_chat_completion(system_prompt='system', user_prompt='user')

    assert result['llm_used'] is True
    assert result['class_llm_used'] is True
    assert result['answer'] == 'Class path answer'
