"""Application settings, sourced from environment variables and an optional `.env` file."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = PROJECT_ROOT / ".env"

_BEARER_PREFIX = re.compile(r"^bearer\s+", re.IGNORECASE)


def clean_token(value: str | None) -> str | None:
    """Strips an optional `Bearer ` prefix and all whitespace (common copy/paste damage)."""
    if not value:
        return None
    cleaned = re.sub(r"\s+", "", _BEARER_PREFIX.sub("", value.strip()))
    return cleaned or None


class Settings(BaseSettings):
    """All runtime configuration. Variable names match the Node service, so its `.env` works as-is."""

    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # --- Service ---
    app_name: str = "mcp-uacapi-py"
    log_level: str = "INFO"
    cors_allow_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])

    # --- LLM ---
    llm_provider: Literal["openai", "anthropic"] = "openai"
    llm_timeout_s: float = Field(60.0, gt=0)
    llm_max_retries: int = Field(2, ge=0)
    # Master switch for provider prompt-caching features (cache markers, cache keys, retention).
    llm_prompt_caching: bool = True

    # OpenAI or any OpenAI-compatible endpoint (e.g. AWS Bedrock gpt-oss). No base URL = api.openai.com.
    openai_api_key: SecretStr | None = None
    openai_base_url: str | None = None
    openai_model: str = "openai.gpt-oss-120b"
    # OpenAI caches identical prompt prefixes automatically. These only improve hit rates, and are
    # unset by default because not every OpenAI-compatible endpoint accepts them.
    openai_prompt_cache_key: str | None = None
    openai_prompt_cache_retention: Literal["in_memory", "24h"] | None = None
    # Explicit breakpoint after the static system prompt (GPT-5.6 and later only).
    openai_cache_breakpoints: bool = False

    # Anthropic Claude, via the Anthropic API or AWS Bedrock.
    anthropic_backend: Literal["api", "bedrock"] = "api"
    anthropic_api_key: SecretStr | None = None
    anthropic_base_url: str | None = None
    # On Bedrock use the Bedrock model or inference-profile id, e.g. global.anthropic.claude-sonnet-5-5.
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_max_tokens: int = Field(2048, ge=1)
    # Lifetime of the cached tools + system prompt prefix. "1h" costs more per write, less per miss.
    anthropic_cache_ttl: Literal["5m", "1h"] = "5m"
    aws_region: str | None = None
    # Bedrock API key; alternatively AWS access keys or a profile (or the default AWS credential chain).
    aws_bearer_token_bedrock: SecretStr | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: SecretStr | None = None
    aws_session_token: SecretStr | None = None
    aws_profile: str | None = None

    # --- Agent loop ---
    agent_max_turns: int = Field(8, ge=1)
    agent_max_tool_calls: int = Field(3, ge=0)
    agent_max_history_turns: int = Field(8, ge=0)
    agent_max_assistant_chars: int = Field(800, ge=0)
    # Shared fallback session for requests without a sessionId. Off by default: a shared
    # session mixes conversations from different shoppers.
    agent_default_session: str | None = None

    # --- Session memory ---
    session_backend: Literal["memory"] = "memory"
    session_max_turns: int = Field(20, ge=0)
    session_max_sessions: int = Field(10_000, ge=1)
    session_ttl_s: int = Field(3600, gt=0)

    # --- UACAPI ---
    uacapi_endpoint: str | None = None
    uacapi_bearer_token: SecretStr | None = None
    uacapi_integration_token: SecretStr | None = None
    uacapi_auth0_domain: str | None = None
    uacapi_auth0_client_id: str | None = None
    uacapi_auth0_client_secret: SecretStr | None = None
    uacapi_auth0_audience: str = "https://commerce.api.ua.com"
    uacapi_customer_no: str | None = None
    uacapi_timeout_ms: int = Field(15_000, gt=0)
    uacapi_max_connections: int = Field(100, ge=1)
    uacapi_site_code: str | None = None
    uacapi_language_code: str | None = None
    uacapi_client_type: str | None = None
    uacapi_user_agent: str | None = None
    uacapi_headers: Annotated[dict[str, str], NoDecode] = Field(default_factory=dict)
    uacapi_image_size: int = Field(600, gt=0)
    debug_uacapi: bool = False

    # --- Help / Queries email ---
    email_transport: Literal["log"] = "log"
    support_email: str = "ankush.katharia@underarmour.com"
    support_email_from: str = "no-reply@underarmour.com"

    @model_validator(mode="before")
    @classmethod
    def _drop_blank_values(cls, data: Any) -> Any:
        # `KEY=` in .env should mean "unset" (use the default), not an empty string.
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if not (isinstance(v, str) and not v.strip())}
        return data

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("uacapi_headers", mode="before")
    @classmethod
    def _parse_headers(cls, value: Any) -> Any:
        return json.loads(value) if isinstance(value, str) else value

    @field_validator("uacapi_bearer_token", "uacapi_integration_token", mode="before")
    @classmethod
    def _clean_tokens(cls, value: Any) -> Any:
        return clean_token(value) if isinstance(value, str) else value

    @property
    def uacapi_context_headers(self) -> dict[str, str]:
        """Static UACAPI context headers (site, language, client type); per-request values win."""
        headers: dict[str, str] = {}
        if self.uacapi_site_code:
            headers["ua-site-code"] = self.uacapi_site_code
        if self.uacapi_language_code:
            headers["ua-language-code"] = self.uacapi_language_code
        if self.uacapi_client_type:
            headers["uaclienttype"] = self.uacapi_client_type
        if self.uacapi_user_agent:
            headers["user-agent"] = self.uacapi_user_agent
        headers.update({k.lower(): v for k, v in self.uacapi_headers.items()})
        return headers

    @property
    def llm_config_error(self) -> str | None:
        """Why the selected LLM provider cannot be used, or None when it is configured."""
        if self.llm_provider == "openai":
            return None if self.openai_api_key else "LLM is not configured: set OPENAI_API_KEY."
        if self.anthropic_backend == "bedrock":
            return None if self.aws_region else "LLM is not configured: set AWS_REGION for Bedrock."
        return None if self.anthropic_api_key else "LLM is not configured: set ANTHROPIC_API_KEY."

    @property
    def auth0_token_url(self) -> str | None:
        """Auth0 client-credentials endpoint, or None when auto-minting is not configured."""
        if not (self.uacapi_auth0_domain and self.uacapi_auth0_client_id and self.uacapi_auth0_client_secret):
            return None
        domain = self.uacapi_auth0_domain.rstrip("/")
        return domain if domain.startswith(("http://", "https://")) else f"https://{domain}/oauth/token"


@lru_cache
def get_settings() -> Settings:
    return Settings()
