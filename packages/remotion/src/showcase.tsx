import type React from 'react'

import {
	AbsoluteFill,
	Easing,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig
} from 'remotion'

import { clampInterpolate, fadeInOut, segmentProgress } from './motion.ts'
import { palette } from './palette.ts'

const sessionsBefore = [
	'019eda49-f0df-7c60-8cc2-b09dad3...',
	'Untitled session',
	'new chat',
	'debug issue'
]

const sessionsAfter = [
	'Remotion Showcase Video',
	'Fix Rename Cooldown',
	'Draft Plugin Installer',
	'Review App-Server Path'
]

const titleWall = [
	['019eda01-fabf...', 'Codex Plugin Install'],
	['Untitled session', 'Go Test Hardening'],
	['new chat', 'README Warning Copy'],
	['019ed9f1-42ba...', 'App-Server Diagnostics'],
	['debug issue', 'Manual Title Guard'],
	['help', 'Release Binary Plan'],
	['question', 'Hook Trust Flow'],
	['019eda35-8112...', 'Remotion Demo Cut'],
	['new thread', 'Config Defaults Review'],
	['codex', 'Session List Cleanup'],
	['019eda91-7e15...', 'GitHub Issue Triage'],
	['Untitled', 'Rename Decision Logs']
]

export function CodexAutoRenameShowcase() {
	const frame = useCurrentFrame()

	return (
		<AbsoluteFill style={styles.stage}>
			<GridBackground />
			<HeroCopy />
			<CmuxWindow
				mode='before'
				opacity={fadeInOut(frame, 0, 116, 14)}
				start={30}
			/>
			<SadMoment />
			<InstallMoment />
			<CmuxWindow
				mode='after'
				opacity={fadeInOut(frame, 154, 235, 12)}
				start={158}
			/>
			<WhooshWall />
			<EndCard />
		</AbsoluteFill>
	)
}

export function ShowcasePoster() {
	return (
		<AbsoluteFill style={styles.stage}>
			<GridBackground />
			<div style={{ ...styles.posterWrap }}>
				<CmuxFrame
					mode='after'
					progress={1}
				/>
				<div style={styles.posterLabel}>
					<div style={styles.kicker}>Codex Session Auto Rename</div>
					<div style={styles.posterTitle}>Readable session names, automatically.</div>
				</div>
			</div>
		</AbsoluteFill>
	)
}

function GridBackground() {
	return (
		<AbsoluteFill
			style={{
				background:
					'radial-gradient(circle at 20% 10%, rgba(64,150,255,0.18), transparent 26%), linear-gradient(135deg, #111316 0%, #171a1f 42%, #121519 100%)'
			}}
		>
			<AbsoluteFill
				style={{
					opacity: 0.22,
					backgroundImage:
						'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
					backgroundSize: '56px 56px'
				}}
			/>
		</AbsoluteFill>
	)
}

function HeroCopy() {
	const frame = useCurrentFrame()
	const opacity = fadeInOut(frame, 0, 68, 10)
	const y = clampInterpolate(frame, [0, 18], [18, 0])

	return (
		<div
			style={{
				...styles.heroCopy,
				opacity,
				transform: `translateY(${y}px)`
			}}
		>
			<div style={styles.kicker}>Codex Session Auto Rename</div>
			<div style={styles.title}>Stop hunting through UUIDs.</div>
		</div>
	)
}

function CmuxWindow({
	mode,
	opacity,
	start
}: {
	mode: 'before' | 'after'
	opacity: number
	start: number
}) {
	const frame = useCurrentFrame()
	const progress = spring({
		frame: frame - start,
		fps: useVideoConfig().fps,
		config: { damping: 26, stiffness: 120 },
		durationInFrames: 28
	})
	const scale = interpolate(progress, [0, 1], [0.965, 1])
	const y = interpolate(progress, [0, 1], [34, 0])

	return (
		<div
			style={{
				...styles.cmuxShell,
				opacity,
				transform: `translate(-50%, -50%) translateY(${y}px) scale(${scale})`
			}}
		>
			<CmuxFrame
				mode={mode}
				progress={progress}
			/>
		</div>
	)
}

