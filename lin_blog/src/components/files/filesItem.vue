<template>
    <div class="file-item">
        <div class="file-item-img" :class="{ 'file-item-selected': props.data?.selected }">
            <yk-image v-if="isPreviewable" :src="previewUrl" fit="contain" width="100%" height="100%"
                :preview="true" :is-lazy="true">
            </yk-image>
            <div v-else class="file-item-img-placeholder">
                <IconFileFill />
                <yk-text type="third">{{ props.data.format }}</yk-text>
            </div>
            <yk-space class="file-item-img-tool" size="s">
                <IconDownloadOutline class="files-tool-download" @click="downloadFile" />
                <yk-popconfirm title="确认删除该文件？可在回收站恢复" trigger="click" placement="topRight"
                    @confirm="deleteFile">
                    <IconDeleteOutline class="files-tool-delete" />
                </yk-popconfirm>
                <yk-popconfirm title="选择分组" trigger="click" placement="bottomRight" @cancel="cancel" @confirm="confirm">
                    <IconSwitchOutline class="files-tool-switch" />
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
            </yk-space>
            <div class="file-item-img-check" @click="checkFile">
                <IconTickMinOutline style="font-size: 24px;" />
            </div>
        </div>
        <div class="file-item-name">
            <p class="file-item-name-file">{{ displayName }}</p>
            <p>.{{ props.data.format }}</p>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import type { FileData } from '../../utils/interface.ts'
import { useSubsetStore } from '../../store/subset.ts'
import './files.less'

const subsetStore = useSubsetStore()

const emits = defineEmits<{
    changeSubsetId: [data: { id: number; subsetId: number | undefined }]
    delete: [id: number]
    selected: [id: number]
    download: [id: number]
}>()

// 仅图片类文件做缩略图预览，其余格式显示文件类型占位
const previewFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
const isPreviewable = computed(() =>
    previewFormats.includes(String(props.data.format || '').toLowerCase())
)

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

type FileItemProps = {
    data: FileData
}

const props = defineProps<FileItemProps>()

// 当前选中的分组 ID
const subsetSelectedId = ref<number | undefined>(
    props.data.subsetId
)

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
    // 宽度交给网格列控制，配合 minmax(200px, 1fr) 填满整行
    width: 100%;
    min-width: 0;

    &-img {
        // 跟随网格列宽自适应；图片区域用等比高度，避免大屏留空
        width: 100%;
        aspect-ratio: 1 / 1;
        position: relative;
        overflow: hidden;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 14px;
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
        transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;

        &-tool {
            position: absolute;
            right: @space-s;
            bottom: @space-s;
            opacity: 0;

            .yk-icon {
                width: 32px;
                height: 32px;
                padding: 8px;
                color: #fff;
                background: rgba(18, 22, 30, 0.52);
                border-radius: 9px;
                backdrop-filter: blur(8px);
                transition: all @animatb;
                cursor: pointer;

                &:hover {
                    color: #fff;
                    background: color-mix(in srgb, var(--pcolor) 76%, transparent);
                    backdrop-filter: blur(2px);
                }
            }
        }

        &-check {
            position: absolute;
            width: 24px;
            height: 24px;
            border-radius: @radius-s;
            background: rgba(18, 22, 30, 0.42);
            left: @space-s;
            top: @space-s;
            cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.56);
            opacity: 0;

            .yk-icon {
                color: white;
                opacity: 0;
            }
        }

        &:hover {
            transform: translateY(-2px);
            border-color: var(--pcolor3);
            background: var(--pcolor1);
            box-shadow: var(--admin-shadow-md, @shadow-m);

            .file-item-img-tool {
                opacity: 1;
            }

            .file-item-img-check {
                opacity: 1;
            }
        }

    }

    &-selected {
        background: var(--pcolor1);
        border: 2px solid var(--pcolor3);

        .file-item-img-tool {
            opacity: 0;
        }

        .file-item-img-check {
            background: var(--pcolor);
            /* border: 1px solid rgba(255, 255, 255, 0.56); */
            opacity: 1;

            .yk-icon {
                opacity: 1;
            }
        }

        &:hover {

            .file-item-img-tool {
                opacity: 0;
            }

        }
    }

    &-name {
        display: flex;
        align-items: baseline;
        gap: 2px;
        padding: 10px 4px 0;
        justify-content: center;

        &-file {
            max-width: 172px;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            text-overflow: ellipsis;
            font-size: 13px;
            font-weight: 600;
            color: var(--gray);
        }

        p {
            margin: 0;
            color: var(--gray6);
            font-size: 11px;
        }
    }

    // 非图片文件的类型占位
    &-img-placeholder {
        width: 100%;
        aspect-ratio: 1 / 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-s;
        background:
            linear-gradient(145deg, var(--pcolor1), transparent 62%),
            var(--bgColor2);
        cursor: pointer;

        .yk-icon {
            font-size: 56px;
            color: var(--gray6);
        }
    }
}
</style>
