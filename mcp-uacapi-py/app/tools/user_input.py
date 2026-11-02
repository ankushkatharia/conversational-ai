"""`request_user_input`: asks the widget to render inline chips, a text field, or a confirm button."""

from __future__ import annotations

from app.core.errors import BadRequestError
from app.schemas.interaction import ChatInteraction, RequestUserInputInput, RequestUserInputResult
from app.tools.base import ToolContext, ToolSpec


async def request_user_input(params: RequestUserInputInput, _ctx: ToolContext) -> RequestUserInputResult:
    if params.type == "chips":
        if not params.options:
            raise BadRequestError('"chips" requires at least one option with a label and value.')
        interaction = ChatInteraction(type="chips", prompt=params.prompt, options=params.options)
    elif params.type == "text_input":
        interaction = ChatInteraction(
            type="text_input",
            prompt=params.prompt,
            input_type=params.input_type or "text",
            placeholder=params.placeholder or None,
            submit_label=params.submit_label or None,
        )
    else:
        interaction = ChatInteraction(
            type="confirm",
            prompt=params.prompt,
            confirm_label=params.confirm_label or "Confirm",
            confirm_value=params.confirm_value or params.prompt,
        )
    return RequestUserInputResult(interaction=interaction)


SPEC = ToolSpec(
    name="request_user_input",
    title="Request inline input from the shopper",
    description=(
        "Render an inline interactive control inside the chat to drive a conversational flow "
        '(primarily Help / Queries). Use "chips" to offer tappable choices (e.g. a help '
        'category, or Ticket vs Call), "text_input" to collect a single value inline (e.g. the '
        'shopper\'s email or phone), or "confirm" to show a single button (e.g. "Create '
        'ticket"). Whatever the shopper taps or types is sent back to you as their next '
        "message, so you stay in control of every step. After calling this, write ONE short "
        "sentence introducing the control and stop. Do not ask for the same information in "
        "plain text as well."
    ),
    input_model=RequestUserInputInput,
    handler=request_user_input,
    open_world=False,
)
