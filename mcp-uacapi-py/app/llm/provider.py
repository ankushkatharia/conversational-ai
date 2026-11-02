"""Selects and owns the chat model configured by LLM_PROVIDER."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Protocol

from app.core.config import ENV_FILE, Settings
from app.core.errors import NotConfiguredError
from app.llm.types import ChatModel

logger = logging.getLogger(__name__)

# Settings that change which model or credentials are used. A change to any of them in `.env`
# rebuilds the client.
_LLM_FIELDS = frozenset(
    name for name in Settings.model_fields if name.startswith(("llm_", "openai_", "anthropic_", "aws_"))
)


def build_chat_model(settings: Settings) -> ChatModel:
    if error := settings.llm_config_error:
        raise NotConfiguredError(error)
    if settings.llm_provider == "anthropic":
        from app.llm.anthropic_chat import AnthropicChatModel

        return AnthropicChatModel(settings)
    from app.llm.openai_chat import OpenAIChatModel

    return OpenAIChatModel(settings)


class ChatModelProvider(Protocol):
    def model(self) -> ChatModel: ...

    @property
    def configured(self) -> bool: ...

    async def aclose(self) -> None: ...


class StaticModelProvider:
    """Always returns the same model (tests, embedding)."""

    def __init__(self, model: ChatModel) -> None:
        self._model = model

    def model(self) -> ChatModel:
        return self._model

    @property
    def configured(self) -> bool:
        return True

    async def aclose(self) -> None:
        await self._model.aclose()


def _mtime(path: Path) -> float | None:
    try:
        return path.stat().st_mtime
    except OSError:
        return None


class LLMProvider:
    """Owns one pooled client for the configured provider.

    Bedrock keys expire often, so when `.env` changes on disk and any LLM setting differs, the
    client is rebuilt with the new values; no restart needed. The check is one `stat` per call.
    """

    def __init__(self, settings: Settings, env_file: Path = ENV_FILE) -> None:
        self._env_file = env_file
        self._env_mtime = _mtime(env_file)
        self._settings = settings
        self._fingerprint = self._fingerprint_of(settings)
        self._model: ChatModel | None = None

    @staticmethod
    def _fingerprint_of(settings: Settings) -> dict[str, Any]:
        return settings.model_dump(include=_LLM_FIELDS)

    def _refresh(self) -> None:
        mtime = _mtime(self._env_file)
        if mtime == self._env_mtime:
            return
        self._env_mtime = mtime
        fresh = Settings(_env_file=self._env_file)
        fingerprint = self._fingerprint_of(fresh)
        if fingerprint != self._fingerprint:
            logger.info("LLM settings changed in .env; rebuilding the %s client.", fresh.llm_provider)
            self._settings, self._fingerprint = fresh, fingerprint
            # The previous client is not closed: in-flight requests may still be using it.
            self._model = None

    @property
    def configured(self) -> bool:
        self._refresh()
        return self._settings.llm_config_error is None

    def model(self) -> ChatModel:
        self._refresh()
        if self._model is None:
            self._model = build_chat_model(self._settings)
            logger.info("LLM ready: provider=%s model=%s", self._model.provider, self._model.model)
        return self._model

    async def aclose(self) -> None:
        if self._model is not None:
            await self._model.aclose()
