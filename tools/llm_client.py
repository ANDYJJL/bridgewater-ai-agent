from __future__ import annotations

import os
import re
from typing import Any

from dotenv import load_dotenv

from utils.connect import BASE_URL as LLM_GATEWAY_BASE_URL

load_dotenv()

DEFAULT_CLASS_MODEL = 'claude-sonnet-4-6'
DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'


def _resolve_class_api_key() -> str | None:
    return os.getenv('CLASS_LLM_API_KEY') or os.getenv('OPENAI_API_KEY')


def _resolve_anthropic_api_key() -> str | None:
    key = os.getenv('ANTHROPIC_API_KEY')
    if key and key.startswith('sk-ant-'):
        return key
    return None


def llm_available() -> bool:
    return bool(_resolve_class_api_key() or _resolve_anthropic_api_key())


def sanitize_llm_error_message(message: str | None) -> str:
    if not message:
        return 'LLM request failed.'
    sanitized = message
    for key in (_resolve_class_api_key(), os.getenv('ANTHROPIC_API_KEY')):
        if key:
            sanitized = sanitized.replace(key, '[redacted]')
    sanitized = re.sub(r'sk-[A-Za-z0-9._-]+', '[redacted]', sanitized)
    sanitized = re.sub(r'Bearer\s+[A-Za-z0-9._-]+', 'Bearer [redacted]', sanitized, flags=re.IGNORECASE)
    sanitized = sanitized.strip().replace('\n', ' ')
    if len(sanitized) > 180:
        sanitized = sanitized[:177].rstrip() + '...'
    return sanitized


def _failure_payload(*, error_type: str, message: str, model: str, base_url_configured: bool, class_llm_used: bool) -> dict[str, Any]:
    return {
        'llm_used': False,
        'fallback_used': True,
        'answer': '',
        'class_llm_used': class_llm_used,
        'llm_error_type': error_type,
        'llm_error_message': sanitize_llm_error_message(message),
        'llm_model': model,
        'llm_base_url_configured': base_url_configured,
    }


def _class_success_payload(answer: str, model: str, base_url_configured: bool) -> dict[str, Any]:
    return {
        'llm_used': True,
        'fallback_used': False,
        'answer': answer,
        'class_llm_used': True,
        'llm_error_type': None,
        'llm_error_message': None,
        'llm_model': model,
        'llm_base_url_configured': base_url_configured,
    }


def _anthropic_success_payload(answer: str, model: str, base_url_configured: bool) -> dict[str, Any]:
    return {
        'llm_used': True,
        'fallback_used': False,
        'answer': answer,
        'class_llm_used': False,
        'llm_error_type': None,
        'llm_error_message': None,
        'llm_model': model,
        'llm_base_url_configured': base_url_configured,
    }


def _extract_openai_text(response: Any) -> str:
    try:
        if response.choices:
            message = response.choices[0].message
            return (getattr(message, 'content', '') or '').strip()
    except Exception:
        pass
    return ''


def _extract_anthropic_text(response: Any) -> str:
    parts: list[str] = []
    for block in getattr(response, 'content', []) or []:
        block_type = getattr(block, 'type', None)
        if block_type == 'text':
            text = getattr(block, 'text', '')
            if text:
                parts.append(str(text).strip())
        elif isinstance(block, dict) and block.get('type') == 'text' and block.get('text'):
            parts.append(str(block['text']).strip())
    return ' '.join(part for part in parts if part).strip()


def _classify_openai_error(exc: Exception) -> str:
    status = getattr(exc, 'status_code', None)
    message = (str(exc) or type(exc).__name__).lower()
    if status in {401, 403}:
        return 'auth_error'
    if status == 429 or 'rate limit' in message or 'ratelimit' in message:
        return 'rate_limited'
    if 'timeout' in message or 'timed out' in message:
        return 'timeout'
    return 'api_error'


