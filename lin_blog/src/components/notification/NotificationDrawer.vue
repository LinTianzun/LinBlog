<template>
    <yk-drawer placement="right" :show="active" title="通知" @close="closes">
        <div class="notification-toolbar" v-if="notifications.length > 0">
            <yk-text type="third">未读 {{ unreadCount }} 条</yk-text>
            <yk-button type="secondary" size="s" :loading="markingAll" :disabled="unreadCount === 0"
                @click="markAllRead">
                全部已读
            </yk-button>
        </div>

        <div v-if="loading" class="notification-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载通知...</yk-text>
        </div>

        <yk-empty v-else-if="notifications.length === 0" description="暂无通知" />

        <ul v-else class="notification-list">
            <li v-for="item in notifications" :key="item.id" class="notification-item"
                :class="{ 'is-unread': item.isRead === 0 }">
                <button type="button" class="notification-main" @click="markRead(item)">
                    <span class="notification-head">
                        <span class="notification-tag" :class="`is-${item.type}`">{{ typeLabel(item.type) }}</span>
                        <time class="notification-time">{{ formatMoment(item.createdAt) }}</time>
                        <span v-if="item.isRead === 0" class="notification-dot" aria-label="未读" />
                    </span>
                    <span class="notification-content">{{ item.content }}</span>
                </button>
                <button type="button" class="notification-delete" :aria-label="`删除通知：${item.content}`"
                    title="删除通知" @click="removeNotification(item)">
                    删除
                </button>
            </li>
        </ul>

        <template #footer>
            <yk-pagination :current="page" :page-size="effectivePageSize" :total="total" @change="changePage"
                simple />
        </template>
    </yk-drawer>
</template>

<script lang="ts" setup>
import { getCurrentInstance, onMounted, onUnmounted, ref, toRefs, watch, type ComponentPublicInstance } from 'vue'
import {
    deleteMessage as deleteMessageApi,
    getNotificationUnreadCount,
    getNotifications,
    getRequestErrorMessage,
    markAllNotificationsRead,
    markMessagesRead,
    type MessageItem,
} from '../../api/message'
import {
    MESSAGE_POLL_INTERVAL,
    emitMessageStateChange,
    isDocumentVisible,
} from '../../utils/messageRealtime'
import { useResponsiveListPageSize } from '../../utils/responsivePageSize'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type NotificationInstance = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const props = withDefaults(defineProps<{ active?: boolean }>(), {
    active: false,
})

const emits = defineEmits<{
    (e: 'close'): void
    (e: 'read'): void
}>()

const { active } = toRefs(props)
const proxy = getCurrentInstance()?.proxy as NotificationInstance | null | undefined
const responsivePageSize = useResponsiveListPageSize(
    ({ height }) => Math.floor((height - 220) / 104),
    { min: 6, max: 16 }
)
const effectivePageSize = responsivePageSize

const notifications = ref<MessageItem[]>([])
const page = ref(1)
const total = ref(0)
const unreadCount = ref(0)
const loading = ref(false)
const markingAll = ref(false)
let pollTimer: number | undefined
let polling = false

const typeLabel = (type: string): string => (type === 'notice' ? '通知' : '系统')

const formatMoment = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const closes = (): void => {
    emits('close')
}

const fetchNotifications = async (showSpinner = true, reportError = true): Promise<void> => {
    if (showSpinner) loading.value = true

    try {
        const [listResult, countResult] = await Promise.all([
            getNotifications({
                page: page.value,
                pageSize: effectivePageSize.value,
            }),
            getNotificationUnreadCount(),
        ])

        if (listResult.code !== 200 || !listResult.data) {
            throw new Error(listResult.message || '通知加载失败')
        }

        notifications.value = listResult.data.list
        total.value = listResult.data.total
        if (countResult.code === 200 && countResult.data) {
            unreadCount.value = Math.max(0, Number(countResult.data.unreadCount) || 0)
        }

        if (notifications.value.length === 0 && page.value > 1) {
            page.value = 1
            await fetchNotifications(showSpinner, reportError)
        }
    } catch (error) {
        if (reportError) {
            notifications.value = []
            total.value = 0
            unreadCount.value = 0
            proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '通知加载失败，请稍后重试') })
        }
    } finally {
        if (showSpinner) loading.value = false
    }
}

const stopPolling = (): void => {
    if (pollTimer !== undefined) {
        window.clearInterval(pollTimer)
        pollTimer = undefined
    }
}

const poll = async (): Promise<void> => {
    if (polling || loading.value || !active.value || page.value !== 1 || !isDocumentVisible()) return
    polling = true
    try {
        await fetchNotifications(false, false)
    } finally {
        polling = false
    }
}

