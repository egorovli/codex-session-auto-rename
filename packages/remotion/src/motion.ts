import { Easing, interpolate } from 'remotion'

export function clampInterpolate(
	frame: number,
	input: [number, number],
	output: [number, number],
	easing = Easing.bezier(0.16, 1, 0.3, 1)
) {
	return interpolate(frame, input, output, {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		easing
	})
}

export function segmentProgress(frame: number, start: number, duration: number) {
	return clampInterpolate(frame, [start, start + duration], [0, 1])
}

export function fadeInOut(frame: number, start: number, end: number, fade = 12) {
	const enter = clampInterpolate(frame, [start, start + fade], [0, 1])
	const exit = clampInterpolate(frame, [end - fade, end], [1, 0], Easing.in(Easing.cubic))
	return Math.min(enter, exit)
}
