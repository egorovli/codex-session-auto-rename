import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function codexHome(): string {
	return process.env.CODEX_HOME || join(homedir(), '.codex')
}

export function packageHome(): string {
	return join(codexHome(), 'codex-session-auto-rename')
}

export function resolveHomePath(path: string): string {
	if (path === '~') {
		return homedir()
	}
	if (path.startsWith('~/')) {
		return join(homedir(), path.slice(2))
	}
	return resolve(path)
}
