<template>
    <section class="db-backup" aria-label="数据库备份">
        <header class="db-backup-head">
            <div class="db-backup-title">
                <h3>数据库备份</h3>
                <p>图片以二进制形式存在数据库内，文件备份无法替代数据库本体备份。</p>
            </div>
            <div class="db-backup-actions">
                <yk-button v-if="canManage" :disabled="running" @click="handleCreate">
                    {{ running === 'backup' ? '备份中…' : '立即备份' }}
                </yk-button>
                <yk-button v-if="canManage" type="secondary" :disabled="running !== null" @click="handlePrune">
                    清理过期
                </yk-button>
            </div>
        </header>

        <p v-if="message" class="db-backup-message" :class="messageType === 'error' ? 'is-error' : 'is-ok'">
            {{ message }}
        </p>

        <!-- 容量与保留策略 -->
        <div v-if="overview" class="db-backup-metrics">
            <div class="db-backup-metric">
                <span class="db-backup-metric-label">备份体积</span>
                <strong>{{ formatBytes(overview.totalBytes) }}</strong>
                <span class="db-backup-metric-note">{{ overview.totalFiles }} 份</span>
            </div>
            <div class="db-backup-metric">
                <span class="db-backup-metric-label">保留策略</span>
                <strong>{{ overview.retentionCount }} 份</strong>
                <span class="db-backup-metric-note">每天 {{ padHour(overview.backupHour) }}:00</span>
            </div>
            <div class="db-backup-metric">
                <span class="db-backup-metric-label">最近备份</span>
                <strong>{{ latestSuccessText }}</strong>
                <span class="db-backup-metric-note">{{ latestSuccessNote }}</span>
            </div>
            <div class="db-backup-metric">
                <span class="db-backup-metric-label">恢复演练</span>
                <strong>{{ latestDrillText }}</strong>
                <span class="db-backup-metric-note">{{ latestDrillNote }}</span>
            </div>
        </div>

        <div v-if="overview?.capacity.maxBytes" class="db-backup-capacity">
            <div class="db-backup-capacity-head">
                <span>备份目录容量</span>
                <span class="db-backup-level" :class="`is-${overview.capacity.level}`">
                    {{ capacityLabel }}
                </span>
            </div>
            <div class="db-backup-bar">
                <span class="db-backup-fill" :class="`is-${overview.capacity.level}`"
                    :style="{ width: `${capacityPercent}%` }" />
            </div>
            <div class="db-backup-capacity-foot">
                <span>{{ formatBytes(overview.capacity.usedBytes) }} / {{ formatBytes(overview.capacity.maxBytes) }}</span>
                <span>{{ capacityPercent.toFixed(1) }}%</span>
            </div>
        </div>

        <p v-if="overview?.latest.lastFailure" class="db-backup-failure">
            最近一次失败：{{ formatDate(overview.latest.lastFailure.created_at) }} ·
            {{ overview.latest.lastFailure.error_message || '未知原因' }}
        </p>

        <yk-text v-if="loading" type="secondary">正在加载备份列表…</yk-text>
        <yk-empty v-else-if="!overview || overview.backups.length === 0" description="还没有数据库备份" />

        <ul v-else class="db-backup-list">
            <li v-for="file in overview.backups" :key="file.filename" class="db-backup-item">
                <div class="db-backup-item-main">
                    <span class="db-backup-file" :title="file.filename">{{ file.filename }}</span>
                    <span class="db-backup-file-meta">
                        {{ formatDate(file.createdAt) }} · {{ formatBytes(file.sizeBytes) }}
                    </span>
                </div>
                <div v-if="canManage" class="db-backup-item-actions">
                    <button type="button" class="db-backup-link" :disabled="running !== null"
                        @click="handleDrill(file.filename)">
                        {{ running === `drill:${file.filename}` ? '演练中…' : '恢复演练' }}
                    </button>
                    <button type="button" class="db-backup-link" :disabled="running !== null"
                        @click="handleDownload(file.filename)">
                        下载
                    </button>
                    <ConfirmPopover title="删除这份备份？" content="删除后无法再用于恢复，请确认已有其他可用备份。"
                        @confirm="handleDelete(file.filename)">
                        <button type="button" class="db-backup-link is-danger" :disabled="running !== null">
                            删除
                        </button>
                    </ConfirmPopover>
                </div>
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useSessionStore } from '../../store/session'
import ConfirmPopover from './ConfirmPopover.vue'
import {
    createDatabaseBackup,
    deleteDatabaseBackup,
    downloadDatabaseBackup,
    getBackupOverview,
    getBackupErrorMessage,
    pruneDatabaseBackups,
    runRestoreDrill,
    type BackupOverviewData,
} from '../../api/backup'
const getErrorMessage = getBackupErrorMessage

