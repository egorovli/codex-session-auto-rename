import { readFileSync, statSync } from 'node:fs'

import { clip, normalizeWhitespace, redactSecrets } from './text.ts'

export interface TranscriptTail {
	userMessages: string[]
	assistantMessages: string[]
	toolSignals: string[]
}

export function readTranscriptTail(
	path: string | null | undefined,
	maxBytes = 384 * 1024
): TranscriptTail {
	if (!path) {
		return { userMessages: [], assistantMessages: [], toolSignals: [] }
	}
	try {
		const stat = statSync(path)
		const start = Math.max(0, stat.size - maxBytes)
		const raw = readFileSync(path).subarray(start).toString('utf8')
		const lines = raw.split('\n').filter(Boolean)
		const userMessages: string[] = []
		const assistantMessages: string[] = []
		const toolSignals: string[] = []
		for (const line of lines) {
			try {
				const parsed = JSON.parse(line) as Record<string, unknown>
				const payload = parsed.payload as Record<string, unknown> | undefined
				if (!payload) {
					continue
				}
				collectFromPayload(payload, userMessages, assistantMessages, toolSignals)
			} catch {
				// Transcript JSONL can be truncated at the head; ignore partial lines.
			}
		}
		return {
			userMessages: userMessages.slice(-3),
			assistantMessages: assistantMessages.slice(-2),
			toolSignals: toolSignals.slice(-12)
		}
	} catch {
		return { userMessages: [], assistantMessages: [], toolSignals: [] }
	}
}

function collectFromPayload(
	payload: Record<string, unknown>,
	userMessages: string[],
	assistantMessages: string[],
	toolSignals: string[]
): void {
	if (payload.type === 'message') {
		const role = payload.role
		const text = extractTextContent(payload.content)
		if (text) {
			if (role === 'user') {
				userMessages.push(text)
			} else if (role === 'assistant') {
				assistantMessages.push(text)
			}
		}
		return
	}
	if (payload.type === 'response_item') {
		const nested = payload.payload as Record<string, unknown> | undefined
		if (nested) {
			collectFromPayload(nested, userMessages, assistantMessages, toolSignals)
		}
		return
	}
	if (payload.type === 'event_msg') {
		const nested = payload.payload as Record<string, unknown> | undefined
		if (nested?.type === 'task_complete') {
			toolSignals.push('task completed')
		}
		return
	}
	if (payload.type === 'function_call' || payload.type === 'tool_call') {
		const name = typeof payload.name === 'string' ? payload.name : 'tool'
		toolSignals.push(name)
	}
}

function extractTextContent(content: unknown): string {
	if (typeof content === 'string') {
		return normalizeTranscriptText(content)
	}
	if (!Array.isArray(content)) {
		return ''
	}
	const parts: string[] = []
	for (const item of content) {
		if (!item || typeof item !== 'object') {
			continue
		}
		const record = item as Record<string, unknown>
		const text = record.text ?? record.input_text ?? record.output_text
		if (typeof text === 'string') {
			parts.push(text)
		}
	}
	return normalizeTranscriptText(parts.join(' '))
}

function normalizeTranscriptText(input: string): string {
	return clip(normalizeWhitespace(redactSecrets(input)), 2500)
}
