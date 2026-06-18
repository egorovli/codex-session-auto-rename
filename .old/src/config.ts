import type { AutoRenameConfig } from './types.ts'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { packageHome, resolveHomePath } from './paths.ts'

const DEFAULT_CONFIG: AutoRenameConfig = {
	enabled: true,
	mode: 'apply',
	respectManualTitles: true,
	minSecondsBetweenRenames: 600,
	minTurnsBetweenRenames: 4,
	maxTitleLength: 64,
	logPrompts: false,
	codexPath: '/opt/homebrew/bin/codex',
	bunPath: '/opt/homebrew/bin/bun',
	appServerTimeoutMs: 1500,
	stateDir: join(packageHome(), 'state'),
	logPath: join(packageHome(), 'logs.jsonl'),
	llm: {
		enabled: false,
		model: 'gpt-5.4-mini',
		timeoutMs: 2000
	}
}

export function configPath(): string {
	return join(packageHome(), 'config.json')
}

export function defaultConfig(): AutoRenameConfig {
	return { ...DEFAULT_CONFIG, llm: { ...DEFAULT_CONFIG.llm } }
}

export function ensureConfig(): AutoRenameConfig {
	const home = packageHome()
	mkdirSync(home, { recursive: true, mode: 0o700 })
	const path = configPath()
	if (!existsSync(path)) {
		const config = defaultConfig()
		writeFileSync(path, `${JSON.stringify(config, null, '\t')}\n`, { mode: 0o600 })
		return config
	}
	return readConfig()
}

export function readConfig(): AutoRenameConfig {
	const path = configPath()
	if (!existsSync(path)) {
		return defaultConfig()
	}
	const raw = readFileSync(path, 'utf8')
	const parsed = JSON.parse(raw) as Partial<AutoRenameConfig>
	const defaults = defaultConfig()
	return {
		...defaults,
		...parsed,
		codexPath: resolveHomePath(parsed.codexPath ?? defaults.codexPath),
		bunPath: resolveHomePath(parsed.bunPath ?? defaults.bunPath),
		stateDir: resolveHomePath(parsed.stateDir ?? defaults.stateDir),
		logPath: resolveHomePath(parsed.logPath ?? defaults.logPath),
		llm: {
			...defaults.llm,
			...(parsed.llm ?? {})
		}
	}
}
