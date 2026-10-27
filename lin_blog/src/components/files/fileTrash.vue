<template>
    <yk-modal :model-value="visible" title="回收站" width="720px" @update:model-value="handleVisibleChange">
        <div class="file-trash">
            <div class="file-trash-head">
                <yk-text type="secondary">
                    已删除文件默认保留 30 天，超期后备份会被自动清理
                </yk-text>
                <yk-space align="center">
                    <yk-button size="s" type="secondary" :disabled="busy || selectedIds.length === 0"
                        @click="restoreSelected">
                        恢复所选
                    </yk-button>
                    <yk-popconfirm v-if="isAdmin" title="彻底删除后将无法恢复，确认删除所选文件？"
                        content="" trigger="click" placement="bottomRight" @confirm="purgeSelected">
                        <yk-button size="s" type="secondary" status="danger"
                            :disabled="busy || selectedIds.length === 0">
                            彻底删除
                        </yk-button>
                    </yk-popconfirm>
                    <yk-button v-if="isAdmin" size="s" type="secondary" :disabled="busy" @click="runCleanup(true)">
                        清理预演
                    </yk-button>
                </yk-space>
            </div>

            <div v-if="isAdmin && storage" class="file-trash-capacity"
                :class="`file-trash-capacity-${storage.level}`">
                <div class="file-trash-capacity-head">
                    <div class="file-trash-capacity-title">
                        <span>备份区容量</span>
                        <strong>{{ capacityLevelLabel }}</strong>
                    </div>
                    <span class="file-trash-capacity-percent">{{ capacityPercentText }}</span>
                </div>
                <div class="file-trash-capacity-track" role="progressbar" :aria-valuenow="storage.usedPercent"
                    aria-valuemin="0" aria-valuemax="100" :aria-label="`备份区容量 ${capacityPercentText}`">
                    <span :style="{ width: `${capacityPercent}%` }" />
                </div>
                <div class="file-trash-capacity-meta">
                    <span>{{ formatSize(storage.usedBytes) }} / {{ formatSize(storage.maxBytes) }}</span>
                    <span>本地 {{ storage.local.files }} 个</span>
                    <span>跨盘 {{ storage.mirror.files }} 个</span>
                    <span>对象存储 {{ storage.offsite?.s3 ? '已启用' : '未启用' }}</span>
                </div>
                <p v-if="capacityTip" class="file-trash-capacity-tip">{{ capacityTip }}</p>
            </div>

            <div v-if="loading" class="file-trash-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在加载回收站...</yk-text>
            </div>

            <yk-empty v-else-if="trashList.length === 0" description="回收站为空" />

            <template v-else>
                <yk-scrollbar height="380px">
                    <div class="file-trash-list">
                        <div v-for="item in trashList" :key="item.id" class="file-trash-item"
                            :class="{ 'file-trash-item-selected': selectedIds.includes(item.id) }"
                            @click="toggleSelect(item.id)">
                            <div class="file-trash-item-main">
                                <p class="file-trash-item-name">
                                    {{ item.fileName }}
                                    <span v-if="!item.recoverable" class="file-trash-item-lost">备份已清理</span>
                                </p>
                                <yk-text type="third">
                                    {{ formatSize(item.size) }} · 删除于 {{ formatTime(item.deletedAt) }}
                                </yk-text>
                            </div>
                            <yk-space size="s">
                                <yk-button size="s" type="secondary" :disabled="busy || !item.recoverable"
                                    @click.stop="restoreOne(item.id)">
                                    恢复
                                </yk-button>
                                <yk-popconfirm v-if="isAdmin" title="彻底删除后将无法恢复，确认删除？"
                                    content="" trigger="click" placement="leftTop" @confirm="purgeOne(item.id)">
                                    <yk-button size="s" type="secondary" status="danger" :disabled="busy"
                                        @click.stop>
                                        彻底删除
                                    </yk-button>
                                </yk-popconfirm>
                            </yk-space>
                        </div>
                    </div>
                </yk-scrollbar>

                <div class="file-trash-pagination">
                    <yk-pagination size="s" :current="page" :total="count" :page-size="pageSize"
                        @change="changePage" />
                </div>
            </template>
        </div>

        <template #footer>
            <yk-button @click="close">关闭</yk-button>
        </template>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch, getCurrentInstance } from 'vue'
import {
    getTrashFiles,
    restoreFiles,
    purgeTrashFiles,
    runFileCleanup,
    getFileStorageStatus,
    getRequestErrorMessage,
    type FileStorageStatus,
    type TrashFileItem,
} from '../../api/file'
import './fileTrash.less'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void
    (e: 'restored'): void
}>()

type MessageOptions = { type: 'primary' | 'error'; message: string }
type ProxyWithMessage = { $message?: (options: MessageOptions) => void }

const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined

const pageSize = 10
const trashList = ref<TrashFileItem[]>([])
const selectedIds = ref<number[]>([])
const count = ref(0)
const page = ref(1)
const loading = ref(false)
const busy = ref(false)
const storage = ref<FileStorageStatus | null>(null)

// 清理接口仅管理员可用，非管理员不展示预演入口
const isAdmin = (() => {
    try {
        const saved = localStorage.getItem('userInfo')
        return saved ? JSON.parse(saved)?.user_type === 'admin' : false
    } catch {
        return false
    }
})()

const showMessage = (type: MessageOptions['type'], message: string): void => {
    proxy?.$message?.({ type, message })
}