const session = useSessionStore()
const canManage = computed(() => session.can('backup.manage'))

const overview = ref<BackupOverviewData | null>(null)
const loading = ref(false)
const running = ref<string | null>(null)
const message = ref('')
const messageType = ref<'ok' | 'error'>('ok')

const latestSuccessText = computed(() => {
    const last = overview.value?.latest.lastSuccess
    if (!last) return '暂无记录'
    return formatDate(last.created_at)
})
const latestSuccessNote = computed(() => {
    const last = overview.value?.latest.lastSuccess
    if (!last) return '尚未成功备份'
    const trigger = last.trigger_type === 'scheduled' ? '定时' : '手动'
    const rows = last.row_count == null ? '?' : formatCount(last.row_count)
    return `${trigger} · ${last.table_count ?? '?'} 表 / ${rows} 行`
})

const latestDrillText = computed(() => {
    const last = overview.value?.latest.lastDrill
    if (!last) return '尚未演练'
    return last.status === 'success' ? '已通过' : '失败'
})
const latestDrillNote = computed(() => {
    const last = overview.value?.latest.lastDrill
    if (!last) return '建议每月执行一次'
    return formatDate(last.created_at)
})

const capacityPercent = computed(() =>
    Math.min(Math.max(Number(overview.value?.capacity.usedPercent ?? 0), 0), 100)
)
const capacityLabel = computed(() => {
    const level = overview.value?.capacity.level
    if (level === 'critical') return '超出上限'
    if (level === 'warning') return '接近上限'
    return '容量正常'
})

const padHour = (hour: number): string => String(hour).padStart(2, '0')

const formatCount = (value: number): string =>
    Number(value).toLocaleString('zh-CN')

