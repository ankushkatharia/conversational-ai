"""MCP endpoint (Streamable HTTP) exposing the same tool registry to external MCP clients.

Runs stateless with JSON responses, so any replica can serve any request.
"""

from __future__ import annotations

import json

from mcp import types
from mcp.server.lowlevel.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from app import __version__
from app.container import Container
from app.core.auth import auth_context_from_headers
from app.core.errors import AppError


def build_mcp_session_manager(container: Container) -> StreamableHTTPSessionManager:
    registry = container.registry

    async def list_tools(_ctx, _params) -> types.ListToolsResult:
        return types.ListToolsResult(
            tools=[
                types.Tool(
                    name=spec.name,
                    title=spec.title,
                    description=spec.description,
                    input_schema=spec.input_schema,
                    annotations=types.ToolAnnotations(
                        read_only_hint=spec.read_only, open_world_hint=spec.open_world
                    ),
                )
                for spec in registry
            ]
        )

    async def call_tool(ctx, params: types.CallToolRequestParams) -> types.CallToolResult:
        # Shopper context comes from the MCP HTTP request headers, same as the REST API.
        headers = getattr(ctx.request, "headers", None) or {}
        tool_ctx = container.tool_context(auth=auth_context_from_headers(headers))
        try:
            spec = registry.get(params.name)
            result = await spec.invoke(params.arguments, tool_ctx)
        except AppError as exc:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=exc.message)], is_error=True
            )
        data = result.model_dump(mode="json")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=json.dumps(data))],
            structured_content=data,
        )

    server = Server("mcp-uacapi", version=__version__, on_list_tools=list_tools, on_call_tool=call_tool)
    return StreamableHTTPSessionManager(app=server, stateless=True, json_response=True)


class McpEndpoint:
    """ASGI endpoint whose session manager is attached during app startup."""

    def __init__(self) -> None:
        self.manager: StreamableHTTPSessionManager | None = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.manager is None:
            await JSONResponse({"error": "MCP endpoint is not ready."}, status_code=503)(scope, receive, send)
            return
        await self.manager.handle_request(scope, receive, send)