const formatSize = (size: number | null): string => {
    const value = Number(size ?? 0)
    if (!Number.isFinite(value) || value <= 0) return '未知大小'
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
    if (value < 1024 * 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
    return `${(value / 1024 / 1024 / 1024 / 1024).toFixed(1)} TB`
}

const formatTime = (value: string | null): string => {
    if (!value) return '未知时间'
    const text = String(value).replace('T', ' ').slice(0, 16)
    return text || '未知时间'
}

const fetchTrash = async (): Promise<void> => {
    loading.value = true

    try {
        const result = await getTrashFiles({ page: page.value, pageSize })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '回收站加载失败')
        }

        count.value = result.data.total
        trashList.value = result.data.list
        selectedIds.value = selectedIds.value.filter(id =>
            result.data?.list.some(item => item.id === id)
        )

        if (result.data.list.length === 0 && page.value > 1) {
            page.value = 1
            await fetchTrash()
        }
    } catch (error) {
        trashList.value = []
        count.value = 0
        showMessage('error', getRequestErrorMessage(error, '回收站加载失败，请稍后重试'))
    } finally {
        loading.value = false
    }
}

const fetchStorageStatus = async (): Promise<void> => {
    if (!isAdmin) return

    try {
        const result = await getFileStorageStatus()
        storage.value = result.code === 200 && result.data ? result.data : null
    } catch {
        storage.value = null
    }
}

const capacityPercent = computed(() => {
    const value = Number(storage.value?.usedPercent ?? 0)
    return Math.min(Math.max(value, 0), 100)
})

const capacityPercentText = computed(() => {
    const value = Number(storage.value?.usedPercent ?? 0)
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%'
})

const capacityLevelLabel = computed(() => {
    if (storage.value?.level === 'critical') return '容量已满'
    if (storage.value?.level === 'warning') return '接近上限'
    return '容量正常'
})

const capacityTip = computed(() => {
    if (!storage.value) return ''
    if (storage.value.level === 'critical') {
        return '备份区已达到容量上限，请清理过期备份或调高容量配置。'
    }
    if (storage.value.level === 'warning') {
        return `备份区使用率已达到 ${storage.value.warnPercent}% 告警阈值，请及时清理。`
    }
    if (!storage.value.offsite?.enabled) {
        return '尚未配置跨盘镜像或对象存储，本地备份单点故障风险较高。'
    }
    return ''
})

const changePage = (nextPage: number): void => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchTrash()
}

const toggleSelect = (id: number): void => {
    selectedIds.value = selectedIds.value.includes(id)
        ? selectedIds.value.filter(item => item !== id)
        : [...selectedIds.value, id]
}

const restoreOne = (id: number): void => {
    void restore([id])
}

const restoreSelected = (): void => {
    if (selectedIds.value.length === 0) return
    void restore([...selectedIds.value])
}

const purgeOne = (id: number): void => {
    void purge([id])
}

const purgeSelected = (): void => {
    if (selectedIds.value.length === 0) return
    void purge([...selectedIds.value])
}

const purge = async (ids: number[]): Promise<void> => {
    if (busy.value || ids.length === 0) return
    busy.value = true

    try {
        const result = await purgeTrashFiles(ids)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '彻底删除失败')
        }

        const failed = Number(result.data.failedCount || 0)
        showMessage(
            failed > 0 ? 'error' : 'primary',
            failed > 0
                ? `已彻底删除 ${result.data.purgedCount} 个，${failed} 个删除失败`
                : `已彻底删除 ${result.data.purgedCount} 个文件`
        )

        selectedIds.value = []
        await Promise.all([fetchTrash(), fetchStorageStatus()])
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '彻底删除失败，请稍后重试'))
    } finally {
        busy.value = false
    }
}

const restore = async (ids: number[]): Promise<void> => {
    if (busy.value || ids.length === 0) return
    busy.value = true

    try {
        const result = await restoreFiles(ids)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '恢复失败')
        }

        const failed = Number(result.data.failedCount || 0)
        showMessage(
            failed > 0 ? 'error' : 'primary',
            failed > 0
                ? `已恢复 ${result.data.restoredCount} 个，${failed} 个因备份缺失失败`
                : `已恢复 ${result.data.restoredCount} 个文件`
        )

        selectedIds.value = []
        await Promise.all([fetchTrash(), fetchStorageStatus()])
        emit('restored')
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '恢复失败，请稍后重试'))
    } finally {
        busy.value = false
    }
}

// 预演只统计可清理项，不改动磁盘与数据库
const runCleanup = async (dryRun: boolean): Promise<void> => {
    if (busy.value) return
    busy.value = true

    try {
        const result = await runFileCleanup(dryRun)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '清理预演失败')
        }

        const data = result.data as {
            removedOrphans?: number
            removedExpiredBackups?: number
            movedLegacyFiles?: number
        }
        showMessage(
            'primary',
            `待清理孤儿 ${data.removedOrphans ?? 0} 个、过期备份 ${data.removedExpiredBackups ?? 0} 个`
        )
        await fetchStorageStatus()
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '清理预演失败，请稍后重试'))
    } finally {
        busy.value = false
    }
}

const close = (): void => {
    emit('update:visible', false)
}

const handleVisibleChange = (value: boolean): void => {
    emit('update:visible', value)
}

watch(() => props.visible, value => {
    if (!value) return
    page.value = 1
    selectedIds.value = []
    void Promise.all([fetchTrash(), fetchStorageStatus()])
})

defineExpose({ refresh: fetchTrash })
</script>
