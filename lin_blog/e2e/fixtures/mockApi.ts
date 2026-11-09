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
  galleries: (typeof galleryItem)[]
  diaries: (typeof diaryItem)[]
  workflows: Record<number, WorkflowMock>
  versions: WorkflowVersionMock[]
  session: { permissions: string[]; isSuperAdmin: boolean }
  aiHealth: {
    lastTestAt: string
    lastSuccessAt: string
    lastLatencyMs: number
    avgLatencyMs: number
    testCount: number
    successCount: number
    successRate: number
    consecutiveFailures: number
    lastError: string
  }
}

export interface WorkflowMock {
  articleId: number
  classify: 'article' | 'image'
  state: 'draft' | 'published' | 'rejected'
  revision: number
  savedAt: string
  scheduledAt: string | null
  publishedAt: string | null
  hasUnpublishedChanges: boolean
  workingCopy: {
    title: string
    subsetId: number | null
    classify: 'article' | 'image'
    label: string
    introduce: string
    content: string
    cover: string
    state: 'draft' | 'published' | 'rejected'
  }
}

export interface WorkflowVersionMock {
  id: number
  articleId: number
  revision: number
  title: string
  subsetId: number | null
  classify: 'article' | 'image'
  label: string | null
  introduce: string | null
  cover: string | null
  state: 'draft' | 'published' | 'rejected'
  source: 'manual' | 'autosave' | 'publish' | 'rollback' | 'scheduled'
  createdBy: number | null
  createdAt: string
  contentLength: number
  mediaCount?: number
  content?: string
}

