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

                <div v-for="item in logs" :key="item.id" class="system-log-row">
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
                        {{ item.detail || '（无详情）' }}
                    </span>
                    <span class="log-col log-col-target">
                        {{ item.targetType ? `${item.targetType} #${item.targetId ?? '-'}` : '-' }}
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
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { useRoute } from 'vue-router'
    import TopTitle from '../components/bar/TopTitle.vue'
    import AdminPager from '../components/common/AdminPager.vue'
    import {
        getSystemLogs,
        exportSystemLogs,
        getRequestErrorMessage,
        type SystemLogItem,
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

    const formatTime = (value: string): string =>
        String(value || '').replace('T', ' ').slice(0, 19)

    const fetchLogs = async (): Promise<void> => {
        loading.value = true
        errorMessage.value = ''

        try {
            const result = await getSystemLogs({
                page: page.value,
                pageSize: pageSize.value,
                keyword: keyword.value.trim() || undefined,
                module: moduleFilter.value || undefined,
                action: actionFilter.value || undefined,
                ...(isCompleteReportRange(startDate.value, endDate.value)
                    ? { startDate: startDate.value, endDate: endDate.value }
                    : {}),
                sortOrder: sortOrder.value,
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

    const reload = (): void => {
        page.value = 1
        void fetchLogs()
    }

    const handleSearch = (value: unknown): void => {
        keyword.value = String(value ?? '').trim()
        reload()
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
            const blob = await exportSystemLogs({
                keyword: keyword.value.trim() || undefined,
                module: moduleFilter.value || undefined,
                action: actionFilter.value || undefined,
                ...(isCompleteReportRange(startDate.value, endDate.value)
                    ? { startDate: startDate.value, endDate: endDate.value }
                    : {}),
                sortOrder: sortOrder.value,
            })
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
    })
</script>

<style lang="less" scoped>
    .system-log {
        width: 100%;

        &-filters {
            width: 100%;
            flex-wrap: wrap;
            row-gap: 8px;
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
