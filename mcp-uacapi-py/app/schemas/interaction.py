"""Inline interactive controls (chips, text input, confirm) rendered by the widget."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from app.schemas.base import CamelModel

InteractionType = Literal["chips", "text_input", "confirm"]
InputType = Literal["email", "phone", "text"]


class InteractionOption(CamelModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    label: str = Field(min_length=1, description="Button text shown to the shopper.")
    value: str = Field(
        min_length=1, description="Message text sent back to you when the shopper taps this chip."
    )


class RequestUserInputInput(CamelModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    type: InteractionType = Field(
        description=(
            'Which inline UI to show: "chips" (tappable options), "text_input" (a single '
            'inline field, e.g. email/phone), or "confirm" (a single button).'
        )
    )
    prompt: str = Field(
        min_length=1,
        description='Short label shown with the control (e.g. "Pick a topic" or "Your email").',
    )
    options: list[InteractionOption] | None = Field(
        None, description='Required for "chips": the tappable choices.'
    )
    input_type: InputType | None = Field(
        None, description='For "text_input": the expected value kind (email | phone | text).'
    )
    placeholder: str | None = Field(None, description='For "text_input": placeholder text.')
    submit_label: str | None = Field(
        None, description='For "text_input": the submit button label (default "Send").'
    )
    confirm_label: str | None = Field(
        None, description='For "confirm": the button label (e.g. "Create ticket").'
    )
    confirm_value: str | None = Field(
        None, description='For "confirm": the message sent back when tapped (e.g. "Yes, create it").'
    )


class ChatInteraction(CamelModel):
    type: InteractionType
    prompt: str
    options: list[InteractionOption] | None = None
    input_type: InputType | None = None
    placeholder: str | None = None
    submit_label: str | None = None
    confirm_label: str | None = None
    confirm_value: str | None = None


class RequestUserInputResult(CamelModel):
    interaction: ChatInteraction
