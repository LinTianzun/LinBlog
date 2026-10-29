<template>
    <yk-space dir="vertical" size="l" class="admin-page messages-page">
        <top-title name="回复私信" :description="isOwner ? '回复所有读者的私信 · 只有你能看到全部会话' : '与博主一对一沟通 · 其他账号无法互相私信'" :is-search="false">
            <template #custom>
                <yk-space align="center" size="m">
                    <yk-text type="third">
                        {{ isOwner ? `共 ${conversations.length} 个会话` : `与 ${owner?.name || '博主'} 对话` }}
                    </yk-text>
                    <yk-button type="secondary" :disabled="loadingConversations" @click="loadConversations">
                        <IconRefreshOutline /> 刷新
                    </yk-button>
                </yk-space>
            </template>
        </top-title>

        <yk-text v-if="pageError" type="danger">{{ pageError }}</yk-text>

        <div class="messages-shell">
            <!-- 左栏：会话列表 -->
            <aside class="messages-side">
                <header class="messages-side-head">
                    <strong>{{ isOwner ? '所有读者' : '我的对话' }}</strong>
                    <small>{{ isOwner ? '按最近消息排序' : '只能与博主对话' }}</small>
                </header>

                <div v-if="loadingConversations" class="messages-side-state">
                    <yk-spinner size="s" />
                </div>
                <yk-empty v-else-if="conversations.length === 0" description="暂无私信会话" />
                <ul v-else class="conversation-list">
                    <li v-for="item in conversations" :key="item.userId">
                        <button type="button" class="conversation-item"
                            :class="{ 'is-active': activeUserId === item.userId }"
                            @click="selectConversation(item.userId)">
                            <yk-avatar :size="36" :img-url="item.avatar || undefined" />
                            <span class="conversation-copy">
                                <span class="conversation-top">
                                    <strong>{{ item.name }}</strong>
                                    <time>{{ shortTime(item.lastAt) }}</time>
                                </span>
                                <span class="conversation-preview">
                                    {{ item.lastContent || '还没有消息，发一条打个招呼吧' }}
                                </span>
                            </span>
                            <span v-if="item.unreadCount > 0" class="conversation-badge">
                                {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
                            </span>
                        </button>
                    </li>
                </ul>
            </aside>

            <!-- 右栏：聊天窗口 -->
            <section class="messages-main">
                <template v-if="activeConversation">
                    <header class="chat-head">
                        <yk-avatar :size="34" :img-url="activeConversation.avatar || undefined" />
                        <div class="chat-head-copy">
                            <strong>{{ activeConversation.name }}</strong>
                            <small>{{ isOwner ? '读者私信' : '博主' }}</small>
                        </div>
                        <span class="chat-head-count">{{ total }} 条消息</span>
                    </header>

                    <div ref="threadRef" class="chat-thread">
                        <button v-if="page < totalPage" type="button" class="chat-load-earlier"
                            :disabled="loadingMessages" @click="loadEarlier">
                            加载更早的消息
                        </button>

                        <div v-if="loadingMessages && messages.length === 0" class="chat-state">
                            <yk-spinner size="m" />
                            <yk-text type="secondary">正在加载会话...</yk-text>
                        </div>
                        <yk-empty v-else-if="messages.length === 0" description="还没有消息，发一条打个招呼吧" />

                        <template v-else>
                            <div v-for="(message, index) in messages" :key="message.id" class="chat-block">
                                <time v-if="showDate(index)" class="chat-date">{{ formatDate(message.createdAt) }}</time>
                                <div class="chat-row" :class="{ 'is-mine': message.senderId === myId }">
                                    <yk-avatar v-if="message.senderId !== myId" :size="28"
                                        :img-url="message.senderAvatar || undefined" class="chat-avatar" />
                                    <div class="chat-bubble" :class="{ 'is-mine': message.senderId === myId }">
                                        <p>{{ message.content }}</p>
                                        <time>{{ formatClock(message.createdAt) }}</time>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>

                    <footer class="chat-composer">
                        <yk-text-area v-model="draft" :max-length="512" show-word-limit
                            :auto-size="{ minRows: 2, maxRows: 5 }" :disabled="sending"
                            placeholder="输入回复内容，Ctrl + Enter 发送" @keydown="handleComposerKeydown" />
                        <div class="chat-composer-actions">
                            <span v-if="sendError" class="chat-error">{{ sendError }}</span>
                            <span v-else class="chat-hint">回复会直接发送到对方的私信收件箱</span>
                            <yk-button type="primary" :loading="sending" :disabled="!draft.trim()"
                                @click="sendReply">
                                发送
                            </yk-button>
                        </div>
                    </footer>
                </template>

                <div v-else class="messages-main-state">
                    <yk-empty :description="isOwner ? '从左侧选择一位读者开始回复' : '正在准备与博主的对话…'" />
                </div>
            </section>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { IconRefreshOutline } from '@yike-design/ui/es/components/svg-icon'
import TopTitle from '../components/bar/TopTitle.vue'
import { useRoute, useRouter } from 'vue-router'
import {
    getConversations,
    getConversation,
    sendMessage,
    markMessagesRead,
    getRequestErrorMessage,
    type ConversationSummary,
    type ConversationUser,
    type MessageItem,
} from '../api/message'

const PAGE_SIZE = 50
const route = useRoute()
const router = useRouter()

const conversations = ref<ConversationSummary[]>([])
const owner = ref<ConversationUser | null>(null)
const activeUserId = ref<number | null>(null)
const messages = ref<MessageItem[]>([])
const total = ref(0)
const page = ref(1)
const totalPage = ref(0)
const draft = ref('')
const loadingConversations = ref(false)
const loadingMessages = ref(false)
const sending = ref(false)
const pageError = ref('')
const sendError = ref('')
const threadRef = ref<HTMLElement | null>(null)

// 博主身份由后端返回：普通账号的会话列表里 owner 就是唯一的对话人
const myId = (() => {
    try {
        const raw = localStorage.getItem('userInfo')
        const parsed = raw ? JSON.parse(raw) : null
        return Number(parsed?.id) || null
    } catch {
        return null
    }
})()

const isOwner = computed(() => {
    if (owner.value && myId) return owner.value.id === myId
    // 博主自己的会话列表里 owner 就是自己
    return owner.value !== null && conversations.value.every(item => !item.isOwner)
})

const activeConversation = computed(
    () => conversations.value.find(item => item.userId === activeUserId.value) || null
)

const queryUserId = (): number | null => {
    const raw = Array.isArray(route.query.userId) ? route.query.userId[0] : route.query.userId
    const userId = Number(raw)
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null
}

const shortTime = (value: string | null): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return formatClock(value)
    return `${date.getMonth() + 1}/${date.getDate()}`
}

