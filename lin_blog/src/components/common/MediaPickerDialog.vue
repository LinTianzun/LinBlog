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

            <div v-else class="media-picker-grid">
                <button v-for="item in images" :key="item.id" type="button" class="media-picker-item"
                    :class="{ 'is-selected': selectedMap[item.id] !== undefined }" @click="toggleImage(item)">
                    <img :src="item.thumbUrl" :alt="item.fileName" loading="lazy" />
                    <span class="media-picker-item-name">{{ item.fileName }}</span>
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
import { computed, ref, watch } from 'vue'
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
const total = ref(0)
const loading = ref(false)
const errorMessage = ref('')

const selectedCount = computed(() => Object.keys(selectedMap.value).length)

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
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: @space-m;
    }

    &-item {
        position: relative;
        padding: 0;
        border: 2px solid transparent;
        border-radius: @radius-m;
        overflow: hidden;
        background: @bg-color-s;
        cursor: pointer;
        text-align: left;

        img {
            display: block;
            width: 100%;
            height: 108px;
            object-fit: cover;
        }

        &-name {
            display: block;
            padding: 6px 8px;
            font-size: @size-s;
            color: @font-color-m;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        &.is-selected {
            border-color: var(--pcolor3);
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
