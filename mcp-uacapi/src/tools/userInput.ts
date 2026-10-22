/**
 * MCP tool: `request_user_input`.
 *
 * Lets the model drive a conversational, inline interactive flow (primarily the
 * Help / Queries experience) by emitting a small UI affordance that the widget
 * renders INSIDE the chat transcript - clickable chips, an inline text input
 * (e.g. for an email / phone), or a confirm button. It performs no side effects;
 * it simply validates and echoes a normalized `interaction` payload.
 *
 * The widget renders the affordance after the assistant's message, and whatever
 * the shopper chooses/types is sent back as a normal chat message, so the model
 * stays in control of every step (fully model-driven).
 */

import { z } from 'zod';

/** The kind of inline interactive element to render. */
export const INTERACTION_TYPES = ['chips', 'text_input', 'confirm'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Input field type hint for a `text_input` interaction. */
const INPUT_TYPES = ['email', 'phone', 'text'] as const;

/**
 * Zod schema for the tool input. `auth` carries the server-injected context and
 * is stripped from the model-facing schema at the call boundary.
 */
export const requestUserInputInputSchema = {
	type: z
		.enum(INTERACTION_TYPES)
		.describe(
			'Which inline UI to show: "chips" (tappable options), "text_input" ' +
				'(a single inline field, e.g. email/phone), or "confirm" (a single button).',
		),
	prompt: z
		.string()
		.min(1)
		.describe('Short label shown above/with the control (e.g. "Pick a topic" or "Your email").'),
	options: z
		.array(
			z.object({
				label: z.string().min(1).describe('Button text shown to the shopper.'),
				value: z
					.string()
					.min(1)
					.describe('Message text sent back to you when the shopper taps this chip.'),
			}),
		)
		.optional()
		.describe('Required for "chips": the tappable choices.'),
	inputType: z
		.enum(INPUT_TYPES)
		.optional()
		.describe('For "text_input": the expected value kind (email | phone | text).'),
	placeholder: z.string().optional().describe('For "text_input": placeholder text.'),
	submitLabel: z
		.string()
		.optional()
		.describe('For "text_input": the submit button label (default "Send").'),
	confirmLabel: z
		.string()
		.optional()
		.describe('For "confirm": the button label (e.g. "Create ticket").'),
	confirmValue: z
		.string()
		.optional()
		.describe('For "confirm": the message text sent back when tapped (e.g. "Yes, create it").'),
	auth: z
		.object({
			bearerToken: z.string().optional(),
			siteCode: z.string().optional(),
			languageCode: z.string().optional(),
			customerNo: z.string().optional(),
			userEmail: z.string().optional(),
		})
		.optional()
		.describe('Internal: server-injected context; not model-facing.'),
};

export interface InteractionOption {
	label: string;
	value: string;
}

/** Stable, model-independent interaction payload returned to the UI. */
export interface ChatInteraction {
	type: InteractionType;
	prompt: string;
	options?: InteractionOption[];
	inputType?: 'email' | 'phone' | 'text';
	placeholder?: string;
	submitLabel?: string;
	confirmLabel?: string;
	confirmValue?: string;
}

export interface RequestUserInputResult {
	interaction: ChatInteraction;
}

export type RequestUserInputInput = {
	type: InteractionType;
	prompt: string;
	options?: InteractionOption[];
	inputType?: 'email' | 'phone' | 'text';
	placeholder?: string;
	submitLabel?: string;
	confirmLabel?: string;
	confirmValue?: string;
	auth?: unknown;
};

/** Validates the request and returns a normalized interaction for the widget. */
export async function runRequestUserInput(
	input: RequestUserInputInput,
): Promise<RequestUserInputResult> {
	const prompt = input.prompt?.trim();
	if (!prompt) {
		throw new Error('A non-empty "prompt" is required.');
	}

	if (input.type === 'chips') {
		const options = (input.options ?? [])
			.map((o) => ({ label: o.label?.trim(), value: o.value?.trim() }))
			.filter((o): o is InteractionOption => Boolean(o.label && o.value));
		if (options.length === 0) {
			throw new Error('"chips" requires at least one option with a label and value.');
		}
		return { interaction: { type: 'chips', prompt, options } };
	}

	if (input.type === 'text_input') {
		return {
			interaction: {
				type: 'text_input',
				prompt,
				inputType: input.inputType ?? 'text',
				placeholder: input.placeholder?.trim() || undefined,
				submitLabel: input.submitLabel?.trim() || undefined,
			},
		};
	}

	// confirm
	return {
		interaction: {
			type: 'confirm',
			prompt,
			confirmLabel: input.confirmLabel?.trim() || 'Confirm',
			confirmValue: input.confirmValue?.trim() || prompt,
		},
	};
}
