<template>
    <yk-space dir="vertical" size="l" class="admin-page sched-page">
        <top-title name="定时发布" description="待发布队列 · 改期 · 立即发布 · 逾期告警" :is-search="false">
            <template #custom>
                <yk-space align="center" size="m">
                    <yk-text type="third">{{ lastLoadedText }}</yk-text>
                    <yk-button type="secondary" :disabled="loading" @click="loadQueue">
                        <IconRefreshOutline /> 刷新
                    </yk-button>
                </yk-space>
            </template>
        </top-title>

        <section class="sched-stats" aria-label="定时发布统计">
            <button v-for="card in statusCards" :key="card.label" type="button"
                :class="['sched-stat', `tone-${card.tone}`]" @click="switchType(card.classify)">
                <span class="sched-stat-label">{{ card.label }}</span>
                <strong class="sched-stat-count">{{ card.count }}</strong>
                <small class="sched-stat-hint">{{ card.hint }}</small>
            </button>
        </section>

        <div v-if="summary.overdue > 0" class="sched-alarm" role="alert">
            <IconWarningOutline />
            <div>
                <strong>{{ summary.overdue }} 条内容已到点但尚未发布</strong>
                <span>调度器可能在停机期间漏掉任务，请逐条检查后立即发布或重新安排。</span>
            </div>
        </div>

        <section class="sched-panel sched-filter-panel">
            <div class="sched-filter-row">
                <span class="sched-filter-label">类型</span>
                <yk-radio-group v-model="classifyFilter" type="button" :solid="true" @change="reload">
                    <yk-radio value="">全部内容</yk-radio>
                    <yk-radio value="article">博客文章</yk-radio>
                    <yk-radio value="image">摄影图库</yk-radio>
                </yk-radio-group>
                <span class="sched-filter-spacer" />
                <yk-text type="third">调度器每 30 秒扫描一次，队列到点仍会显示在此处直至发布成功</yk-text>
            </div>
        </section>

        <div v-if="actionError" class="sched-error" role="alert">
            <span>{{ actionError }}</span>
            <button type="button" aria-label="关闭提示" @click="actionError = ''">×</button>
        </div>

        <div v-if="loading && !items.length" class="sched-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在读取待发布队列...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="sched-state is-error">
            <yk-empty :description="errorMessage" />
            <yk-button type="primary" @click="loadQueue">重新加载</yk-button>
        </div>

        <template v-else>
            <yk-empty v-if="!items.length" description="当前没有安排定时发布的内容" />

            <div v-else class="sched-list" :class="{ 'is-refreshing': loading }">
                <article v-for="item in items" :key="item.id"
                    :class="['sched-card', isOverdue(item.scheduledAt) ? 'status-overdue' : 'status-upcoming']">
                    <div class="sched-date" :aria-label="`计划发布时间 ${formatWorkflowTime(item.scheduledAt)}`">
                        <span class="sched-date-month">{{ dateParts(item.scheduledAt).month }}</span>
                        <strong class="sched-date-day">{{ dateParts(item.scheduledAt).day }}</strong>
                        <small class="sched-date-meta">
                            {{ dateParts(item.scheduledAt).weekday }} {{ dateParts(item.scheduledAt).time }}
                        </small>
                    </div>

                    <div class="sched-card-body">
                        <header class="sched-card-head">
                            <h2 class="sched-card-title">{{ item.title }}</h2>
                            <span class="sched-type-tag">{{ classifyLabel(item.classify) }}</span>
                            <span v-if="isOverdue(item.scheduledAt)" class="sched-state-tag is-overdue">逾期</span>
                            <span v-else class="sched-state-tag">待发布</span>
                            <span v-if="asBoolean(item.hasUnpublishedChanges)" class="sched-state-tag is-draft">
                                有未发布修改
                            </span>
                        </header>

                        <div class="sched-meta">
                            <span class="sched-meta-item">
                                <span class="sched-meta-label">计划</span>
                                <strong class="sched-meta-value">
                                    {{ formatWorkflowTime(item.scheduledAt) }}
                                </strong>
                            </span>
                            <span class="sched-meta-item">
                                <span class="sched-meta-label">状态</span>
                                <strong class="sched-meta-value">{{ distance(item.scheduledAt) }}</strong>
                            </span>
                            <span class="sched-meta-item">
                                <span class="sched-meta-label">作者</span>
                                <strong class="sched-meta-value">{{ item.ownerName || '未知作者' }}</strong>
                            </span>
                            <span v-if="asBoolean(item.hasUnpublishedChanges) && item.draftSavedAt"
                                class="sched-meta-item">
                                <span class="sched-meta-label">最近暂存</span>
                                <strong class="sched-meta-value">{{ formatWorkflowTime(item.draftSavedAt) }}</strong>
                            </span>
                        </div>
                    </div>

                    <footer class="sched-card-actions">
                        <yk-button size="s" type="secondary" :disabled="actingId === item.id"
                            @click="openReschedule(item)">
                            改期
                        </yk-button>
                        <yk-button size="s" type="primary" :disabled="actingId === item.id"
                            @click="askPublish(item)">
                            立即发布
                        </yk-button>
                        <yk-button size="s" type="secondary" status="danger" :disabled="actingId === item.id"
                            @click="askCancel(item)">
                            取消计划
                        </yk-button>
                        <yk-button size="s" type="outline" :disabled="actingId === item.id" @click="openEditor(item)">
                            打开编辑
                        </yk-button>
                    </footer>
                </article>

                <div class="sched-pagination">
                    <AdminPager v-model:page="page" v-model:page-size="pageSize" :total="total"
                        :page-size-options="[10, 20, 50]" :show-page-size="true" :show-total="true"
                        :disabled="loading" @change="handlePagerChange" />
                </div>
            </div>
        </template>

        <yk-modal :model-value="rescheduleTarget !== null" title="调整发布时间" size="s"
            :closeable="!acting" @update:model-value="closeReschedule">
            <div class="sched-dialog">
                <p class="sched-dialog-hint">
                    新时间至少需晚于当前 1 分钟。到点后会应用当前工作稿并自动发布。
                </p>
                <label class="sched-dialog-label">
                    <span>发布时间</span>
                    <input v-model="rescheduleValue" type="datetime-local" class="sched-dialog-input" />
                </label>
                <div class="sched-dialog-actions">
                    <yk-button size="s" :disabled="acting" @click="closeReschedule()">取消</yk-button>
                    <yk-button size="s" type="primary" :loading="acting" @click="confirmReschedule">
                        保存改期
                    </yk-button>
                </div>
            </div>
        </yk-modal>

        <yk-modal :model-value="confirmTarget !== null" :title="confirmTitle" size="s"
            :closeable="!acting" @update:model-value="closeConfirm">
            <div class="sched-dialog">
                <p class="sched-dialog-copy">{{ confirmCopy }}</p>
                <blockquote v-if="confirmTarget">{{ confirmTarget.title }}</blockquote>
                <div class="sched-dialog-actions">
                    <yk-button size="s" :disabled="acting" @click="closeConfirm()">返回</yk-button>
                    <yk-button v-if="confirmAction === 'cancel'" size="s" type="primary" status="danger"
                        :loading="acting" @click="runConfirm">
                        确认取消计划
                    </yk-button>
                    <yk-button v-else size="s" type="primary" :loading="acting" @click="runConfirm">
                        确认立即发布
                    </yk-button>
                </div>
            </div>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IconRefreshOutline, IconWarningOutline } from '@yike-design/ui/es/components/svg-icon'
