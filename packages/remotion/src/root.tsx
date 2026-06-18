import { Composition, Still } from 'remotion'

import { CodexAutoRenameShowcase, ShowcasePoster } from './showcase.tsx'

export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080
export const DURATION_IN_FRAMES = 330

export function RemotionRoot() {
	return (
		<>
			<Composition
				id='CodexSessionAutoRename'
				component={CodexAutoRenameShowcase}
				durationInFrames={DURATION_IN_FRAMES}
				fps={FPS}
				width={WIDTH}
				height={HEIGHT}
			/>
			<Still
				id='CodexSessionAutoRenamePoster'
				component={ShowcasePoster}
				width={WIDTH}
				height={HEIGHT}
			/>
		</>
	)
}
