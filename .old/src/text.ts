const SECRET_PATTERNS = [
	/(api[_-]?key|access[_-]?token|secret|password|passwd|authorization)\s*[:=]\s*["']?[^"'\s]+/gi,
	/(sk-[A-Za-z0-9_-]{20,})/g,
	/(ghp_[A-Za-z0-9_]{20,})/g
]

const STOPWORDS = new Set([
	'the',
	'and',
	'for',
	'with',
	'that',
	'this',
	'you',
	'can',
	'pls',
	'please',
	'into',
	'from',
	'what',
	'when',
	'where',
	'how',
	'why',
	'just',
	'now',
	'then',
	'about',
	'doing',
	'work',
	'task',
	'thread',
	'session',
	'codex'
])

export function redactSecrets(input: string): string {
	let output = input
	for (const pattern of SECRET_PATTERNS) {
		output = output.replace(pattern, '[REDACTED]')
	}
	return output
}

export function normalizeWhitespace(input: string): string {
	return input.replace(/\s+/g, ' ').trim()
}

export function clip(input: string, maxLength: number): string {
	if (input.length <= maxLength) {
		return input
	}
	return input.slice(0, Math.max(0, maxLength - 1)).trimEnd()
}

export function words(input: string): string[] {
	return normalizeWhitespace(input)
		.toLowerCase()
		.replace(/[^a-z0-9_\-./:[\]#]+/g, ' ')
		.split(/\s+/)
		.filter(word => word.length > 2 && !STOPWORDS.has(word))
}

export function titleCase(input: string): string {
	return input
		.split(/\s+/)
		.filter(Boolean)
		.map(word => {
			if (/^[A-Z]{2,}-\d+$/.test(word) || /^[A-Z0-9]{2,}$/.test(word)) {
				return word
			}
			if (word.includes('/')) {
				return word
			}
			return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
		})
		.join(' ')
}

export function jaccard(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0) {
		return 1
	}
	const left = new Set(a)
	const right = new Set(b)
	let intersection = 0
	for (const value of left) {
		if (right.has(value)) {
			intersection += 1
		}
	}
	const union = new Set([...left, ...right]).size
	return union === 0 ? 0 : intersection / union
}

export function hasControlCharacters(input: string): boolean {
	for (const char of input) {
		const code = char.charCodeAt(0)
		if (code < 32 || code === 127) {
			return true
		}
	}
	return false
}
