"""Help / Queries support ticket models."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from app.schemas.base import CamelModel

HelpCategory = Literal["order", "payment", "product", "return_refund", "other"]
PreferredContact = Literal["ticket", "call"]


class CreateSupportTicketInput(CamelModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category: HelpCategory = Field(
        description="Help category: order | payment | product | return_refund | other."
    )
    description: str = Field(min_length=1, description="The shopper's explanation of the problem.")
    order_number: str | None = Field(
        None, description="Related order number, when the issue is about a specific order."
    )
    preferred_contact: PreferredContact = Field(
        description='How the shopper wants help: "ticket" (email follow-up) or "call" (phone).'
    )
    contact_email: str | None = Field(
        None, description="Shopper email for a ticket follow-up; falls back to the login email."
    )
    contact_phone: str | None = Field(
        None, description="Shopper phone number when they requested a call back."
    )


class SupportTicket(CamelModel):
    ref: str
    category: HelpCategory
    category_label: str
    status: str
    preferred_contact: PreferredContact
    description: str
    order_number: str | None
    contact_email: str | None
    contact_phone: str | None
    support_email: str
    created_at: str
    delivered: bool


class CreateSupportTicketResult(CamelModel):
    ticket: SupportTicket


class SupportTicketRequest(CreateSupportTicketInput):
    """`POST /support-ticket` body. `x-ua-user-email` header takes precedence over `userEmail`."""

    user_email: str | None = None
    site_id: str | None = None