export async function installApiMock(page: Page): Promise<MockState> {
  const state: MockState = {
    messages: [{ ...initialMessage }],
    conversation: { ...initialConversation },
    articles: [{ ...article }],
    galleries: [{ ...galleryItem }],
    diaries: [{ ...diaryItem }],
    workflows: {},
    versions: [],
    session: { permissions: [], isSuperAdmin: false },
    aiHealth: {
      lastTestAt: '2026-11-09T01:40:00.000Z',
      lastSuccessAt: '2026-11-09T01:40:00.000Z',
      lastLatencyMs: 1180,
      avgLatencyMs: 1250,
      testCount: 6,
      successCount: 6,
      successRate: 100,
      consecutiveFailures: 0,
      lastError: '',
    },
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

    // 服务器时间：定时发布以服务器时区为权威。mock 固定东八区，
    // 这样浏览器时区被改写成其他值时仍应算出同样的"1 小时后"。
    if (method === 'GET' && path === '/api/time/now') {
      await fulfill({
        now: new Date().toISOString(),
        offsetMinutes: 480,
        timeZone: 'Asia/Shanghai',
      })
      return
    }

    // AI 写作建议：服务端代理模型 API，这里返回稳定的建议内容
    if (method === 'POST' && path === '/api/ai/suggest') {
      await fulfill({
        summary: 'AI 建议的简介内容',
        labels: ['Vue', '前端工程化'],
      }, { message: 'AI 建议已生成，请确认后再填充' })
      return
    }

    if (method === 'POST' && path === '/api/ai/writing') {
      const action = body?.action === 'continue' ? 'continue' : 'polish'
      await fulfill({
        action,
        text: action === 'continue'
          ? 'AI 续写的候选内容。'
          : 'AI 润色后的候选内容。',
      }, { message: 'AI 写作辅助已生成，请确认后再写入' })
      return
    }

    if (method === 'POST' && path === '/api/ai/cover') {
      await fulfill({
        token: 'a'.repeat(48),
        dataUri:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        prompt: '测试封面提示词',
      }, { message: 'AI 封面已生成，请确认后再采用' })
      return
    }

    if (method === 'POST' && path === '/api/ai/cover/confirm') {
      await fulfill({
        url: '/api/uploads/ai-e2e-cover.png',
      }, { message: 'AI 封面已保存' })
      return
    }

    // ─── AI 管理（模型、用量策略、调用记录）─────────────────────
    if (method === 'GET' && path === '/api/ai/models') {
      await fulfill({
        list: [
          {
            id: 1,
            name: '智谱 GLM',
            provider: 'openai',
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
            apiKeyMasked: '********7890',
            chatModel: 'glm-4-flash',
            imageModel: 'cogview-3-flash',
            imageSize: '1344x768',
            timeoutMs: 20000,
            dailyLimitPerUser: 10,
            monthlyLimitPerUser: 50,
            enabled: true,
            isDefault: true,
            remark: '默认写作与配图模型',
            createdAt: '2026-11-09 10:00:00',
            updatedAt: '2026-11-09 10:00:00',
            health: { ...state.aiHealth },
          },
        ],
      })
      return
    }

    if (method === 'GET' && path === '/api/ai/settings') {
      await fulfill({
        quotaEnabled: true,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true,
      })
      return
    }

    if (method === 'PUT' && path === '/api/ai/settings') {
      await fulfill({
        quotaEnabled: body?.quotaEnabled !== false,
        dailyLimitPerUser: Number(body?.dailyLimitPerUser ?? 20),
        monthlyLimitPerUser: Number(body?.monthlyLimitPerUser ?? 100),
        superAdminUnlimited: body?.superAdminUnlimited !== false,
      }, { message: 'AI 用量策略已保存' })
      return
    }

    if (method === 'POST' && path === '/api/ai/models/import-env') {
      await fulfill({
        id: 1,
        name: '智谱 GLM',
        provider: 'openai',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKeyMasked: '********7890',
        chatModel: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000,
        enabled: true,
        isDefault: true,
        remark: '由环境变量 LINBLOG_AI_* 导入，可在后台继续维护',
      }, { message: '环境变量配置已导入为接入模型' })
      return
    }

    if (method === 'POST' && path === '/api/ai/models/1/test') {
      // 连通性测试返回健康快照，前端应立即写回模型卡片
      state.aiHealth = {
        lastTestAt: '2026-11-09T13:14:00.000Z',
        lastSuccessAt: '2026-11-09T13:14:00.000Z',
        lastLatencyMs: 880,
        avgLatencyMs: 1080,
        testCount: 7,
        successCount: 7,
        successRate: 100,
        consecutiveFailures: 0,
        lastError: '',
      }
      await fulfill({
        ok: true,
        latencyMs: 880,
        health: state.aiHealth,
      }, { message: '连通性测试通过（耗时 880 毫秒）' })
      return
    }

    if (method === 'GET' && path === '/api/ai/usage') {
      await fulfill({
        list: [
          {
            id: 11,
            userId: 1,
            username: '林知雨',
            feature: 'suggest',
            modelName: 'glm-4-flash',
            status: 'success',
            detail: '生成文章简介与标签建议',
            durationMs: 1240,
            promptTokens: 320,
            completionTokens: 180,
            outputChars: 96,
            createdAt: '2026-11-09 10:05:00',
          },
        ],
      })
      return
    }

    if (method === 'GET' && path === '/api/ai/usage/stats') {
      await fulfill({
        summary: {
          all: {
            total: 42,
            success: 40,
            failed: 2,
            denied: 0,
            successRate: 95.2,
            avgDurationMs: 1380,
            promptTokens: 6400,
            completionTokens: 3200,
            totalTokens: 9600,
            outputChars: 4200,
          },
          last7Days: {
            total: 12,
            success: 12,
            failed: 0,
            denied: 0,
            successRate: 100,
            avgDurationMs: 1120,
            promptTokens: 1800,
            completionTokens: 900,
            totalTokens: 2700,
            outputChars: 1500,
          },
          last30Days: {
            total: 30,
            success: 29,
            failed: 1,
            denied: 0,
            successRate: 96.7,
            avgDurationMs: 1250,
            promptTokens: 4800,
            completionTokens: 2400,
            totalTokens: 7200,
            outputChars: 3100,
          },
        },
        byModel: [
          {
            modelName: 'glm-4-flash',
            total: 30,
            success: 29,
            successRate: 96.7,
            avgDurationMs: 1250,
            promptTokens: 4800,
            completionTokens: 2400,
          },
        ],
        byFeature: [
          {
            feature: 'suggest',
            total: 18,
            success: 18,
            successRate: 100,
            avgDurationMs: 980,
          },
        ],
        trend: [
          { day: '2026-11-08', total: 4, success: 4, tokens: 900 },
          { day: '2026-11-09', total: 8, success: 8, tokens: 1800 },
        ],
        pending: { total: 3, bytes: 245760, expired: 0 },
        health: [
          {
            modelId: 1,
            modelName: '智谱 GLM',
            enabled: true,
            ...state.aiHealth,
          },
        ],
        days: 30,
      })
      return
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
        usedPercent: 10.5,
        warnPercent: 80,
        level: 'ok',
        local: { bytes: 524288, files: 2 },
        mirror: { bytes: 524288, files: 2 },
        offsite: null,
      })
      return
    }

    if (method === 'GET' && path === '/api/file/maintenance/stats') {
      await fulfill({
        cache: {
          entries: 12,
          bytes: 3145728,
          maxBytes: 67108864,
          hits: 48,
          misses: 12,
          generations: 12,
          evictions: 0,
          clears: 0,
          hitRate: 80,
        },
        storage: {
          disk: { count: 3, bytes: 409600 },
          image: { count: 5, bytes: 1048576 },
          trashDisk: { count: 1, bytes: 8192 },
          trashImage: { count: 0, bytes: 0 },
        },
      })
      return
    }

    if (method === 'POST' && path === '/api/file/maintenance/cache') {
      await fulfill({
        cache: {
          entries: 0,
          bytes: 0,
          maxBytes: 67108864,
          hits: 48,
          misses: 12,
          generations: 12,
          evictions: 0,
          clears: 1,
          hitRate: 80,
        },
      })
      return
    }

    // 本地文件列表：磁盘文件与内容图片（image 表）混排
    if (method === 'GET' && path === '/api/file') {
      await fulfill({
        total: 2,
        page: 1,
        pageSize: 8,
        totalPage: 1,
        list: [
          {
            id: 601,
            fileName: '1700000000-cover.jpg',
            format: 'jpg',
            size: 204800,
            url: '/api/uploads/1700000000-cover.jpg',
            rawUrl: '/api/file/601/raw',
            subsetId: 3,
            createdAt: '2026-11-01T08:00:00.000Z',
            source: 'image',
            owners: [
              { type: 'article', id: 1201, title: '把日常写成一条慢速河流' },
              { type: 'diary', id: 1401, title: '雨天的旧书店' },
            ],
          },
          {
            id: 602,
            fileName: '说明文档.pdf',
            format: 'pdf',
            size: 409600,
            url: '/api/file/602/download',
            subsetId: 2,
            createdAt: '2026-10-31T08:00:00.000Z',
            source: 'file',
          },
        ],
      })
      return
    }

    if (method === 'GET' && path === '/api/file/summary') {
      await fulfill({
        all: 2,
        uncategorized: 0,
        subsets: [
          { id: 2, name: '图片', classify: 'resource', sort: 100, moment: '2026-10-20', value: 1 },
          { id: 3, name: '内容图片', classify: 'resource', sort: 95, moment: '2026-10-20', value: 1 },
        ],
      })
      return
    }

    // 素材库图片：文章/图库/随笔的「从素材库选择」用它拉列表
    if (method === 'GET' && path === '/api/file/images') {
      await fulfill({
        total: 2,
        page: 1,
        pageSize: 12,
        totalPage: 1,
        list: [
          {
            id: 501,
            fileName: '素材-日落.jpg',
            format: 'jpg',
            size: 204800,
            url: '/api/file/501/raw',
            thumbUrl: '/api/file/501/raw?w=320&format=webp',
            subsetId: 3,
            subsetName: '摄影',
            createdAt: '2026-10-30T08:00:00.000Z',
          },
          {
            id: 502,
            fileName: '素材-夜色.png',
            format: 'png',
            size: 409600,
            url: '/api/file/502/raw',
            thumbUrl: '/api/file/502/raw?w=320&format=webp',
            subsetId: 3,
            subsetName: '摄影',
            createdAt: '2026-10-29T08:00:00.000Z',
          },
        ],
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
      const source = classify === 'image'
        ? state.galleries.map(item => {
            const workflow = state.workflows[item.id]
            return {
              ...item,
              hasUnpublishedChanges: Boolean(workflow?.hasUnpublishedChanges),
              scheduledAt: workflow?.scheduledAt ?? null,
            }
          })
        : state.articles.map(item => {
            const workflow = state.workflows[item.id]
            return {
              ...item,
              hasUnpublishedChanges: Boolean(workflow?.hasUnpublishedChanges),
              scheduledAt: workflow?.scheduledAt ?? null,
            }
          })
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

    if (method === 'GET' && path === '/api/article/scheduled') {
      const classify = url.searchParams.get('classify')
      const requestedPage = Math.max(1, Number(url.searchParams.get('page') || 1))
      const requestedPageSize = Math.max(1, Number(url.searchParams.get('pageSize') || 20))
      const scheduled = Object.values(state.workflows)
        .filter(workflow => Boolean(workflow.scheduledAt))
        .map(workflow => {
          const target =
            state.articles.find(item => item.id === workflow.articleId) ||
            state.galleries.find(item => item.id === workflow.articleId)
          if (!target) return null
          return {
            id: target.id,
            userId: target.userId,
            ownerName: target.userId === owner.id ? owner.name : '未知作者',
            title: workflow.workingCopy.title || target.title,
            classify: workflow.classify,
            state: workflow.state,
            scheduledAt: workflow.scheduledAt as string,
            hasUnpublishedChanges: workflow.hasUnpublishedChanges,
            draftSavedAt: workflow.hasUnpublishedChanges ? workflow.savedAt : null,
            updatedAt: target.updatedAt,
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter(item => !classify || item.classify === classify)
        .sort((left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
        )

      const now = Date.now()
      const total = scheduled.length
      const start = (requestedPage - 1) * requestedPageSize
      await fulfill({
        list: scheduled.slice(start, start + requestedPageSize),
        total,
        page: requestedPage,
        pageSize: requestedPageSize,
        totalPage: Math.ceil(total / requestedPageSize),
        summary: {
          total,
          upcoming: scheduled.filter(item => new Date(item.scheduledAt).getTime() > now).length,
          overdue: scheduled.filter(item => new Date(item.scheduledAt).getTime() <= now).length,
        },
      })
      return
    }

    // 后台文章详情（编辑页据此判断状态与归属）
    const articleDetailMatch = path.match(/^\/api\/article\/(\d+)$/)
    if (method === 'GET' && articleDetailMatch) {
      const id = Number(articleDetailMatch[1])
      const target =
        state.articles.find(item => item.id === id) ||
        state.galleries.find(item => item.id === id)
      if (!target) {
        await fulfill({}, { code: 404, message: '文章不存在或无权限访问', status: 404 })
        return
      }
      await fulfill({ ...target })
      return
    }

    if (method === 'PATCH' && /^\/api\/article\/\d+\/status$/.test(path)) {
      const id = Number(path.split('/')[3])
      const nextState = String(body?.state || 'draft')
      const target = state.articles.find(item => item.id === id)
      if (target) target.state = nextState
      const gallery = state.galleries.find(item => item.id === id)
      if (gallery) gallery.state = nextState
      await fulfill({ id, state: nextState })
      return
    }

    // ─── 内容创作工作流：自动保存 / 预览 / 版本 / 定时发布 ─────────────
    const workflowMatch = path.match(/^\/api\/article\/(\d+)\/workflow$/)
    if (method === 'GET' && workflowMatch) {
      const id = Number(workflowMatch[1])
      const target =
        state.articles.find(item => item.id === id) ||
        state.galleries.find(item => item.id === id)
      if (!target) {
        await fulfill({}, { code: 404, message: '文章不存在或已删除', status: 404 })
        return
      }
      const existing = state.workflows[id]
      if (existing) {
        await fulfill(existing)
        return
      }
      const created: WorkflowMock = {
        articleId: id,
        classify: target.classify,
        state: target.state === 'published' ? 'published' : 'draft',
        revision: 0,
        savedAt: target.updatedAt,
        scheduledAt: null,
        publishedAt: target.publishedAt,
        hasUnpublishedChanges: false,
        workingCopy: {
          title: target.title,
          subsetId: target.subsetId,
          classify: target.classify,
          label: target.label ?? '',
          introduce: target.introduce ?? '',
          content: target.content ?? '',
          cover: target.cover ?? '',
          state: target.state === 'published' ? 'published' : 'draft',
        },
      }
      state.workflows[id] = created
      await fulfill(created)
      return
    }

    const draftMatch = path.match(/^\/api\/article\/(\d+)\/workflow\/draft$/)
    if (method === 'POST' && draftMatch) {
      const id = Number(draftMatch[1])
      const workflow = state.workflows[id]
      if (!workflow) {
        await fulfill({}, { code: 404, message: '文章不存在或已删除', status: 404 })
        return
      }
      const requestedRevision = Number(body?.revision)
      if (
        Number.isSafeInteger(requestedRevision) &&
        requestedRevision >= 0 &&
        requestedRevision !== workflow.revision
      ) {
        await fulfill(
          { revision: workflow.revision },
          {
            code: 409,
            message: '工作稿已在其他窗口更新，请刷新后继续编辑',
            status: 409,
          }
        )
        return
      }

      workflow.revision += 1
      workflow.savedAt = new Date().toISOString()
      workflow.hasUnpublishedChanges = workflow.state === 'published'
      workflow.workingCopy = {
        title: String(body?.title ?? workflow.workingCopy.title),
        subsetId: body?.subsetId === null || body?.subsetId === undefined
          ? null
          : Number(body.subsetId),
        classify: workflow.classify,
        label: String(body?.label ?? ''),
        introduce: String(body?.introduce ?? ''),
        content: String(body?.content ?? ''),
        cover: String(body?.cover ?? ''),
        state: workflow.state,
      }
      state.versions.unshift({
        id: state.versions.length + 1,
        articleId: id,
        revision: workflow.revision,
        title: workflow.workingCopy.title,
        subsetId: workflow.workingCopy.subsetId,
        classify: workflow.classify,
        label: workflow.workingCopy.label,
        introduce: workflow.workingCopy.introduce,
        cover: workflow.workingCopy.cover,
        state: workflow.state,
        source: body?.source === 'manual' ? 'manual' : 'autosave',
        createdBy: 1,
        createdAt: workflow.savedAt,
        contentLength: workflow.workingCopy.content.length,
        mediaCount:
          workflow.classify === 'image'
            ? (() => {
                try {
                  const parsed = JSON.parse(workflow.workingCopy.content)
                  return Array.isArray(parsed) ? parsed.length : 0
                } catch {
                  return 0
                }
              })()
            : undefined,
        content: workflow.workingCopy.content,
      })
      await fulfill({
        articleId: id,
        revision: workflow.revision,
        savedAt: workflow.savedAt,
        hasUnpublishedChanges: workflow.hasUnpublishedChanges,
      })
      return
    }

    const publishMatch = path.match(/^\/api\/article\/(\d+)\/workflow\/publish$/)
    if (method === 'POST' && publishMatch) {
      const id = Number(publishMatch[1])
      const workflow = state.workflows[id]
      if (!workflow) {
        await fulfill({}, { code: 404, message: '文章不存在或已删除', status: 404 })
        return
      }
      workflow.state = 'published'
      workflow.hasUnpublishedChanges = false
      workflow.scheduledAt = null
      workflow.publishedAt = new Date().toISOString()
      workflow.revision += 1
      const target = state.articles.find(item => item.id === id)
      if (target) {
        target.state = 'published'
        target.title = workflow.workingCopy.title
        target.introduce = workflow.workingCopy.introduce
        target.content = workflow.workingCopy.content
      }
      const gallery = state.galleries.find(item => item.id === id)
      if (gallery) {
        gallery.state = 'published'
        gallery.title = workflow.workingCopy.title
        gallery.introduce = workflow.workingCopy.introduce
        gallery.content = workflow.workingCopy.content
      }
      await fulfill({ articleId: id, state: 'published', revision: workflow.revision })
      return
    }

    const scheduleMatch = path.match(/^\/api\/article\/(\d+)\/workflow\/schedule$/)
    if (method === 'POST' && scheduleMatch) {
      const id = Number(scheduleMatch[1])
      const workflow = state.workflows[id]
      if (!workflow) {
        await fulfill({}, { code: 404, message: '文章不存在或已删除', status: 404 })
        return
      }
      workflow.scheduledAt = String(body?.scheduledAt || '')
      await fulfill({ articleId: id, scheduledAt: workflow.scheduledAt })
      return
    }

    if (method === 'DELETE' && scheduleMatch) {
      const id = Number(scheduleMatch[1])
      const workflow = state.workflows[id]
      if (workflow) workflow.scheduledAt = null
      await fulfill({ articleId: id })
      return
    }

    const versionListMatch = path.match(/^\/api\/article\/(\d+)\/versions$/)
    if (method === 'GET' && versionListMatch) {
      const id = Number(versionListMatch[1])
      const list = state.versions.filter(item => item.articleId === id)
      await fulfill({
        list: list.map(({ content, ...rest }) => rest),
        total: list.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 10),
        totalPage: Math.max(1, Math.ceil(list.length / 10)),
      })
      return
    }

    const versionDetailMatch = path.match(/^\/api\/article\/(\d+)\/versions\/(\d+)$/)
    if (method === 'GET' && versionDetailMatch) {
      const versionId = Number(versionDetailMatch[2])
      const version = state.versions.find(item => item.id === versionId)
      if (!version) {
        await fulfill({}, { code: 404, message: '版本不存在', status: 404 })
        return
      }
      await fulfill(version)
      return
    }

    const versionRestoreMatch = path.match(
      /^\/api\/article\/(\d+)\/versions\/(\d+)\/restore$/
    )
    if (method === 'POST' && versionRestoreMatch) {
      const id = Number(versionRestoreMatch[1])
      const versionId = Number(versionRestoreMatch[2])
      const workflow = state.workflows[id]
      const version = state.versions.find(item => item.id === versionId)
      if (!workflow || !version) {
        await fulfill({}, { code: 404, message: '版本不存在', status: 404 })
        return
      }
      workflow.revision += 1
      workflow.workingCopy = {
        title: version.title,
        subsetId: version.subsetId,
        classify: workflow.classify,
        label: version.label ?? '',
        introduce: version.introduce ?? '',
        content: version.content ?? '',
        cover: version.cover ?? '',
        state: workflow.state,
      }
      await fulfill({ articleId: id, revision: workflow.revision, restoredFrom: version.revision })
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
