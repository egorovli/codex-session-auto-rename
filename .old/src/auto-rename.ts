#!/usr/bin/env bun
import type { HookInput, RenameDecision } from './types.ts'

import { performance } from 'node:perf_hooks'

import { readThread, setThreadName } from './app-server-client.ts'
import { readConfig } from './config.ts'
import { sha256 } from './hash.ts'
import { extractAssistantMessage, extractPrompt, readHookInput } from './hook-input.ts'
import { logDecision } from './log.ts'
import { readThreadState, withThreadLock, writeThreadState } from './state.ts'
import {
	applyDecisionToState,
	createPendingPrompt,
	decideRename,
	extractIntent
} from './title-engine.ts'
import { readTranscriptTail } from './transcript.ts'

const command = process.argv[2] ?? 'decide'

async function main(): Promise<void> {
	const startedAt = performance.now()
	const config = readConfig()
	if (process.env.CODEX_AUTO_RENAME_DISABLED === '1' || !config.enabled) {
		logDecision(config, {
			at: new Date().toISOString(),
			level: 'info',
			event: command,
			decision: 'disabled',
			reason: 'disabled by config or environment'
		})
		return
	}
	if (process.env.CODEX_AUTO_RENAME_HOOK === '1') {
		return
	}
	const input = await readHookInput()
	const threadId = input.session_id
	if (!threadId) {
		logDecision(config, {
			at: new Date().toISOString(),
			level: 'warn',
			event: command,
			decision: 'skipped',
			reason: 'missing session_id'
		})
		return
	}
	await withCommand(config, command, threadId, input, performance.now() - startedAt)
}

async function withCommand(
	config: ReturnType<typeof readConfig>,
	commandName: string,
	threadId: string,
	input: HookInput,
	startupMs: number
): Promise<void> {
	if (commandName === 'capture') {
		withThreadLock(config, threadId, () => {
			const state = readThreadState(config, threadId)
			const prompt = extractPrompt(input)
			if (prompt) {
				state.pendingPrompt = createPendingPrompt(
					input.turn_id ?? sha256(prompt),
					prompt,
					input.cwd
				)
				writeThreadState(config, state)
			}
			logDecision(config, {
				at: new Date().toISOString(),
				level: 'info',
				event: 'capture',
				threadId,
				decision: 'captured',
				reason: prompt ? 'prompt captured' : 'no prompt field found',
				...(prompt ? { sourceHash: sha256(prompt) } : {}),
				durationMs: Math.round(startupMs)
			})
		})
		return
	}
	if (commandName === 'suggest' || commandName === 'decide') {
		await decide(config, threadId, input, commandName === 'suggest', startupMs)
		return
	}
	throw new Error(`Unknown command: ${commandName}`)
}

async function decide(
	config: ReturnType<typeof readConfig>,
	threadId: string,
	input: HookInput,
	suggestOnly: boolean,
	startupMs: number
): Promise<void> {
	let decision: RenameDecision | null = null
	let nextState = readThreadState(config, threadId)
	try {
		await withThreadLock(config, threadId, () => {
			nextState = readThreadState(config, threadId)
			nextState.turnOrdinal += input.hook_event_name === 'Stop' ? 1 : 0
		})
		const state = readThreadState(config, threadId)
		let threadReadError: string | null = null
		const thread = await readThread(config, threadId).catch(error => {
			threadReadError = error instanceof Error ? error.message : String(error)
			return null
		})
		const prompt =
			state.pendingPrompt ??
			(extractPrompt(input)
				? createPendingPrompt(
						input.turn_id ?? sha256(extractPrompt(input)),
						extractPrompt(input),
						input.cwd
					)
				: null)
		const transcript = readTranscriptTail(input.transcript_path)
		const assistantMessage = extractAssistantMessage(input)
		const sourceHash = sha256(
			JSON.stringify({
				threadId,
				turnId: input.turn_id,
				promptHash: prompt?.promptHash,
				assistantHash: sha256(assistantMessage),
				transcriptSignals: transcript.toolSignals
			})
		)
		if (!thread && !suggestOnly && config.mode === 'apply') {
			logDecision(config, {
				at: new Date().toISOString(),
				level: 'warn',
				event: 'decide',
				threadId,
				decision: 'skipped',
				reason: 'app-server thread/read unavailable',
				sourceHash,
				...(threadReadError ? { error: threadReadError } : {}),
				durationMs: Math.round(performance.now() - startupMs)
			})
			return
		}
		const configForDecision = suggestOnly ? { ...config, mode: 'dry-run' as const } : config
		decision = await decideRename({
			config: configForDecision,
			state,
			thread,
			prompt,
			assistantMessage,
			transcript,
			sourceHash
		})
		if (decision.kind === 'renamed' && decision.newTitle) {
			await setThreadName(config, threadId, decision.newTitle)
		}
		const appliedState = applyDecisionToState(state, decision)
		if (prompt && !appliedState.stableIntent) {
			appliedState.stableIntent = extractIntent(prompt.promptPreview)
		}
		appliedState.pendingPrompt = decision.kind === 'renamed' ? null : state.pendingPrompt
		writeThreadState(config, appliedState)
		logDecision(config, {
			at: new Date().toISOString(),
			level: decision.kind === 'failed' ? 'error' : 'info',
			event: suggestOnly ? 'suggest' : 'decide',
			threadId,
			decision: decision.kind,
			oldTitle: decision.oldTitle,
			newTitle: decision.newTitle,
			confidence: decision.confidence,
			reason: decision.reason,
			signals: decision.signals,
			sourceHash: decision.sourceHash,
			durationMs: Math.round(performance.now() - startupMs)
		})
		if (suggestOnly) {
			process.stdout.write(`${JSON.stringify(decision, null, '\t')}\n`)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logDecision(config, {
			at: new Date().toISOString(),
			level: 'error',
			event: suggestOnly ? 'suggest' : 'decide',
			threadId,
			decision: 'failed',
			reason: 'unhandled error',
			error: message,
			durationMs: Math.round(performance.now() - startupMs)
		})
		if (suggestOnly) {
			throw error
		}
	}
}

await main()