const formatBytes = (bytes?: number): string => {
    const value = Number(bytes ?? 0)
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const formatDate = (value?: string | null): string => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const setMessage = (text: string, type: 'ok' | 'error' = 'ok'): void => {
    message.value = text
    messageType.value = type
}

const loadOverview = async (): Promise<void> => {
    loading.value = true
    try {
        const result = await getBackupOverview()
        overview.value = result.code === 200 && result.data ? result.data : null
        if (!overview.value) setMessage(result.message || '备份状态加载失败', 'error')
    } catch (error) {
        overview.value = null
        setMessage(getErrorMessage(error, '备份状态加载失败'), 'error')
    } finally {
        loading.value = false
    }
}

const handleCreate = async (): Promise<void> => {
    running.value = 'backup'
    setMessage('')
    try {
        const result = await createDatabaseBackup()
        if (result.code === 200 && result.data) {
            setMessage(
                `备份完成：${result.data.filename}（${formatBytes(result.data.sizeBytes)}，`
                + `${result.data.tables} 表 / ${formatCount(result.data.rows)} 行）`
            )
            await loadOverview()
        } else {
            setMessage(result.message || '备份失败', 'error')
        }
    } catch (error) {
        setMessage(getErrorMessage(error, '备份失败'), 'error')
    } finally {
        running.value = null
    }
}

const handlePrune = async (): Promise<void> => {
    running.value = 'prune'
    setMessage('')
    try {
        const result = await pruneDatabaseBackups()
        if (result.code === 200 && result.data) {
            setMessage(
                result.data.removed.length > 0
                    ? `已清理 ${result.data.removed.length} 份过期备份`
                    : '当前备份数量未超出保留策略'
            )
            await loadOverview()
        } else {
            setMessage(result.message || '清理失败', 'error')
        }
    } catch (error) {
        setMessage(getErrorMessage(error, '清理失败'), 'error')
    } finally {
        running.value = null
    }
}

const handleDrill = async (filename: string): Promise<void> => {
    running.value = `drill:${filename}`
    setMessage('')
    try {
        const result = await runRestoreDrill(filename)
        if (result.code === 200 && result.data) {
            setMessage(
                `恢复演练通过：${result.data.tables} 表 / ${formatCount(result.data.rows)} 行，`
                + `耗时 ${result.data.durationMs}ms`
                + (result.data.temporaryDatabaseCleaned ? '，临时库已清理' : '，请手动清理临时库')
            )
            await loadOverview()
        } else {
            setMessage(result.message || '恢复演练失败', 'error')
        }
    } catch (error) {
        setMessage(getErrorMessage(error, '恢复演练失败'), 'error')
    } finally {
        running.value = null
    }
}

const handleDownload = async (filename: string): Promise<void> => {
    running.value = `download:${filename}`
    setMessage('')
    try {
        const blob = await downloadDatabaseBackup(filename)
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setMessage(`已开始下载 ${filename}`)
    } catch (error) {
        setMessage(getErrorMessage(error, '下载失败'), 'error')
    } finally {
        running.value = null
    }
}

const handleDelete = async (filename: string): Promise<void> => {
    running.value = `delete:${filename}`
    setMessage('')
    try {
        const result = await deleteDatabaseBackup(filename)
        if (result.code === 200) {
            setMessage(`已删除 ${filename}`)
            await loadOverview()
        } else {
            setMessage(result.message || '删除失败', 'error')
        }
    } catch (error) {
        setMessage(getErrorMessage(error, '删除失败'), 'error')
    } finally {
        running.value = null
    }
}

onMounted(loadOverview)
</script>

<style lang="less" scoped>
.db-backup {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.db-backup-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.db-backup-title {
    min-width: 0;

    h3 {
        margin: 0;
        color: var(--admin-text, var(--gray));
        font-size: 15px;
        font-weight: 600;
    }

    p {
        margin: 4px 0 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.6;
    }
}

.db-backup-actions {
    display: flex;
    flex: none;
    gap: 8px;
}

.db-backup-message {
    margin: 0;
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 12px;
    line-height: 1.6;

    &.is-ok {
        background: color-mix(in srgb, var(--scolor, #1fb4a2) 10%, transparent);
        color: var(--scolor, #1fb4a2);
    }

    &.is-error {
        background: color-mix(in srgb, var(--ecolor, #fa5247) 10%, transparent);
        color: var(--ecolor, #fa5247);
    }
}

.db-backup-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
}

.db-backup-metric {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor2);

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 15px;
        font-variant-numeric: tabular-nums;
    }
}

.db-backup-metric-label {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    letter-spacing: 0.04em;
}

.db-backup-metric-note {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
}

.db-backup-capacity {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 13px 15px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor2);
}

.db-backup-capacity-head,
.db-backup-capacity-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.db-backup-level {
    font-weight: 600;

    &.is-ok { color: var(--scolor, #1fb4a2); }
    &.is-warning { color: var(--wcolor, #ff9a2e); }
    &.is-critical { color: #fa5247; }
}

.db-backup-bar {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--bgColor1);
}

.db-backup-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 0.4s ease;

    &.is-ok { background: var(--scolor, #1fb4a2); }
    &.is-warning { background: var(--wcolor, #ff9a2e); }
    &.is-critical { background: #fa5247; }
}

.db-backup-failure {
    margin: 0;
    color: var(--ecolor, #fa5247);
    font-size: 12px;
}

.db-backup-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.db-backup-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 11px 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 11px;
    background: var(--bgColor2);
}

.db-backup-item-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.db-backup-file {
    overflow: hidden;
    color: var(--admin-text, var(--gray));
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-backup-file-meta {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}

.db-backup-item-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 12px;
}

.db-backup-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--pcolor);
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.16s ease;

    &:hover:not(:disabled) {
        opacity: 0.72;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &.is-danger {
        color: var(--ecolor, #fa5247);
    }
}

@media (max-width: 700px) {
    .db-backup-head {
        flex-direction: column;
    }

    .db-backup-actions {
        width: 100%;
    }

    .db-backup-item {
        flex-direction: column;
        align-items: stretch;
    }

    .db-backup-item-actions {
        justify-content: flex-end;
    }
}

@media (prefers-reduced-motion: reduce) {
    .db-backup-fill,
    .db-backup-link {
        transition: none;
    }
}
</style>
