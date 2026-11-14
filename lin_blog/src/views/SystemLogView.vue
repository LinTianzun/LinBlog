<template>
    <yk-space dir="vertical" size="l" class="admin-page system-log">
        <top-title name="系统日志" description="追踪关键操作与系统活动" :is-search="true" @search="handleSearch">
            <template #custom>
                <yk-button type="secondary" :disabled="loading" @click="exportLogs">
                    导出当前筛选
                </yk-button>
            </template>
        </top-title>

        <yk-text v-if="loading" type="secondary">正在加载日志...</yk-text>
        <yk-text v-else-if="errorMessage" type="danger">{{ errorMessage }}</yk-text>

        <template v-else>
            <section class="system-log-risk" :class="{ 'is-clear': riskSummary && riskSummary.highRisk === 0 }">
                <div class="risk-copy">
                    <span class="risk-kicker">风险巡检</span>
                    <strong v-if="riskSummary">
                        {{ riskSummary.highRisk > 0
                            ? `近 ${riskSummary.days} 天有 ${riskSummary.highRisk} 条高风险操作`
                            : `近 ${riskSummary.days} 天没有高风险操作` }}
                    </strong>
                    <strong v-else>正在汇总高风险操作…</strong>
                    <span v-if="riskSummary?.recent?.length" class="risk-recent">
                        最近：{{ riskSummary.recent[0].username }} {{ moduleLabel(riskSummary.recent[0].module) }} ·
                        {{ formatTime(riskSummary.recent[0].createdAt) }}
                    </span>
                </div>
                <div class="risk-actions">
                    <button type="button" class="risk-chip" :class="{ 'is-active': riskFilter === 'high' }"
                        @click="toggleRiskFilter">
                        全部高风险 <b>{{ riskSummary?.highRisk ?? 0 }}</b>
                    </button>
                    <button type="button" class="risk-chip"
                        :class="{ 'is-active': moduleFilter === 'permission' && !riskFilter }"
                        @click="focusModule('permission')">
                        权限变更 <b>{{ riskSummary?.permissionChanges ?? 0 }}</b>
                    </button>
                    <button type="button" class="risk-chip"
                        :class="{ 'is-active': moduleFilter === 'backup' && !riskFilter }"
                        @click="focusModule('backup')">
                        备份操作 <b>{{ riskSummary?.backupOps ?? 0 }}</b>
                    </button>
                    <button type="button" class="risk-chip"
                        :class="{ 'is-active': moduleFilter === 'pet' && !riskFilter }"
                        @click="focusModule('pet')">
                        宠物设置 <b>{{ riskSummary?.petChanges ?? 0 }}</b>
                    </button>
                </div>
            </section>

            <yk-space align="center" size="m" class="system-log-filters">
                <yk-radio-group v-model="moduleFilter" type="button" :solid="true" @change="reload">
                    <yk-radio value="">全部模块</yk-radio>
                    <yk-radio v-for="item in moduleOptions" :key="item.value" :value="item.value">{{ item.label }}</yk-radio>
                </yk-radio-group>
                <yk-radio-group v-model="actionFilter" type="button" :solid="true" @change="reload">
                    <yk-radio value="">全部动作</yk-radio>
                    <yk-radio v-for="item in actionOptions" :key="item.value" :value="item.value">{{ item.label }}</yk-radio>
                </yk-radio-group>
                <div class="date-filter">
                    <div class="date-filter-presets">
                        <button
                            v-for="option in dateRangeOptions"
                            :key="option.value"
                            type="button"
                            class="date-chip"
                            :class="{ 'is-active': datePreset === option.value }"
                            @click="applyDatePreset(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                    <input v-model="startDate" type="date" aria-label="日志开始日期" :max="endDate || undefined"
                        :disabled="loading" @change="applyDateRange" />
                    <span class="date-separator">至</span>
                    <input v-model="endDate" type="date" aria-label="日志结束日期" :min="startDate || undefined"
                        :disabled="loading" @change="applyDateRange" />
                    <button v-if="startDate || endDate" type="button" class="date-chip date-clear" @click="clearDateRange">
                        清除日期
                    </button>
                </div>
            </yk-space>

            <div class="system-log-advanced">
                <div class="advanced-head">
                    <button type="button" class="advanced-toggle" :class="{ 'is-active': advancedOpen }"
                        :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">
                        高级筛选
                        <span v-if="advancedFilterCount > 0" class="advanced-count">{{ advancedFilterCount }}</span>
                        <span class="advanced-arrow" aria-hidden="true">{{ advancedOpen ? '收起' : '展开' }}</span>
                    </button>
                    <span v-if="advancedFilterCount > 0 && !advancedOpen" class="advanced-hint">
                        已应用 {{ advancedFilterCount }} 项条件
                    </span>
                </div>
                <div v-if="advancedOpen" class="advanced-fields">
                    <label class="advanced-field">
                        <span>操作人</span>
                        <input v-model="operatorFilter" type="text" placeholder="输入用户名" autocomplete="off"
                            @change="applyAdvancedFilters" @keydown.enter="applyAdvancedFilters" />
                    </label>
                    <label class="advanced-field">
                        <span>IP</span>
                        <input v-model="ipFilter" type="text" placeholder="如 127.0.0" autocomplete="off"
                            @change="applyAdvancedFilters" @keydown.enter="applyAdvancedFilters" />
                    </label>
                    <label class="advanced-field">
                        <span>目标类型</span>
                        <input v-model="targetTypeFilter" type="text" placeholder="如 collection" autocomplete="off"
                            @change="applyAdvancedFilters" @keydown.enter="applyAdvancedFilters" />
                    </label>
                    <label class="advanced-field">
                        <span>目标 ID</span>
                        <input v-model="targetIdFilter" type="number" min="1" placeholder="如 12"
                            @change="applyAdvancedFilters" @keydown.enter="applyAdvancedFilters" />
                    </label>
                    <button v-if="advancedFilterCount > 0" type="button" class="date-chip date-clear"
                        @click="resetAdvancedFilters">
                        清除条件
                    </button>
                </div>
            </div>

            <yk-empty v-if="logs.length === 0" description="暂无日志" />

            <!-- 紧凑日志表：操作人/动作/模块/详情/来源分行对齐 -->
            <div v-else class="system-log-table">
                <div class="system-log-row system-log-head">
                    <span class="log-col log-col-user">操作人</span>
                    <span class="log-col log-col-action">动作</span>
                    <span class="log-col log-col-module">模块</span>
                    <span class="log-col log-col-detail">详情</span>
                    <span class="log-col log-col-target">目标 / IP</span>
                    <span class="log-col log-col-time">
                        <button type="button" class="log-sort" :class="{ 'is-active': sortOrder !== 'desc' }"
                            :aria-sort="sortOrder === 'asc' ? 'ascending' : 'descending'" @click="toggleSort">
                            <span>时间</span>
                            <span class="log-sort-icon" aria-hidden="true">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                        </button>
                    </span>
                </div>

                <div v-for="item in logs" :key="item.id" class="system-log-row"
                    :class="{ 'is-risk': isHighRisk(item) }" tabindex="0" role="button"
                    :aria-label="`查看日志详情：${item.detail || '无详情'}`"
                    @click="openDetail(item)" @keydown.enter.prevent="openDetail(item)"
                    @keydown.space.prevent="openDetail(item)">
                    <span class="log-col log-col-user">
                        <span class="log-avatar" aria-hidden="true">{{ item.username?.slice(0, 1) || '·' }}</span>
                        <span class="log-user-name">{{ item.username }}</span>
                    </span>
                    <span class="log-col log-col-action">
                        <span class="system-log-item-tag" :class="`is-${item.action}`">{{ actionLabel(item.action) }}</span>
                    </span>
                    <span class="log-col log-col-module">
                        <span class="system-log-item-module">{{ moduleLabel(item.module) }}</span>
                    </span>
                    <span class="log-col log-col-detail" :title="item.detail || ''">
                        <span v-if="isHighRisk(item)" class="log-risk-tag">高风险</span>
                        {{ item.detail || '（无详情）' }}
                    </span>
                    <span class="log-col log-col-target">
                        {{ targetLabel(item.targetType, item.targetId) }}
                        <span class="log-ip">{{ item.ip || '-' }}</span>
                    </span>
                    <span class="log-col log-col-time">{{ formatTime(item.createdAt) }}</span>
                </div>
            </div>

            <div class="system-log-pagination">
                <AdminPager v-model:page="page" v-model:page-size="pageSize" :total="total"
                    :page-size-options="[5, 10, 20, 50]" :show-page-size="true" :show-total="true"
                    :disabled="loading" @change="handlePagerChange" />
            </div>

            <yk-drawer :show="detailVisible" title="日志详情" placement="right" size="m" :scrollable="true"
                @close="closeDetail">
                <div v-if="selectedLog" class="log-detail">
                    <div class="log-detail-tags">
                        <span class="system-log-item-tag" :class="`is-${selectedLog.action}`">
                            {{ actionLabel(selectedLog.action) }}
                        </span>
                        <span class="system-log-item-module">{{ moduleLabel(selectedLog.module) }}</span>
                        <span v-if="isHighRisk(selectedLog)" class="log-risk-tag">高风险</span>
                    </div>
                    <dl class="log-detail-grid">
                        <div>
                            <dt>操作时间</dt>
                            <dd>{{ formatTime(selectedLog.createdAt) }}</dd>
                        </div>
                        <div>
                            <dt>操作人</dt>
                            <dd>{{ selectedLog.username }}</dd>
                        </div>
                        <div>
                            <dt>目标</dt>
                            <dd>{{ targetLabel(selectedLog.targetType, selectedLog.targetId) }}</dd>
                        </div>
                        <div>
                            <dt>来源 IP</dt>
                            <dd><code>{{ selectedLog.ip || '未记录' }}</code></dd>
                        </div>
                    </dl>
                    <section class="log-detail-block">
                        <h4>详情</h4>
                        <p>{{ selectedLog.detail || '（无详情）' }}</p>
                    </section>
                    <section class="log-detail-block">
                        <h4>审计标识</h4>
                        <p>
                            日志 #{{ selectedLog.id }} ·
                            用户 #{{ selectedLog.userId ?? '-' }} ·
                            {{ selectedLog.targetType || '无目标类型' }}
                        </p>
                    </section>
                </div>
            </yk-drawer>
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
    import { computed, ref, onMounted } from 'vue'
    import { useRoute } from 'vue-router'
    import TopTitle from '../components/bar/TopTitle.vue'
    import AdminPager from '../components/common/AdminPager.vue'
    import {
        getSystemLogs,
        getSystemLogRiskSummary,
        exportSystemLogs,
        getRequestErrorMessage,
        type SystemLogItem,
        type SystemLogRiskSummary,
        type SystemLogSortOrder,
    } from '../api/systemLog'
    import {
        REPORT_RANGE_OPTIONS,
        resolveReportRange,
        rangePresetFromDates,
        isCompleteReportRange,
        type ReportRangePreset,
    } from '../utils/commentReportWorkbench'

    const route = useRoute()

    const moduleOptions = [
        { value: 'user', label: '用户' },
        { value: 'article', label: '文章' },
        { value: 'collection', label: '内容系列' },
        { value: 'gallery', label: '图库' },
        { value: 'diary', label: '日记' },
        { value: 'file', label: '文件' },
        { value: 'comment', label: '评论' },
        { value: 'message', label: '消息' },
        { value: 'subset', label: '分类' },
        { value: 'label', label: '标签' },
        { value: 'permission', label: '权限' },
        { value: 'ai', label: 'AI' },
        { value: 'system', label: '系统' },
        { value: 'backup', label: '备份' },
        { value: 'pet', label: '宠物' },
    ]

    // 支持从权限管理页带 ?module=permission 直接落到权限审计
    const initialModule = typeof route.query.module === 'string' ? route.query.module : ''

    const logs = ref<SystemLogItem[]>([])
    const total = ref(0)
    const page = ref(1)
    // 默认一页 10 条，用户可按 5/10/20/50 调整
    const pageSize = ref(10)
    const loading = ref(false)
    const errorMessage = ref('')
    const keyword = ref('')
    const moduleFilter = ref(
        moduleOptions.some(item => item.value === initialModule) ? initialModule : ''
    )
    const actionFilter = ref('')
    //  默认最新在前；点击表头在升序/降序之间切换
    const sortOrder = ref<SystemLogSortOrder>('desc')
    const datePreset = ref<ReportRangePreset>(0)
    const startDate = ref('')
    const endDate = ref('')
    const riskSummary = ref<SystemLogRiskSummary | null>(null)
    const advancedOpen = ref(false)
    const operatorFilter = ref('')
    const ipFilter = ref('')
    const targetTypeFilter = ref('')
    const targetIdFilter = ref('')
    const riskFilter = ref<'' | 'high'>('')
    const detailVisible = ref(false)
    const selectedLog = ref<SystemLogItem | null>(null)

    const actionOptions = [
        { value: 'login', label: '登录' },
        { value: 'logout', label: '登出' },
        { value: 'create', label: '创建' },
        { value: 'update', label: '更新' },
        { value: 'delete', label: '删除' },
        { value: 'publish', label: '发布' },
        { value: 'revoke', label: '撤回' },
        { value: 'status', label: '状态' },
        { value: 'system', label: '系统' },
        { value: 'ai', label: 'AI' },
    ]

    const dateRangeOptions = REPORT_RANGE_OPTIONS

    const actionLabel = (value: string): string =>
        actionOptions.find(item => item.value === value)?.label || value

    const moduleLabel = (value: string): string =>
        moduleOptions.find(item => item.value === value)?.label || value

    const targetTypeLabels: Record<string, string> = {
        article: '内容',
        collection: '内容系列',
        gallery: '图库',
        diary: '随笔',
        comment: '评论',
        comment_report: '评论举报',
        diary_comment: '随笔评论',
        file: '文件',
        label: '标签',
        message: '消息',
        subset: '分类',
        user: '用户',
        permission: '权限矩阵',
        system_log: '系统日志',
        database: '数据库',
        site_setting: '站点设置',
        model: 'AI 模型',
        prompt: '提示词模板',
    }

    const targetLabel = (type: string | null, id: number | null): string => {
        if (!type) return '-'
        const label = targetTypeLabels[type] || type
        return id == null ? label : `${label} #${id}`
    }

    const formatTime = (value: string): string =>
        String(value || '').replace('T', ' ').slice(0, 19)

    const targetIdValue = computed(() => {
        const value = Number.parseInt(targetIdFilter.value, 10)
        return Number.isSafeInteger(value) && value > 0 ? value : null
    })

    const advancedFilterCount = computed(() =>
        [operatorFilter.value, ipFilter.value, targetTypeFilter.value, targetIdFilter.value]
            .filter(value => String(value).trim().length > 0)
            .length
    )

    const isHighRisk = (item: SystemLogItem): boolean =>
        ['permission', 'backup', 'pet'].includes(item.module) || item.action === 'delete'

    const buildFilterParams = () => ({
        keyword: keyword.value.trim() || undefined,
        module: moduleFilter.value || undefined,
        action: actionFilter.value || undefined,
        operator: operatorFilter.value.trim() || undefined,
        ip: ipFilter.value.trim() || undefined,
        targetType: targetTypeFilter.value.trim() || undefined,
        ...(targetIdValue.value ? { targetId: targetIdValue.value } : {}),
        ...(riskFilter.value === 'high' ? { risk: 'high' as const } : {}),
        ...(isCompleteReportRange(startDate.value, endDate.value)
            ? { startDate: startDate.value, endDate: endDate.value }
            : {}),
        sortOrder: sortOrder.value,
    })

    const fetchLogs = async (): Promise<void> => {
        loading.value = true
        errorMessage.value = ''

        try {
            const result = await getSystemLogs({
                page: page.value,
                pageSize: pageSize.value,
                ...buildFilterParams(),
            })

            if (result.code !== 200 || !result.data) {
                throw new Error(result.message || '日志加载失败')
            }

            logs.value = result.data.list
            total.value = result.data.total
        } catch (error) {
            logs.value = []
            total.value = 0
            errorMessage.value = getRequestErrorMessage(error, '日志加载失败，请稍后重试')
        } finally {
            loading.value = false
        }
    }

    const fetchRiskSummary = async (): Promise<void> => {
        try {
            const result = await getSystemLogRiskSummary(7)
            if (result.code === 200 && result.data) {
                riskSummary.value = result.data
            }
        } catch {
            // 高风险摘要失败不阻塞日志列表，保留上一次结果或空态
        }
    }

    const reload = (): void => {
        page.value = 1
        void fetchLogs()
    }

    const handleSearch = (value: unknown): void => {
        keyword.value = String(value ?? '').trim()
        reload()
    }

    const applyAdvancedFilters = (): void => {
        reload()
    }

    const resetAdvancedFilters = (): void => {
        operatorFilter.value = ''
        ipFilter.value = ''
        targetTypeFilter.value = ''
        targetIdFilter.value = ''
        reload()
    }

    const toggleRiskFilter = (): void => {
        if (riskFilter.value === 'high') {
            riskFilter.value = ''
        } else {
            riskFilter.value = 'high'
            moduleFilter.value = ''
            actionFilter.value = ''
        }
        reload()
    }

    const focusModule = (module: string): void => {
        riskFilter.value = ''
        actionFilter.value = ''
        moduleFilter.value = moduleFilter.value === module ? '' : module
        reload()
    }

    const openDetail = (item: SystemLogItem): void => {
        selectedLog.value = item
        detailVisible.value = true
    }

    const closeDetail = (): void => {
        detailVisible.value = false
    }

    // 页码和每页条数已由 v-model 同步；切换条数时组件会把页码重置为 1
    const handlePagerChange = ({ page: nextPage, pageSize: nextPageSize }: {
        page: number
        pageSize: number
    }): void => {
        page.value = nextPage
        pageSize.value = nextPageSize
        void fetchLogs()
    }

    const toggleSort = (): void => {
        const nextOrder: SystemLogSortOrder = sortOrder.value === 'desc' ? 'asc' : 'desc'
        sortOrder.value = nextOrder
        page.value = 1
        void fetchLogs()
    }

    const applyDatePreset = (value: ReportRangePreset): void => {
        datePreset.value = value
        const range = resolveReportRange(value)
        startDate.value = range.startDate
        endDate.value = range.endDate
        reload()
    }

    const applyDateRange = (): void => {
        if (!startDate.value && !endDate.value) {
            datePreset.value = 0
            reload()
            return
        }
        if (!isCompleteReportRange(startDate.value, endDate.value)) return
        if (startDate.value > endDate.value) {
            const nextStart = endDate.value
            endDate.value = startDate.value
            startDate.value = nextStart
        }
        datePreset.value = rangePresetFromDates(startDate.value, endDate.value)
        reload()
    }

    const clearDateRange = (): void => {
        startDate.value = ''
        endDate.value = ''
        datePreset.value = 0
        reload()
    }

    const exportLogs = async (): Promise<void> => {
        try {
            const blob = await exportSystemLogs(buildFilterParams())
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `system-log-${new Date().toISOString().slice(0, 10)}.csv`
            link.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '系统日志导出失败')
        }
    }

    onMounted(() => {
        void fetchLogs()
        void fetchRiskSummary()
    })
