import { describe, expect, test } from 'bun:test'

import { defaultConfig } from '../src/config.ts'
import { initialThreadState } from '../src/state.ts'
import { applyDecisionToState, createPendingPrompt, decideRename } from '../src/title-engine.ts'

describe('title engine', () => {
	test('renames a generic title after a meaningful prompt', async () => {
		const config = { ...defaultConfig(), mode: 'dry-run' as const }
		const state = initialThreadState('thread-1')
		const prompt = createPendingPrompt(
			'turn-1',
			'Build a Bun TypeScript Codex hook that auto renames thread titles',
			'/tmp/project'
		)
		const decision = await decideRename({
			config,
			state,
			thread: { id: 'thread-1', name: 'New chat' },
			prompt,
			assistantMessage: 'Implemented the package and tests.',
			transcript: { userMessages: [], assistantMessages: [], toolSignals: ['edited files'] },
			sourceHash: 'source-1'
		})
		expect(decision.kind).toBe('would_rename')
		expect(decision.newTitle).toContain('Codex')
		expect(decision.newTitle).toContain('Auto')
	})

	test('skips same-task follow-up under cooldown', async () => {
		const config = { ...defaultConfig(), mode: 'dry-run' as const }
		const state = initialThreadState('thread-1')
		const firstPrompt = createPendingPrompt(
			'turn-1',
			'Research Codex auto rename hooks',
			'/tmp/project'
		)
		const firstDecision = await decideRename({
			config,
			state,
			thread: { id: 'thread-1', name: 'New chat' },
			prompt: firstPrompt,
			assistantMessage: 'Researched Codex hooks and app server thread naming.',
			transcript: { userMessages: [], assistantMessages: [], toolSignals: [] },
			sourceHash: 'source-1'
		})
		const nextState = applyDecisionToState(state, firstDecision)
		const followUp = createPendingPrompt(
			'turn-2',
			'Can you add tests for that same hook?',
			'/tmp/project'
		)
		const followUpDecision = await decideRename({
			config,
			state: nextState,
			thread: { id: 'thread-1', name: firstDecision.newTitle },
			prompt: followUp,
			assistantMessage: 'Added tests for the same hook.',
			transcript: { userMessages: [], assistantMessages: [], toolSignals: ['tests'] },
			sourceHash: 'source-2'
		})
		expect(followUpDecision.kind).toBe('skipped')
	})

	test('detects manual title override', async () => {
		const config = { ...defaultConfig(), mode: 'dry-run' as const, respectManualTitles: true }
		const state = {
			...initialThreadState('thread-1'),
			lastAutoTitle: 'Codex Auto Rename Hook',
			stableIntent: createPendingPrompt('turn-1', 'Codex auto rename hook', '/tmp/project').intent
		}
		const prompt = createPendingPrompt(
			'turn-2',
			'Switch gears and research mobile SQLCipher boot errors',
			'/tmp/project'
		)
		const decision = await decideRename({
			config,
			state,
			thread: { id: 'thread-1', name: 'My Hand Picked Title' },
			prompt,
			assistantMessage: 'Researched SQLCipher boot handling.',
			transcript: { userMessages: [], assistantMessages: [], toolSignals: [] },
			sourceHash: 'source-2'
		})
		expect(decision.kind).toBe('skipped')
		expect(decision.signals).toContain('manual_title_detected')
	})
})