import TopTitle from '../components/bar/TopTitle.vue'
import AdminPager from '../components/common/AdminPager.vue'
import {
    cancelArticleSchedule,
    getArticleErrorMessage,
    getScheduledArticles,
    publishArticleWorkflow,
    scheduleArticlePublish,
    type ArticleClassify,
    type ScheduledArticleItem,
    type ScheduledArticleSummary,
} from '../api/article'
import {
    defaultScheduleValue,
    formatWorkflowTime,
    isoToLocalDateTime,
    localDateTimeToIso,
} from '../utils/articleWorkflow'
import {
    isScheduleOverdue,
    scheduleDateParts,
    scheduleDistanceLabel,
    scheduledClassifyLabel,
} from '../utils/scheduledPublish'

type ConfirmAction = 'publish' | 'cancel'

const REFRESH_INTERVAL_MS = 30_000

const router = useRouter()
const instance = getCurrentInstance()
const proxy = instance?.proxy as { $message?: (options: {
    type: 'primary' | 'success' | 'warning' | 'error'
    message: string
}) => void } | null

const items = ref<ScheduledArticleItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const summary = ref<ScheduledArticleSummary>({ total: 0, upcoming: 0, overdue: 0 })
const classifyFilter = ref<'' | ArticleClassify>('')
const loading = ref(false)
const acting = ref(false)
const actingId = ref(0)
const errorMessage = ref('')
const actionError = ref('')
const lastLoadedAt = ref<number | null>(null)

