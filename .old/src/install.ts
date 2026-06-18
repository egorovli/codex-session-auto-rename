#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ensureConfig } from './config.ts'
import { codexHome, packageHome } from './paths.ts'

interface HookHandler {
	type: 'command'
	command: string
	timeout?: number
	statusMessage?: string
}

interface HookGroup {
	hooks: HookHandler[]
}

interface HooksFile {
	hooks?: Record<string, HookGroup[]>
}

const SOURCE_ROOT = resolve(import.meta.dir, '..')
const TARGET_ROOT = packageHome()

function main(): void {
	mkdirSync(TARGET_ROOT, { recursive: true, mode: 0o700 })
	cleanupLegacyInstall()
	cpSync(SOURCE_ROOT, TARGET_ROOT, {
		recursive: true,
		force: true,
		filter: source => !/\/node_modules(?:\/|$)/.test(source) && !/\/\.git(?:\/|$)/.test(source)
	})
	ensureConfig()
	mergeHooks()
	process.stdout.write(`Installed codex-session-auto-rename to ${TARGET_ROOT}\n`)
	process.stdout.write('Open /hooks in Codex and trust the new UserPromptSubmit and Stop hooks.\n')
}

function mergeHooks(): void {
	const hooksPath = join(codexHome(), 'hooks.json')
	const existing = readHooksFile(hooksPath)
	existing.hooks ??= {}
	removeAutoRenameHooks(existing, 'UserPromptSubmit')
	removeAutoRenameHooks(existing, 'Stop')
	addHook(existing, 'UserPromptSubmit', {
		type: 'command',
		command: `${detectBunPath()} ${join(TARGET_ROOT, 'src/auto-rename.ts')} capture`,
		timeout: 3
	})
	addHook(existing, 'Stop', {
		type: 'command',
		command: `${detectBunPath()} ${join(TARGET_ROOT, 'src/auto-rename.ts')} decide`,
		timeout: 5,
		statusMessage: 'Checking thread title'
	})
	mkdirSync(dirname(hooksPath), { recursive: true, mode: 0o700 })
	if (existsSync(hooksPath)) {
		const backupPath = `${hooksPath}.bak-auto-rename-${new Date().toISOString().replace(/[:.]/g, '-')}`
		writeFileSync(backupPath, readFileSync(hooksPath), { mode: 0o600 })
	}
	writeFileSync(hooksPath, `${JSON.stringify(existing, null, '\t')}\n`, { mode: 0o600 })
}

function readHooksFile(path: string): HooksFile {
	if (!existsSync(path)) {
		return { hooks: {} }
	}
	return JSON.parse(readFileSync(path, 'utf8')) as HooksFile
}

function addHook(file: HooksFile, event: string, handler: HookHandler): void {
	file.hooks ??= {}
	file.hooks[event] ??= []
	const groups = file.hooks[event]
	const commandMarker = 'auto-rename.ts'
	for (const group of groups) {
		if (group.hooks.some(existing => existing.command.includes(commandMarker))) {
			return
		}
	}
	groups.push({ hooks: [handler] })
}

function removeAutoRenameHooks(file: HooksFile, event: string): void {
	if (!file.hooks?.[event]) {
		return
	}
	file.hooks[event] = file.hooks[event].filter(
		group =>
			!group.hooks.some(
				handler =>
					handler.command.includes('/auto-rename/') ||
					handler.command.includes('/codex-session-auto-rename/')
			)
	)
}

function detectBunPath(): string {
	const stablePath = '/opt/homebrew/bin/bun'
	if (existsSync(stablePath)) {
		return stablePath
	}
	return process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, 'bin/bun') : process.execPath
}

function cleanupLegacyInstall(): void {
	const legacyPaths = [
		join(TARGET_ROOT, 'auto-rename.mjs'),
		join(TARGET_ROOT, 'lib'),
		join(TARGET_ROOT, 'locks'),
		join(TARGET_ROOT, 'config.toml')
	]
	for (const path of legacyPaths) {
		rmSync(path, { recursive: true, force: true })
	}
}

main()
