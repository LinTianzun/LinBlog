export type Easing = (progress: number) => number

export interface TweenHandle {
  cancel: () => void
}

export interface NumberTweenOptions {
  from: number
  to: number
  duration: number
  delay?: number
  ease?: Easing
  onUpdate: (value: number) => void
  onComplete?: () => void
}

export interface ColorTweenOptions {
  from: number
  to: number
  duration: number
  delay?: number
  ease?: Easing
  onUpdate: (hex: number) => void
  onComplete?: () => void
}

export const easeOutCubic: Easing = (progress) =>
  1 - Math.pow(1 - progress, 3)

export const easeInOutCubic: Easing = (progress) =>
  progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const colorChannels = (hex: number) => ({
  red: (hex >> 16) & 0xff,
  green: (hex >> 8) & 0xff,
  blue: hex & 0xff,
})

const channelsToHex = (red: number, green: number, blue: number) =>
  (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue)

export function tweenNumber(options: NumberTweenOptions): TweenHandle {
  const {
    from,
    to,
    duration,
    delay = 0,
    ease = easeOutCubic,
    onUpdate,
    onComplete,
  } = options
  let cancelled = false
  let frameId = 0
  let started = false
  let startedAt = 0

  if (
    duration <= 0 ||
    delay + duration <= 0 ||
    prefersReducedMotion() ||
    typeof requestAnimationFrame !== 'function'
  ) {
    onUpdate(to)
    onComplete?.()
    return { cancel: () => undefined }
  }

  const step = (timestamp: number) => {
    if (cancelled) return
    if (!started) {
      started = true
      startedAt = timestamp
    }
    const elapsed = timestamp - startedAt - delay
    if (elapsed < 0) {
      frameId = requestAnimationFrame(step)
      return
    }
    const progress = Math.min(1, elapsed / duration)
    onUpdate(from + (to - from) * ease(progress))
    if (progress < 1) {
      frameId = requestAnimationFrame(step)
    } else {
      onComplete?.()
    }
  }

  frameId = requestAnimationFrame(step)
  return {
    cancel: () => {
      cancelled = true
      if (frameId) cancelAnimationFrame(frameId)
    },
  }
}

export function tweenColor(options: ColorTweenOptions): TweenHandle {
  const from = colorChannels(options.from)
  const to = colorChannels(options.to)
  return tweenNumber({
    from: 0,
    to: 1,
    duration: options.duration,
    delay: options.delay,
    ease: options.ease,
    onUpdate: (progress) => {
      options.onUpdate(
        channelsToHex(
          from.red + (to.red - from.red) * progress,
          from.green + (to.green - from.green) * progress,
          from.blue + (to.blue - from.blue) * progress
        )
      )
    },
    onComplete: options.onComplete,
  })
}