const startPolling = (): void => {
    stopPolling()
    if (!active.value || !isDocumentVisible()) return
    pollTimer = window.setInterval(() => {
        void poll()
    }, MESSAGE_POLL_INTERVAL)
}

const markRead = async (item: MessageItem): Promise<void> => {
    if (item.isRead !== 0) return

    try {
        const result = await markMessagesRead(item.id)
        if (result.code !== 200) throw new Error(result.message || '标记失败')

        item.isRead = 1
        unreadCount.value = Math.max(0, unreadCount.value - 1)
        emits('read')
        emitMessageStateChange()
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '标记已读失败，请稍后重试') })
    }
}

const markAllRead = async (): Promise<void> => {
    if (unreadCount.value === 0) return

    markingAll.value = true
    try {
        const result = await markAllNotificationsRead()
        if (result.code !== 200) throw new Error(result.message || '标记失败')

        notifications.value = notifications.value.map(item => ({ ...item, isRead: 1 }))
        unreadCount.value = 0
        proxy?.$message?.({ type: 'primary', message: result.message || '已全部标记为已读' })
        emits('read')
        emitMessageStateChange()
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '标记失败，请稍后重试') })
    } finally {
        markingAll.value = false
    }
}

const removeNotification = async (item: MessageItem): Promise<void> => {
    try {
        const result = await deleteMessageApi(item.id)
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        if (notifications.value.length === 1 && page.value > 1) {
            page.value -= 1
        }
        await fetchNotifications()
        emits('read')
        emitMessageStateChange()
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '删除失败，请稍后重试') })
    }
}

const changePage = (nextPage: number): void => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchNotifications()
}

const handleVisibilityChange = (): void => {
    if (isDocumentVisible() && active.value) {
        void poll()
        startPolling()
    } else {
        stopPolling()
    }
}

watch(active, value => {
    if (value) {
        page.value = 1
        void fetchNotifications()
        startPolling()
    } else {
        stopPolling()
    }
})

watch(effectivePageSize, () => {
    if (!active.value) return
    page.value = 1
    void fetchNotifications()
})

onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (active.value) {
        void fetchNotifications()
        startPolling()
    }
})

onUnmounted(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style lang="less" scoped>
.notification-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: @space-m;
    padding-bottom: @space-m;
    border-bottom: 1px solid @line-color-s;
    margin-bottom: @space-m;
}

.notification-state {
    display: flex;
    min-height: 200px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: @space-m;
}

.notification-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.notification-item {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 6px;
    padding: 4px 4px 4px 0;
    border: 1px solid var(--gray1);
    border-radius: @radius-m;
    background: var(--bgColor1);
    transition: border-color 160ms ease, background 160ms ease;

    &:hover {
        border-color: color-mix(in srgb, var(--pcolor) 26%, transparent);
    }

    &.is-unread {
        border-color: color-mix(in srgb, var(--pcolor) 34%, transparent);
        background: color-mix(in srgb, var(--pcolor1) 46%, var(--bgColor1));
    }
}

.notification-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    padding: 12px 12px 12px 14px;
    border: 0;
    border-radius: @radius-m;
    background: transparent;
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: -2px;
    }
}

.notification-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.notification-tag {
    flex: none;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;

    &.is-notice {
        background: color-mix(in srgb, @wcolor 14%, transparent);
        color: @wcolor;
    }
}

.notification-time {
    overflow: hidden;
    color: var(--gray6);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.notification-dot {
    width: 7px;
    height: 7px;
    flex: none;
    margin-left: auto;
    border-radius: 50%;
    background: var(--pcolor);
    box-shadow: 0 0 0 3px var(--pcolor1);
}

.notification-content {
    color: var(--gray8);
    font-size: 13px;
    line-height: 1.65;
    overflow-wrap: anywhere;
}

.notification-item.is-unread .notification-content {
    color: var(--gray);
    font-weight: 550;
}

.notification-delete {
    flex: none;
    align-self: flex-start;
    margin-top: 10px;
    padding: 3px 7px;
    border: 0;
    border-radius: @radius-s;
    background: transparent;
    color: var(--gray6);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    opacity: 0;
    transition: opacity 160ms ease, color 160ms ease, background 160ms ease;

    &:hover,
    &:focus-visible {
        background: color-mix(in srgb, @ecolor 10%, transparent);
        color: @ecolor;
    }
}

.notification-item:hover .notification-delete,
.notification-delete:focus-visible {
    opacity: 1;
}

@media (hover: none) {
    .notification-delete {
        opacity: 1;
    }
}
</style>