def _classify_anthropic_error(exc: Exception) -> str:
    message = (str(exc) or type(exc).__name__).lower()
    name = type(exc).__name__.lower()
    if 'ratelimit' in name or 'rate limit' in message or '429' in message:
        return 'rate_limited'
    if 'timeout' in name or 'timed out' in message or 'deadline exceeded' in message:
        return 'timeout'
    if '401' in message or '403' in message or 'auth' in message or 'invalid x-api-key' in message:
        return 'auth_error'
    return 'api_error'


def _run_class_openai_compatible(*, system_prompt: str, user_prompt: str, timeout_seconds: float, max_tokens: int | None = None) -> dict[str, Any]:
    api_key = _resolve_class_api_key()
    model = os.getenv('LLM_MODEL', DEFAULT_CLASS_MODEL)
    base_url = os.getenv('LLM_BASE_URL') or LLM_GATEWAY_BASE_URL
    base_url_configured = bool(os.getenv('LLM_BASE_URL')) or bool(LLM_GATEWAY_BASE_URL)
    if not api_key:
        return _failure_payload(
            error_type='missing_api_key',
            message='No CLASS_LLM_API_KEY is configured.',
            model=model,
            base_url_configured=base_url_configured,
            class_llm_used=True,
        )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url=base_url, timeout=timeout_seconds)
        request_kwargs = {
            'model': model,
            'temperature': 0.2,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
        }
        if max_tokens is not None:
            request_kwargs['max_tokens'] = max_tokens
        response = client.chat.completions.create(**request_kwargs)
        answer = _extract_openai_text(response)
        if not answer:
            return _failure_payload(
                error_type='api_error',
                message='Class LLM provider returned an empty response.',
                model=model,
                base_url_configured=base_url_configured,
                class_llm_used=True,
            )
        return _class_success_payload(answer, model, base_url_configured)
    except Exception as exc:  # pragma: no cover
        return _failure_payload(
            error_type=_classify_openai_error(exc),
            message=str(exc) or type(exc).__name__,
            model=model,
            base_url_configured=base_url_configured,
            class_llm_used=True,
        )


def _run_anthropic_optional(*, system_prompt: str, user_prompt: str, timeout_seconds: float, max_tokens: int | None = None) -> dict[str, Any]:
    api_key = _resolve_anthropic_api_key()
    model = os.getenv('ANTHROPIC_MODEL', DEFAULT_ANTHROPIC_MODEL)
    base_url = os.getenv('ANTHROPIC_BASE_URL')
    base_url_configured = bool(base_url)
    if not api_key:
        return _failure_payload(
            error_type='missing_api_key',
            message='No ANTHROPIC_API_KEY is configured.',
            model=model,
            base_url_configured=base_url_configured,
            class_llm_used=False,
        )

    try:
        import anthropic

        kwargs: dict[str, Any] = {'api_key': api_key, 'timeout': timeout_seconds}
        if base_url:
            kwargs['base_url'] = base_url
        client = anthropic.Anthropic(**kwargs)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens or 700,
            temperature=0.2,
            system=system_prompt,
            messages=[{'role': 'user', 'content': user_prompt}],
        )
        answer = _extract_anthropic_text(response)
        if not answer:
            return _failure_payload(
                error_type='api_error',
                message='Anthropic returned an empty response.',
                model=model,
                base_url_configured=base_url_configured,
                class_llm_used=False,
            )
        return _anthropic_success_payload(answer, model, base_url_configured)
    except Exception as exc:  # pragma: no cover
        return _failure_payload(
            error_type=_classify_anthropic_error(exc),
            message=str(exc) or type(exc).__name__,
            model=model,
            base_url_configured=base_url_configured,
            class_llm_used=False,
        )


def run_grounded_chat_completion(
    *,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float = 12.0,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    class_result = _run_class_openai_compatible(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=timeout_seconds,
        max_tokens=max_tokens,
    )
    if class_result.get('llm_used'):
        return class_result
    if class_result.get('llm_error_type') != 'missing_api_key':
        return class_result

    anthropic_result = _run_anthropic_optional(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=timeout_seconds,
        max_tokens=max_tokens,
    )
    if anthropic_result.get('llm_used'):
        return anthropic_result
    return class_result
