import type { Page } from '@playwright/test'

export interface MockSessionOptions {
  id?: number
  permissions?: string[]
  isSuperAdmin?: boolean
  username?: string
  mail?: string
}

export const article = {
  id: 1201,
  userId: 1,
  title: '把日常写成一条慢速河流',
  subsetId: 3,
  subsetName: '生活随笔',
  classify: 'article',
  label: 'Vue,写作',
  introduce: '在代码、光线与日常之间，记录那些值得被慢慢读完的片段。',
  cover: null,
  content: '<p>这是一篇用于端到端回归的文章。</p><p><strong>深链接、评论与主题都应稳定工作。</strong></p>',
  views: 97,
  likes: 12,
  comments: 1,
  rootComments: 1,
  replyComments: 0,
  state: 'published',
  createdAt: '2026-10-20T08:30:00.000Z',
  updatedAt: '2026-10-20T08:30:00.000Z',
  publishedAt: '2026-10-20T08:30:00.000Z',
}

export const reportedComment = {
  id: 201,
  userId: 9,
  userName: '读者甲',
  userAvatar: null,
  parentId: 0,
  replyToCommentId: null,
  replyToUserId: null,
  replyToUserName: null,
  content: '这是一条待举报的评论',
  likes: 2,
  liked: false,
  complaint: 0,
  createdAt: '2026-10-30T09:00:00.000Z',
}

export const owner = {
  id: 1,
  name: '林知雨',
  avatar: null,
}

// yk-modal 的 BEM 根节点是 .yk-modal__main，用它限定弹窗范围，
// 避免同时匹配到页面上其它 modal（例如举报弹窗）。
export const modalRootClass = '.yk-modal__main'

export const initialConversation = {
  userId: 2,
  name: '读者乙',
  avatar: null,
  lastContent: '想和你聊聊摄影',
  lastAt: '2026-10-30T09:15:00.000Z',
  lastSenderId: 2,
  unreadCount: 1,
  total: 1,
  isOwner: false,
}

// 后台内容列表用的图库条目（classify=image，与文章共用 /api/article）
export const galleryItem = {
  id: 1301,
  userId: 1,
  title: '城市夜色练习',
  subsetId: 3,
  subsetName: '摄影',
  classify: 'image',
  label: '夜拍',
  introduce: '一组关于城市光线的练习作品。',
  cover: null,
  content: JSON.stringify([
    '/api/uploads/photo-1.jpg',
    '/api/uploads/photo-2.jpg',
  ]),
  views: 42,
  likes: 8,
  comments: 0,
  rootComments: 0,
  replyComments: 0,
  state: 'published',
  createdAt: '2026-10-21T08:30:00.000Z',
  updatedAt: '2026-10-21T08:30:00.000Z',
  publishedAt: '2026-10-21T08:30:00.000Z',
}

// 后台随笔列表条目
export const diaryItem = {
  id: 1401,
  title: '雨天的旧书店',
  content: '下午路过旧书店，买了一本停在 1998 年的诗集。',
  picture: [],
  weatherId: 4,
  weatherName: '大雨',
  views: 21,
  likes: 3,
  comments: 1,
  rootComments: 1,
  replyComments: 0,
  createdAt: '2026-10-22T10:00:00.000Z',
}

export const initialMessage = {
  id: 301,
  senderId: 2,
  senderName: '读者乙',
  senderAvatar: null,
  receiverId: 1,
  receiverName: '林知雨',
  type: 'private',
  content: '想和你聊聊摄影',
  isRead: 0,
  createdAt: '2026-10-30T09:15:00.000Z',
}

export async function seedSession(
  page: Page,
  options: MockSessionOptions = {},
): Promise<void> {
  const {
    id = 7,
    permissions = ['article.create', 'comment.create', 'comment.like', 'comment.report'],
    isSuperAdmin = false,
    username = '普通用户',
    mail = 'user@example.com',
  } = options

  await page.addInitScript((session) => {
    localStorage.setItem('token', 'mock-token')
    localStorage.setItem('userInfo', JSON.stringify({
      id: session.id,
      username: session.username,
      mail: session.mail,
      user_type: session.isSuperAdmin ? 'admin' : 'normal',
      imgurl: null,
      permissions: session.permissions,
      isSuperAdmin: session.isSuperAdmin,
    }))
    localStorage.setItem('linlogPermissions', JSON.stringify(session.permissions))
    localStorage.setItem('linlogSuperAdmin', session.isSuperAdmin ? '1' : '0')
    // 供 mock 读取：会话首屏会重新拉一次 /api/permission/me，
    // mock 必须回同样的权限，否则会把注入的会话覆盖成写死的普通用户。
    localStorage.setItem('e2eMockSession', JSON.stringify({
      permissions: session.permissions,
      isSuperAdmin: session.isSuperAdmin,
    }))
  }, { id, permissions, isSuperAdmin, username, mail })
}