const rescheduleTarget = ref<ScheduledArticleItem | null>(null)
const rescheduleValue = ref(defaultScheduleValue())

const confirmTarget = ref<ScheduledArticleItem | null>(null)
const confirmAction = ref<ConfirmAction>('publish')
let refreshTimer: number | undefined

const statusCards = computed(() => [
    { label: '待发布总数', count: summary.value.total, hint: '当前账号可管理的计划', tone: 'primary', classify: '' as '' | ArticleClassify },
    { label: '即将发布', count: summary.value.upcoming, hint: '尚未到点', tone: 'success', classify: '' as '' | ArticleClassify },
    { label: '已到点未发布', count: summary.value.overdue, hint: '需要立即处理', tone: 'danger', classify: '' as '' | ArticleClassify },
])

const lastLoadedText = computed(() => lastLoadedAt.value
    ? `队列更新于 ${formatWorkflowTime(new Date(lastLoadedAt.value).toISOString())}`
    : '正在准备队列')

const confirmTitle = computed(() => confirmAction.value === 'cancel' ? '取消定时发布' : '立即发布')
const confirmCopy = computed(() => confirmAction.value === 'cancel'
    ? '取消后内容保持当前状态，不再自动发布，稍后可重新安排。'
    : '立即发布会应用当前工作稿并置为已发布，原计划时间同步清除。')

const showMessage = (type: 'primary' | 'success' | 'warning' | 'error', message: string): void => {
    proxy?.$message?.({ type, message })
}

const describeError = (error: unknown, fallback: string): string => {
    const responseMessage = getArticleErrorMessage(error, '')
    if (responseMessage) return responseMessage
    return error instanceof Error && error.message ? error.message : fallback
}

const asBoolean = (value: unknown): boolean => value === true || Number(value) === 1
const isOverdue = (value: string): boolean => isScheduleOverdue(value)
const dateParts = scheduleDateParts
const classifyLabel = scheduledClassifyLabel
const distance = (value: string): string => scheduleDistanceLabel(value)

const loadQueue = async (silent = false): Promise<void> => {
    if (!silent) loading.value = true
    if (!silent) errorMessage.value = ''

    try {
        const result = await getScheduledArticles({
            page: page.value,
            pageSize: pageSize.value,
            ...(classifyFilter.value ? { classify: classifyFilter.value } : {}),
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '定时发布队列加载失败')
        }
        items.value = result.data.list
        total.value = result.data.total
        summary.value = result.data.summary
        lastLoadedAt.value = Date.now()
        actionError.value = ''
    } catch (error) {
        if (!silent) {
            items.value = []
            total.value = 0
            errorMessage.value = describeError(error, '定时发布队列加载失败，请稍后重试')
        }
    } finally {
        loading.value = false
    }
}

const reload = (): void => {
    page.value = 1
    void loadQueue()
}

const switchType = (value: '' | ArticleClassify): void => {
    if (classifyFilter.value === value) return
    classifyFilter.value = value
    reload()
}

const handlePagerChange = (): void => {
    void loadQueue()
}

const openEditor = (item: ScheduledArticleItem): void => {
    void router.push(item.classify === 'image' ? `/editgallery/${item.id}` : `/editarticle/${item.id}`)
}

const openReschedule = (item: ScheduledArticleItem): void => {
    rescheduleTarget.value = item
    rescheduleValue.value = item.scheduledAt
        ? isoToLocalDateTime(item.scheduledAt) || defaultScheduleValue()
        : defaultScheduleValue()
}

const closeReschedule = (open?: boolean): void => {
    if (open === true || acting.value) return
    rescheduleTarget.value = null
}

