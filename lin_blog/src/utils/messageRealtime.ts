import type {
  ConversationSummary,
  MessageItem,
} from '../api/message'

export const MESSAGE_POLL_INTERVAL = 20_000
export const MESSAGE_STATE_EVENT = 'linblog:message-state-change'

export interface MessageMergeResult {
  list: MessageItem[]
  added: MessageItem[]
}

function messageTimestamp(item: MessageItem): number {
  const timestamp = new Date(item.createdAt).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

// 轮询只取最新一页。这里按消息 ID 合并，既保留已加载的历史记录，
// 又用服务端返回的已读状态覆盖本地副本。
export function mergeMessagePage(
  current: MessageItem[],
  latest: MessageItem[]
): MessageMergeResult {
  const currentIds = new Set(current.map(item => item.id))
  const added = latest.filter(item => !currentIds.has(item.id))
  const merged = new Map<number, MessageItem>()

  for (const item of current) merged.set(item.id, item)
  for (const item of latest) merged.set(item.id, item)

  return {
    list: [...merged.values()].sort((left, right) => {
      const timeDiff = messageTimestamp(left) - messageTimestamp(right)
      return timeDiff || left.id - right.id
    }),
    added,
  }
}

export function conversationFingerprint(
  conversation: Pick<
    ConversationSummary,
    'lastAt' | 'lastSenderId' | 'unreadCount' | 'total'
  >
): string {
  return [
    conversation.lastAt || '',
    conversation.lastSenderId ?? '',
    conversation.unreadCount,
    conversation.total,
  ].join(':')
}

// 新消息提醒不看未读数：在别处标记已读不应伪装成收到一条新私信。
export function conversationIncomingFingerprint(
  conversation: Pick<
    ConversationSummary,
    'lastAt' | 'lastSenderId' | 'total'
  >
): string {
  return [
    conversation.lastAt || '',
    conversation.lastSenderId ?? '',
    conversation.total,
  ].join(':')
}

// 只把对方新发来的消息，或首次出现的会话视为新提醒。
export function findNewIncomingConversations(
  previous: ReadonlyMap<number, string>,
  current: ConversationSummary[],
  myId: number | null
): ConversationSummary[] {
  return current.filter(item => {
    if (item.lastSenderId === null || item.lastSenderId === myId) return false
    return previous.get(item.userId) !== conversationIncomingFingerprint(item)
  })
}

export function isDocumentVisible(): boolean {
  return typeof document === 'undefined'
    || document.visibilityState !== 'hidden'
}

export function emitMessageStateChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MESSAGE_STATE_EVENT))
  }
}
