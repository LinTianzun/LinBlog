<template>
    <yk-space dir="vertical" size="l" class="admin-page report-page">
        <top-title name="举报处理" description="审核评论举报 · 违规评论可直接删除" :is-search="false">
            <template #custom>
                <yk-space align="center" size="m">
                    <yk-text type="third">待处理 {{ summary.pending }} 条</yk-text>
                    <yk-button type="secondary" :disabled="loading" @click="reload">
                        <IconRefreshOutline /> 刷新
                    </yk-button>
                </yk-space>
            </template>
        </top-title>

        <!-- 状态概览：点击卡片切换待处理/已处理/已忽略 -->
        <div class="report-stats">
            <button v-for="card in statusCards" :key="card.value" type="button" class="report-stat"
                :class="[`tone-${card.tone}`, { 'is-active': statusFilter === card.value }]"
                @click="switchStatus(card.value)">
                <span class="report-stat-label">{{ card.label }}</span>
                <strong class="report-stat-count">{{ card.count }}</strong>
                <small class="report-stat-hint">{{ card.hint }}</small>
            </button>
        </div>

        <div class="report-toolbar">
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

            <yk-space align="center" size="s" class="report-toolbar-right">
                <yk-radio-group v-model="targetFilter" type="button" :solid="true" @change="reload">
                    <yk-radio value="">全部来源</yk-radio>
                    <yk-radio value="article">博客文章</yk-radio>
                    <yk-radio value="gallery">摄影图库</yk-radio>
                    <yk-radio value="diary">随笔随记</yk-radio>
                </yk-radio-group>
                <yk-input v-model="keyword" class="report-search" placeholder="搜索评论、来源或用户"
                    :limit="40" clearable @submit="reload" />
                <yk-button type="primary" :disabled="loading" @click="reload">搜索</yk-button>
            </yk-space>
        </div>

        <yk-text v-if="loading && reports.length === 0" type="secondary">正在加载举报…</yk-text>
        <yk-text v-else-if="errorMessage" type="danger">{{ errorMessage }}</yk-text>
        <yk-empty v-else-if="reports.length === 0" description="当前筛选下暂无举报" />

        <template v-else>
            <div v-if="actionError" class="report-action-error" role="alert">
                <span>{{ actionError }}</span>
                <button type="button" aria-label="关闭提示" @click="actionError = ''">×</button>
            </div>

            <div class="report-list">
                <article v-for="item in reports" :key="item.id" class="report-card"
                    :class="[`status-${item.status}`, `reason-${item.reason}`]">
                    <header class="report-card-head">
                        <span class="report-reason-tag">{{ reasonLabel(item.reason) }}</span>
                        <span class="report-status-tag">{{ statusLabel(item.status) }}</span>
                        <span class="report-source-tag">
                            {{ sourceKindLabel(item) }}
                        </span>
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
                            <span class="report-meta-label">该评论累计被举报</span>
                            <span class="report-meta-value">{{ item.comment.complaint }} 次</span>
                        </span>
                    </div>

                    <p v-if="item.detail" class="report-detail">
                        <span>补充说明</span>{{ item.detail }}
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
                            <yk-button v-else size="s" type="secondary" :disabled="actingId === item.id"
                                @click="markReport(item, 1)">
                                标记为已处理
                            </yk-button>
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

        <!-- 删除评论二次确认：与后台其它删除入口保持同一套交互 -->
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
    type CommentReportSourceFilter,
    type CommentReportItem,
    type CommentReportStatus,
} from '../api/commentReport'
import { deleteInteractionComment, type CommentReportReason } from '../api/comment'
import { COMMENT_REPORT_REASONS, commentReportReasonLabel } from '../utils/commentReport'

type StatusFilter = CommentReportStatus | 'all'

const reports = ref<CommentReportItem[]>([])
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

const deleteTarget = ref<CommentReportItem | null>(null)
const deleting = ref(false)

