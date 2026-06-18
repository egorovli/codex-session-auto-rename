import type { TranscriptTail } from './transcript.ts'
import type {
	AutoRenameConfig,
	IntentSummary,
	PendingPrompt,
	RenameDecision,
	ThreadRecord,
	ThreadState
} from './types.ts'

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sha256 } from './hash.ts'
import {
	clip,
	hasControlCharacters,
	jaccard,
	normalizeWhitespace,
	titleCase,
	words
} from './text.ts'

const GENERIC_TITLES = new Set([
	'',
	'new chat',
	'new thread',
	'untitled',
	'codex',
	'debug issue',
	'help',
	'question'
])

const SAME_TASK_HINTS =
	/\b(continue|same|that|this|now test|run tests|commit|push|merge|fix that|status|how is it going)\b/i
const CHANGE_HINTS =
	/\b(new task|switch gears|different question|unrelated|another repo|now research|let's do|lets do)\b/i

export function createPendingPrompt(
	turnId: string,
	prompt: string,
	cwd: string | undefined
): PendingPrompt {
	const promptPreview = clip(normalizeWhitespace(prompt), 4000)
	return {
		turnId,
		promptHash: sha256(promptPreview),
		promptPreview,
		intent: extractIntent([promptPreview, cwd ?? ''].join(' ')),
		createdAt: new Date().toISOString()
	}
}

export async function decideRename(input: {
	config: AutoRenameConfig
	state: ThreadState
	thread: ThreadRecord | null
	prompt: PendingPrompt | null
	assistantMessage: string
	transcript: TranscriptTail
	sourceHash: string
	force?: boolean
}): Promise<RenameDecision> {
	const { config, state, thread, prompt, transcript, sourceHash } = input
	const threadId = state.threadId
	const oldTitle = thread?.name ?? null
	if (process.env.CODEX_AUTO_RENAME_DISABLED === '1' || !config.enabled || config.mode === 'off') {
		return skipped(threadId, oldTitle, sourceHash, 'disabled', ['disabled'])
	}
	if (state.lastProcessedTurnIds.includes(prompt?.turnId ?? sourceHash)) {
		return skipped(threadId, oldTitle, sourceHash, 'turn already processed', ['idempotent'])
	}
	if (state.manualLock && !input.force) {
		return skipped(threadId, oldTitle, sourceHash, 'manual title lock', ['manual_lock'])
	}
	if (
		config.respectManualTitles &&
		state.lastAutoTitle &&
		oldTitle &&
		oldTitle !== state.lastAutoTitle
	) {
		state.manualLock = true
		return skipped(threadId, oldTitle, sourceHash, 'current title differs from last auto title', [
			'manual_title_detected'
		])
	}

	const promptText = prompt?.promptPreview ?? transcript.userMessages.at(-1) ?? ''
	const outcomeText = normalizeWhitespace(
		[input.assistantMessage, ...transcript.assistantMessages, ...transcript.toolSignals].join(' ')
	)
	const completedIntent = extractIntent([promptText, outcomeText, thread?.cwd ?? ''].join(' '))
	const stableIntent = state.stableIntent
	const oldIsGeneric = isGenericTitle(oldTitle)
	const meaningful = isMeaningfulTurn(promptText, outcomeText, oldIsGeneric)
	if (!meaningful) {
		return skipped(threadId, oldTitle, sourceHash, 'turn is not meaningful enough', ['low_signal'])
	}

	const similarity = stableIntent ? scoreSimilarity(stableIntent, completedIntent, promptText) : 0
	const strongChangeSignals = countStrongChangeSignals(
		stableIntent,
		completedIntent,
		promptText,
		oldTitle
	)
	const cooldown = cooldownAllowsRename(config, state)
	const firstTitle = oldIsGeneric && !state.lastAutoTitle
	const improvedFirstTitle = oldIsGeneric || titleTooBroad(oldTitle, completedIntent)
	const shouldRename =
		firstTitle ||
		(input.force ?? false) ||
		(cooldown && similarity < 0.3 && strongChangeSignals >= 2) ||
		(cooldown && similarity < 0.45 && strongChangeSignals >= 1) ||
		(cooldown && improvedFirstTitle && similarity < 0.72)

	if (!shouldRename) {
		return skipped(threadId, oldTitle, sourceHash, 'same durable task or cooldown active', [
			`similarity:${similarity.toFixed(2)}`,
			`strong_change:${strongChangeSignals}`
		])
	}

	const generated = generateTitle(completedIntent, promptText, config.maxTitleLength)
	const llmTitle =
		config.llm.enabled && generated.confidence < 0.75
			? await generateTitleWithCodex(config, oldTitle, promptText, outcomeText)
			: null
	const candidate = llmTitle?.title ?? generated.title
	const confidence = Math.max(generated.confidence, llmTitle?.confidence ?? 0)
	const checked = validateTitle(candidate, oldTitle, config.maxTitleLength)
	if (!checked.ok) {
		return skipped(threadId, oldTitle, sourceHash, checked.reason, ['invalid_title'])
	}
	if (confidence < 0.68 && !firstTitle) {
		return skipped(threadId, oldTitle, sourceHash, 'candidate confidence too low', [
			`confidence:${confidence.toFixed(2)}`
		])
	}

	return {
		kind: config.mode === 'dry-run' ? 'would_rename' : 'renamed',
		threadId,
		oldTitle,
		newTitle: checked.title,
		confidence,
		reason: firstTitle ? 'first meaningful title' : 'material direction change',
		signals: [
			`similarity:${similarity.toFixed(2)}`,
			`strong_change:${strongChangeSignals}`,
			...generated.signals,
			...(llmTitle ? ['llm_title'] : [])
		],
		sourceHash
	}
}

export function applyDecisionToState(state: ThreadState, decision: RenameDecision): ThreadState {
	const turnKey = decision.sourceHash
	const processed = [...state.lastProcessedTurnIds.filter(id => id !== turnKey), turnKey].slice(-20)
	const next: ThreadState = {
		...state,
		lastProcessedTurnIds: processed,
		turnOrdinal: state.turnOrdinal + 1
	}
	if ((decision.kind === 'renamed' || decision.kind === 'would_rename') && decision.newTitle) {
		next.lastAutoTitle = decision.newTitle
		next.lastRenameAt = new Date().toISOString()
		next.lastRenameTurnOrdinal = next.turnOrdinal
		next.recentTitles = [...state.recentTitles, decision.newTitle].slice(-8)
		next.stableIntent = extractIntent(decision.newTitle)
		next.pendingPrompt = null
	}
	return next
}

export function extractIntent(input: string): IntentSummary {
	const normalized = normalizeWhitespace(input)
	const ticketIds = Array.from(new Set(normalized.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []))
	const paths = Array.from(
		new Set(normalized.match(/\b(?:[\w.-]+\/)+(?:[\w.[\]-]+)\b/g)?.slice(0, 8) ?? [])
	)
	const keywords = Array.from(new Set(words(normalized))).slice(0, 20)
	return {
		ticketIds,
		paths,
		repoWords: keywords.filter(word => /repo|mobile|web|api|codex|hook|thread|title/.test(word)),
		actionType: classifyAction(normalized),
		deliverableType: classifyDeliverable(normalized),
		keywords,
		userGoal: clip(normalized, 500)
	}
}

function scoreSimilarity(a: IntentSummary, b: IntentSummary, promptText: string): number {
	let score = 0
	if (intersects(a.ticketIds, b.ticketIds)) {
		score += 0.25
	}
	if (intersects(a.repoWords, b.repoWords)) {
		score += 0.2
	}
	if (intersects(a.paths, b.paths)) {
		score += 0.15
	}
	if (a.deliverableType === b.deliverableType) {
		score += 0.15
	}
	if (a.actionType === b.actionType) {
		score += 0.1
	}
	score += Math.min(0.1, jaccard(a.keywords, b.keywords) * 0.1)
	if (SAME_TASK_HINTS.test(promptText)) {
		score += 0.05
	}
	return Math.min(1, score)
}

function countStrongChangeSignals(
	stable: IntentSummary | null,
	next: IntentSummary,
	promptText: string,
	oldTitle: string | null
): number {
	let count = 0
	if (!stable) {
		return 2
	}
	if (CHANGE_HINTS.test(promptText)) {
		count += 1
	}
	if (
		stable.ticketIds.length > 0 &&
		next.ticketIds.length > 0 &&
		!intersects(stable.ticketIds, next.ticketIds)
	) {
		count += 1
	}
	if (stable.deliverableType !== next.deliverableType && next.deliverableType !== 'unknown') {
		count += 1
	}
	if (oldTitle && jaccard(words(oldTitle), next.keywords) < 0.15) {
		count += 1
	}
	return count
}

function isMeaningfulTurn(promptText: string, outcomeText: string, oldIsGeneric: boolean): boolean {
	const combined = `${promptText} ${outcomeText}`
	if (oldIsGeneric && words(promptText).length >= 3) {
		return true
	}
	if (
		/\b(implement|fix|research|plan|review|deploy|diagnose|test|merge|install|hook|plugin)\b/i.test(
			combined
		)
	) {
		return true
	}
	return words(combined).length >= 18
}

function generateTitle(
	intent: IntentSummary,
	promptText: string,
	maxLength: number
): { title: string; confidence: number; signals: string[] } {
	const signals: string[] = []
	const pieces: string[] = []
	if (intent.ticketIds[0]) {
		pieces.push(intent.ticketIds[0])
		signals.push('ticket')
	}
	const domain = pickDomain(intent, promptText)
	if (domain) {
		pieces.push(...domain)
		signals.push('domain')
	}
	const outcome = pickOutcome(intent)
	if (outcome) {
		pieces.push(...outcome)
		signals.push('outcome')
	}
	if (pieces.length < 3) {
		pieces.push(...intent.keywords.slice(0, 6 - pieces.length))
	}
	const uniquePieces = dedupeWords(pieces).slice(0, 8)
	const title = clip(titleCase(uniquePieces.join(' ')), maxLength)
	const confidence = Math.min(
		0.92,
		0.45 + signals.length * 0.15 + Math.min(0.17, uniquePieces.length * 0.03)
	)
	return { title, confidence, signals }
}

function pickDomain(intent: IntentSummary, promptText: string): string[] {
	const source = `${promptText} ${intent.userGoal}`.toLowerCase()
	if (source.includes('auto') && source.includes('rename')) {
		return ['Codex', 'Auto', 'Rename']
	}
	if (source.includes('thread') && source.includes('title')) {
		return ['Thread', 'Title']
	}
	if (source.includes('mobile')) {
		return ['Mobile']
	}
	if (source.includes('revenuecat')) {
		return ['RevenueCat']
	}
	if (source.includes('jira')) {
		return ['Jira']
	}
	const path = intent.paths[0]
	if (path) {
		return path.split('/').filter(Boolean).slice(-2)
	}
	return intent.repoWords.slice(0, 2)
}

function pickOutcome(intent: IntentSummary): string[] {
	if (intent.deliverableType === 'plugin') {
		return ['Hook', 'Package']
	}
	if (intent.deliverableType === 'research') {
		return ['Research', 'Plan']
	}
	if (intent.deliverableType === 'implementation') {
		return ['Implementation']
	}
	if (intent.deliverableType === 'debugging') {
		return ['Diagnostics']
	}
	if (intent.deliverableType === 'deployment') {
		return ['Deployment']
	}
	if (intent.actionType !== 'unknown') {
		return [intent.actionType]
	}
	return []
}

function classifyAction(input: string): string {
	if (/\b(research|investigate|look up|find)\b/i.test(input)) {
		return 'research'
	}
	if (/\b(plan|design|architect)\b/i.test(input)) {
		return 'design'
	}
	if (/\b(implement|build|add|create|install|wire)\b/i.test(input)) {
		return 'build'
	}
	if (/\b(debug|diagnose|fix|repair)\b/i.test(input)) {
		return 'fix'
	}
	if (/\b(review|audit)\b/i.test(input)) {
		return 'review'
	}
	if (/\b(deploy|release|rollout)\b/i.test(input)) {
		return 'deploy'
	}
	return 'unknown'
}

function classifyDeliverable(input: string): string {
	if (/\b(plugin|hook|redistributable|package)\b/i.test(input)) {
		return 'plugin'
	}
	if (/\b(research|plan|proposal)\b/i.test(input)) {
		return 'research'
	}
	if (/\b(implement|build|code|script|typescript|bun)\b/i.test(input)) {
		return 'implementation'
	}
	if (/\b(debug|diagnose|error|failure)\b/i.test(input)) {
		return 'debugging'
	}
	if (/\b(deploy|release)\b/i.test(input)) {
		return 'deployment'
	}
	return 'unknown'
}

function validateTitle(
	title: string,
	oldTitle: string | null,
	maxLength: number
): { ok: true; title: string } | { ok: false; reason: string } {
	const normalized = normalizeWhitespace(title)
	if (!normalized) {
		return { ok: false, reason: 'empty title' }
	}
	if (hasControlCharacters(normalized)) {
		return { ok: false, reason: 'title contains control characters' }
	}
	if (normalized.length > maxLength) {
		return { ok: true, title: clip(normalized, maxLength) }
	}
	if (oldTitle && normalized.toLowerCase() === oldTitle.toLowerCase()) {
		return { ok: false, reason: 'candidate equals current title' }
	}
	if (GENERIC_TITLES.has(normalized.toLowerCase())) {
		return { ok: false, reason: 'candidate is generic' }
	}
	return { ok: true, title: normalized }
}

function isGenericTitle(title: string | null): boolean {
	if (!title) {
		return true
	}
	const normalized = normalizeWhitespace(title).toLowerCase()
	return GENERIC_TITLES.has(normalized) || words(normalized).length < 3
}

function titleTooBroad(title: string | null, intent: IntentSummary): boolean {
	if (!title) {
		return true
	}
	return jaccard(words(title), intent.keywords) < 0.2
}

function cooldownAllowsRename(config: AutoRenameConfig, state: ThreadState): boolean {
	if (!state.lastRenameAt) {
		return true
	}
	const elapsedSeconds = (Date.now() - Date.parse(state.lastRenameAt)) / 1000
	const elapsedTurns = state.turnOrdinal - state.lastRenameTurnOrdinal
	return (
		elapsedSeconds >= config.minSecondsBetweenRenames &&
		elapsedTurns >= config.minTurnsBetweenRenames
	)
}

function skipped(
	threadId: string,
	oldTitle: string | null,
	sourceHash: string,
	reason: string,
	signals: string[]
): RenameDecision {
	return {
		kind: 'skipped',
		threadId,
		oldTitle,
		newTitle: null,
		confidence: 0,
		reason,
		signals,
		sourceHash
	}
}

function intersects(a: string[], b: string[]): boolean {
	const right = new Set(b)
	return a.some(value => right.has(value))
}

function dedupeWords(values: string[]): string[] {
	const seen = new Set<string>()
	const output: string[] = []
	for (const value of values) {
		const normalized = normalizeWhitespace(value)
		const key = normalized.toLowerCase()
		if (!normalized || seen.has(key)) {
			continue
		}
		seen.add(key)
		output.push(normalized)
	}
	return output
}

async function generateTitleWithCodex(
	config: AutoRenameConfig,
	currentTitle: string | null,
	promptText: string,
	outcomeText: string
): Promise<{ title: string; confidence: number } | null> {
	if (process.env.CODEX_AUTO_RENAME_HOOK === '1') {
		return null
	}
	const tempDir = mkdtempSync(join(tmpdir(), 'codex-auto-title-'))
	const outputPath = join(tempDir, 'title.json')
	const schemaPath = join(tempDir, 'schema.json')
	writeFileSync(
		schemaPath,
		JSON.stringify({
			type: 'object',
			additionalProperties: false,
			properties: {
				title: { type: 'string' },
				confidence: { type: 'number' }
			},
			required: ['title', 'confidence']
		})
	)
	const prompt = [
		'Return a concise Codex thread title as JSON.',
		'Rules: 3-8 words, <=64 chars, no secrets, no timestamps, no generic title.',
		`Current title: ${currentTitle ?? ''}`,
		`User intent: ${clip(promptText, 1200)}`,
		`Outcome: ${clip(outcomeText, 1200)}`
	].join('\n')
	try {
		await runWithTimeout(
			config.codexPath,
			[
				'exec',
				'--skip-git-repo-check',
				'--ephemeral',
				'--model',
				config.llm.model,
				'--output-schema',
				schemaPath,
				'--output-last-message',
				outputPath,
				prompt
			],
			config.llm.timeoutMs
		)
		const parsed = JSON.parse(readFileSync(outputPath, 'utf8')) as {
			title?: unknown
			confidence?: unknown
		}
		if (typeof parsed.title === 'string' && typeof parsed.confidence === 'number') {
			return { title: parsed.title, confidence: parsed.confidence }
		}
		return null
	} catch {
		return null
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

function runWithTimeout(command: string, args: string[], timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['ignore', 'ignore', 'ignore'],
			env: { ...process.env, CODEX_AUTO_RENAME_HOOK: '1' }
		})
		const timeout = setTimeout(() => {
			child.kill('SIGTERM')
			reject(new Error('Codex title generation timed out'))
		}, timeoutMs)
		child.on('exit', code => {
			clearTimeout(timeout)
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`Codex title generation exited with ${code ?? 'signal'}`))
			}
		})
		child.on('error', error => {
			clearTimeout(timeout)
			reject(error)
		})
	})
}