interface MockState {
  messages: typeof initialMessage[]
  conversation: typeof initialConversation
  articles: (typeof article)[]
  diaries: (typeof diaryItem)[]
  session: { permissions: string[]; isSuperAdmin: boolean }
}

export async function installApiMock(page: Page): Promise<MockState> {
  const state: MockState = {
    messages: [{ ...initialMessage }],
    conversation: { ...initialConversation },
    articles: [{ ...article }],
    diaries: [{ ...diaryItem }],
    session: { permissions: [], isSuperAdmin: false },
  }

  // 只拦截后端 /api 前缀：Vite dev 的 /@api/... 与 /@id/... 模块路径不能被
  // 兜底成 JSON，否则 main.ts 会因 MIME 类型不符而加载失败、整个应用不挂载。
  await page.route(url => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    // 同步一次 seedSession 注入的会话，供 /api/permission/me 回同样的权限
    if (!state.session.permissions.length) {
      const raw = await page.evaluate(() => localStorage.getItem('e2eMockSession'))
      if (raw) {
        try {
          state.session = JSON.parse(raw) as MockState['session']
        } catch {
          // 解析失败时保持默认空权限
        }
      }
    }
    let body: Record<string, unknown> | null = null
    try {
      body = request.postDataJSON() as Record<string, unknown> | null
    } catch {
      // GET requests and empty POST bodies do not carry JSON payloads.
    }

    const fulfill = async (data: unknown, options: {
      code?: number
      message?: string
      status?: number
    } = {}) => {
      await route.fulfill({
        status: options.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: options.code ?? 200,
          message: options.message ?? 'ok',
          data,
        }),
      })
    }

    if (method === 'POST' && path === '/api/user/login') {
      await fulfill({
        token: 'mock-token',
        userInfo: {
          id: 7,
          username: '普通用户',
          mail: 'user@example.com',
          user_type: 'normal',
          imgurl: null,
          permissions: ['article.create', 'comment.create', 'comment.like', 'comment.report'],
          isSuperAdmin: false,
        },
      }, { message: '登录成功' })
      return
    }

    if (method === 'GET' && path === '/api/permission/me') {
      await fulfill({
        // 必须与 seedSession 注入的会话一致：会话在首屏会重新拉一次权限，
        // 这里若写死普通用户权限，会把超级管理员的权限覆盖掉。
        permissions: state.session.permissions,
        isSuperAdmin: state.session.isSuperAdmin,
        canEditPermissions: false,
      })
      return
    }

    if (method === 'POST' && path === '/api/user/userInfo') {
      await fulfill({
        id: 7,
        username: '普通用户',
        mail: 'user@example.com',
        user_type: 'normal',
        imgurl: null,
        status: 1,
        created_at: '2026-01-10T08:00:00.000Z',
        last_login_at: '2026-10-30T08:00:00.000Z',
      })
      return
    }

    if (method === 'GET' && path === '/api/file/storage/status') {
      await fulfill({
        usedBytes: 1048576,
        maxBytes: 10485760,
        level: 'normal',
      })
      return
    }

    if (method === 'POST' && path === '/api/upload/ticket') {
      await fulfill({
        ticket: 'e2e-upload-ticket',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        expiresInMs: 300_000,
        uses: 20,
      })
      return
    }

    if (method === 'GET' && path === '/api/public/article') {
      await fulfill({
        total: 1,
        page: 1,
        pageSize: 10,
        totalPage: 1,
        list: [article],
      })
      return
    }

    if (method === 'GET' && path === `/api/public/article/${article.id}`) {
      await fulfill(article)
      return
    }

    if (method === 'GET' && path === '/api/public/subset') {
      await fulfill({
        count: 1,
        list: [{
          id: 3,
          name: '生活随笔',
          classify: 'article',
          sort: 1,
          value: 1,
          moment: '2026-10-20T08:30:00.000Z',
        }],
      })
      return
    }

    // ─── 后台内容列表 ──────────────────────────────────────────────
    if (method === 'GET' && path === '/api/article') {
      const classify = url.searchParams.get('classify')
      const keyword = (url.searchParams.get('keyword') || '').trim()
      const source = classify === 'image' ? [{ ...galleryItem }] : state.articles
      const list = keyword
        ? source.filter(item => item.title.includes(keyword))
        : source

      await fulfill({
        total: list.length,
        page: 1,
        pageSize: Number(url.searchParams.get('pageSize') || 10),
        totalPage: 1,
        list,
      })
      return
    }

    if (method === 'GET' && path === '/api/article/state/summary') {
      await fulfill({ published: 1, draft: 0 })
      return
    }

    if (method === 'PATCH' && /^\/api\/article\/\d+\/status$/.test(path)) {
      const id = Number(path.split('/')[3])
      const nextState = String(body?.state || 'draft')
      const target = state.articles.find(item => item.id === id)
      if (target) target.state = nextState
      await fulfill({ id, state: nextState })
      return
    }

    if (method === 'DELETE' && /^\/api\/article\/\d+$/.test(path)) {
      const id = Number(path.split('/')[3])
      state.articles = state.articles.filter(item => item.id !== id)
      await fulfill({})
      return
    }

    // ─── 后台随笔列表 ──────────────────────────────────────────────
    if (method === 'GET' && path === '/api/diary') {
      const keyword = (url.searchParams.get('keyword') || '').trim()
      const list = keyword
        ? state.diaries.filter(item => item.title.includes(keyword))
        : state.diaries

      await fulfill({
        total: list.length,
        page: 1,
        pageSize: Number(url.searchParams.get('pageSize') || 10),
        totalPage: 1,
        list,
      })
      return
    }

    if (method === 'POST' && path === '/api/diary') {
      const created = {
        ...diaryItem,
        id: 1500 + state.diaries.length,
        title: String(body?.title || '未命名随笔'),
        content: String(body?.content || ''),
      }
      state.diaries = [created, ...state.diaries]
      await fulfill({ diaryId: created.id })
      return
    }

    if (method === 'PUT' && /^\/api\/diary\/\d+$/.test(path)) {
      const id = Number(path.split('/')[3])
      state.diaries = state.diaries.map(item =>
        item.id === id
          ? {
              ...item,
              title: String(body?.title ?? item.title),
              content: String(body?.content ?? item.content),
            }
          : item
      )
      await fulfill({})
      return
    }

    if (method === 'DELETE' && /^\/api\/diary\/\d+$/.test(path)) {
      const id = Number(path.split('/')[3])
      state.diaries = state.diaries.filter(item => item.id !== id)
      await fulfill({})
      return
    }

    if (method === 'GET' && path === '/api/public/label') {
      await fulfill({
        count: 2,
        list: [
          { id: 1, name: 'Vue', value: 1, moment: '2026-10-20T08:30:00.000Z' },
          { id: 2, name: '写作', value: 1, moment: '2026-10-20T08:30:00.000Z' },
        ],
      })
      return
    }

    if (method === 'GET' && path === '/api/public/comment') {
      await fulfill({
        total: 1,
        page: 1,
        pageSize: 50,
        totalPage: 1,
        list: [reportedComment],
      })
      return
    }

    if (method === 'GET' && path === `/api/public/praise/${article.id}`) {
      await fulfill({ liked: false, likes: article.likes })
      return
    }

    if (method === 'POST' && path === '/api/public/view') {
      await fulfill({
        targetType: 'article',
        targetId: article.id,
        counted: true,
        views: 98,
      })
      return
    }

    if (method === 'POST' && path === '/api/public/comment/report') {
      await fulfill({ complaint: 1, already: false }, { message: '举报成功' })
      return
    }

    if (method === 'POST' && path === '/api/public/comment/like') {
      await fulfill({ liked: true, likes: reportedComment.likes + 1 })
      return
    }

    if (method === 'GET' && path === '/api/message/unread/count') {
      await fulfill({
        unreadCount: state.messages.filter(item => item.receiverId === 1 && item.isRead === 0).length,
        type: 'private',
      })
      return
    }

    if (method === 'GET' && path === '/api/message/conversations') {
      await fulfill({
        owner,
        conversations: [state.conversation],
      })
      return
    }

    if (method === 'GET' && path === `/api/message/conversation/${state.conversation.userId}`) {
      await fulfill({
        target: {
          id: state.conversation.userId,
          name: state.conversation.name,
          avatar: state.conversation.avatar,
        },
        list: state.messages,
        total: state.messages.length,
        page: 1,
        pageSize: 50,
        totalPage: 1,
      })
      return
    }

    if (method === 'POST' && path === '/api/message') {
      const content = String(body?.content || '').trim()
      const receiverId = Number(body?.receiverId)
      const sent = {
        id: 400 + state.messages.length,
        senderId: 1,
        senderName: owner.name,
        senderAvatar: owner.avatar,
        receiverId,
        receiverName: state.conversation.name,
        type: 'private',
        content,
        isRead: 1,
        createdAt: new Date().toISOString(),
      }
      state.messages = [...state.messages, sent]
      state.conversation = {
        ...state.conversation,
        lastContent: content,
        lastAt: sent.createdAt,
        lastSenderId: 1,
        unreadCount: 0,
        total: state.messages.length,
      }
      await fulfill({ messageId: sent.id, createAt: sent.createdAt }, { message: '消息发送成功' })
      return
    }

    if (method === 'PATCH' && path === '/api/message/read') {
      const messageIds = Array.isArray(body?.messageIds) ? body.messageIds : []
      state.messages = state.messages.map(item =>
        messageIds.includes(item.id) ? { ...item, isRead: 1 } : item
      )
      state.conversation = { ...state.conversation, unreadCount: 0 }
      await fulfill({ markedCount: messageIds.length })
      return
    }

    // Every test stays hermetic: unknown API calls resolve as an empty success
    // response instead of reaching a real backend through the Vite proxy.
    await fulfill({})
  })

  return state
}
