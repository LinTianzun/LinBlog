<template>
    <yk-modal :model-value="open" title="从素材库选择" size="l" :show-footer="false"
        content-height="min(620px, calc(100vh - 160px))" @update:model-value="emit('update:open', $event)">
        <div class="media-picker">
            <div class="media-picker-head">
                <yk-input v-model="keyword" placeholder="按文件名搜索素材" clearable
                    @update:model-value="handleKeywordChange" />
                <yk-button type="secondary" size="s" :loading="loading" @click="loadImages(1)">
                    刷新
                </yk-button>
            </div>

            <p class="media-picker-hint">
                素材库中的图片与本地文件模块同源，选中后直接作为文章、图库或随笔图片使用。
            </p>

            <div v-if="loading" class="media-picker-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在读取素材...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="media-picker-state">
                <yk-empty description="素材加载失败">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-button type="secondary" @click="loadImages(1)">重新加载</yk-button>
                </yk-empty>
            </div>

            <div v-else-if="images.length === 0" class="media-picker-state">
                <yk-empty description="素材库里还没有图片">
                    <yk-text type="secondary">先在「本地文件」模块上传图片，再回到这里选择。</yk-text>
                </yk-empty>
            </div>

            <div v-else ref="gridRef" class="media-picker-grid"
                :style="{ '--picker-basis': itemBasis }">
                <button v-for="item in images" :key="item.id" type="button" class="media-picker-item"
                    :class="{ 'is-selected': selectedMap[item.id] !== undefined }"
                    :aria-pressed="selectedMap[item.id] !== undefined" @click="toggleImage(item)">
                    <img :src="item.thumbUrl" :alt="item.fileName" loading="lazy" />
                    <span class="media-picker-item-glow" aria-hidden="true" />
                    <span class="media-picker-item-check" aria-hidden="true">
                        <IconTickOutline />
                    </span>
                    <span class="media-picker-item-meta">
                        <span class="media-picker-item-name">{{ item.fileName }}</span>
                        <span class="media-picker-item-time">{{ formatDate(item.createdAt) }}</span>
                    </span>
                </button>
            </div>

            <div class="media-picker-foot">
                <span class="media-picker-count">
                    已选 {{ selectedCount }} 张<template v-if="total > 0"> / 共 {{ total }} 张</template>
                </span>
                <AdminPager v-model:page="page" :page-size="pageSize" :total="total" :disabled="loading"
                    @change="handlePageChange" />
                <yk-space size="s">
                    <yk-button type="secondary" @click="emit('update:open', false)">取消</yk-button>
                    <yk-button :disabled="selectedCount === 0" @click="confirmSelection">确定</yk-button>
                </yk-space>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getImageFiles, type MediaImageItem } from '../../api/file.ts'
import AdminPager from './AdminPager.vue'

const props = withDefaults(defineProps<{
    open: boolean
    multiple?: boolean
    maxCount?: number
}>(), {
    multiple: false,
    maxCount: 20,
})

const emit = defineEmits<{
    (event: 'update:open', value: boolean): void
    (event: 'select', urls: string[]): void
}>()

const images = ref<MediaImageItem[]>([])
// 选中项按 id 缓存，跨页选择也不会因为翻页丢失
const selectedMap = ref<Record<number, MediaImageItem>>({})
const keyword = ref('')
const page = ref(1)
const pageSize = ref(12)
const gridRef = ref<HTMLElement | null>(null)

// 列数按容器宽度实测，并让每页条数 = 列数 × 行数：
// 这样每一行都排得满，末页也不会出现半行空位。
const columnCount = ref(4)
const rowCount = 3
let resizeObserver: ResizeObserver | undefined
// 与样式里的 gap: @space-m 保持一致
const gridGap = 12
const gridWidth = ref(0)

// 每张图的基准宽度：按列数摊掉间距，末行图片靠 flex-grow 补齐空位
const itemBasis = computed(() => {
    const width = gridWidth.value
    if (width <= 0) return `${100 / columnCount.value}%`
    const totalGap = gridGap * (columnCount.value - 1)
    const perItem = Math.max(0, (width - totalGap) / columnCount.value)
    return `${(perItem / width) * 100}%`
})

const measureColumns = (): void => {
    const width = gridRef.value?.clientWidth ?? 0
    if (width <= 0) return

    const minWidth = 168
    const gap = gridGap
    const next = Math.max(2, Math.min(6, Math.floor((width + gap) / (minWidth + gap))))
    gridWidth.value = width
    if (next === columnCount.value) return

    columnCount.value = next
    pageSize.value = next * rowCount
    if (page.value > 1) void loadImages(1)
}

// 网格是 v-else 分支，加载完成前并不存在，
// 因此在图片渲染出来后再测量列数并挂上监听。
watch(
    () => images.value.length,
    async (count) => {
        if (count === 0) return
        await nextTick()
        measureColumns()
        resizeObserver?.disconnect()
        resizeObserver = undefined
        if (!gridRef.value) return
        resizeObserver = new ResizeObserver(measureColumns)
        resizeObserver.observe(gridRef.value)
    }
)

onMounted(() => {
    measureColumns()
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
})
const total = ref(0)
const loading = ref(false)
const errorMessage = ref('')

const selectedCount = computed(() => Object.keys(selectedMap.value).length)

const formatDate = (value: string): string => {
    const text = String(value || '')
    return text ? text.slice(0, 10).replace(/-/g, '/') : '未知时间'
}