const formatClock = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const formatDate = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return '今天'
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 同一天的消息只显示一次日期分隔
const showDate = (index: number): boolean => {
    if (index === 0) return true
    const current = new Date(messages.value[index].createdAt)
    const previous = new Date(messages.value[index - 1].createdAt)
    return current.toDateString() !== previous.toDateString()
}

const scrollToBottom = async (): Promise<void> => {
    await nextTick()
    const el = threadRef.value
    if (el) el.scrollTop = el.scrollHeight
}

const loadConversations = async (): Promise<void> => {
    loadingConversations.value = true
    pageError.value = ''
    try {
        const result = await getConversations()
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '会话加载失败')
        }
        owner.value = result.data.owner
        conversations.value = result.data.conversations

        // 优先打开顶部私信跳转携带的 userId；否则保留当前选择或落到第一条会话
        const requestedUserId = queryUserId()
        const requestedExists = requestedUserId !== null
            && conversations.value.some(item => item.userId === requestedUserId)
        const stillExists = conversations.value.some(item => item.userId === activeUserId.value)
        activeUserId.value = requestedExists
            ? requestedUserId
            : stillExists
                ? activeUserId.value
                : conversations.value[0]?.userId ?? null
        if (activeUserId.value) {
            await loadMessages(true)
        } else {
            messages.value = []
        }
    } catch (error) {
        pageError.value = getRequestErrorMessage(error, '会话加载失败，请稍后重试')
        conversations.value = []
        messages.value = []
    } finally {
        loadingConversations.value = false
    }
}

