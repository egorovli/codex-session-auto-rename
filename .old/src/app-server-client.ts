import type { AutoRenameConfig, ThreadRecord } from './types.ts'

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

interface JsonRpcResponse {
	id?: number
	result?: unknown
	error?: { code: number; message: string }
}

interface AppServerProcess {
	send: (message: unknown) => void
	request: (method: string, params: unknown) => Promise<unknown>
	close: () => void
}

export async function readThread(
	config: AutoRenameConfig,
	threadId: string
): Promise<ThreadRecord | null> {
	return withAppServer(config, async client => {
		const result = await client.request('thread/read', {
			threadId,
			includeTurns: false
		})
		return parseThreadReadResult(result)
	})
}

export async function setThreadName(
	config: AutoRenameConfig,
	threadId: string,
	name: string
): Promise<void> {
	await withAppServer(config, async client => {
		await client.request('thread/name/set', { threadId, name })
	})
}

async function withAppServer<T>(
	config: AutoRenameConfig,
	fn: (client: AppServerProcess) => Promise<T>
): Promise<T> {
	let lastError: Error | null = null
	for (const mode of ['proxy', 'stdio'] as const) {
		let client: AppServerProcess | null = null
		try {
			client = await startClient(config, mode)
			return await fn(client)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
		} finally {
			client?.close()
		}
	}
	throw lastError ?? new Error('App-server unavailable')
}

function parseThreadReadResult(result: unknown): ThreadRecord | null {
	if (!result || typeof result !== 'object') {
		return null
	}
	const record = result as Record<string, unknown>
	if (isThreadRecord(record)) {
		return record
	}
	const thread = record.thread
	if (isThreadRecord(thread)) {
		return thread
	}
	return null
}

function isThreadRecord(value: unknown): value is ThreadRecord {
	if (!value || typeof value !== 'object') {
		return false
	}
	return typeof (value as { id?: unknown }).id === 'string'
}

async function startClient(
	config: AutoRenameConfig,
	mode: 'proxy' | 'stdio'
): Promise<AppServerProcess> {
	const args = mode === 'proxy' ? ['app-server', 'proxy'] : ['app-server', '--stdio']
	const child = spawn(config.codexPath, args, {
		stdio: ['pipe', 'pipe', 'ignore'],
		env: {
			...process.env,
			CODEX_AUTO_RENAME_HOOK: '1'
		}
	})
	let nextId = 1
	const pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: Timer }
	>()
	const rl = createInterface({ input: child.stdout })
	rl.on('line', line => {
		let message: JsonRpcResponse
		try {
			message = JSON.parse(line) as JsonRpcResponse
		} catch {
			return
		}
		if (typeof message.id !== 'number') {
			return
		}
		const waiter = pending.get(message.id)
		if (!waiter) {
			return
		}
		clearTimeout(waiter.timeout)
		pending.delete(message.id)
		if (message.error) {
			waiter.reject(new Error(message.error.message))
		} else {
			waiter.resolve(message.result)
		}
	})
	child.on('exit', () => {
		for (const [id, waiter] of pending) {
			clearTimeout(waiter.timeout)
			waiter.reject(new Error('app-server process exited'))
			pending.delete(id)
		}
	})

	const send = (message: unknown) => {
		child.stdin.write(`${JSON.stringify(message)}\n`)
	}
	const request = (method: string, params: unknown) => {
		const id = nextId
		nextId += 1
		const promise = new Promise<unknown>((resolve, reject) => {
			const timeout = setTimeout(() => {
				pending.delete(id)
				reject(new Error(`app-server request timed out: ${method}`))
			}, config.appServerTimeoutMs)
			pending.set(id, { resolve, reject, timeout })
		})
		send({ method, id, params })
		return promise
	}

	const client: AppServerProcess = {
		send,
		request,
		close: () => {
			rl.close()
			child.kill('SIGTERM')
		}
	}

	await request('initialize', {
		clientInfo: {
			name: 'codex_auto_thread_title',
			title: 'Codex Session Auto Rename',
			version: '0.1.0'
		},
		capabilities: {
			experimentalApi: true
		}
	})
	send({ method: 'initialized', params: {} })
	return client
}
