/**
 * Minimal email transport abstraction for support tickets / contact requests.
 *
 * The transport is selected by `EMAIL_TRANSPORT` (default "log"). The default
 * "log" transport does NOT send real mail - it records the message to stderr
 * (and, when `DEBUG_UACAPI_FILE` is set, appends it to that file) so the Help /
 * Queries flow works end to end now. Real transports (SMTP, provider API) can be
 * added behind the same `sendEmail` interface later without touching callers.
 */

import { appendFileSync } from 'node:fs';

export interface SendEmailInput {
	to: string;
	from?: string;
	subject: string;
	text: string;
	/** Optional reply-to (e.g. the customer's email) so support can respond. */
	replyTo?: string;
}

export interface SendEmailResult {
	/** True only when a real transport actually accepted the message. */
	delivered: boolean;
	/** Which transport handled it ("log" | "smtp" | ...). */
	transport: string;
	/** Synthetic message id for correlation/telemetry. */
	messageId: string;
}

/** Default sender address (override via SUPPORT_EMAIL_FROM). */
const DEFAULT_FROM = 'no-reply@underarmour.com';

function makeMessageId(): string {
	const rand = Math.random().toString(36).slice(2, 10);
	return `${Date.now().toString(36)}-${rand}@mcp-uacapi`;
}

/**
 * Sends (or, for the "log" transport, records) an email. Returns metadata about
 * how it was handled. Throws only for an unknown/misconfigured transport.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
	const transport = (process.env.EMAIL_TRANSPORT ?? 'log').trim().toLowerCase();
	const from = input.from ?? process.env.SUPPORT_EMAIL_FROM?.trim() ?? DEFAULT_FROM;
	const messageId = makeMessageId();

	if (transport === 'log') {
		const rendered = [
			'[email:log] (not actually sent - EMAIL_TRANSPORT=log)',
			`  message-id: ${messageId}`,
			`  from: ${from}`,
			`  to: ${input.to}`,
			`  reply-to: ${input.replyTo ?? '(none)'}`,
			`  subject: ${input.subject}`,
			'  --- body ---',
			input.text,
			'  --- end ---',
		].join('\n');

		// eslint-disable-next-line no-console
		console.error(rendered);
		const file = process.env.DEBUG_UACAPI_FILE?.trim();
		if (file) {
			try {
				appendFileSync(file, `${rendered}\n`);
			} catch {
				/* best-effort file logging */
			}
		}
		return { delivered: false, transport: 'log', messageId };
	}

	// Future transports (e.g. "smtp" via nodemailer, or a provider HTTP API) plug
	// in here, reading their own env (SMTP_HOST/PORT/USER/PASS or an API key).
	throw new Error(
		`Unsupported EMAIL_TRANSPORT "${transport}". Supported transports: "log". ` +
			'Add an SMTP/provider transport in src/email/mailer.ts to enable real sending.',
	);
}
