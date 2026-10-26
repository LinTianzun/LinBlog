<template>
    <yk-space dir="vertical" size="l" class="file-view">
        <top-title name="本地文件" :is-search="false" style="margin-bottom: 8px;">
            <template #custom>
                <yk-space align="center">
                    <yk-text type="third">支持多选，单个文件不超过 20MB</yk-text>
                    <yk-button @click="openUpload">上传</yk-button>
                </yk-space>
            </template>
        </top-title>

        <subset classify="resource" @nowSubset="handleSubset" />

        <files ref="filesRef" :page-size="8" :subset-id="subsetId" :uncategorized="uncategorized" />

        <yk-modal :model-value="uploadVisible" title="上传文件" @update:model-value="handleModalChange">
            <yk-space dir="vertical" size="m" style="width: 100%;">
                <yk-text type="third">上传到分组：{{ subsetStore.subsetName(subsetScopeId) }}</yk-text>

                <yk-upload v-if="uploaderVisible" :key="uploaderKey" :upload-url="uploadUrl" accept="*"
                    :multiple="true" :limit="maxUploadCount" :max-size="20 * 1024 * 1024"
                    @handle-success="handleUploadSuccess"
                    @handle-error="handleUploadError" />

                <div v-if="uploadedFiles.length > 0" class="file-upload-preview">
                    <yk-text type="secondary">本次已上传 {{ uploadedFiles.length }} 个文件</yk-text>
                    <div class="file-upload-preview-list">
                        <div class="file-upload-preview-item" v-for="item in uploadedFiles" :key="item.fileId">
                            <img v-if="isImage(item.format)" :src="item.url" :alt="item.fileName" />
                            <div v-else class="file-upload-preview-icon">
                                <IconFileFill />
                            </div>
                            <div class="file-upload-preview-info">
                                <p class="file-upload-preview-name">{{ item.fileName }}</p>
                                <yk-text type="third">{{ formatSize(item.size) }}</yk-text>
                            </div>
                        </div>
                    </div>
                </div>
            </yk-space>
            <template #footer>
                <yk-button @click="closeUpload">关闭</yk-button>
            </template>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
import { ref, nextTick, getCurrentInstance } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import subset from '../components/subset/subset.vue'
import files from '../components/files/files.vue'
import { useSubsetStore } from '../store/subset'
import { getFileUploadUrl, getRequestErrorMessage } from '../api/file'
import { createUploadTicket } from '../utils/uploadUrl.ts'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type ProxyWithMessage = {
    $message?: (options: MessageOptions) => void
}

type FilesExpose = {
    refresh: () => Promise<void>
}

type UploadResponse = {
    code?: number
    error?: string
    message?: string
    data?: {
        fileId?: number
        url?: string
        fileName?: string
        format?: string
        size?: number
    }
}

type UploadedFile = {
    fileId: number
    fileName: string
    format: string
    size: number
    url: string
}

const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined
const subsetStore = useSubsetStore()

const maxUploadCount = 9

const subsetId = ref(-1)
const uncategorized = ref(false)
const uploadVisible = ref(false)
const uploaderVisible = ref(true)
const uploaderKey = ref(0)
const filesRef = ref<FilesExpose | null>(null)
// 上传时归属的分组，取当前筛选中的具体分组
const subsetScopeId = ref<number | undefined>(undefined)

// 本次弹窗内的上传结果，用于预览
const uploadedFiles = ref<UploadedFile[]>([])
// 多选时组件按文件逐个回调，用「静默期」判断本轮是否结束（被 limit/大小拦截的文件不会再回调）
// 仅用于合并刷新，不再自动关闭弹窗
let refreshTimer: number | undefined

// 上传凭证改用短期票据：打开上传弹窗时换取一次，URL 里流通的不再是长期 JWT
const uploadUrl = ref('')
const ticketBusy = ref(false)

const refreshUploadUrl = async (): Promise<void> => {
    if (ticketBusy.value) return
    ticketBusy.value = true
    try {
        const { ticket } = await createUploadTicket()
        uploadUrl.value = getFileUploadUrl(ticket, subsetScopeId.value)
    } catch (error) {
        uploadUrl.value = ''
        proxy?.$message?.({
            type: 'error',
            message: getRequestErrorMessage(error, '上传凭证获取失败，请重新登录后再试')
        })
    } finally {
        ticketBusy.value = false
    }
}

