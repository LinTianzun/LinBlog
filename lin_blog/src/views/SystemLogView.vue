<template>
    <yk-space dir="vertical" size="l" class="system-log">
        <top-title name="系统日志" :is-search="true" @search="handleSearch" />

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

            <yk-space v-else dir="vertical" size="m" class="system-log-list">
                <div v-for="item in logs" :key="item.id" class="system-log-item">
                    <yk-space align="center" size="m" class="system-log-item-head">
                        <span class="system-log-item-name">{{ item.username }}</span>
                        <span class="system-log-item-tag" :class="`is-${item.action}`">{{ actionLabel(item.action) }}</span>
                        <span class="system-log-item-module">{{ moduleLabel(item.module) }}</span>
                        <yk-text type="third" class="system-log-item-time">{{ formatTime(item.createdAt) }}</yk-text>
                    </yk-space>
                    <p class="system-log-item-detail">{{ item.detail || '（无详情）' }}</p>
                    <yk-text type="third">
                        {{ item.targetType ? `目标：${item.targetType} #${item.targetId ?? '-'}　` : '' }}IP：{{ item.ip || '-' }}
                    </yk-text>
                </div>
            </yk-space>

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
    const pageSize = 20
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
        }

        &-list {
            width: 100%;
        }

        &-item {
            width: 100%;
            background: @bg-color-l;
            border-radius: @radius-m;
            padding: @space-l @space-xl;

            &-head {
                width: 100%;
            }

            &-name {
                font-weight: 600;
                color: @font-color-l;
            }

            &-tag {
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

            &-module {
                font-size: @size-s;
                color: @font-color-s;
                padding: 2px 10px;
                border-radius: @radius-r;
                background: @bg-color-m;
            }

            &-time {
                margin-left: auto;
            }

            &-detail {
                margin: @space-s 0;
                color: @font-color-m;
            }
        }

        &-pagination {
            display: flex;
            justify-content: flex-end;
            padding-top: @space-m;
            width: 100%;
        }
    }
</style>