const describeError = (error: unknown): string => (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || (error instanceof Error ? error.message : '')
    || '素材加载失败，请稍后重试'
)

const loadImages = async (nextPage = page.value): Promise<void> => {
    page.value = Math.max(1, Number(nextPage) || 1)
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getImageFiles({
            page: page.value,
            pageSize: pageSize.value,
            keyword: keyword.value.trim() || undefined,
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '素材加载失败')
        }
        images.value = result.data.list
        total.value = result.data.total
    } catch (error) {
        errorMessage.value = describeError(error)
        images.value = []
        total.value = 0
    } finally {
        loading.value = false
    }
}

const handleKeywordChange = (value: string | number): void => {
    keyword.value = String(value ?? '')
    void loadImages(1)
}

const handlePageChange = (payload: { page: number; pageSize: number }): void => {
    pageSize.value = payload.pageSize
    void loadImages(payload.page)
}

const toggleImage = (item: MediaImageItem): void => {
    if (props.multiple) {
        const next = { ...selectedMap.value }
        if (next[item.id] !== undefined) {
            delete next[item.id]
            selectedMap.value = next
            return
        }
        if (selectedCount.value >= props.maxCount) return
        next[item.id] = item
        selectedMap.value = next
        return
    }

    selectedMap.value = selectedMap.value[item.id] !== undefined ? {} : { [item.id]: item }
}

const confirmSelection = (): void => {
    const urls = Object.values(selectedMap.value).map(item => item.url)
    if (urls.length === 0) return

    emit('select', urls)
    emit('update:open', false)
}

watch(
    () => props.open,
    (open) => {
        if (!open) return
        selectedMap.value = {}
        keyword.value = ''
        void loadImages(1)
    },
    { immediate: true }
)
</script>

<style lang="less" scoped>
.media-picker {
    display: flex;
    flex-direction: column;
    gap: @space-m;
    min-height: 260px;

    &-head {
        display: flex;
        align-items: center;
        gap: @space-m;
    }

    &-hint {
        margin: 0;
        font-size: @size-s;
        color: @font-color-s;
    }

    &-state {
        flex: 1;
        min-height: 260px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-grid {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        // 列数由脚本实测后写成 CSS 变量，每页条数 = 列数 × 行数，
        // 满页时每行正好排满；末行不足时靠 flex 撑开，不会留空位。
        display: flex;
        flex-wrap: wrap;
        gap: @space-m;
    }

    &-item {
        position: relative;
        flex: 1 1 var(--picker-basis, 22%);
        min-width: 0;
        padding: 0;
        border: 1px solid var(--admin-line, @line-color-s);
        border-radius: 16px;
        overflow: hidden;
        background: var(--admin-surface, @bg-color-s);
        box-shadow: var(--admin-shadow-sm, @shadow-s);
        cursor: pointer;
        text-align: left;
        transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;

        &:hover,
        &:focus-visible {
            border-color: var(--pcolor3);
            box-shadow: var(--admin-shadow-md, @shadow-m);
            transform: translateY(-2px);
        }

        img {
            display: block;
            width: 100%;
            aspect-ratio: 4 / 3;
            object-fit: cover;
            box-sizing: border-box;
            background:
                radial-gradient(circle at 78% 8%, var(--pcolor1), transparent 60%),
                color-mix(in srgb, var(--bgColor2) 88%, transparent);
        }

        // 铺满卡片的主题色光晕只在选中时出现，让选择反馈不只依赖细边框
        &-glow {
            position: absolute;
            inset: auto 0 0;
            height: 3px;
            background: linear-gradient(90deg,
                    var(--pcolor),
                    color-mix(in srgb, var(--pcolor) 40%, transparent));
            opacity: 0;
            pointer-events: none;
            transition: opacity 180ms ease;
        }

        &-check {
            position: absolute;
            top: 9px;
            right: 9px;
            width: 26px;
            height: 26px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.72);
            background: rgba(19, 22, 30, 0.48);
            color: #fff;
            opacity: 0;
            pointer-events: none;
            transition: opacity 180ms ease, background 180ms ease, transform 180ms ease;

            .yk-icon {
                width: 16px;
                height: 16px;
            }
        }

        &-meta {
            display: block;
            padding: 8px 10px 10px;
        }

        &-name {
            display: block;
            font-size: 12px;
            line-height: 18px;
            color: var(--admin-text, @font-color-m);
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        &-time {
            display: block;
            margin-top: 2px;
            font-size: 10px;
            line-height: 14px;
            color: var(--admin-muted, @font-color-s);
        }

        &.is-selected {
            border-color: var(--pcolor);
            box-shadow:
                0 0 0 3px color-mix(in srgb, var(--pcolor) 22%, transparent),
                var(--admin-shadow-md, @shadow-m);

            img {
                filter: saturate(1.05);
            }

            .media-picker-item-glow {
                opacity: 1;
            }

            .media-picker-item-check {
                opacity: 1;
                color: var(--bgColor1);
                background: var(--pcolor);
                border-color: transparent;
                transform: scale(1.04);
            }
        }
    }

    &-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: @space-m;
        flex-wrap: wrap;
        padding-top: @space-m;
        border-top: 1px solid var(--admin-line, @line-color-s);
    }

    &-count {
        font-size: @size-s;
        color: @font-color-s;
    }
}
</style>
