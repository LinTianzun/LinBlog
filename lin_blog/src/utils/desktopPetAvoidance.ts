/**
 * 桌宠自动避让：只做纯几何计算，方便单测。
 * 宠物素材是 16:9 视频，角色实际可见区域只占中间一块，
 * 这里按可见身体而不是整个视频盒判断是否挡住页面控件。
 */

export interface PetRect {
    left: number
    top: number
    right: number
    bottom: number
}

export interface PetPoint {
    x: number
    y: number
}

export interface PetAvoidanceBounds extends PetRect {
    /** 宠物左上角允许的最大 x / y */
    maxX: number
    maxY: number
}

export interface PetAvoidanceInput {
    position: PetPoint
    width: number
    height: number
    obstacles: readonly PetRect[]
    bounds: PetAvoidanceBounds
    /** 与控件之间保留的安全间距 */
    padding?: number
    /** 单次自动微移的最大距离，避免宠物突然横穿屏幕 */
    maxShift?: number
}

export interface PetAvoidanceResult extends PetPoint {
    moved: boolean
    overlapArea: number
}

// 与 DesktopPet.vue 的气泡定位使用同一组可见边界
const BODY_LEFT_INSET = 0.14
const BODY_TOP_INSET = 0.172
const BODY_RIGHT_INSET = 0.14
const BODY_BOTTOM_INSET = 0.083

const EPSILON = 0.5

export function petBodyRect(
    position: PetPoint,
    width: number,
    height: number
): PetRect {
    return {
        left: position.x + width * BODY_LEFT_INSET,
        top: position.y + height * BODY_TOP_INSET,
        right: position.x + width * (1 - BODY_RIGHT_INSET),
        bottom: position.y + height * (1 - BODY_BOTTOM_INSET),
    }
}

export function overlapArea(a: PetRect, b: PetRect): number {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return width > 0 && height > 0 ? width * height : 0
}

export function totalOverlapArea(body: PetRect, obstacles: readonly PetRect[]): number {
    let total = 0
    for (const obstacle of obstacles) total += overlapArea(body, obstacle)
    return total
}

function unionRect(rects: readonly PetRect[]): PetRect | null {
    if (!rects.length) return null
    return rects.reduce(
        (union, rect) => ({
            left: Math.min(union.left, rect.left),
            top: Math.min(union.top, rect.top),
            right: Math.max(union.right, rect.right),
            bottom: Math.max(union.bottom, rect.bottom),
        }),
        { ...rects[0] }
    )
}

/**
 * 找出离当前位置最近、且能减少遮挡的落点。
 * 优先完全不遮挡；没有空间时退而求其次选择遮挡面积更小的位置。
 */
export function findPetAvoidancePosition(
    input: PetAvoidanceInput
): PetAvoidanceResult {
    const { position, width, height, obstacles, bounds } = input
    const padding = Math.max(0, input.padding ?? 10)
    const maxShift = Math.max(0, input.maxShift ?? 280)
    const body = petBodyRect(position, width, height)
    const currentArea = totalOverlapArea(body, obstacles)

    if (currentArea <= 0) {
        return { ...position, moved: false, overlapArea: 0 }
    }

    const bodyOffsetX = body.left - position.x
    const bodyOffsetY = body.top - position.y
    const bodyWidth = body.right - body.left
    const bodyHeight = body.bottom - body.top

    const candidates = new Map<string, PetPoint>()
    const addCandidate = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        const clampedX = Math.min(Math.max(x, bounds.left), bounds.maxX)
        const clampedY = Math.min(Math.max(y, bounds.top), bounds.maxY)
        const shift = Math.hypot(clampedX - position.x, clampedY - position.y)
        if (shift < EPSILON || shift > maxShift) return
        candidates.set(`${Math.round(clampedX)}:${Math.round(clampedY)}`, {
            x: clampedX,
            y: clampedY,
        })
    }

    const blocking = obstacles.filter((obstacle) => overlapArea(body, obstacle) > 0)
    const union = unionRect(blocking)

    for (const obstacle of blocking) {
        addCandidate(
            obstacle.left - padding - bodyWidth - bodyOffsetX,
            position.y
        )
        addCandidate(
            obstacle.right + padding - bodyOffsetX,
            position.y
        )
        addCandidate(
            position.x,
            obstacle.top - padding - bodyHeight - bodyOffsetY
        )
        addCandidate(
            position.x,
            obstacle.bottom + padding - bodyOffsetY
        )
    }

    // 多个控件挨在一起时，按它们的并集再试一次，避免只躲开其中一个
    if (union) {
        addCandidate(
            union.left - padding - bodyWidth - bodyOffsetX,
            position.y
        )
        addCandidate(
            union.right + padding - bodyOffsetX,
            position.y
        )
        addCandidate(
            position.x,
            union.top - padding - bodyHeight - bodyOffsetY
        )
        addCandidate(
            position.x,
            union.bottom + padding - bodyOffsetY
        )
    }

    // 兜底：按固定步长向四个方向微移，处理控件贴边或候选点被钳制的情况
    for (const distance of [padding + 8, 32, 56, 84, 120, 168, 224, 280]) {
        if (distance > maxShift) break
        addCandidate(position.x, position.y - distance)
        addCandidate(position.x, position.y + distance)
        addCandidate(position.x - distance, position.y)
        addCandidate(position.x + distance, position.y)
    }

    let best: PetPoint = position
    let bestArea = currentArea
    let bestDistance = 0

    for (const candidate of candidates.values()) {
        const candidateBody = petBodyRect(candidate, width, height)
        const area = totalOverlapArea(candidateBody, obstacles)
        const distance = Math.hypot(
            candidate.x - position.x,
            candidate.y - position.y
        )
        const areaImproved = area < bestArea - EPSILON
        const sameAreaCloser =
            Math.abs(area - bestArea) <= EPSILON && distance < bestDistance - EPSILON
        if (areaImproved || sameAreaCloser) {
            best = candidate
            bestArea = area
            bestDistance = distance
        }
    }

    if (bestArea >= currentArea - EPSILON) {
        return {
            ...position,
            moved: false,
            overlapArea: currentArea,
        }
    }

    return {
        x: best.x,
        y: best.y,
        moved: true,
        overlapArea: bestArea,
    }
}
