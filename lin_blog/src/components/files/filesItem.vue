<template>
    <div class="file-item" :class="{ 'file-item-selected': props.data?.selected }" @click="checkFile">
        <div class="file-item-img">
            <img v-if="isPreviewable" class="file-item-img-preview" :src="previewUrl" :alt="props.data.fileName"
                loading="lazy">
            <div v-else class="file-item-img-placeholder">
                <IconFileFill />
                <span>{{ props.data.format }}</span>
            </div>
            <span class="file-item-img-glow" aria-hidden="true" />
            <span class="file-item-img-check" aria-hidden="true">
                <IconTickOutline />
            </span>
            <div class="file-item-img-tool">
                <button type="button" class="file-item-action" aria-label="预览图片" @click.stop="togglePreview">
                    <IconEyeOutline />
                </button>
                <button type="button" class="file-item-action" aria-label="下载文件" @click.stop="downloadFile">
                    <IconDownloadOutline />
                </button>
                <yk-popconfirm title="确认删除该文件？可在回收站恢复" trigger="click" placement="topRight"
                    @confirm="deleteFile">
                    <button type="button" class="file-item-action file-item-action-danger" aria-label="删除文件"
                        @click.stop>
                        <IconDeleteOutline />
                    </button>
                </yk-popconfirm>
                <yk-popconfirm title="选择分组" trigger="click" placement="bottomRight" @cancel="cancel"
                    @confirm="confirm">
                    <button type="button" class="file-item-action" aria-label="修改分组" @click.stop>
                        <IconSwitchOutline />
                    </button>
                    <template #content>
                        <yk-scrollbar ref="scrollbar" height="148px" class="subset">
                            <div class="subset-item" v-for="(item, index) in subsetStore.data" :key="index"
                                @click="changeOption(item.id)"
                                :class="{ 'subset-seledted': subsetSelectedId == item.id }">
                                {{ item.name }}{{ item.value }}
                            </div>
                        </yk-scrollbar>
                    </template>
                </yk-popconfirm>
            </div>
        </div>

        <div class="file-item-info">
            <p class="file-item-name" :title="props.data.fileName">
                {{ displayName }}<span>.{{ props.data.format }}</span>
            </p>
            <div class="file-item-meta">
                <span class="file-item-source" :class="{ 'file-item-source-image': isContentImage }">
                    {{ isContentImage ? '内容图片' : '磁盘文件' }}
                </span>
                <span>{{ formatSize(props.data.size) }}</span>
                <span>{{ formatDate(props.data.createdAt) }}</span>
            </div>

            <div v-if="owners.length > 0" class="file-item-owners">
                <span
                    v-for="owner in owners"
                    :key="`${owner.type}-${owner.id}`"
                    class="file-item-owner"
                    :class="`file-item-owner-${owner.type}`"
                    :title="owner.title"
                >
                    {{ ownerTypeLabel[owner.type] }}·{{ owner.title }}
                </span>
            </div>
            <p v-else-if="isContentImage" class="file-item-owners-empty">尚未被任何内容引用</p>
        </div>

        <ContentLightbox :open="previewOpen" :photos="previewOpen ? [previewUrl] : []" :index="0"
            :title="props.data.fileName" @close="previewOpen = false" />
    </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import type { FileData, FileOwner } from '../../utils/interface.ts'
import { useSubsetStore } from '../../store/subset.ts'
import ContentLightbox from '../content/ContentLightbox.vue'
import './files.less'

const subsetStore = useSubsetStore()

const emits = defineEmits<{
    changeSubsetId: [data: { id: number; subsetId: number | undefined }]
    delete: [id: number]
    selected: [id: number]
    download: [id: number]
}>()

type FileItemProps = {
    data: FileData
}

const props = defineProps<FileItemProps>()

// 仅图片类文件做缩略图预览，其余格式显示文件类型占位
const previewFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
const isPreviewable = computed(() =>
    previewFormats.includes(String(props.data.format || '').toLowerCase())
)

// 内容图片来自文章/图库/随笔的上传（二进制在 image 表），与磁盘文件区分展示
const isContentImage = computed(() => props.data.source === 'image')

// 下载接口默认 attachment + octet-stream，缩略图需要 inline 才能拿到正确 MIME
const previewUrl = computed(() => {
    const url = String(props.data.url || '')
    if (!url.startsWith('/api/file/')) return url
    return url.includes('?') ? `${url}&inline=true` : `${url}?inline=true`
})

// 数据库存的是完整文件名，下方已单独展示后缀，这里去掉尾部扩展名避免「a.mp4 .mp4」
const displayName = computed(() => {
    const name = String(props.data.fileName || '')
    const ext = String(props.data.format || '').toLowerCase()
    if (!ext) return name
    return name.toLowerCase().endsWith(`.${ext}`) ? name.slice(0, -(ext.length + 1)) : name
})

const formatSize = (size?: number): string => {
    const value = Number(size ?? 0)
    if (!Number.isFinite(value) || value <= 0) return '未知大小'
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (value?: string): string => {
    const text = String(value || '')
    return text ? text.slice(0, 10).replace(/-/g, '/') : '未知时间'
}

// 归属区块：文章、图库、随笔
const ownerTypeLabel: Record<FileOwner['type'], string> = {
    article: '文章',
    gallery: '图库',
    diary: '随笔'
}

const owners = computed(() => props.data.owners ?? [])

// 预览走独立灯箱：卡片本身负责「选中」，点击图片不应弹出预览抢走选择
const previewOpen = ref(false)

const togglePreview = (): void => {
    if (!isPreviewable.value) return
    previewOpen.value = true
}

// 当前选中的分组 ID
const subsetSelectedId = ref<number | undefined>(props.data.subsetId)

// 将分组 ID 统一为数字，避免 string | number 类型冲突
const normalizeId = (value: string | number): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined
    }

    if (value.trim() === '') {
        return undefined
    }

    const id = Number(value)
    return Number.isFinite(id) ? id : undefined
}