</script>

<style lang="less" scoped>
    .system-log {
        width: 100%;

        &-filters {
            width: 100%;
            flex-wrap: wrap;
            row-gap: 8px;

            :deep(.yk-radio-group) {
                flex: 1 1 100%;
                min-width: 0;
            }

            :deep(.yk-radio-group__container) {
                flex-wrap: wrap;
                row-gap: 6px;
            }

            :deep(.yk-radio__label) {
                white-space: nowrap;
            }
        }

        &-risk {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px 20px;
            flex-wrap: wrap;
            padding: 14px 18px;
            border: 1px solid rgba(255, 170, 26, 0.32);
            border-radius: var(--admin-radius, 18px);
            background:
                linear-gradient(120deg, rgba(255, 170, 26, 0.14), transparent 62%),
                var(--admin-surface, var(--bgColor1));

            &.is-clear {
                border-color: var(--admin-line, var(--gray1));
                background: var(--admin-surface, var(--bgColor1));
            }
        }

        .risk-copy {
            display: flex;
            align-items: center;
            gap: 8px 12px;
            flex-wrap: wrap;
            min-width: 0;

            strong {
                color: var(--gray8);
                font-size: 14px;
            }
        }

        .risk-kicker {
            padding: 2px 9px;
            border-radius: 999px;
            background: rgba(255, 170, 26, 0.16);
            color: @wcolor;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }

        .risk-recent {
            overflow: hidden;
            color: var(--gray6);
            font-size: 12px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .risk-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .risk-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin: 0;
            padding: 6px 11px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 999px;
            background: var(--admin-surface, var(--bgColor1));
            color: var(--gray7);
            font-size: 12px;
            cursor: pointer;
            transition: border-color 160ms ease, background 160ms ease, color 160ms ease;

            b {
                color: var(--gray8);
                font-variant-numeric: tabular-nums;
            }

            &:hover {
                border-color: rgba(255, 170, 26, 0.5);
                color: @wcolor;
            }

            &.is-active {
                border-color: transparent;
                background: rgba(255, 170, 26, 0.18);
                color: @wcolor;

                b {
                    color: @wcolor;
                }
            }
        }

        &-advanced {
            width: 100%;
            padding: 0 2px;
        }

        .advanced-head {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .advanced-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0;
            padding: 6px 12px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 999px;
            background: var(--admin-surface, var(--bgColor1));
            color: var(--gray7);
            font-size: 12px;
            cursor: pointer;
            transition: border-color 160ms ease, color 160ms ease, background 160ms ease;

            &:hover,
            &.is-active {
                border-color: var(--pcolor);
                color: var(--pcolor);
            }
        }

        .advanced-count {
            display: grid;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            place-items: center;
            border-radius: 999px;
            background: var(--pcolor);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
        }

        .advanced-hint {
            color: var(--gray6);
            font-size: 12px;
        }

        .advanced-arrow {
            color: var(--gray6);
            font-size: 11px;
        }

        .advanced-fields {
            display: flex;
            align-items: flex-end;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 10px;
            padding: 14px;
            border: 1px dashed var(--admin-line, var(--gray1));
            border-radius: @radius-s;
            background: var(--admin-surface-soft, var(--bgColor2));
        }

        .advanced-field {
            display: grid;
            gap: 5px;
            min-width: 150px;
            flex: 1 1 160px;

            span {
                color: var(--gray6);
                font-size: 11px;
            }

            input {
                width: 100%;
                height: 32px;
                padding: 0 10px;
                border: 1px solid var(--admin-line, var(--gray1));
                border-radius: @radius-s;
                background: var(--admin-surface, var(--bgColor1));
                color: var(--gray8);
                font-size: 12px;

                &:focus {
                    outline: none;
                    border-color: var(--pcolor);
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
                }
            }
        }

        .date-filter {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex: 1 1 360px;
            min-width: 300px;
            flex-wrap: wrap;
        }

        .date-filter-presets {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .date-chip {
            margin: 0;
            padding: 5px 12px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 999px;
            background: var(--admin-surface, var(--bgColor1));
            color: var(--gray7);
            font-size: 12px;
            line-height: 1.4;
            cursor: pointer;
            transition: border-color 160ms ease, background 160ms ease, color 160ms ease;

            &:hover {
                border-color: color-mix(in srgb, var(--pcolor) 34%, transparent);
                color: var(--pcolor);
            }

            &.is-active {
                border-color: transparent;
                background: var(--pcolor);
                color: #fff;
            }
        }

        .date-clear {
            color: @ecolor;
            background: rgba(250, 82, 71, 0.08);
        }

        .date-separator {
            flex: none;
            color: var(--gray6);
            font-size: 12px;
        }

        .date-filter input[type='date'] {
            height: 32px;
            padding: 0 10px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: @radius-s;
            background: var(--admin-surface, var(--bgColor1));
            color: var(--gray8);
            font-size: 12px;

            &:focus {
                outline: none;
                border-color: var(--pcolor);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
            }
        }

        &-list {
            width: 100%;
        }

        // 紧凑表格：单行一条日志，纵向占用约为原来的 1/3
        &-table {
            width: 100%;
            overflow: hidden;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: var(--admin-radius, 18px);
            background: var(--admin-surface, var(--bgColor1));
            box-shadow: var(--admin-shadow-sm, @shadow-s);
        }

        &-row {
            display: grid;
            grid-template-columns: minmax(120px, 1.1fr) 76px 72px minmax(0, 2.6fr) minmax(0, 1.3fr) 148px;
            gap: 12px;
            align-items: center;
            padding: 10px 18px;
            border-bottom: 1px solid var(--admin-line, var(--gray1));
            font-size: 13px;
            transition: background 160ms ease;

            &:last-child {
                border-bottom: 0;
            }

            &:not(.system-log-head) {
                cursor: pointer;
            }

            &:focus-visible {
                outline: 2px solid var(--pcolor);
                outline-offset: -2px;
            }

            &.is-risk:not(.system-log-head) {
                box-shadow: inset 3px 0 0 rgba(250, 82, 71, 0.55);
            }

            &:not(.system-log-head):hover {
                background: color-mix(in srgb, var(--pcolor1) 52%, transparent);
            }
        }

        &-head {
            color: var(--gray6);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.02em;
            background: var(--admin-surface-soft, var(--bgColor2));
        }

        .log-col {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--gray8);
        }

        .log-col-user {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .log-avatar {
            display: grid;
            width: 24px;
            height: 24px;
            flex: none;
            place-items: center;
            border-radius: 50%;
            background: var(--pcolor1);
            color: var(--pcolor);
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .log-user-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 600;
            color: var(--gray);
        }

        .log-col-target {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: nowrap;
        }

        .log-ip {
            flex: none;
            padding: 1px 7px;
            border-radius: 999px;
            background: var(--bgColor3);
            color: var(--gray6);
            font-size: 11px;
        }

        .log-risk-tag {
            display: inline-flex;
            align-items: center;
            margin-right: 6px;
            padding: 1px 7px;
            border-radius: 999px;
            background: rgba(250, 82, 71, 0.12);
            color: @ecolor;
            font-size: 11px;
            font-weight: 700;
            vertical-align: middle;
        }

        .log-col-time {
            color: var(--gray6);
            font-variant-numeric: tabular-nums;
            text-align: right;
        }

        .log-sort {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin: 0;
            padding: 2px 6px;
            border: 1px solid transparent;
            border-radius: @radius-s;
            background: transparent;
            color: inherit;
            font: inherit;
            cursor: pointer;
            transition: border-color 160ms ease, background 160ms ease, color 160ms ease;

            &:hover {
                border-color: var(--admin-line, var(--gray1));
                background: var(--admin-surface-soft, var(--bgColor2));
                color: var(--pcolor);
            }

            &.is-active {
                color: var(--pcolor);
            }
        }

        .log-sort-icon {
            font-size: 12px;
            line-height: 1;
        }

        .system-log-item-tag {
            font-size: @size-s;
            padding: 2px 10px;
            border-radius: @radius-r;
            color: @pcolor;
            background: rgba(43, 90, 237, 0.08);

            &.is-delete {
                color: @ecolor;
                background: rgba(250, 82, 71, 0.1);
            }

            &.is-publish {
                color: @scolor;
                background: rgba(31, 180, 162, 0.1);
            }

            &.is-revoke,
            &.is-status {
                color: @wcolor;
                background: rgba(255, 170, 26, 0.12);
            }

            &.is-login {
                color: @font-color-m;
                background: @bg-color-m;
            }

            &.is-ai {
                color: @pcolor;
                background: color-mix(in srgb, @pcolor 12%, transparent);
            }

            &.is-system {
                color: var(--gray7);
                background: var(--admin-surface-soft, var(--bgColor2));
            }
        }

        .system-log-item-module {
            font-size: @size-s;
            color: @font-color-s;
            padding: 2px 10px;
            border-radius: @radius-r;
            background: @bg-color-m;
        }

        .log-detail {
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .log-detail-tags {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .log-detail-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin: 0;

            > div {
                padding: 12px 14px;
                border: 1px solid var(--admin-line, var(--gray1));
                border-radius: @radius-s;
                background: var(--admin-surface-soft, var(--bgColor2));
            }

            dt {
                margin-bottom: 5px;
                color: var(--gray6);
                font-size: 11px;
            }

            dd {
                margin: 0;
                color: var(--gray8);
                font-size: 13px;
                word-break: break-all;
            }

            code {
                color: inherit;
                font-size: 12px;
            }
        }

        .log-detail-block {
            h4 {
                margin: 0 0 8px;
                color: var(--gray8);
                font-size: 13px;
            }

            p {
                margin: 0;
                padding: 12px 14px;
                border: 1px solid var(--admin-line, var(--gray1));
                border-radius: @radius-s;
                background: var(--admin-surface-soft, var(--bgColor2));
                color: var(--gray7);
                font-size: 13px;
                line-height: 1.7;
                white-space: pre-wrap;
                word-break: break-word;
            }
        }

        &-pagination {
            display: flex;
            justify-content: flex-end;
            padding-top: @space-m;
            width: 100%;
        }

        @media (max-width: 1100px) {
            &-row {
                grid-template-columns: minmax(0, 1.2fr) 76px 72px minmax(0, 2fr) 130px;
            }

            .log-col-target {
                display: none;
            }
        }

        @media (max-width: 820px) {
            &-risk {
                align-items: flex-start;
            }

            .risk-actions {
                width: 100%;
            }

            .advanced-field {
                flex-basis: 100%;
            }

            .log-detail-grid {
                grid-template-columns: 1fr;
            }

            &-head {
                display: none;
            }

            &-row {
                grid-template-columns: minmax(0, 1fr) 76px 72px;
                row-gap: 6px;
                padding: 12px 14px;
            }

            .log-col-detail {
                grid-column: 1 / -1;
                white-space: normal;
                color: var(--gray6);
            }

            .log-col-time {
                grid-column: 1 / -1;
                text-align: left;
            }
        }
    }
</style>
