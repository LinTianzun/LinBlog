import assert from 'node:assert/strict'
import test from 'node:test'
import type {
    ConversationSummary,
    MessageItem,
} from '../src/api/message.ts'
import {
    conversationIncomingFingerprint,
    findNewIncomingConversations,
    mergeMessagePage,
} from '../src/utils/messageRealtime.ts'

function message(
  id: number,
  createdAt: string,
  overrides: Partial<MessageItem> = {}
): MessageItem {
  return {
    id,
    senderId: 2,
    senderName: '读者',
    senderAvatar: null,
    receiverId: 1,
    receiverName: '博主',
    type: 'private',
    content: `消息 ${id}`,
    isRead: 0,
    createdAt,
    ...overrides,
  }
}

function conversation(
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    userId: 2,
    name: '读者',
    avatar: null,
    lastContent: '你好',
    lastAt: '2026-10-29T10:00:00.000Z',
    lastSenderId: 2,
    unreadCount: 1,
    total: 3,
    isOwner: false,
    ...overrides,
  }
}

test('轮询合并保留旧消息，并按时间和 ID 稳定排序', () => {
  const current = [
    message(3, '2026-10-29T10:02:00.000Z', { isRead: 1 }),
    message(1, '2026-10-29T10:00:00.000Z'),
  ]
  const latest = [
    message(2, '2026-10-29T10:01:00.000Z'),
    message(3, '2026-10-29T10:02:00.000Z', { isRead: 1 }),
    message(4, '2026-10-29T10:03:00.000Z'),
  ]

  const result = mergeMessagePage(current, latest)

  assert.deepEqual(result.list.map(item => item.id), [1, 2, 3, 4])
  assert.deepEqual(result.added.map(item => item.id), [2, 4])
  assert.equal(result.list.find(item => item.id === 3)?.isRead, 1)
})

test('相同时间戳按消息 ID 排序，非法时间不会打乱顺序', () => {
  const result = mergeMessagePage([], [
    message(9, '2026-10-29T10:00:00.000Z'),
    message(8, 'invalid'),
    message(7, 'invalid'),
  ])

  assert.deepEqual(result.list.map(item => item.id), [7, 8, 9])
})

test('只提醒对方发来的新消息或新会话', () => {
  const unchanged = conversation()
  const previous = new Map([
    [unchanged.userId, conversationIncomingFingerprint(unchanged)],
  ])

  assert.deepEqual(
    findNewIncomingConversations(previous, [unchanged], 1),
    []
  )

  const incoming = conversation({
    lastAt: '2026-10-29T10:05:00.000Z',
    unreadCount: 2,
    total: 4,
  })
  assert.deepEqual(
    findNewIncomingConversations(previous, [incoming], 1).map(item => item.userId),
    [2]
  )

  const mine = conversation({
    lastAt: '2026-10-29T10:06:00.000Z',
    lastSenderId: 1,
    unreadCount: 0,
    total: 5,
  })
  assert.deepEqual(findNewIncomingConversations(previous, [mine], 1), [])

  const readElsewhere = conversation({
    unreadCount: 0,
    total: unchanged.total,
  })
  assert.deepEqual(
    findNewIncomingConversations(previous, [readElsewhere], 1),
    []
  )

  const newConversation = conversation({
    userId: 3,
    name: '新读者',
    total: 1,
  })
  assert.deepEqual(
    findNewIncomingConversations(previous, [newConversation], 1).map(item => item.userId),
    [3]
  )
})
