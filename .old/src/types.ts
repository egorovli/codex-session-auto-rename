export type HookEventName =
	| 'SessionStart'
	| 'UserPromptSubmit'
	| 'Stop'
	| 'PreToolUse'
	| 'PostToolUse'
	| 'PermissionRequest'
	| string

export interface HookInput {
	session_id?: string
	transcript_path?: string | null
	cwd?: string
	hook_event_name?: HookEventName
	model?: string
	turn_id?: string
	prompt?: string
	user_prompt?: string
	message?: string
	last_assistant_message?: string
	permission_mode?: string
	[key: string]: unknown
}

export type Mode = 'apply' | 'dry-run' | 'off'

export interface AutoRenameConfig {
	enabled: boolean
	mode: Mode
	respectManualTitles: boolean
	minSecondsBetweenRenames: number
	minTurnsBetweenRenames: number
	maxTitleLength: number
	logPrompts: boolean
	codexPath: string
	bunPath: string
	appServerTimeoutMs: number
	stateDir: string
	logPath: string
	llm: {
		enabled: boolean
		model: string
		timeoutMs: number
	}
}

export interface IntentSummary {
	ticketIds: string[]
	paths: string[]
	repoWords: string[]
	actionType: string
	deliverableType: string
	keywords: string[]
	userGoal: string
}

export interface PendingPrompt {
	turnId: string
	promptHash: string
	promptPreview: string
	intent: IntentSummary
	createdAt: string
}

export interface ThreadState {
	threadId: string
	stableIntent: IntentSummary | null
	lastAutoTitle: string | null
	lastRenameAt: string | null
	lastRenameTurnOrdinal: number
	turnOrdinal: number
	recentTitles: string[]
	manualLock: boolean
	pendingPrompt: PendingPrompt | null
	lastProcessedTurnIds: string[]
	updatedAt: string
}

export type RenameDecisionKind =
	| 'renamed'
	| 'would_rename'
	| 'captured'
	| 'skipped'
	| 'failed'
	| 'disabled'

export interface RenameDecision {
	kind: RenameDecisionKind
	threadId: string
	oldTitle: string | null
	newTitle: string | null
	confidence: number
	reason: string
	signals: string[]
	sourceHash: string
}

export interface ThreadRecord {
	id: string
	sessionId?: string
	name?: string | null
	preview?: string
	cwd?: string
	updatedAt?: number
}