const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']

const isImage = (format: string): boolean =>
    imageFormats.includes(String(format || '').toLowerCase())

// 下载接口默认 attachment + octet-stream，<img> 需要 inline 才能拿到正确 MIME
const toPreviewUrl = (url: string): string => {
    if (!url.startsWith('/api/file/')) return url
    return url.includes('?') ? `${url}&inline=true` : `${url}?inline=true`
}
const formatSize = (size: number): string => {
    if (!Number.isFinite(size) || size <= 0) return '未知大小'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const handleSubset = (payload: { id: string | number; type: string }): void => {
    if (payload.type === 'subset') {
        subsetId.value = Number(payload.id)
        uncategorized.value = false
        subsetScopeId.value = Number(payload.id)
        return
    }

    subsetId.value = -1
    uncategorized.value = payload.type === 'exclude'
    subsetScopeId.value = undefined
}

const refreshAll = async (): Promise<void> => {
    await Promise.all([
        filesRef.value?.refresh(),
        subsetStore.fetchFileSubsets(),
    ])
}

// 重挂载上传组件，清空其内部列表
const remountUploader = async (): Promise<void> => {
    uploaderVisible.value = false
    await nextTick()
    uploaderKey.value += 1
    uploaderVisible.value = true
}

const resetUploadState = (): void => {
    uploadedFiles.value = []
    if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer)
        refreshTimer = undefined
    }
}

const openUpload = async (): Promise<void> => {
    resetUploadState()
    uploadVisible.value = true
    // 先换取票据再挂载上传组件，避免用户抢在票据返回前就选文件
    await refreshUploadUrl()
    void remountUploader()
}

const closeModal = (): void => {
    uploadVisible.value = false
    resetUploadState()
}

const closeUpload = (): void => {
    closeModal()
    void refreshAll()
}

const handleModalChange = (value: boolean): void => {
    uploadVisible.value = value
    if (!value) {
        closeModal()
        void refreshAll()
    }
}

// 多选时每个文件都会触发一次回调，合并成静默期后的一次刷新，避免连续请求
const scheduleRefresh = (): void => {
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)

    refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        void refreshAll()
    }, 1200)
}

const handleUploadSuccess = (response: UploadResponse): void => {
    const data = response?.data
    if (data?.fileId && data.url) {
        uploadedFiles.value = [...uploadedFiles.value, {
            fileId: data.fileId,
            fileName: data.fileName || '未命名文件',
            format: data.format || '',
            size: Number(data.size ?? 0),
            url: toPreviewUrl(data.url),
        }]
        proxy?.$message?.({ type: 'primary', message: `${data.fileName || '文件'} 上传成功` })
    }

    scheduleRefresh()
}

const handleUploadError = (error: unknown): void => {
    let message = '文件上传失败，请稍后重试'
    if (typeof error === 'string' && error.trim()) {
        message = error
    } else if (typeof error === 'object' && error !== null) {
        const payload = error as { error?: unknown; message?: unknown }
        const detail = payload.error || payload.message
        if (typeof detail === 'string' && detail.trim()) message = detail
    }
    proxy?.$message?.({ type: 'error', message })

    scheduleRefresh()
}
</script>

<style lang="less" scoped>
    .file-view {
        width: 100%;
    }

    .file-upload-preview {
        &-list {
            display: flex;
            flex-wrap: wrap;
            gap: @space-s;
            padding-top: @space-s;
        }

        &-item {
            display: flex;
            align-items: center;
            gap: @space-s;
            width: calc(50% - @space-s / 2);
            padding: @space-s;
            border-radius: @radius-m;
            background: @bg-color-m;
        }

        &-item img {
            width: 44px;
            height: 44px;
            object-fit: cover;
            border-radius: @radius-s;
            flex: none;
        }

        &-icon {
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: @radius-s;
            background: @bg-color-s;
            flex: none;

            .yk-icon {
                font-size: 22px;
                color: @font-color-s;
            }
        }

        &-info {
            min-width: 0;
            display: flex;
            flex-direction: column;
        }

        &-name {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            font-size: @size-s;
        }
    }
</style>
