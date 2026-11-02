"""Tool abstraction shared by the agent loop, the REST endpoints, and the MCP endpoint."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from functools import cached_property
from typing import Any

from pydantic import BaseModel, ValidationError

from app.clients.integration_token import IntegrationTokenManager
from app.clients.uacapi import UacapiClient
from app.core.auth import AuthContext
from app.core.config import Settings
from app.core.errors import BadRequestError
from app.llm.types import ToolDefinition
from app.services.email import Mailer


@dataclass(frozen=True, slots=True)
class ToolContext:
    """Server-side dependencies and shopper context for one tool call (never model-facing)."""

    auth: AuthContext
    settings: Settings
    uacapi: UacapiClient
    tokens: IntegrationTokenManager
    mailer: Mailer


Handler = Callable[[Any, ToolContext], Awaitable[BaseModel]]


def format_validation_error(exc: ValidationError) -> str:
    parts = []
    for error in exc.errors():
        loc = ".".join(str(p) for p in error["loc"])
        parts.append(f"{loc}: {error['msg']}" if loc else error["msg"])
    return "; ".join(parts)


def clean_json_schema(schema: Mapping[str, Any]) -> dict[str, Any]:
    """Simplifies a Pydantic JSON schema for LLM function calling.

    Inlines `$ref`s, drops titles and null defaults, and collapses `anyOf[X, null]` to `X`.
    """
    defs: Mapping[str, Any] = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, list):
            return [walk(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            target = defs[node["$ref"].rsplit("/", 1)[-1]]
            return walk({**target, **{k: v for k, v in node.items() if k != "$ref"}})

        out: dict[str, Any] = {}
        for key, value in node.items():
            if key in ("title", "$defs") or (key == "default" and value is None):
                continue
            if key == "properties":
                out[key] = {name: walk(prop) for name, prop in value.items()}
            else:
                out[key] = walk(value)

        any_of = out.get("anyOf")
        if isinstance(any_of, list):
            non_null = [s for s in any_of if s.get("type") != "null"]
            if len(non_null) == 1 and len(non_null) < len(any_of):
                out.pop("anyOf")
                out = {**non_null[0], **out}
        return out

    return walk(dict(schema))


@dataclass(frozen=True)
class ToolSpec:
    name: str
    title: str
    description: str
    input_model: type[BaseModel]
    handler: Handler
    read_only: bool = True
    open_world: bool = True
    # Compact view of the result for the LLM. The UI gets the full structured result separately,
    # so the model does not need image URLs and similar bulky fields.
    llm_view: Callable[[Any], Any] | None = None

    @cached_property
    def input_schema(self) -> dict[str, Any]:
        return clean_json_schema(self.input_model.model_json_schema(by_alias=True))

    def parse(self, arguments: Mapping[str, Any] | None) -> BaseModel:
        try:
            return self.input_model.model_validate(arguments or {})
        except ValidationError as exc:
            raise BadRequestError(
                f"Invalid arguments for {self.name}: {format_validation_error(exc)}"
            ) from exc

    async def invoke(self, arguments: Mapping[str, Any] | None, ctx: ToolContext) -> BaseModel:
        return await self.handler(self.parse(arguments), ctx)

    def llm_payload(self, result: BaseModel) -> str:
        data = self.llm_view(result) if self.llm_view else result.model_dump(mode="json")
        return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


class ToolRegistry:
    def __init__(self, specs: Iterable[ToolSpec]) -> None:
        self._specs = {spec.name: spec for spec in specs}

    def __iter__(self) -> Iterator[ToolSpec]:
        return iter(self._specs.values())

    def get(self, name: str) -> ToolSpec:
        try:
            return self._specs[name]
        except KeyError:
            raise BadRequestError(f"Unknown tool: {name}") from None

    @cached_property
    def definitions(self) -> tuple[ToolDefinition, ...]:
        """Model-facing tool definitions, built once so every request sends identical bytes."""
        return tuple(ToolDefinition(spec.name, spec.description, spec.input_schema) for spec in self)