// 切换分组
const changeOption = (value: string | number) => {
    const id = normalizeId(value)

    if (id !== undefined) {
        subsetSelectedId.value = id
    }
}

function cancel() {
    // 用户取消选择，不修改文件分组
}

function confirm() {
    if (subsetSelectedId.value !== props.data.subsetId) {
        emits('changeSubsetId', {
            id: props.data.id,
            subsetId: subsetSelectedId.value,
        })
    }
}

// 删除文件
const deleteFile = () => {
    emits('delete', props.data.id)
}

// 选择文件
const checkFile = () => {
    emits('selected', props.data.id)
}

// 下载文件
const downloadFile = () => {
    emits('download', props.data.id)
}
</script>

<style lang="less" scoped>
.file-item {
    width: 100%;
    min-width: 0;
    cursor: pointer;
    border-radius: 16px;
    transition: transform 180ms ease;

    &-img {
        width: 100%;
        aspect-ratio: 1 / 1;
        position: relative;
        overflow: hidden;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 16px;
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
        transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            background 180ms ease;

        &-preview {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }

        &-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background:
                radial-gradient(circle at 74% 6%, var(--pcolor1), transparent 58%),
                color-mix(in srgb, var(--bgColor2) 88%, transparent);

            .yk-icon {
                font-size: 46px;
                color: var(--gray6);
            }

            span {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--gray6);
            }
        }

        // 选中项底部的光晕，与素材选择器保持同一套反馈语言
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
            left: 9px;
            width: 25px;
            height: 25px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.68);
            background: rgba(19, 22, 30, 0.46);
            color: #fff;
            opacity: 0;
            pointer-events: none;
            transition: opacity 180ms ease, background 180ms ease, transform 180ms ease;

            .yk-icon {
                width: 15px;
                height: 15px;
            }
        }

        &-tool {
            position: absolute;
            right: 9px;
            bottom: 9px;
            display: flex;
            gap: 6px;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 180ms ease, transform 180ms ease;
        }
    }

    &-action {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: rgba(18, 22, 30, 0.55);
        color: #fff;
        cursor: pointer;
        backdrop-filter: blur(8px);
        transition: background 180ms ease, transform 180ms ease;

        .yk-icon {
            width: 17px;
            height: 17px;
        }

        &:hover,
        &:focus-visible {
            background: color-mix(in srgb, var(--pcolor) 78%, transparent);
            transform: translateY(-1px);
        }

        &:focus-visible {
            outline: 2px solid var(--pcolor4);
            outline-offset: 2px;
        }

        &-danger:hover,
        &-danger:focus-visible {
            background: #d64545;
        }
    }

    &:hover,
    &:focus-within {
        transform: translateY(-2px);

        .file-item-img {
            border-color: var(--pcolor3);
            box-shadow: var(--admin-shadow-md, @shadow-m);
            background: color-mix(in srgb, var(--admin-surface, var(--bgColor1)) 92%, var(--pcolor1));
        }

        .file-item-img-tool,
        .file-item-img-check {
            opacity: 1;
        }

        .file-item-img-tool {
            transform: translateY(0);
        }
    }

    &-info {
        padding: 9px 4px 3px;
    }

    &-name {
        margin: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 13px;
        line-height: 20px;
        font-weight: 650;
        color: var(--admin-text, var(--gray));

        span {
            margin-left: 2px;
            font-size: 11px;
            font-weight: 500;
            color: var(--admin-muted, var(--gray6));
        }
    }

    &-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        font-size: 11px;
        line-height: 16px;
        color: var(--admin-muted, var(--gray6));

        span + span::before {
            content: '/';
            margin-right: 6px;
            color: color-mix(in srgb, var(--admin-muted, var(--gray6)) 44%, transparent);
        }
    }

    &-source {
        flex: none;
        padding: 2px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--gray6) 15%, transparent);
        color: var(--admin-muted, var(--gray6));

        &-image {
            background: var(--pcolor1);
            color: var(--pcolor);
        }
    }

    // 归属区块：内容图片被哪篇文章、图库、随笔引用
    &-owners {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 7px;
    }

    &-owner {
        max-width: 100%;
        padding: 2px 7px;
        border-radius: 6px;
        font-size: 10px;
        line-height: 16px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: color-mix(in srgb, var(--gray6) 13%, transparent);
        color: var(--admin-muted, var(--gray6));

        &-article {
            background: color-mix(in srgb, var(--pcolor) 14%, transparent);
            color: var(--pcolor);
        }

        &-gallery {
            background: color-mix(in srgb, #2f9e6f 16%, transparent);
            color: #2f9e6f;
        }

        &-diary {
            background: color-mix(in srgb, #d08a3c 18%, transparent);
            color: #b3762f;
        }
    }

    &-owners-empty {
        margin: 7px 0 0;
        font-size: 10px;
        line-height: 16px;
        color: color-mix(in srgb, var(--admin-muted, var(--gray6)) 72%, transparent);
    }

    &-selected {
        .file-item-img {
            border-color: var(--pcolor);
            box-shadow:
                0 0 0 3px color-mix(in srgb, var(--pcolor) 22%, transparent),
                var(--admin-shadow-md, @shadow-m);
            background: color-mix(in srgb, var(--admin-surface, var(--bgColor1)) 82%, var(--pcolor1));
        }

        .file-item-img-glow {
            opacity: 1;
        }

        .file-item-img-check {
            opacity: 1;
            color: var(--bgColor1);
            background: var(--pcolor);
            border-color: transparent;
            transform: scale(1.04);
        }
    }
}
</style>
