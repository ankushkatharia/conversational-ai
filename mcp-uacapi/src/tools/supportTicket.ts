/**
 * MCP tool: `create_support_ticket`.
 *
 * Backs the Help / Queries flow. Captures a shopper's issue (category +
 * description, optional order number) and how they want to be helped
 * (`preferredContact`: "ticket" or "call"), generates a ticket reference, and
 * emails the support inbox (recipient is env-configurable via `SUPPORT_EMAIL`,
 * default ankush.katharia@underarmour.com).
 *
 * The shopper identity (customerNo), site/locale, and login email are injected
 * server-side via the `auth` passthrough and are never model-facing. When the
 * shopper does not provide a contact email for a ticket, the injected login
 * email is used as the fallback.
 */

import { z } from 'zod';

import { sendEmail } from '../email/mailer.js';

/** Supported help categories (kept in sync with the widget). */
export const HELP_CATEGORIES = ['order', 'payment', 'product', 'return_refund', 'other'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

/** Human labels for categories (used in the composed email/subject). */
const CATEGORY_LABELS: Record<HelpCategory, string> = {
	order: 'Order issue',
	payment: 'Payment issue',
	product: 'Product issue',
	return_refund: 'Return / Refund',
	other: 'Other',
};

/**
 * Zod schema for the tool input. `auth` carries the server-injected shopper
 * identity/locale/login-email and is stripped from the schema shown to the LLM.
 */
export const createSupportTicketInputSchema = {
	category: z
		.enum(HELP_CATEGORIES)
		.describe('Help category: order | payment | product | return_refund | other.'),
	description: z
		.string()
		.min(1)
		.describe("The shopper's explanation of the problem."),
	orderNumber: z
		.string()
		.optional()
		.describe('Related order number, when the issue is about a specific order.'),
	preferredContact: z
		.enum(['ticket', 'call'])
		.describe('How the shopper wants help: "ticket" (email follow-up) or "call" (phone).'),
	contactEmail: z
		.string()
		.optional()
		.describe('Shopper email for a ticket follow-up; falls back to the login email.'),
	contactPhone: z
		.string()
		.optional()
		.describe('Shopper phone number when they requested a call back.'),
	auth: z
		.object({
			bearerToken: z.string().optional(),
			siteCode: z.string().optional(),
			languageCode: z.string().optional(),
			customerNo: z.string().optional(),
			userEmail: z.string().optional(),
		})
		.optional()
		.describe('Internal: shopper identity/locale/login-email injected by the server; not model-facing.'),
};

/** Inferred TypeScript type for the validated tool input. */
export type CreateSupportTicketInput = {
	category: HelpCategory;
	description: string;
	orderNumber?: string;
	preferredContact: 'ticket' | 'call';
	contactEmail?: string;
	contactPhone?: string;
	auth?: {
		bearerToken?: string;
		siteCode?: string;
		languageCode?: string;
		customerNo?: string;
		userEmail?: string;
	};
};

/** Stable, model-independent ticket payload returned to the UI. */
export interface SupportTicket {
	ref: string;
	category: HelpCategory;
	categoryLabel: string;
	status: string;
	preferredContact: 'ticket' | 'call';
	description: string;
	orderNumber: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	/** Support inbox the ticket was routed to. */
	supportEmail: string;
	createdAt: string;
	/** Whether a real email transport accepted the message (false for log-only). */
	delivered: boolean;
}

export interface CreateSupportTicketResult {
	ticket: SupportTicket;
}

/** Default support inbox; overridden by SUPPORT_EMAIL. */
const DEFAULT_SUPPORT_EMAIL = 'ankush.katharia@underarmour.com';

/** Builds a human-friendly, reasonably-unique ticket reference. */
function makeTicketRef(): string {
	const now = new Date();
	const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `UA-HELP-${ymd}-${rand}`;
}

function sanitize(value: string | undefined): string | undefined {
	const v = value?.trim();
	return v ? v : undefined;
}

/**
 * Validates the request, generates a ticket, emails the support inbox, and
 * returns the stable ticket payload.
 */
export async function runCreateSupportTicket(
	input: CreateSupportTicketInput,
): Promise<CreateSupportTicketResult> {
	const category = input.category;
	const description = sanitize(input.description);
	if (!description) {
		throw new Error('Please describe the problem before submitting a request.');
	}

	const preferredContact = input.preferredContact;
	const contactPhone = sanitize(input.contactPhone);
	// For a ticket, fall back to the injected login email when none is provided.
	const contactEmail =
		preferredContact === 'ticket'
			? sanitize(input.contactEmail) ?? sanitize(input.auth?.userEmail)
			: sanitize(input.contactEmail);

	if (preferredContact === 'call' && !contactPhone) {
		throw new Error('A phone number is required to request a call back.');
	}
	if (preferredContact === 'ticket' && !contactEmail) {
		throw new Error('An email address is required to create a ticket.');
	}

	const orderNumber = sanitize(input.orderNumber) ?? null;
	const supportEmail = sanitize(process.env.SUPPORT_EMAIL) ?? DEFAULT_SUPPORT_EMAIL;
	const ref = makeTicketRef();
	const createdAt = new Date().toISOString();
	const categoryLabel = CATEGORY_LABELS[category];
	const customerNo = sanitize(input.auth?.customerNo) ?? '(guest / unknown)';
	const site = sanitize(input.auth?.siteCode) ?? '(default)';

	const subjectBits = [`[Help/${categoryLabel}]`, ref];
	if (orderNumber) subjectBits.push(`order ${orderNumber}`);
	const subject = subjectBits.join(' · ');

	const body = [
		`New help request: ${ref}`,
		`Created: ${createdAt}`,
		'',
		`Category: ${categoryLabel} (${category})`,
		`Preferred contact: ${preferredContact === 'call' ? 'Call back' : 'Ticket / email'}`,
		orderNumber ? `Order number: ${orderNumber}` : 'Order number: (none)',
		'',
		'Customer:',
		`  Customer no: ${customerNo}`,
		`  Site: ${site}`,
		`  Email: ${contactEmail ?? '(not provided)'}`,
		`  Phone: ${contactPhone ?? '(not provided)'}`,
		'',
		'Problem description:',
		description,
		'',
		'-- Sent by the UA shopping assistant Help / Queries flow.',
	].join('\n');

	// eslint-disable-next-line no-console
	console.error(
		`[create_support_ticket] ${ref} category=${category} contact=${preferredContact} ` +
			`order=${orderNumber ?? '-'} -> ${supportEmail}`,
	);

	const result = await sendEmail({
		to: supportEmail,
		subject,
		text: body,
		replyTo: contactEmail,
	});

	return {
		ticket: {
			ref,
			category,
			categoryLabel,
			status: 'received',
			preferredContact,
			description,
			orderNumber,
			contactEmail: contactEmail ?? null,
			contactPhone: contactPhone ?? null,
			supportEmail,
			createdAt,
			delivered: result.delivered,
		},
	};
}
