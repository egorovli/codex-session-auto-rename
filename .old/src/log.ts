import type { AutoRenameConfig, RenameDecision } from './types.ts'

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface LogEntry {
	at: string
	level: 'info' | 'warn' | 'error'
	event: string
	threadId?: string
	decision?: RenameDecision['kind']
	reason?: string
	signals?: string[]
	oldTitle?: string | null
	newTitle?: string | null
	confidence?: number
	sourceHash?: string
	error?: string
	durationMs?: number
}

export function logDecision(config: AutoRenameConfig, entry: LogEntry): void {
	try {
		mkdirSync(dirname(config.logPath), { recursive: true, mode: 0o700 })
		appendFileSync(config.logPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
	} catch {
		// Hooks should fail open and avoid noisy stderr.
	}
}
