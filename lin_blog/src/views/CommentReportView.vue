<template>
    <yk-space dir="vertical" size="l" class="admin-page report-page">
        <top-title name="举报处理" description="审核评论举报 · 批量处置 · 留痕复盘" :is-search="false">
            <template #custom>
                <yk-space align="center" size="m">
                    <yk-text type="third">待处理 {{ summary.pending }} 条</yk-text>
                    <yk-button type="secondary" :disabled="loading" @click="reload">
                        <IconRefreshOutline /> 刷新
                    </yk-button>
                </yk-space>
            </template>
        </top-title>

        <div v-if="actionError" class="report-action-error" role="alert">
            <span>{{ actionError }}</span>
            <button type="button" aria-label="关闭提示" @click="actionError = ''">×</button>
        </div>

        <section class="report-insight-grid">
            <article class="report-panel report-trend-panel">
                <header class="report-trend-head">
                    <div>
                        <span class="report-trend-kicker">REPORT PULSE</span>
                        <h2>近 14 天举报走势</h2>
                        <p>按举报创建日期统计，颜色区分当前处理状态。</p>
                    </div>
                    <div class="report-trend-summary">
                        <span>
                            <strong>{{ trendTotal }}</strong>
                            <small>14 天举报</small>
                        </span>
                        <span>
                            <strong>{{ peakTrend ? shortDate(peakTrend.date) : '—' }}</strong>
                            <small>{{ peakTrend ? `峰值 ${peakTrend.total} 条` : '暂无峰值' }}</small>
                        </span>
                    </div>
                </header>

                <div v-if="trend.length" class="report-trend-scroll">
                    <div class="report-trend-chart" role="img" aria-label="近 14 天举报趋势柱状图">
                        <div v-for="point in trend" :key="point.date" class="report-trend-day"
                            :title="`${point.date}：共 ${point.total} 条，待处理 ${point.pending}，已处理 ${point.resolved}，已忽略 ${point.dismissed}`">
                            <span class="report-trend-total">{{ point.total || '' }}</span>
                            <div class="report-trend-track">
                                <span class="report-trend-segment tone-pending"
                                    :style="{ height: `${trendPartHeight(point.pending)}%` }" />
                                <span class="report-trend-segment tone-resolved"
                                    :style="{ height: `${trendPartHeight(point.resolved)}%` }" />
                                <span class="report-trend-segment tone-dismissed"
                                    :style="{ height: `${trendPartHeight(point.dismissed)}%` }" />
                            </div>
                            <span class="report-trend-date">{{ shortDate(point.date) }}</span>
                        </div>
                    </div>
                </div>
                <yk-text v-else type="secondary">暂无趋势数据</yk-text>

                <div class="report-trend-legend">
                    <span><i class="tone-pending" />待处理 {{ summary.pending }}</span>
                    <span><i class="tone-resolved" />已处理 {{ summary.resolved }}</span>
                    <span><i class="tone-dismissed" />已忽略 {{ summary.dismissed }}</span>
                </div>
            </article>

            <div class="report-stats">
                <button v-for="card in statusCards" :key="card.value" type="button" class="report-stat"
                    :class="[`tone-${card.tone}`, { 'is-active': statusFilter === card.value }]"
                    @click="switchStatus(card.value)">
                    <span class="report-stat-label">{{ card.label }}</span>
                    <strong class="report-stat-count">{{ card.count }}</strong>
                    <small class="report-stat-hint">{{ card.hint }}</small>
                </button>
            </div>
        </section>

        <section class="report-panel report-filter-panel">
            <div class="report-filter-row">
                <span class="report-filter-label">时间</span>
                <div class="report-date-presets" role="group" aria-label="举报时间快捷筛选">
                    <button v-for="option in REPORT_RANGE_OPTIONS" :key="option.value" type="button"
                        class="report-chip" :class="{ 'is-active': datePreset === option.value }"
                        @click="switchDatePreset(option.value)">
                        {{ option.label }}
                    </button>
                </div>
                <div class="report-date-editor">
                    <input v-model="startDate" type="date" aria-label="开始日期"
                        :max="endDate || undefined" @input="markCustomDate" />
                    <span>至</span>
                    <input v-model="endDate" type="date" aria-label="结束日期"
                        :min="startDate || undefined" @input="markCustomDate" />
                    <button type="button" class="report-chip report-chip--apply" @click="applyDateRange">
                        应用
                    </button>
                    <button v-if="startDate || endDate" type="button" class="report-chip"
                        @click="clearDateRange">
                        清除
                    </button>
                </div>
            </div>

            <div class="report-filter-row">
                <span class="report-filter-label">原因</span>
                <div class="report-reasons" role="group" aria-label="按举报原因筛选">
                    <button type="button" class="report-reason-filter"
                        :class="{ 'is-active': reasonFilter === '' }" @click="switchReason('')">
                        全部原因
                        <em>{{ summary.total }}</em>
                    </button>
                    <button v-for="reason in COMMENT_REPORT_REASONS" :key="reason.value" type="button"
                        class="report-reason-filter" :class="{ 'is-active': reasonFilter === reason.value }"
                        @click="switchReason(reason.value)">
                        {{ reason.label }}
                        <em>{{ summary.reasons[reason.value] || 0 }}</em>
                    </button>
                </div>
            </div>

            <div class="report-filter-row report-filter-row--last">
                <span class="report-filter-label">来源</span>
                <yk-radio-group v-model="targetFilter" type="button" :solid="true" @change="reload">
                    <yk-radio value="">全部来源</yk-radio>
                    <yk-radio value="article">博客文章</yk-radio>
                    <yk-radio value="gallery">摄影图库</yk-radio>
                    <yk-radio value="diary">随笔随记</yk-radio>
                </yk-radio-group>
                <span class="report-filter-spacer" />
                <div class="report-search">
                    <yk-input v-model="keyword" placeholder="搜索评论、来源或用户" :limit="40" clearable
                        @submit="reload" />
                </div>
                <yk-button type="primary" :disabled="loading" @click="reload">搜索</yk-button>
            </div>
        </section>

        <section v-if="selectableIds.length" class="report-panel report-batch-bar">
            <div class="report-batch-select">
                <yk-checkbox :checked="allSelected" :indeterminate="partlySelected" @change="handleSelectAll">
                    全选本页待处理
                </yk-checkbox>
                <span>已选 {{ selectedIds.length }} / {{ selectableIds.length }} 条</span>
            </div>
            <div class="report-batch-actions">
                <input v-model="batchNote" type="text" maxlength="200" class="report-batch-note"
                    placeholder="批量处理备注（选填，最多 200 字）" />
                <yk-button size="s" type="secondary" :disabled="batchActing || selectedIds.length === 0"
                    @click="runBatch(1)">
                    标记已处理
                </yk-button>
                <yk-button size="s" type="secondary" :disabled="batchActing || selectedIds.length === 0"
                    @click="runBatch(2)">
                    忽略
                </yk-button>
                <button type="button" class="report-batch-clear" @click="clearSelection">清空选择</button>
            </div>
        </section>

        <yk-text v-if="loading && reports.length === 0" type="secondary">正在加载举报…</yk-text>
        <yk-text v-else-if="errorMessage" type="danger">{{ errorMessage }}</yk-text>
        <yk-empty v-else-if="reports.length === 0" description="当前筛选下暂无举报" />

        <template v-else>
            <div class="report-list" :class="{ 'is-refreshing': loading }">
                <article v-for="item in reports" :key="item.id" class="report-card"
                    :class="[`status-${item.status}`, { 'is-selected': selectedIds.includes(item.id) }]">
                    <header class="report-card-head">
                        <yk-checkbox v-if="item.status === 0" :checked="selectedIds.includes(item.id)"
                            class="report-card-check" @change="toggleReportSelection(item.id)">
                            <span class="sr-only">选择举报 #{{ item.id }}</span>
                        </yk-checkbox>
                        <span class="report-reason-tag">{{ reasonLabel(item.reason) }}</span>
                        <span class="report-status-tag">{{ statusLabel(item.status) }}</span>
                        <span class="report-source-tag">{{ sourceKindLabel(item) }}</span>
                        <span class="report-head-spacer" />
                        <span class="report-time">{{ formatTime(item.createdAt) }}</span>
                    </header>

                    <blockquote class="report-quote">
                        <span class="report-quote-mark" aria-hidden="true">“</span>
                        <p>{{ item.comment.content }}</p>
                    </blockquote>

                    <div class="report-meta">
                        <span class="report-meta-item">
                            <span class="report-meta-label">评论作者</span>
                            <span class="report-meta-value">{{ item.comment.user.name }}</span>
                        </span>
                        <span class="report-meta-item">
                            <span class="report-meta-label">所属内容</span>
                            <span class="report-meta-value">{{ sourceLabel(item) }}</span>
                        </span>
                        <span class="report-meta-item">
                            <span class="report-meta-label">举报人</span>
                            <span class="report-meta-value">{{ item.reporter.name }}</span>
                        </span>
                        <span class="report-meta-item">
                            <span class="report-meta-label">累计被举报</span>
                            <span class="report-meta-value">{{ item.comment.complaint }} 次</span>
                        </span>
                    </div>

                    <p v-if="item.detail" class="report-detail">
                        <span>补充说明</span>{{ item.detail }}
                    </p>

                    <p v-if="item.handleNote" class="report-handle-note">
                        <span>处理备注</span>{{ item.handleNote }}
                    </p>

                    <footer class="report-card-foot">
                        <span v-if="item.status !== 0" class="report-handled">
                            由 {{ item.handlerName || '管理员' }} 于 {{ formatTime(item.handledAt) }}
                            {{ item.status === 1 ? '标记为已处理' : '忽略' }}
                        </span>
                        <span v-else class="report-handled report-handled--pending">
                            该评论当前{{ item.comment.status === 0 ? '已被删除' : '仍正常展示' }}
                        </span>

                        <span class="report-card-actions">
                            <template v-if="item.status === 0">
                                <yk-button size="s" type="secondary" :disabled="actingId === item.id"
                                    @click="openNoteModal(item)">
                                    备注处理
                                </yk-button>
                                <yk-button size="s" type="secondary" :disabled="actingId === item.id"
                                    @click="markReport(item, 2)">
                                    忽略
                                </yk-button>
                                <yk-button size="s" type="secondary" :disabled="actingId === item.id"
                                    @click="markReport(item, 1)">
                                    标记已处理
                                </yk-button>
                                <yk-button size="s" type="primary" status="danger" :disabled="actingId === item.id"
                                    @click="askDelete(item)">
                                    删除评论
                                </yk-button>
                            </template>
                            <template v-else>
                                <yk-button size="s" type="secondary" :disabled="actingId === item.id"
                                    @click="openNoteModal(item)">
                                    {{ item.handleNote ? '修改备注' : '补充备注' }}
                                </yk-button>
                                <yk-button v-if="item.status === 1" size="s" type="secondary"
                                    :disabled="actingId === item.id" @click="markReport(item, 0)">
                                    设为未处理
                                </yk-button>
                                <yk-button v-else size="s" type="secondary" :disabled="actingId === item.id"
                                    @click="markReport(item, 1)">
                                    标记为已处理
                                </yk-button>
                            </template>
                        </span>
                    </footer>
                </article>
            </div>

            <div class="report-pagination">
                <AdminPager v-model:page="page" v-model:page-size="pageSize" :total="total"
                    :page-size-options="[10, 20, 50]" :show-page-size="true" :show-total="true"
                    :disabled="loading" @change="handlePagerChange" />
            </div>
        </template>

        <yk-modal :model-value="noteTarget !== null" title="处理举报并填写备注" size="s"
            :closeable="!noteSubmitting" @update:model-value="closeNoteModal">
            <div class="report-note-form">
                <blockquote v-if="noteTarget">{{ noteTarget.comment.content }}</blockquote>
                <div class="report-note-status" role="group" aria-label="处理结果">
                    <button type="button" :class="{ 'is-active': noteNextStatus === 1 }"
                        @click="noteNextStatus = 1">
                        标记已处理
                    </button>
                    <button type="button" :class="{ 'is-active': noteNextStatus === 2 }"
                        @click="noteNextStatus = 2">
                        忽略举报
                    </button>
                </div>
                <label class="report-note-label">
                    <span>处理备注（选填）</span>
                    <textarea v-model="noteDraft" rows="4" maxlength="200"
                        placeholder="例如：已删除违规评论并通知作者" />
                </label>
                <div class="report-note-counter">{{ noteDraft.length }} / 200</div>
                <div class="report-note-actions">
                    <yk-button size="s" :disabled="noteSubmitting" @click="closeNoteModal">取消</yk-button>
                    <yk-button size="s" type="primary" :loading="noteSubmitting" @click="saveNote">
                        保存并完成处理
                    </yk-button>
                </div>
            </div>
        </yk-modal>

        <yk-modal :model-value="deleteTarget !== null" title="删除被举报评论" size="s"
            :closeable="!deleting" @update:model-value="closeDeleteModal">
            <div class="report-delete">
                <p>确认删除这条评论吗？删除后评论及其回复将不再展示，相关待处理举报会同步标记为已处理。</p>
                <blockquote v-if="deleteTarget">{{ deleteTarget.comment.content }}</blockquote>
                <div class="report-delete-actions">
                    <yk-button size="s" :disabled="deleting" @click="closeDeleteModal">取消</yk-button>
                    <yk-button size="s" type="primary" status="danger" :loading="deleting" @click="confirmDelete">
                        确认删除
                    </yk-button>
                </div>
            </div>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { IconRefreshOutline } from '@yike-design/ui/es/components/svg-icon'