function CmuxFrame({ mode, progress }: { mode: 'before' | 'after'; progress: number }) {
	const after = mode === 'after'
	const sidebarItems = after ? sessionsAfter : sessionsBefore
	const activeTitle = after ? 'Remotion Showcase Video' : '019eda49-f0df-7c60-8cc2-b09dad3...'

	return (
		<div style={styles.window}>
			<div style={styles.traffic}>
				<span style={{ ...styles.dot, backgroundColor: palette.red }} />
				<span style={{ ...styles.dot, backgroundColor: palette.amber }} />
				<span style={{ ...styles.dot, backgroundColor: palette.green }} />
				<div style={styles.windowTitle}>{after ? 'New workspace' : 'Before plugin'}</div>
			</div>
			<div style={styles.workspace}>
				<div style={styles.sidebar}>
					<div style={styles.sidebarHeading}>Codex Session Auto Rename</div>
					{sidebarItems.map((name, index) => (
						<SidebarItem
							key={name}
							active={index === 0}
							delay={index * 4}
							name={name}
							after={after}
							progress={progress}
						/>
					))}
				</div>
				<div style={styles.terminal}>
					<div style={styles.tabRow}>
						<div style={styles.tab}>{activeTitle}</div>
						<div style={styles.tabDim}>~/Dev/codex-session-auto-rename</div>
					</div>
					<div style={styles.terminalBody}>
						<PromptLine
							text='OpenAI Codex (v0.141.0)'
							muted
						/>
						<PromptLine
							text='model: gpt-5.5 high'
							muted
						/>
						<PromptLine
							text='directory: ~/Dev/codex-session-auto-rename'
							muted
						/>
						<div style={styles.separator} />
						{after ? (
							<>
								<PromptLine text='› build the short Remotion launch demo' />
								<ResponseLine text='• Captured intent: Remotion showcase video' />
								<ResponseLine
									text='• Suggested title: "Remotion Showcase Video"'
									accent
								/>
								<ResponseLine text='• Session list updated when the supported rename path is available' />
							</>
						) : (
							<>
								<PromptLine text='› i want you to do this remotion video' />
								<ResponseLine text='• Exploring files...' />
								<ResponseLine text='• Running tools...' />
								<ResponseLine
									text='• Sidebar title is still an opaque session id'
									warning
								/>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

function SidebarItem({
	name,
	active,
	after,
	progress,
	delay
}: {
	name: string
	active: boolean
	after: boolean
	progress: number
	delay: number
}) {
	const local = Math.max(0, Math.min(1, progress - delay / 40))
	const shift = after ? interpolate(local, [0, 1], [-14, 0]) : 0

	return (
		<div
			style={{
				...styles.sidebarItem,
				...(active ? styles.sidebarItemActive : null),
				transform: `translateX(${shift}px)`,
				borderLeftColor: after ? palette.green : active ? palette.blue : 'transparent'
			}}
		>
			<div style={styles.sidebarName}>{name}</div>
			<div style={styles.sidebarMeta}>
				{after ? 'Clear task title' : active ? 'Running' : 'Idle'}
			</div>
		</div>
	)
}

function PromptLine({ text, muted = false }: { text: string; muted?: boolean }) {
	return (
		<div style={{ ...styles.promptLine, color: muted ? palette.muted : palette.text }}>
			<span style={styles.promptMark}>›</span>
			{text}
		</div>
	)
}

function ResponseLine({
	text,
	accent = false,
	warning = false
}: {
	text: string
	accent?: boolean
	warning?: boolean
}) {
	return (
		<div
			style={{
				...styles.responseLine,
				color: accent ? palette.green : warning ? palette.amber : palette.muted
			}}
		>
			{text}
		</div>
	)
}

function SadMoment() {
	const frame = useCurrentFrame()
	const opacity = fadeInOut(frame, 68, 124, 10)
	const progress = segmentProgress(frame, 72, 20)

	return (
		<div
			style={{
				...styles.callout,
				top: 790,
				opacity,
				transform: `translateX(-50%) translateY(${interpolate(progress, [0, 1], [16, 0])}px)`
			}}
		>
			<span style={styles.calloutIcon}>:(</span>
			Great work. Impossible to find later.
		</div>
	)
}

function InstallMoment() {
	const frame = useCurrentFrame()
	const opacity = fadeInOut(frame, 106, 152, 9)
	const progress = segmentProgress(frame, 110, 18)
	const scale = interpolate(progress, [0, 1], [0.92, 1], {
		easing: Easing.bezier(0.34, 1.56, 0.64, 1),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp'
	})

	return (
		<div
			style={{ ...styles.installWrap, opacity, transform: `translate(-50%, -50%) scale(${scale})` }}
		>
			<div style={styles.idea}>One tiny install later</div>
			<div style={styles.command}>
				<span style={styles.promptMark}>›</span>
				codex plugin add egorovli/codex-session-auto-rename
			</div>
			<div style={styles.hookTrust}>review hooks once in /hooks</div>
		</div>
	)
}

function WhooshWall() {
	const frame = useCurrentFrame()
	const opacity = fadeInOut(frame, 214, 300, 10)
	const progress = segmentProgress(frame, 220, 34)
	const streak = clampInterpolate(frame, [220, 252], [-520, 2200], Easing.out(Easing.cubic))

	return (
		<AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
			<div
				style={{
					...styles.streak,
					transform: `translateX(${streak}px) rotate(-10deg)`
				}}
			/>
			<div
				style={{
					...styles.wall,
					transform: `translate(-50%, -50%) scale(${interpolate(progress, [0, 1], [0.94, 1])})`
				}}
			>
				{titleWall.map(([before, after], index) => {
					const itemProgress = clampInterpolate(frame, [224 + index * 3, 240 + index * 3], [0, 1])
					return (
						<div
							key={`${before}-${after}`}
							style={styles.renameCard}
						>
							<div style={{ ...styles.beforeTitle, opacity: 1 - itemProgress }}>{before}</div>
							<div
								style={{
									...styles.afterTitle,
									opacity: itemProgress,
									transform: `translateY(${interpolate(itemProgress, [0, 1], [10, 0])}px)`
								}}
							>
								{after}
							</div>
						</div>
					)
				})}
			</div>
			<div style={styles.wallCaption}>Sessions become readable at a glance.</div>
		</AbsoluteFill>
	)
}

function EndCard() {
	const frame = useCurrentFrame()
	const opacity = clampInterpolate(frame, [286, 310], [0, 1])
	const y = clampInterpolate(frame, [286, 310], [24, 0])

	return (
		<div
			style={{ ...styles.endCard, opacity, transform: `translate(-50%, -50%) translateY(${y}px)` }}
		>
			<div style={styles.kicker}>Codex Session Auto Rename</div>
			<div style={styles.endTitle}>Readable session names, without churn.</div>
			<div style={styles.endSub}>
				Developer preview: title decisions and clean metadata writes today. Live UI rename awaits a
				supported Codex API.
			</div>
		</div>
	)
}

const fontFamily =
	'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const monoFamily = 'SFMono-Regular, ui-monospace, Menlo, Consolas, monospace'

const styles = {
	stage: {
		backgroundColor: palette.ink,
		color: palette.text,
		fontFamily,
		overflow: 'hidden'
	},
	heroCopy: {
		position: 'absolute',
		left: 120,
		top: 92,
		width: 900
	} satisfies React.CSSProperties,
	kicker: {
		color: palette.cyan,
		fontSize: 25,
		fontWeight: 700,
		letterSpacing: 0,
		textTransform: 'uppercase'
	} satisfies React.CSSProperties,
	title: {
		marginTop: 14,
		fontSize: 62,
		lineHeight: 0.96,
		fontWeight: 800,
		letterSpacing: 0
	} satisfies React.CSSProperties,
	cmuxShell: {
		position: 'absolute',
		left: '50%',
		top: '52%',
		width: 1720,
		height: 820,
		transformOrigin: 'center center'
	} satisfies React.CSSProperties,
	window: {
		width: '100%',
		height: '100%',
		border: `1px solid ${palette.line}`,
		borderRadius: 22,
		backgroundColor: palette.ink2,
		boxShadow: '0 36px 110px rgba(0,0,0,0.48)',
		overflow: 'hidden'
	} satisfies React.CSSProperties,
	traffic: {
		height: 58,
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		padding: '0 24px',
		borderBottom: `1px solid ${palette.line}`,
		backgroundColor: '#1c2026'
	} satisfies React.CSSProperties,
	dot: {
		width: 15,
		height: 15,
		borderRadius: 999,
		display: 'block'
	},
	windowTitle: {
		marginLeft: 18,
		color: palette.muted,
		fontSize: 20,
		fontFamily: monoFamily
	},
	workspace: {
		display: 'grid',
		gridTemplateColumns: '360px 1fr',
		height: 'calc(100% - 58px)'
	},
	sidebar: {
		padding: 24,
		borderRight: `1px solid ${palette.line}`,
		backgroundColor: '#191d22'
	},
	sidebarHeading: {
		color: palette.muted,
		fontSize: 18,
		fontWeight: 700,
		marginBottom: 18
	},
	sidebarItem: {
		borderLeft: '4px solid transparent',
		borderRadius: 12,
		padding: '16px 16px 16px 14px',
		marginBottom: 10,
		backgroundColor: 'rgba(255,255,255,0.035)'
	} satisfies React.CSSProperties,
	sidebarItemActive: {
		backgroundColor: 'rgba(64,150,255,0.24)'
	},
	sidebarName: {
		fontFamily: monoFamily,
		fontSize: 19,
		lineHeight: 1.2,
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	} satisfies React.CSSProperties,
	sidebarMeta: {
		marginTop: 8,
		color: palette.muted,
		fontSize: 15
	},
	terminal: {
		display: 'grid',
		gridTemplateRows: '54px 1fr',
		minWidth: 0
	},
	tabRow: {
		display: 'flex',
		alignItems: 'stretch',
		borderBottom: `1px solid ${palette.line}`,
		backgroundColor: '#181c21'
	},
	tab: {
		width: 560,
		padding: '15px 22px',
		borderRight: `1px solid ${palette.line}`,
		color: palette.text,
		fontFamily: monoFamily,
		fontSize: 18,
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	} satisfies React.CSSProperties,
	tabDim: {
		padding: '15px 22px',
		color: palette.muted,
		fontFamily: monoFamily,
		fontSize: 18
	},
	terminalBody: {
		padding: '34px 44px',
		fontFamily: monoFamily,
		fontSize: 26,
		lineHeight: 1.45
	},
	separator: {
		height: 1,
		backgroundColor: palette.line,
		margin: '26px 0'
	},
	promptLine: {
		display: 'flex',
		gap: 16,
		whiteSpace: 'pre'
	} satisfies React.CSSProperties,
	promptMark: {
		color: palette.green,
		fontWeight: 800
	},
	responseLine: {
		marginTop: 13,
		paddingLeft: 34,
		whiteSpace: 'pre'
	} satisfies React.CSSProperties,
	callout: {
		position: 'absolute',
		left: '50%',
		padding: '18px 28px',
		border: `1px solid ${palette.line}`,
		borderRadius: 999,
		backgroundColor: 'rgba(17,19,22,0.78)',
		boxShadow: '0 22px 60px rgba(0,0,0,0.32)',
		fontSize: 25,
		fontWeight: 750
	} satisfies React.CSSProperties,
	calloutIcon: {
		color: palette.amber,
		marginRight: 14,
		fontFamily: monoFamily
	},
	installWrap: {
		position: 'absolute',
		left: '50%',
		top: '50%',
		width: 1320,
		padding: '44px 52px',
		border: `1px solid ${palette.line}`,
		borderRadius: 24,
		backgroundColor: 'rgba(24,28,33,0.96)',
		boxShadow: '0 34px 100px rgba(0,0,0,0.56)'
	} satisfies React.CSSProperties,
	idea: {
		color: palette.cyan,
		fontSize: 28,
		fontWeight: 800,
		marginBottom: 22
	},
	command: {
		fontFamily: monoFamily,
		fontSize: 29,
		color: palette.text,
		padding: '22px 26px',
		borderRadius: 16,
		backgroundColor: '#0f1216',
		border: `1px solid ${palette.line}`
	},
	hookTrust: {
		color: palette.muted,
		fontSize: 21,
		marginTop: 18
	},
	streak: {
		position: 'absolute',
		top: 450,
		width: 420,
		height: 36,
		borderRadius: 999,
		background:
			'linear-gradient(90deg, transparent, rgba(98,213,247,0.08), rgba(255,255,255,0.9), rgba(100,209,122,0.34), transparent)',
		filter: 'blur(2px)'
	} satisfies React.CSSProperties,
	wall: {
		position: 'absolute',
		left: '50%',
		top: '49%',
		width: 1380,
		display: 'grid',
		gridTemplateColumns: 'repeat(3, 1fr)',
		gap: 18
	} satisfies React.CSSProperties,
	renameCard: {
		position: 'relative',
		height: 112,
		border: `1px solid ${palette.line}`,
		borderRadius: 16,
		backgroundColor: 'rgba(32,36,43,0.88)',
		overflow: 'hidden',
		padding: '23px 26px'
	} satisfies React.CSSProperties,
	beforeTitle: {
		position: 'absolute',
		inset: '23px 26px',
		color: palette.muted,
		fontFamily: monoFamily,
		fontSize: 22,
		textDecoration: 'line-through',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	} satisfies React.CSSProperties,
	afterTitle: {
		position: 'absolute',
		inset: '23px 26px',
		color: palette.white,
		fontSize: 27,
		fontWeight: 800,
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	} satisfies React.CSSProperties,
	wallCaption: {
		position: 'absolute',
		left: '50%',
		bottom: 116,
		transform: 'translateX(-50%)',
		fontSize: 42,
		fontWeight: 850
	} satisfies React.CSSProperties,
	endCard: {
		position: 'absolute',
		left: '50%',
		top: '50%',
		width: 1120,
		textAlign: 'center'
	} satisfies React.CSSProperties,
	endTitle: {
		marginTop: 18,
		fontSize: 76,
		lineHeight: 1,
		fontWeight: 900,
		letterSpacing: 0
	},
	endSub: {
		marginTop: 26,
		color: palette.muted,
		fontSize: 28
	},
	posterWrap: {
		position: 'absolute',
		left: '50%',
		top: '50%',
		width: 1620,
		height: 780,
		transform: 'translate(-50%, -50%)'
	} satisfies React.CSSProperties,
	posterLabel: {
		position: 'absolute',
		left: 80,
		bottom: 72,
		width: 900
	} satisfies React.CSSProperties,
	posterTitle: {
		marginTop: 16,
		fontSize: 64,
		lineHeight: 1,
		fontWeight: 900
	}
}
