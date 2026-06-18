import type { HookInput } from './types.ts'

import { stdin } from 'node:process'

export async function readHookInput(): Promise<HookInput> {
	const chunks: Buffer[] = []
	for await (const chunk of stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	}
	const raw = Buffer.concat(chunks).toString('utf8').trim()
	if (!raw) {
		return {}
	}
	return JSON.parse(raw) as HookInput
}

export function extractPrompt(input: HookInput): string {
	const candidates = [input.prompt, input.user_prompt, input.message]
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return candidate
		}
	}
	for (const [key, value] of Object.entries(input)) {
		if (/prompt|message|input/i.test(key) && typeof value === 'string' && value.trim()) {
			return value
		}
	}
	return ''
}

export function extractAssistantMessage(input: HookInput): string {
	if (typeof input.last_assistant_message === 'string') {
		return input.last_assistant_message
	}
	return ''
}
