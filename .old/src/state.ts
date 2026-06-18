import type { AutoRenameConfig, ThreadState } from './types.ts'

import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

function safeName(threadId: string): string {
	return basename(threadId).replace(/[^a-zA-Z0-9_.-]/g, '_')
}

export function initialThreadState(threadId: string): ThreadState {
	return {
		threadId,
		stableIntent: null,
		lastAutoTitle: null,
		lastRenameAt: null,
		lastRenameTurnOrdinal: 0,
		turnOrdinal: 0,
		recentTitles: [],
		manualLock: false,
		pendingPrompt: null,
		lastProcessedTurnIds: [],
		updatedAt: new Date().toISOString()
	}
}

export function readThreadState(config: AutoRenameConfig, threadId: string): ThreadState {
	const path = statePath(config, threadId)
	if (!existsSync(path)) {
		return initialThreadState(threadId)
	}
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as ThreadState
	return {
		...initialThreadState(threadId),
		...parsed,
		threadId
	}
}

export function writeThreadState(config: AutoRenameConfig, state: ThreadState): void {
	mkdirSync(config.stateDir, { recursive: true, mode: 0o700 })
	const path = statePath(config, state.threadId)
	const tempPath = `${path}.${process.pid}.tmp`
	const next = { ...state, updatedAt: new Date().toISOString() }
	writeFileSync(tempPath, `${JSON.stringify(next, null, '\t')}\n`, { mode: 0o600 })
	renameSync(tempPath, path)
}

export function withThreadLock<T>(config: AutoRenameConfig, threadId: string, fn: () => T): T {
	mkdirSync(config.stateDir, { recursive: true, mode: 0o700 })
	const lockDir = join(config.stateDir, `${safeName(threadId)}.lock`)
	try {
		mkdirSync(lockDir, { mode: 0o700 })
	} catch (error) {
		if (isFileExistsError(error) && clearStaleLock(lockDir)) {
			mkdirSync(lockDir, { mode: 0o700 })
		} else if (isFileExistsError(error)) {
			throw new Error(`Thread lock busy for ${threadId}`)
		} else {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Unable to create thread lock for ${threadId}: ${message}`)
		}
	}
	try {
		const fd = openSync(join(lockDir, 'owner'), 'w', 0o600)
		try {
			writeFileSync(fd, `${process.pid}\n`)
		} finally {
			closeSync(fd)
		}
		return fn()
	} finally {
		rmSync(lockDir, { recursive: true, force: true })
	}
}

function statePath(config: AutoRenameConfig, threadId: string): string {
	const path = join(config.stateDir, `${safeName(threadId)}.json`)
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
	return path
}

function isFileExistsError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'EEXIST'
	)
}

function clearStaleLock(lockDir: string): boolean {
	try {
		const stat = statSync(lockDir)
		if (Date.now() - stat.mtimeMs < 60_000) {
			return false
		}
		rmSync(lockDir, { recursive: true, force: true })
		return true
	} catch {
		return false
	}
}