const confirmReschedule = async (): Promise<void> => {
    const target = rescheduleTarget.value
    if (!target || acting.value) return

    const iso = localDateTimeToIso(rescheduleValue.value)
    if (!iso) {
        actionError.value = '请选择有效的发布时间'
        return
    }
    if (new Date(iso).getTime() < Date.now() + 60_000) {
        actionError.value = '发布时间至少需晚于当前时间 1 分钟'
        return
    }

    acting.value = true
    actingId.value = target.id
    actionError.value = ''
    try {
        const result = await scheduleArticlePublish(target.id, iso)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '改期失败')
        }
        rescheduleTarget.value = null
        showMessage('success', `已改期至 ${formatWorkflowTime(result.data.scheduledAt)}`)
        await loadQueue()
    } catch (error) {
        actionError.value = describeError(error, '调整发布时间失败，请稍后重试')
    } finally {
        acting.value = false
        actingId.value = 0
    }
}

const askPublish = (item: ScheduledArticleItem): void => {
    confirmAction.value = 'publish'
    confirmTarget.value = item
}

const askCancel = (item: ScheduledArticleItem): void => {
    confirmAction.value = 'cancel'
    confirmTarget.value = item
}

const closeConfirm = (open?: boolean): void => {
    if (open === true || acting.value) return
    confirmTarget.value = null
}

const runConfirm = async (): Promise<void> => {
    const target = confirmTarget.value
    if (!target || acting.value) return

    acting.value = true
    actingId.value = target.id
    actionError.value = ''
    try {
        const result = confirmAction.value === 'publish'
            ? await publishArticleWorkflow(target.id)
            : await cancelArticleSchedule(target.id)
        if (result.code !== 200) throw new Error(result.message || '操作失败')

        confirmTarget.value = null
        showMessage(
            'success',
            confirmAction.value === 'publish' ? `${target.title} 已立即发布` : `已取消「${target.title}」的定时发布`
        )
        await loadQueue()
    } catch (error) {
        actionError.value = describeError(
            error,
            confirmAction.value === 'publish' ? '立即发布失败，请稍后重试' : '取消定时发布失败，请稍后重试'
        )
    } finally {
        acting.value = false
        actingId.value = 0
    }
}

onMounted(() => {
    void loadQueue()
    refreshTimer = window.setInterval(() => {
        if (!document.hidden && !acting.value) void loadQueue(true)
    }, REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
    if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer)
        refreshTimer = undefined
    }
})
</script>

