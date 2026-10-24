<template>
    <div class="file-item">
        <div class="file-item-img" :class="{ 'file-item-selected': props.data?.selected }">
            <yk-image v-if="isPreviewable" :src="props.data.url" fit="contain" width="200" height="200"
                :preview="true" :is-lazy="true">
            </yk-image>
            <div v-else class="file-item-img-placeholder">
                <IconFileFill />
                <yk-text type="third">{{ props.data.format }}</yk-text>
            </div>
            <yk-space class="file-item-img-tool" size="s">
                <IconDownloadOutline class="files-tool-download" @click="downloadFile" />
                <yk-popconfirm title="确认删除该文件？删除后不可恢复" trigger="click" placement="topRight"
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

    &-img {
        width: 205px;
        position: relative;
        border: 2px solid @bg-color-l;
        border-radius: @radius-s;

        &-tool {
            position: absolute;
            right: @space-s;
            bottom: @space-s;
            opacity: 0;

            .yk-icon {
                width: 32px;
                height: 32px;
                padding: 8px;
                background: rgba(255, 255, 255, 0.56);
                border-radius: @radius-m;
                transition: all @animatb;
                cursor: pointer;

                &:hover {
                    color: @pcolor;
                    background: rgba(255, 255, 255, 0.72);
                    backdrop-filter: blur(2px);
                }
            }
        }

        &-check {
            position: absolute;
            width: 24px;
            height: 24px;
            border-radius: @radius-s;
            background: @gray-4;
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
            background: @pcolor-1;

            .file-item-img-tool {
                opacity: 1;
            }

            .file-item-img-check {
                opacity: 1;
            }
        }

    }

    &-selected {
        background: @pcolor-1;
        border: 2px solid @pcolor-3;

        .file-item-img-tool {
            opacity: 0;
        }

        .file-item-img-check {
            background: @pcolor;
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
        padding-top: @space-l;
        justify-content: center;

        &-file {
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            text-overflow: ellipsis;
        }
    }

    // 非图片文件的类型占位
    &-img-placeholder {
        width: 200px;
        height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-s;
        background: @bg-color-m;
        cursor: pointer;

        .yk-icon {
            font-size: 56px;
            color: @font-color-s;
        }
    }
}
</style>