const loadMessages = async (reset = true): Promise<void> => {
    const targetUserId = activeUserId.value
    if (!targetUserId) return

    loadingMessages.value = true
    sendError.value = ''
    try {
        const nextPage = reset ? 1 : page.value + 1
        const result = await getConversation(targetUserId, { page: nextPage, pageSize: PAGE_SIZE })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '消息加载失败')
        }

        page.value = result.data.page
        total.value = result.data.total
        totalPage.value = result.data.totalPage
        messages.value = reset
            ? result.data.list
            : [...result.data.list, ...messages.value]

        // 进入会话后把对方发来的未读消息标为已读，红点与未读数同步消失
        const unreadIds = result.data.list
            .filter(item => item.receiverId === myId && item.isRead === 0)
            .map(item => item.id)
        if (unreadIds.length > 0) {
            // 已读标记失败不影响消息本身展示
            try {
                await markMessagesRead(unreadIds)
                for (const item of messages.value) {
                    if (unreadIds.includes(item.id)) item.isRead = 1
                }
                const summary = conversations.value.find(item => item.userId === targetUserId)
                if (summary) summary.unreadCount = Math.max(0, summary.unreadCount - unreadIds.length)
            } catch {
                // 忽略已读标记失败，下次进入会话会再次尝试
            }
        }

        if (reset) await scrollToBottom()
    } catch (error) {
        pageError.value = getRequestErrorMessage(error, '消息加载失败，请稍后重试')
    } finally {
        loadingMessages.value = false
    }
}

const selectConversation = async (userId: number): Promise<void> => {
    if (activeUserId.value === userId) return
    activeUserId.value = userId
    messages.value = []
    draft.value = ''
    await router.replace({ path: '/messages', query: { userId: String(userId) } })
    await loadMessages(true)
}

const loadEarlier = async (): Promise<void> => {
    if (loadingMessages.value || page.value >= totalPage.value) return
    const previousHeight = threadRef.value?.scrollHeight || 0
    await loadMessages(false)
    // 前置旧消息后保持视口位置，避免聊天记录跳到顶部
    await nextTick()
    if (threadRef.value) {
        threadRef.value.scrollTop = threadRef.value.scrollHeight - previousHeight
    }
}

const sendReply = async (): Promise<void> => {
    const content = draft.value.trim()
    const targetUserId = activeUserId.value
    if (!content || !targetUserId || sending.value) return

    sending.value = true
    sendError.value = ''
    try {
        const result = await sendMessage({
            receiverId: targetUserId,
            type: 'private',
            content,
        })
        if (result.code !== 200 && result.code !== 201) {
            throw new Error(result.message || '发送失败')
        }
        draft.value = ''
        await loadMessages(true)
        // 本地会话列表同步最后一条消息，再后台刷新未读/排序
        const summary = conversations.value.find(item => item.userId === targetUserId)
        if (summary) {
            summary.lastContent = content
            summary.lastAt = new Date().toISOString()
            summary.lastSenderId = myId
        }
    } catch (error) {
        sendError.value = getRequestErrorMessage(error, '发送失败，请稍后重试')
    } finally {
        sending.value = false
    }
}

const handleComposerKeydown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        void sendReply()
    }
}

onMounted(() => {
    void loadConversations()
})

// 顶栏私信抽屉在页面内跳转时组件不会重新挂载，需要响应 userId 变化
watch(() => route.query.userId, () => {
    const userId = queryUserId()
    if (userId === null || userId === activeUserId.value) return
    if (!conversations.value.some(item => item.userId === userId)) return
    void selectConversation(userId)
})
</script>