<style lang="less" scoped>
    .sched-page {
        width: 100%;
    }

    .sched-panel,
    .sched-card,
    .sched-stat {
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm);
    }

    .sched-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        width: 100%;
    }

    .sched-stat {
        display: flex;
        min-height: 96px;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        padding: 14px 16px;
        text-align: left;
        cursor: pointer;
        transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;

        &:hover {
            transform: translateY(-2px);
            border-color: var(--pcolor3);
        }
    }

    .sched-stat-label,
    .sched-stat-hint {
        color: var(--gray6);
        font-size: 11px;
    }

    .sched-stat-count {
        color: var(--gray);
        font-size: 28px;
        font-weight: 760;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
    }

    .tone-primary .sched-stat-count {
        color: var(--pcolor);
    }

    .tone-success .sched-stat-count {
        color: @scolor;
    }

    .tone-danger .sched-stat-count {
        color: @ecolor;
    }

    .sched-alarm {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid color-mix(in srgb, @ecolor 34%, transparent);
        border-radius: var(--admin-radius-sm, 12px);
        background: linear-gradient(90deg, color-mix(in srgb, @ecolor 12%, transparent), transparent 72%);
        color: var(--gray8);

        div {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 3px;
        }

        strong {
            color: @ecolor;
            font-size: 14px;
        }

        span {
            color: var(--gray6);
            font-size: 12px;
        }
    }

    .sched-filter-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px 16px;
    }

    .sched-filter-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .sched-filter-label {
        color: var(--gray6);
        font-size: 11px;
        font-weight: 650;
    }

    .sched-filter-spacer {
        flex: 1;
    }

    .sched-error,
    .sched-state {
        display: flex;
        width: 100%;
        box-sizing: border-box;
        align-items: center;
        gap: 12px;
    }

    .sched-error {
        justify-content: space-between;
        padding: 10px 14px;
        border: 1px solid color-mix(in srgb, @ecolor 35%, transparent);
        border-radius: var(--admin-radius-sm, 12px);
        background: color-mix(in srgb, @ecolor 8%, transparent);
        color: @ecolor;
        font-size: 12px;

        button {
            flex: none;
            border: 0;
            background: transparent;
            color: inherit;
            font-size: 17px;
            line-height: 1;
            cursor: pointer;
        }
    }

    .sched-state {
        min-height: 190px;
        flex-direction: column;
        justify-content: center;
        border: 1px dashed var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface-soft, var(--bgColor1));
    }

    .sched-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        transition: opacity 160ms ease;

        &.is-refreshing {
            opacity: 0.58;
        }
    }

    .sched-card {
        display: grid;
        grid-template-columns: 88px minmax(0, 1fr) auto;
        gap: 16px;
        align-items: center;
        padding: 15px 17px;
        border-left: 3px solid @scolor;
        transition: border-color 160ms ease, box-shadow 160ms ease;

        &:hover {
            box-shadow: var(--admin-shadow-md);
        }

        &.status-overdue {
            border-left-color: @ecolor;
            background: linear-gradient(90deg, color-mix(in srgb, @ecolor 5%, var(--admin-surface, var(--bgColor1))), var(--admin-surface, var(--bgColor1)) 42%);
        }
    }

    .sched-date {
        display: flex;
        min-height: 78px;
        box-sizing: border-box;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 14px;
        background: color-mix(in srgb, var(--bgColor2) 72%, transparent);
    }

    .sched-date-month,
    .sched-date-meta {
        color: var(--gray6);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
    }

    .sched-date-day {
        color: var(--gray);
        font-size: 28px;
        font-weight: 760;
        line-height: 1;
        font-variant-numeric: tabular-nums;
    }

    .sched-card-body {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
    }

    .sched-card-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    .sched-card-title {
        overflow: hidden;
        max-width: min(520px, 100%);
        margin: 0;
        color: var(--gray);
        font-size: 16px;
        font-weight: 720;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .sched-type-tag,
    .sched-state-tag {
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 650;
        white-space: nowrap;
    }

    .sched-type-tag {
        color: var(--gray6);
        background: var(--bgColor3);
    }

    .sched-state-tag {
        color: @scolor;
        background: color-mix(in srgb, @scolor 12%, transparent);
    }

    .sched-state-tag.is-overdue {
        color: @ecolor;
        background: color-mix(in srgb, @ecolor 12%, transparent);
    }

    .sched-state-tag.is-draft {
        color: @wcolor;
        background: rgba(255, 170, 26, 0.14);
    }

    .sched-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 7px 18px;
    }

    .sched-meta-item {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 6px;
        font-size: 12px;
    }

    .sched-meta-label {
        color: var(--gray6);
    }

    .sched-meta-value {
        overflow: hidden;
        max-width: 260px;
        color: var(--gray8);
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .sched-card-actions {
        display: flex;
        flex-wrap: wrap;
        align-content: center;
        justify-content: flex-end;
        gap: 8px;
    }

    .sched-pagination {
        display: flex;
        justify-content: flex-end;
        width: 100%;
        padding-top: 4px;
    }

    .sched-dialog {
        display: flex;
        flex-direction: column;
        gap: 13px;

        p,
        blockquote {
            margin: 0;
            color: var(--gray8);
            font-size: 13px;
            line-height: 1.65;
        }

        blockquote {
            padding: 10px 12px;
            border-radius: @radius-s;
            background: var(--bgColor2);
            word-break: break-word;
        }
    }

    .sched-dialog-hint {
        color: var(--gray6) !important;
        font-size: 12px !important;
    }

    .sched-dialog-label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--gray8);
        font-size: 12px;
    }

    .sched-dialog-input {
        width: 100%;
        height: 34px;
        box-sizing: border-box;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 10px;
        padding: 0 10px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray8);
        font: inherit;
        outline: none;

        &:focus {
            border-color: var(--pcolor);
        }
    }

    .sched-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    @media (max-width: 1050px) {
        .sched-card {
            grid-template-columns: 78px minmax(0, 1fr);
        }

        .sched-card-actions {
            grid-column: 2;
            justify-content: flex-start;
        }
    }

    @media (max-width: 760px) {
        .sched-stats {
            grid-template-columns: 1fr;
        }

        .sched-filter-spacer {
            display: none;
        }

        .sched-card {
            grid-template-columns: 1fr;
        }

        .sched-date {
            min-height: 58px;
            flex-direction: row;
            gap: 8px;
        }

        .sched-card-actions,
        .sched-error {
            align-items: stretch;
            flex-direction: column;
        }
    }
</style>
