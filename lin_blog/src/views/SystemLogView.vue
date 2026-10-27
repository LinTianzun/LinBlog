<template>
    <yk-space dir="vertical" size="l" class="admin-page system-log">
        <top-title name="系统日志" description="追踪关键操作与系统活动" :is-search="true" @search="handleSearch" />

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
            </yk-space>

            <yk-empty v-if="logs.length === 0" description="暂无日志" />

            <!-- 紧凑日志表：一页 10 条，操作人/动作/模块/详情/来源分行对齐 -->
            <div v-else class="system-log-table">
                <div class="system-log-row system-log-head">
                    <span class="log-col log-col-user">操作人</span>
                    <span class="log-col log-col-action">动作</span>
                    <span class="log-col log-col-module">模块</span>
                    <span class="log-col log-col-detail">详情</span>
                    <span class="log-col log-col-target">目标 / IP</span>
                    <span class="log-col log-col-time">时间</span>
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
                <yk-pagination @change="changePage" :current="page" :total="total" :page-size="pageSize" size="m" />
            </div>
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import TopTitle from '../components/bar/TopTitle.vue'
    import {
        getSystemLogs,
        getRequestErrorMessage,
        type SystemLogItem,
    } from '../api/systemLog'

    const logs = ref<SystemLogItem[]>([])
    const total = ref(0)
    const page = ref(1)
    // 单页 20 条日志过长：改为 10 条 + 紧凑表格，一屏内可读完
    const pageSize = 10
    const loading = ref(false)
    const errorMessage = ref('')
    const keyword = ref('')
    const moduleFilter = ref('')
    const actionFilter = ref('')

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
        { value: 'system', label: '系统' },
    ]

    const actionOptions = [
        { value: 'login', label: '登录' },
        { value: 'create', label: '创建' },
        { value: 'update', label: '更新' },
        { value: 'delete', label: '删除' },
        { value: 'publish', label: '发布' },
        { value: 'revoke', label: '撤回' },
        { value: 'status', label: '状态' },
    ]

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
                pageSize,
                keyword: keyword.value.trim() || undefined,
                module: moduleFilter.value || undefined,
                action: actionFilter.value || undefined,
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

    const changePage = (nextPage: number): void => {
        if (nextPage === page.value) return
        page.value = nextPage
        void fetchLogs()
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
