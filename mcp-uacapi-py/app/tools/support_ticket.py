"""`create_support_ticket`: Help / Queries ticket or call-back request (emails the support inbox)."""

from __future__ import annotations

import logging
import secrets
import string
from datetime import UTC, datetime

from app.core.errors import BadRequestError
from app.schemas.support import CreateSupportTicketInput, CreateSupportTicketResult, SupportTicket
from app.services.email import EmailMessage
from app.tools.base import ToolContext, ToolSpec

logger = logging.getLogger(__name__)

CATEGORY_LABELS = {
    "order": "Order issue",
    "payment": "Payment issue",
    "product": "Product issue",
    "return_refund": "Return / Refund",
    "other": "Other",
}
_REF_ALPHABET = string.ascii_uppercase + string.digits


def _ticket_ref(now: datetime) -> str:
    suffix = "".join(secrets.choice(_REF_ALPHABET) for _ in range(4))
    return f"UA-HELP-{now:%Y%m%d}-{suffix}"


async def create_support_ticket(
    params: CreateSupportTicketInput, ctx: ToolContext
) -> CreateSupportTicketResult:
    phone = params.contact_phone or None
    email = params.contact_email or None
    if params.preferred_contact == "ticket":
        email = email or ctx.auth.user_email
        if not email:
            raise BadRequestError("An email address is required to create a ticket.")
    elif not phone:
        raise BadRequestError("A phone number is required to request a call back.")

    now = datetime.now(UTC)
    ref = _ticket_ref(now)
    label = CATEGORY_LABELS[params.category]
    order_number = params.order_number or None
    support_email = ctx.settings.support_email

    subject = " · ".join([f"[Help/{label}]", ref, *([f"order {order_number}"] if order_number else [])])
    contact = "Call back" if params.preferred_contact == "call" else "Ticket / email"
    body = "\n".join(
        [
            f"New help request: {ref}",
            f"Created: {now.isoformat()}",
            "",
            f"Category: {label} ({params.category})",
            f"Preferred contact: {contact}",
            f"Order number: {order_number or '(none)'}",
            "",
            "Customer:",
            f"  Customer no: {ctx.auth.customer_no or '(guest / unknown)'}",
            f"  Site: {ctx.auth.site_code or '(default)'}",
            f"  Email: {email or '(not provided)'}",
            f"  Phone: {phone or '(not provided)'}",
            "",
            "Problem description:",
            params.description,
            "",
            "-- Sent by the UA shopping assistant Help / Queries flow.",
        ]
    )
    logger.info("support ticket %s category=%s contact=%s", ref, params.category, params.preferred_contact)
    result = await ctx.mailer.send(
        EmailMessage(
            to=support_email,
            sender=ctx.settings.support_email_from,
            subject=subject,
            text=body,
            reply_to=email,
        )
    )
    return CreateSupportTicketResult(
        ticket=SupportTicket(
            ref=ref,
            category=params.category,
            category_label=label,
            status="received",
            preferred_contact=params.preferred_contact,
            description=params.description,
            order_number=order_number,
            contact_email=email,
            contact_phone=phone,
            support_email=support_email,
            created_at=now.isoformat(),
            delivered=result.delivered,
        )
    )


SPEC = ToolSpec(
    name="create_support_ticket",
    title="Create a support ticket / contact request",
    description=(
        "Create a help request for the Help / Queries flow. Use after the shopper has chosen a "
        "category (order | payment | product | return_refund | other), described the problem, "
        'and chosen how to be helped ("ticket" for an email follow-up, or "call" for a phone '
        'call back). Collect "contactEmail" for a ticket (falls back to the login email) or '
        '"contactPhone" for a call. Generates a ticket reference and emails the support inbox. '
        "Only call this with the user's explicit confirmation and their own details; the server "
        "injects identity/site/login-email."
    ),
    input_model=CreateSupportTicketInput,
    handler=create_support_ticket,
    read_only=False,
)