import TopTitle from '../components/bar/TopTitle.vue'
import AdminPager from '../components/common/AdminPager.vue'
import {
    getCommentReports,
    getRequestErrorMessage,
    updateCommentReportStatus,
    updateCommentReportStatusBatch,
    type CommentReportItem,
    type CommentReportSourceFilter,
    type CommentReportStatus,
    type CommentReportTrendPoint,
} from '../api/commentReport'
import { deleteInteractionComment, type CommentReportReason } from '../api/comment'
import { COMMENT_REPORT_REASONS, commentReportReasonLabel } from '../utils/commentReport'
import {
    REPORT_RANGE_OPTIONS,
    emitReportStateChange,
    extractTrend,
    isAllSelected,
    isCompleteReportRange,
    normalizeHandleNote,
    pruneSelectedIds,
    rangePresetFromDates,
    resolveReportRange,
    selectableReportIds,
    shortDate,
    toggleId,
    toggleSelectAll,
    trendMax,
    trendSummary,
    type ReportRangePreset,
} from '../utils/commentReportWorkbench'

type StatusFilter = CommentReportStatus | 'all'
type DatePreset = ReportRangePreset | 'custom'

const reports = ref<CommentReportItem[]>([])
const trend = ref<CommentReportTrendPoint[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMessage = ref('')
const actionError = ref('')
const summary = ref({ total: 0, pending: 0, resolved: 0, dismissed: 0, reasons: {} as Record<string, number> })
const statusFilter = ref<StatusFilter>(0)
const reasonFilter = ref<CommentReportReason | ''>('')
const targetFilter = ref<CommentReportSourceFilter | ''>('')
const keyword = ref('')
const actingId = ref(0)

const startDate = ref('')
const endDate = ref('')
const datePreset = ref<DatePreset>(0)

const selectedIds = ref<number[]>([])
const batchNote = ref('')
const batchActing = ref(false)

const noteTarget = ref<CommentReportItem | null>(null)
const noteNextStatus = ref<1 | 2>(1)
const noteDraft = ref('')
const noteSubmitting = ref(false)

const deleteTarget = ref<CommentReportItem | null>(null)
const deleting = ref(false)

const statusCards = computed(() => [
    { value: 0 as StatusFilter, label: '待处理', count: summary.value.pending, hint: '需要尽快审核', tone: 'danger' },
    { value: 1 as StatusFilter, label: '已处理', count: summary.value.resolved, hint: '违规已处置', tone: 'success' },
    { value: 2 as StatusFilter, label: '已忽略', count: summary.value.dismissed, hint: '不构成违规', tone: 'muted' },
    { value: 'all' as StatusFilter, label: '全部举报', count: summary.value.total, hint: '包含全部状态', tone: 'primary' },
])

const selectableIds = computed(() => selectableReportIds(reports.value))
const allSelected = computed(() => isAllSelected(selectedIds.value, selectableIds.value))
const partlySelected = computed(() => selectedIds.value.length > 0 && !allSelected.value)
const maxTrendValue = computed(() => trendMax(trend.value))
const trendStats = computed(() => trendSummary(trend.value))
const trendTotal = computed(() => trendStats.value.total)
const peakTrend = computed(() => trendStats.value.peak)

const statusLabel = (value: CommentReportStatus): string =>
    value === 1 ? '已处理' : value === 2 ? '已忽略' : '待处理'

const reasonLabel = (value: string): string => commentReportReasonLabel(value)

const formatTime = (value: string | null): string =>
    value ? String(value).replace('T', ' ').slice(0, 19) : '-'

const sourceKindLabel = (item: CommentReportItem): string =>
    item.source.classify === 'image'
        ? '摄影图库'
        : item.source.classify === 'diary'
            ? '随笔随记'
            : '博客文章'

const sourceLabel = (item: CommentReportItem): string =>
    `${sourceKindLabel(item)} · ${item.source.title}`

const trendPartHeight = (count: number): number =>
    count > 0 ? Math.round((count / maxTrendValue.value) * 100) : 0

const fetchReports = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''
    actionError.value = ''

    try {
        const result = await getCommentReports({
            page: page.value,
            pageSize: pageSize.value,
            status: statusFilter.value,
            reason: reasonFilter.value,
            targetType: targetFilter.value,
            keyword: keyword.value.trim() || undefined,
            ...(isCompleteReportRange(startDate.value, endDate.value)
                ? { startDate: startDate.value, endDate: endDate.value }
                : {}),
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '举报加载失败')
        }
        reports.value = result.data.list
        total.value = result.data.total
        summary.value = result.data.summary
        trend.value = extractTrend(result.data)
        selectedIds.value = pruneSelectedIds(selectedIds.value, selectableReportIds(reports.value))
    } catch (error) {
        reports.value = []
        trend.value = []
        total.value = 0
        selectedIds.value = []
        errorMessage.value = getRequestErrorMessage(error, '举报加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const reload = (): void => {
    page.value = 1
    void fetchReports()
}

const switchStatus = (value: StatusFilter): void => {
    if (statusFilter.value === value) return
    statusFilter.value = value
    reload()
}

const switchReason = (value: CommentReportReason | ''): void => {
    if (reasonFilter.value === value) return
    reasonFilter.value = value
    reload()
}

const switchDatePreset = (preset: ReportRangePreset): void => {
    const range = resolveReportRange(preset)
    startDate.value = range.startDate
    endDate.value = range.endDate
    datePreset.value = preset
    reload()
}

const markCustomDate = (): void => {
    datePreset.value = 'custom'
}

const applyDateRange = (): void => {
    if (!startDate.value && !endDate.value) {
        datePreset.value = 0
        reload()
        return
    }
    if (!startDate.value || !endDate.value) {
        actionError.value = '请同时选择开始日期和结束日期'
        return
    }
    if (!isCompleteReportRange(startDate.value, endDate.value)) {
        actionError.value = '请选择有效的日期范围'
        return
    }
    if (startDate.value > endDate.value) {
        const nextStart = endDate.value
        endDate.value = startDate.value
        startDate.value = nextStart
    }
    datePreset.value = rangePresetFromDates(startDate.value, endDate.value) || 'custom'
    reload()
}

const clearDateRange = (): void => {
    startDate.value = ''
    endDate.value = ''
    datePreset.value = 0
    reload()
}

const handlePagerChange = ({ page: nextPage, pageSize: nextPageSize }: {
    page: number
    pageSize: number
}): void => {
    page.value = nextPage
    pageSize.value = nextPageSize
    void fetchReports()
}

const handleSelectAll = (): void => {
    selectedIds.value = toggleSelectAll(selectedIds.value, selectableIds.value)
}

const toggleReportSelection = (id: number): void => {
    selectedIds.value = toggleId(selectedIds.value, id)
}

const clearSelection = (): void => {
    selectedIds.value = []
    batchNote.value = ''
}

const emitChange = (): void => {
    emitReportStateChange()
}

const markReport = async (
    item: CommentReportItem,
    status: 0 | 1 | 2,
    note?: string
): Promise<boolean> => {
    actingId.value = item.id
    try {
        const result = await updateCommentReportStatus(item.id, status, note)
        if (result.code !== 200) throw new Error(result.message || '操作失败')
        emitChange()
        await fetchReports()
        return true
    } catch (error) {
        actionError.value = getRequestErrorMessage(error, '处理举报失败，请稍后重试')
        return false
    } finally {
        actingId.value = 0
    }
}

const runBatch = async (status: 1 | 2): Promise<void> => {
    if (selectedIds.value.length === 0) return

    batchActing.value = true
    actionError.value = ''
    try {
        const note = normalizeHandleNote(batchNote.value)
        const result = await updateCommentReportStatusBatch(selectedIds.value, status, note || undefined)
        if (result.code !== 200) throw new Error(result.message || '批量处理失败')
        clearSelection()
        emitChange()
        await fetchReports()
    } catch (error) {
        actionError.value = getRequestErrorMessage(error, '批量处理举报失败，请稍后重试')
    } finally {
        batchActing.value = false
    }
}

const openNoteModal = (item: CommentReportItem): void => {
    noteTarget.value = item
    noteNextStatus.value = item.status === 0 || item.status === 1 ? 1 : 2
    noteDraft.value = item.handleNote || ''
}

const closeNoteModal = (open?: boolean): void => {
    if (open === true || noteSubmitting.value) return
    noteTarget.value = null
}

const saveNote = async (): Promise<void> => {
    const target = noteTarget.value
    if (!target) return

    noteSubmitting.value = true
    const updated = await markReport(
        target,
        noteNextStatus.value,
        normalizeHandleNote(noteDraft.value) || undefined
    )
    noteSubmitting.value = false
    if (updated) noteTarget.value = null
}

const askDelete = (item: CommentReportItem): void => {
    deleteTarget.value = item
}

const closeDeleteModal = (open?: boolean): void => {
    if (open === true || deleting.value) return
    deleteTarget.value = null
}

const confirmDelete = async (): Promise<void> => {
    const target = deleteTarget.value
    if (!target) return

    deleting.value = true
    actingId.value = target.id
    try {
        const result = await deleteInteractionComment({
            commentType: target.targetType,
            commentId: target.commentId,
        })
        if (result.code !== 200) throw new Error(result.message || '删除失败')
        deleteTarget.value = null
        emitChange()
        await fetchReports()
    } catch (error) {
        actionError.value = getRequestErrorMessage(error, '删除评论失败，请稍后重试')
    } finally {
        deleting.value = false
        actingId.value = 0
    }
}

onMounted(() => {
    void fetchReports()
})
</script>

<style lang="less" scoped>
    .report-page {
        width: 100%;
    }

    .report-panel {
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm);
    }

    .report-insight-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.85fr);
        gap: 14px;
        width: 100%;
    }

    .report-trend-panel {
        min-width: 0;
        padding: 18px 20px 16px;
        background:
            radial-gradient(circle at 92% 8%, var(--pcolor2), transparent 30%),
            var(--admin-surface, var(--bgColor1));
    }

    .report-trend-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;

        h2 {
            margin: 3px 0 4px;
            color: var(--gray);
            font-size: 18px;
            line-height: 1.25;
        }

        p {
            margin: 0;
            color: var(--gray6);
            font-size: 11px;
        }
    }

    .report-trend-kicker {
        color: var(--pcolor);
        font-size: 9px;
        font-weight: 750;
        letter-spacing: 0.16em;
    }

    .report-trend-summary {
        display: flex;
        gap: 20px;
        flex: none;

        span {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 2px;
        }

        strong {
            color: var(--gray);
            font-size: 18px;
            font-variant-numeric: tabular-nums;
            line-height: 1.2;
        }

        small {
            color: var(--gray6);
            font-size: 10px;
        }
    }

    .report-trend-scroll {
        overflow-x: auto;
        padding: 10px 2px 2px;
        scrollbar-width: thin;
    }

    .report-trend-chart {
        display: grid;
        grid-template-columns: repeat(14, minmax(22px, 1fr));
        gap: 5px;
        min-width: 520px;
        height: 148px;
        align-items: end;
    }

    .report-trend-day {
        display: flex;
        min-width: 0;
        height: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
    }

    .report-trend-total {
        height: 14px;
        color: var(--gray6);
        font-size: 9px;
        font-variant-numeric: tabular-nums;
        line-height: 14px;
    }

    .report-trend-track {
        display: flex;
        width: 100%;
        max-width: 20px;
        height: 98px;
        flex-direction: column-reverse;
        gap: 1px;
        overflow: hidden;
        border-radius: 5px 5px 2px 2px;
        background: color-mix(in srgb, var(--bgColor3) 62%, transparent);
    }

    .report-trend-segment {
        display: block;
        width: 100%;
        min-height: 0;
        transition: height 220ms ease;
    }

    .report-trend-date {
        color: var(--gray6);
        font-size: 9px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .report-trend-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        padding-top: 9px;
        color: var(--gray6);
        font-size: 10px;

        span {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        i {
            width: 7px;
            height: 7px;
            border-radius: 2px;
        }
    }

    .tone-pending {
        background: @ecolor;
    }

    .tone-resolved {
        background: @scolor;
    }

    .tone-dismissed {
        background: var(--gray5);
    }

    .report-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        width: 100%;
    }

    .report-stat {
        display: flex;
        min-height: 90px;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        padding: 13px 15px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius-sm, 12px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm);
        text-align: left;
        cursor: pointer;
        transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;

        &:hover {
            transform: translateY(-2px);
            border-color: var(--pcolor3);
        }

        &.is-active {
            border-color: var(--pcolor);
            background: color-mix(in srgb, var(--pcolor) 7%, var(--admin-surface, var(--bgColor1)));
        }
    }

    .report-stat-label {
        color: var(--gray6);
        font-size: 12px;
    }

    .report-stat-count {
        color: var(--gray);
        font-size: 25px;
        font-weight: 750;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
    }

    .report-stat-hint {
        color: var(--gray6);
        font-size: 10px;
    }

    .tone-danger .report-stat-count {
        color: @ecolor;
    }

    .tone-success .report-stat-count {
        color: @scolor;
    }

    .tone-primary .report-stat-count {
        color: var(--pcolor);
    }

    .report-filter-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px 16px;
    }

    .report-filter-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding-bottom: 10px;
        border-bottom: 1px dashed var(--admin-line, var(--gray1));

        &:last-child {
            padding-bottom: 0;
            border-bottom: 0;
        }
    }

    .report-filter-row--last {
        padding-top: 0;
    }

    .report-filter-label {
        width: 38px;
        flex: none;
        color: var(--gray6);
        font-size: 11px;
        font-weight: 600;
    }

    .report-filter-spacer {
        flex: 1;
    }

    .report-date-presets,
    .report-reasons {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
    }

    .report-chip,
    .report-reason-filter {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 999px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray8);
        font-size: 11px;
        cursor: pointer;
        transition: border-color 160ms ease, color 160ms ease, background 160ms ease;

        &:hover {
            border-color: var(--pcolor3);
            color: var(--pcolor);
        }

        &.is-active {
            border-color: var(--pcolor);
            background: var(--pcolor1);
            color: var(--pcolor);
            font-weight: 650;
        }
    }

    .report-chip--apply {
        border-color: var(--pcolor3);
        color: var(--pcolor);
    }

    .report-reason-filter em {
        padding: 0 5px;
        border-radius: 999px;
        background: var(--bgColor3);
        color: var(--gray6);
        font-style: normal;
        font-size: 10px;
        font-variant-numeric: tabular-nums;
    }

    .report-reason-filter.is-active em {
        background: var(--pcolor2);
        color: var(--pcolor);
    }

    .report-date-editor {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        color: var(--gray6);
        font-size: 11px;

        input {
            height: 28px;
            box-sizing: border-box;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 8px;
            padding: 0 8px;
            background: var(--admin-surface, var(--bgColor1));
            color: var(--gray8);
            font: inherit;
            outline: none;

            &:focus {
                border-color: var(--pcolor);
            }
        }
    }

    .report-search {
        width: 230px;
    }

    .report-batch-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px 18px;
        padding: 11px 14px;
        border-color: var(--pcolor3);
        background:
            linear-gradient(90deg, var(--pcolor1), transparent 55%),
            var(--admin-surface, var(--bgColor1));
    }

    .report-batch-select,
    .report-batch-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
    }

    .report-batch-select > span {
        color: var(--pcolor);
        font-size: 11px;
        font-weight: 650;
    }

    .report-batch-note {
        width: 260px;
        height: 30px;
        box-sizing: border-box;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 9px;
        padding: 0 10px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray8);
        font-size: 11px;
        outline: none;

        &:focus {
            border-color: var(--pcolor);
        }
    }

    .report-batch-clear {
        border: 0;
        background: transparent;
        color: var(--gray6);
        font-size: 11px;
        cursor: pointer;

        &:hover {
            color: @ecolor;
        }
    }

    .report-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        transition: opacity 160ms ease;

        &.is-refreshing {
            opacity: 0.58;
        }
    }

    .report-action-error {
        display: flex;
        width: 100%;
        box-sizing: border-box;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px;
        border: 1px solid color-mix(in srgb, @ecolor 35%, transparent);
        border-radius: var(--admin-radius-sm, 12px);
        background: color-mix(in srgb, @ecolor 8%, transparent);
        color: @ecolor;
        font-size: 12px;

        button {
            flex: none;
            padding: 0 4px;
            border: 0;
            background: transparent;
            color: inherit;
            font-size: 16px;
            line-height: 1;
            cursor: pointer;
        }
    }

    .report-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 18px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-left: 3px solid var(--pcolor);
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm);
        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;

        &:hover {
            box-shadow: var(--admin-shadow-md);
        }

        &.status-0 {
            border-left-color: @ecolor;
        }

        &.status-1 {
            border-left-color: @scolor;
        }

        &.status-2 {
            border-left-color: var(--gray5);
            opacity: 0.86;
        }

        &.is-selected {
            border-color: var(--pcolor);
            background: color-mix(in srgb, var(--pcolor) 4%, var(--admin-surface, var(--bgColor1)));
        }
    }

    .report-card-head {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .report-card-check {
        margin-right: 2px;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
    }

    .report-reason-tag,
    .report-status-tag,
    .report-source-tag {
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
    }

    .report-reason-tag {
        color: @wcolor;
        background: rgba(255, 170, 26, 0.13);
    }

    .report-source-tag {
        color: var(--gray6);
        background: var(--bgColor3);
        font-weight: 500;
    }

    .report-status-tag {
        color: @ecolor;
        background: rgba(250, 82, 71, 0.1);
    }

    .status-1 .report-status-tag {
        color: @scolor;
        background: rgba(31, 180, 162, 0.12);
    }

    .status-2 .report-status-tag {
        color: var(--gray6);
        background: var(--bgColor3);
    }

    .report-head-spacer {
        flex: 1;
    }

    .report-time {
        color: var(--gray6);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }

    .report-quote {
        position: relative;
        margin: 0;
        padding: 10px 14px 10px 30px;
        border-radius: var(--admin-radius-sm, 12px);
        background: color-mix(in srgb, var(--bgColor2) 70%, transparent);
        color: var(--gray8);
        font-size: 14px;
        line-height: 1.65;
        word-break: break-word;

        p {
            margin: 0;
            white-space: pre-wrap;
        }
    }

    .report-quote-mark {
        position: absolute;
        top: 2px;
        left: 10px;
        color: var(--pcolor3);
        font-size: 30px;
        font-family: Georgia, serif;
        line-height: 1;
    }

    .report-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
    }

    .report-meta-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        font-size: 12px;
    }

    .report-meta-label {
        color: var(--gray6);
    }

    .report-meta-value {
        overflow: hidden;
        max-width: 360px;
        color: var(--gray8);
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .report-detail,
    .report-handle-note {
        margin: 0;
        padding: 8px 12px;
        border-radius: var(--admin-radius-sm, 12px);
        color: var(--gray8);
        font-size: 12px;
        line-height: 1.6;
        word-break: break-word;

        span {
            margin-right: 8px;
            font-weight: 700;
        }
    }

    .report-detail {
        background: var(--pcolor1);

        span {
            color: var(--pcolor);
        }
    }

    .report-handle-note {
        border: 1px dashed color-mix(in srgb, @scolor 30%, var(--admin-line, var(--gray1)));
        background: color-mix(in srgb, @scolor 6%, transparent);

        span {
            color: @scolor;
        }
    }

    .report-card-foot {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        padding-top: 10px;
        border-top: 1px dashed var(--admin-line, var(--gray1));
    }

    .report-handled {
        color: var(--gray6);
        font-size: 12px;
    }

    .report-handled--pending {
        color: @ecolor;
    }

    .report-card-actions {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .report-pagination {
        display: flex;
        justify-content: flex-end;
        width: 100%;
        padding-top: 4px;
    }

    .report-note-form,
    .report-delete {
        display: flex;
        flex-direction: column;
        gap: 13px;

        p {
            margin: 0;
            color: var(--gray8);
            font-size: 13px;
            line-height: 1.7;
        }

        blockquote {
            margin: 0;
            max-height: 150px;
            overflow-y: auto;
            padding: 10px 12px;
            border-radius: @radius-s;
            background: var(--bgColor2);
            color: var(--gray8);
            font-size: 13px;
            line-height: 1.6;
            word-break: break-word;
        }
    }

    .report-note-status {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        padding: 4px;
        border-radius: 11px;
        background: var(--bgColor2);

        button {
            height: 34px;
            border: 1px solid transparent;
            border-radius: 8px;
            background: transparent;
            color: var(--gray6);
            font-size: 12px;
            cursor: pointer;

            &.is-active {
                border-color: var(--pcolor3);
                background: var(--admin-surface, var(--bgColor1));
                color: var(--pcolor);
                font-weight: 650;
                box-shadow: var(--admin-shadow-sm);
            }
        }
    }

    .report-note-label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--gray8);
        font-size: 12px;

        textarea {
            width: 100%;
            box-sizing: border-box;
            resize: vertical;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 10px;
            padding: 9px 11px;
            background: var(--admin-surface, var(--bgColor1));
            color: var(--gray8);
            font: inherit;
            line-height: 1.6;
            outline: none;

            &:focus {
                border-color: var(--pcolor);
            }
        }
    }

    .report-note-counter {
        margin-top: -7px;
        color: var(--gray6);
        font-size: 10px;
        text-align: right;
    }

    .report-note-actions,
    .report-delete-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    @media (max-width: 1180px) {
        .report-insight-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 820px) {
        .report-trend-head {
            flex-direction: column;
        }

        .report-trend-summary {
            align-self: stretch;
            justify-content: space-between;
        }

        .report-filter-row--last {
            align-items: flex-start;
        }

        .report-filter-spacer {
            display: none;
        }

        .report-search {
            width: 100%;
        }

        .report-batch-bar,
        .report-batch-actions {
            align-items: stretch;
            flex-direction: column;
        }

        .report-batch-note {
            width: 100%;
        }

        .report-meta-value {
            max-width: 100%;
        }

        .report-card-foot {
            align-items: flex-start;
            flex-direction: column;
        }
    }

    @media (max-width: 560px) {
        .report-stats {
            grid-template-columns: 1fr;
        }

        .report-date-editor {
            width: 100%;
        }
    }
</style>