<style lang="less" scoped>
    .messages-page {
        width: 100%;
    }

    .messages-shell {
        display: grid;
        grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
        gap: @space-m;
        width: 100%;
        min-height: 560px;
        height: calc(100vh - 220px);
    }

    .messages-side,
    .messages-main {
        display: flex;
        min-height: 0;
        flex-direction: column;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm);
        overflow: hidden;
    }

    .messages-side-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--admin-line, var(--gray1));

        strong {
            color: var(--gray);
            font-size: 14px;
            font-weight: 700;
        }

        small {
            color: var(--gray6);
            font-size: 11px;
        }
    }

    .messages-side-state {
        display: grid;
        flex: 1;
        place-items: center;
    }

    .conversation-list {
        margin: 0;
        padding: 8px;
        list-style: none;
        overflow-y: auto;
        flex: 1;
    }

    .conversation-item {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 10px;
        padding: 10px 10px;
        margin-bottom: 2px;
        border: 1px solid transparent;
        border-radius: 12px;
        background: transparent;
        text-align: left;
        cursor: pointer;
        transition: border-color 160ms ease, background 160ms ease;

        &:hover {
            background: var(--pcolor1);
        }

        &.is-active {
            border-color: var(--pcolor3);
            background: var(--pcolor1);
        }
    }

    .conversation-copy {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .conversation-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;

        strong {
            overflow: hidden;
            color: var(--gray);
            font-size: 13px;
            font-weight: 650;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        time {
            flex: none;
            color: var(--gray6);
            font-size: 11px;
            font-variant-numeric: tabular-nums;
        }
    }

    .conversation-preview {
        overflow: hidden;
        color: var(--gray6);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .conversation-badge {
        display: grid;
        min-width: 20px;
        height: 20px;
        flex: none;
        padding: 0 6px;
        place-items: center;
        border-radius: 999px;
        background: @ecolor;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
    }

    .chat-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--admin-line, var(--gray1));
    }

    .chat-head-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;

        strong {
            color: var(--gray);
            font-size: 14px;
            font-weight: 700;
        }

        small {
            color: var(--gray6);
            font-size: 11px;
        }
    }

    .chat-head-count {
        margin-left: auto;
        color: var(--gray6);
        font-size: 11px;
    }

    .chat-thread {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background:
            radial-gradient(circle at 100% 0%, var(--pcolor1), transparent 40%),
            color-mix(in srgb, var(--bgColor2) 45%, transparent);
    }

    .chat-load-earlier {
        display: block;
        margin: 0 auto 14px;
        padding: 4px 12px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 999px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray6);
        font-size: 11px;
        cursor: pointer;

        &:disabled {
            opacity: 0.6;
            cursor: default;
        }
    }

    .chat-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 200px;
    }

    .chat-date {
        display: block;
        margin: 12px auto;
        color: var(--gray6);
        font-size: 11px;
        text-align: center;
    }

    .chat-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        margin-bottom: 10px;

        &.is-mine {
            justify-content: flex-end;
        }
    }

    .chat-avatar {
        flex: none;
    }

    .chat-bubble {
        max-width: min(560px, 78%);
        padding: 9px 12px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 14px 14px 14px 4px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray8);
        font-size: 13px;
        line-height: 1.6;
        word-break: break-word;

        &.is-mine {
            border-color: transparent;
            border-radius: 14px 14px 4px 14px;
            background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
            color: #fff;
        }

        p {
            margin: 0;
            white-space: pre-wrap;
        }

        time {
            display: block;
            margin-top: 4px;
            color: var(--gray6);
            font-size: 10px;
            text-align: right;
            font-variant-numeric: tabular-nums;
        }

        &.is-mine time {
            color: rgba(255, 255, 255, 0.72);
        }
    }

    .chat-composer {
        padding: 12px 16px 14px;
        border-top: 1px solid var(--admin-line, var(--gray1));
        background: var(--admin-surface, var(--bgColor1));
    }

    .chat-composer-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 8px;
    }

    .chat-hint {
        color: var(--gray6);
        font-size: 11px;
    }

    .chat-error {
        color: @ecolor;
        font-size: 12px;
    }

    .messages-main-state {
        display: grid;
        flex: 1;
        place-items: center;
    }

    @media (max-width: 900px) {
        .messages-shell {
            grid-template-columns: 1fr;
            grid-template-rows: minmax(180px, 32vh) minmax(420px, 1fr);
            height: auto;
        }

        .messages-side {
            max-height: 32vh;
        }
    }
</style>
