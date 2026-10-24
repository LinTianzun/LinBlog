<template>
    <yk-space dir="vertical" size="l" class="file-view">
        <top-title name="本地文件" :is-search="false" style="margin-bottom: 8px;">
            <template #custom>
                <yk-space align="center">
                    <yk-text type="third">单个文件不超过 20MB</yk-text>
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
                    :multiple="false" :limit="1" :max-size="20 * 1024 * 1024"
                    @handle-success="handleUploadSuccess" @handle-error="handleUploadError" />
            </yk-space>
            <template #footer>
                <yk-button @click="closeUpload">关闭</yk-button>
            </template>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
import { ref, computed, nextTick, getCurrentInstance } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import subset from '../components/subset/subset.vue'
import files from '../components/files/files.vue'
import { useSubsetStore } from '../store/subset'
import { getFileUploadUrl } from '../api/file'

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

const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined
const subsetStore = useSubsetStore()

const subsetId = ref(-1)
const uncategorized = ref(false)
const uploadVisible = ref(false)
const uploaderVisible = ref(true)
const uploaderKey = ref(0)
const filesRef = ref<FilesExpose | null>(null)
// 上传时归属的分组，取当前筛选中的具体分组
const subsetScopeId = ref<number | undefined>(undefined)

const uploadUrl = computed(() => getFileUploadUrl(subsetScopeId.value))

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

// 重挂载上传组件，便于连续上传多个文件
const remountUploader = async (): Promise<void> => {
    uploaderVisible.value = false
    await nextTick()
    uploaderKey.value += 1
    uploaderVisible.value = true
}

const openUpload = (): void => {
    uploadVisible.value = true
    void remountUploader()
}

const closeUpload = (): void => {
    uploadVisible.value = false
    void refreshAll()
}

const handleModalChange = (value: boolean): void => {
    uploadVisible.value = value
    if (!value) {
        void refreshAll()
    }
}

const handleUploadSuccess = (): void => {
    proxy?.$message?.({ type: 'primary', message: '文件上传成功' })
    void remountUploader()
    void refreshAll()
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
}
</script>

<style lang="less" scoped>
    .file-view {
        width: 100%;
    }
</style>
