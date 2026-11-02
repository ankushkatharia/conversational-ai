"""Email transport abstraction for support tickets."""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class EmailMessage:
    to: str
    sender: str
    subject: str
    text: str
    reply_to: str | None = None


@dataclass(frozen=True, slots=True)
class SendResult:
    delivered: bool
    transport: str
    message_id: str


class Mailer(Protocol):
    async def send(self, message: EmailMessage) -> SendResult: ...


class LogMailer:
    """Records the message in the logs instead of sending it (EMAIL_TRANSPORT=log)."""

    async def send(self, message: EmailMessage) -> SendResult:
        message_id = f"{int(time.time() * 1000):x}-{secrets.token_hex(4)}@mcp-uacapi"
        logger.info(
            "[email:log] not sent | id=%s to=%s reply_to=%s subject=%s\n%s",
            message_id,
            message.to,
            message.reply_to or "(none)",
            message.subject,
            message.text,
        )
        return SendResult(delivered=False, transport="log", message_id=message_id)


def build_mailer(settings: Settings) -> Mailer:
    match settings.email_transport:
        case "log":
            return LogMailer()