const statusCards = computed(() => [
    { value: 0 as StatusFilter, label: '待处理', count: summary.value.pending, hint: '需要尽快审核', tone: 'danger' },
    { value: 1 as StatusFilter, label: '已处理', count: summary.value.resolved, hint: '违规已处置', tone: 'success' },
    { value: 2 as StatusFilter, label: '已忽略', count: summary.value.dismissed, hint: '不构成违规', tone: 'muted' },
    { value: 'all' as StatusFilter, label: '全部举报', count: summary.value.total, hint: '包含全部状态', tone: 'primary' },
])

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
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '举报加载失败')
        }
        reports.value = result.data.list
        total.value = result.data.total
        summary.value = result.data.summary
    } catch (error) {
        reports.value = []
        total.value = 0
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

const handlePagerChange = ({ page: nextPage, pageSize: nextPageSize }: {
    page: number
    pageSize: number
}): void => {
    page.value = nextPage
    pageSize.value = nextPageSize
    void fetchReports()
}

const markReport = async (item: CommentReportItem, status: 1 | 2): Promise<void> => {
    actingId.value = item.id
    try {
        const result = await updateCommentReportStatus(item.id, status)
        if (result.code !== 200) throw new Error(result.message || '操作失败')
        await fetchReports()
    } catch (error) {
        actionError.value = getRequestErrorMessage(error, '处理举报失败，请稍后重试')
    } finally {
        actingId.value = 0
    }
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

    .report-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: @space-m;
        width: 100%;
    }

    .report-stat {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 14px 16px;
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
        font-size: 26px;
        font-weight: 750;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
    }

    .report-stat-hint {
        color: var(--gray6);
        font-size: 11px;
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

    .report-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        width: 100%;
    }

    .report-reasons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .report-reason-filter {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 999px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray8);
        font-size: 12px;
        cursor: pointer;
        transition: border-color 160ms ease, color 160ms ease, background 160ms ease;

        em {
            padding: 0 6px;
            border-radius: 999px;
            background: var(--bgColor3);
            color: var(--gray6);
            font-style: normal;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
        }

        &:hover {
            border-color: var(--pcolor3);
            color: var(--pcolor);
        }

        &.is-active {
            border-color: var(--pcolor);
            background: var(--pcolor1);
            color: var(--pcolor);
            font-weight: 600;

            em {
                background: var(--pcolor2);
                color: var(--pcolor);
            }
        }
    }

    .report-toolbar-right {
        flex-wrap: wrap;
    }

    .report-search {
        width: 220px;
    }

    .report-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
    }

    .report-action-error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px;
        border: 1px solid color-mix(in srgb, @ecolor 35%, transparent);
        border-radius: var(--admin-radius-sm, 12px);
        background: color-mix(in srgb, @ecolor 8%, transparent);
        color: @ecolor;
        font-size: 12px;
        width: 100%;
        box-sizing: border-box;

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
        transition: border-color 160ms ease, box-shadow 160ms ease;

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
    }

    .report-card-head {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
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

    .report-detail {
        margin: 0;
        padding: 8px 12px;
        border-radius: var(--admin-radius-sm, 12px);
        background: var(--pcolor1);
        color: var(--gray8);
        font-size: 12px;
        line-height: 1.6;
        word-break: break-word;

        span {
            margin-right: 8px;
            color: var(--pcolor);
            font-weight: 700;
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
        padding-top: @space-m;
    }

    .report-delete {
        display: flex;
        flex-direction: column;
        gap: 14px;

        p {
            margin: 0;
            color: var(--gray8);
            font-size: 13px;
            line-height: 1.7;
        }

        blockquote {
            margin: 0;
            max-height: 180px;
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

    .report-delete-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    @media (max-width: 1100px) {
        .report-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 820px) {
        .report-stats {
            grid-template-columns: 1fr;
        }

        .report-toolbar {
            flex-direction: column;
            align-items: stretch;
        }

        .report-toolbar-right {
            justify-content: flex-start;
        }

        .report-search {
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
</style>
