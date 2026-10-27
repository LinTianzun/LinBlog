import {
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
    type Ref,
} from 'vue'

type GridPageSizeOptions = {
    minCardWidth: number
    gap?: number
    rows?: number
    min?: number
    max?: number
    horizontalPadding?: number
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(Math.floor(value), min), max)

/**
 * 根据网格实际可用宽度计算每页条数，保证大屏下也能铺满多行。
 */
export function useResponsiveGridPageSize(
    target: Ref<HTMLElement | null>,
    options: GridPageSizeOptions
) {
    const {
        minCardWidth,
        gap = 24,
        rows = 3,
        min = 4,
        max = 60,
        horizontalPadding = 0,
    } = options

    const pageSize = ref(min)
    let observer: ResizeObserver | undefined
    let frame = 0

    const measure = (): void => {
        const width = target.value
            ? Math.max(0, target.value.clientWidth - horizontalPadding)
            : Math.max(0, window.innerWidth - 320)

        const columns = Math.max(
            1,
            Math.floor((width + gap) / (minCardWidth + gap))
        )
        const nextPageSize = clamp(columns * rows, min, max)

        if (nextPageSize !== pageSize.value) {
            pageSize.value = nextPageSize
        }
    }

    const scheduleMeasure = (): void => {
        if (frame) window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(() => {
            frame = 0
            measure()
        })
    }

    const stopObserving = (): void => {
        observer?.disconnect()
        observer = undefined
    }

    watch(
        target,
        element => {
            stopObserving()
            if (!element) return

            observer = new ResizeObserver(scheduleMeasure)
            observer.observe(element)
            scheduleMeasure()
        },
        { flush: 'post' }
    )

    onMounted(() => {
        measure()
        window.addEventListener('resize', scheduleMeasure)
    })

    onBeforeUnmount(() => {
        stopObserving()
        window.removeEventListener('resize', scheduleMeasure)
        if (frame) window.cancelAnimationFrame(frame)
    })

    return pageSize
}

/**
 * 列表型内容按视口高度调整每页条数，避免大屏下只显示半屏数据。
 */
export function useResponsiveListPageSize(
    getPageSize: (viewport: { width: number; height: number }) => number,
    options: { min?: number; max?: number } = {}
) {
    const { min = 8, max = 20 } = options
    const pageSize = ref(min)
    let frame = 0

    const measure = (): void => {
        const nextPageSize = clamp(
            getPageSize({
                width: window.innerWidth,
                height: window.innerHeight,
            }),
            min,
            max
        )

        if (nextPageSize !== pageSize.value) {
            pageSize.value = nextPageSize
        }
    }

    const scheduleMeasure = (): void => {
        if (frame) window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(() => {
            frame = 0
            measure()
        })
    }

    onMounted(() => {
        measure()
        window.addEventListener('resize', scheduleMeasure)
    })

    onBeforeUnmount(() => {
        window.removeEventListener('resize', scheduleMeasure)
        if (frame) window.cancelAnimationFrame(frame)
    })

    return pageSize
}
