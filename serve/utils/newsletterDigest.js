const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')
const newsletterModel = require('../model/dbModel/newsletter/index')
const config = require('../config/default')
const { sendAlertMail } = require('./mailer')
const { writeSystemLog } = require('./logHelper')
const { buildVectors, cosine } = require('./textSimilarity')

const SITE_NAME = '林知雨 · 个人刊物'
const DEFAULT_LOOKBACK_DAYS = 7
const DEFAULT_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000
const MAX_ITEMS = 8
// 两篇内容相似度超过该阈值即归入同一主题；阈值偏保守，避免把不相关内容硬凑成一组
const GROUP_THRESHOLD = 0.12
const MAX_GROUPS = 4

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function excerpt(value, maxLength = 120) {
    const text = String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    if (text.length <= maxLength) return text
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function itemUrl(origin, kind, id) {
    const path = kind === 'gallery'
        ? '/portal/gallery'
        : kind === 'diary'
            ? '/portal/diary'
            : '/portal/articles'
    const url = new URL(path, origin)
    url.searchParams.set('open', String(id))
    return url.toString()
}

function unsubscribeUrl(origin, token) {
    const url = new URL('/api/newsletter/unsubscribe', origin)
    url.searchParams.set('token', token)
    return url.toString()
}

/**
 * 把最近发布的内容整理成摘要。
 * 只收已发布文章与公开随笔，空结果不发送，避免给订阅者制造噪音。
 */
function buildDigest({ origin, articles = [], diaries = [], since }) {
    const items = [
        ...articles.map(article => ({
            id: article.id,
            kind: article.classify === 'image' ? 'gallery' : 'article',
            title: article.title,
            description: excerpt(article.introduce),
            publishedAt: article.publishedAt || article.createdAt,
        })),
        ...diaries.map(diary => ({
            id: diary.id,
            kind: 'diary',
            title: diary.title,
            description: excerpt(diary.content),
            publishedAt: diary.createdAt,
        })),
    ]
        .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0))
        .slice(0, MAX_ITEMS)
        .map(item => ({
            title: item.title,
            kindLabel: item.kind === 'gallery' ? '摄影' : item.kind === 'diary' ? '随笔' : '文章',
            url: itemUrl(origin, item.kind, item.id),
            description: item.description,
        }))

    // 主题分组：把讲的是一件事的内容聚到一起，没凑够两篇的单独成组
    const groups = groupDigestItems(items)
    return {
        title: `最近更新 · ${SITE_NAME}`,
        since,
        intro: since
            ? `这是 ${new Date(since).toLocaleDateString('zh-CN')} 以来的更新清单。`
            : '这是订阅后的第一期更新清单。',
        items,
        groups,
        grouped: groups.length > 1,
    }
}

/**
 * 按内容相似度做单链聚类（greedy single-link clustering）：
 * 新条目与已有组内任一条相似度超过阈值就并入该组，否则自成一組。
 * 顺序沿用摘要的发布时间倒序，保证分组结果稳定、可复现。
 */
function groupDigestItems(items) {
    if (items.length === 0) return []
    const vectors = buildVectors(items)
    const groups = []

    items.forEach((item, index) => {
        let bestGroup = null
        let bestScore = 0
        groups.forEach(group => {
            const score = Math.max(...group.members.map(member => cosine(vectors[index], vectors[member])))
            if (score > bestScore) {
                bestScore = score
                bestGroup = group
            }
        })

        if (bestGroup && bestScore >= GROUP_THRESHOLD) {
            bestGroup.members.push(index)
            return
        }
        groups.push({ members: [index] })
    })

    // 组内保持时间顺序；组之间按首篇在摘要中的位置排序，组内条目多的不因此前移
    return groups
        .map(group => ({
            items: group.members.map(index => items[index]),
            firstIndex: group.members[0],
        }))
        .sort((a, b) => a.firstIndex - b.firstIndex)
        .slice(0, MAX_GROUPS)
        .map((group, index) => ({
            id: index + 1,
            label: groupThemeLabel(group.items),
            items: group.items,
        }))
}

/**
 * 主题名取组内首篇内容的最短标题片段：
 * 优先沿用第一篇的标题（通常是最新一篇），过长时截断，保证邮件里可读。
 */
function groupThemeLabel(items) {
    const first = items[0]
    const title = String(first?.title || '未命名').trim()
    return title.length > 18 ? `${title.slice(0, 17)}…` : title
}

function renderDigestText(digest, unsubUrl) {
    const lines = [digest.title, '', digest.intro]
    for (const group of digest.groups || []) {
        if (digest.grouped) lines.push('', `## ${group.label}`)
        for (const item of group.items) {
            lines.push('', `【${item.kindLabel}】${item.title}`, item.url)
            if (item.description) lines.push(item.description)
        }
    }
    lines.push('', '不想再收到时，打开下面的退订链接：', unsubUrl)
    return lines.join('\n')
}

function renderDigestHtml(digest, unsubUrl) {
    const renderItem = item => `
        <li style="margin:0 0 20px">
            <div style="font-size:12px;color:#888;letter-spacing:.12em">${escapeHtml(item.kindLabel)}</div>
            <a href="${escapeHtml(item.url)}" style="color:#1f2937;font-size:17px;font-weight:600;text-decoration:none">${escapeHtml(item.title)}</a>
            <p style="margin:6px 0 0;color:#555;line-height:1.7">${escapeHtml(item.description)}</p>
        </li>
    `

    const groups = digest.groups?.length
        ? digest.groups
        : [{ label: '', items: digest.items }]
    const body = groups.map(group => `
        ${digest.grouped
            ? `<h3 style="margin:28px 0 12px;padding-left:10px;border-left:3px solid #1fb4a2;font-size:15px">${escapeHtml(group.label)}</h3>`
            : ''}
        <ul style="padding:0;list-style:none">${group.items.map(renderItem).join('')}</ul>
    `).join('')

    return `
        <div style="max-width:620px;margin:0 auto;padding:32px 24px;font-family:Arial,sans-serif;color:#222;line-height:1.7">
            <h2 style="margin:0 0 8px">${escapeHtml(digest.title)}</h2>
            <p style="margin:0 0 24px;color:#666">${escapeHtml(digest.intro)}</p>
            ${body}
            <p style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:12px">
                你收到这封邮件，是因为确认订阅了 ${escapeHtml(SITE_NAME)}。
                <a href="${escapeHtml(unsubUrl)}" style="color:#888">退订</a>
            </p>
        </div>
    `
}

async function collectDigestContent({ since, origin }) {
    const [articles, diaries] = await Promise.all([
        articleModel.listPublishedContentForFeed(500),
        diaryModel.listPublicDiariesForFeed(500),
    ])
    const sinceTime = new Date(since).getTime()
    const inWindow = value => {
        const time = new Date(value || 0).getTime()
        return Number.isFinite(time) && time >= sinceTime
    }
    return buildDigest({
        origin,
        since,
        articles: articles.filter(item => inWindow(item.publishedAt || item.createdAt)),
        diaries: diaries.filter(item => inWindow(item.createdAt)),
    })
}

/**
 * 发送一期摘要。只有配置了 SMTP、确有收件人且确有新内容时才发信。
 * 本任务按「已确认 + 本期未发送」筛选收件人，失败者不更新 last_digest_at，
 * 下一轮可以自然重试。邮件使用密送，避免订阅者互相看到地址。
 */
async function sendDigestOnce({
    origin,
    since = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    dryRun = false,
    sendMail = sendAlertMail,
} = {}) {
    const digest = await collectDigestContent({ since, origin })
    if (digest.items.length === 0) {
        return { sent: 0, skipped: 0, reason: 'no_updates', digest }
    }

    const recipients = await newsletterModel.listDigestRecipients({ since, limit: 500 })
    if (recipients.length === 0) {
        return { sent: 0, skipped: 0, reason: 'no_recipients', digest }
    }
    if (dryRun) {
        return { sent: 0, skipped: recipients.length, dryRun: true, digest }
    }

    let sent = 0
    const sentIds = []
    for (const recipient of recipients) {
        try {
            const token = await newsletterModel.createUnsubscribeToken(recipient.id)
            if (!token) continue
            const unsubscribe = unsubscribeUrl(origin, token)
            const delivery = await sendMail({
                to: recipient.email,
                subject: digest.title,
                text: renderDigestText(digest, unsubscribe),
                html: renderDigestHtml(digest, unsubscribe),
            })
            // SMTP 未配置时 sendAlertMail 会静默降级，这里不能把“未发送”记成成功
            if (delivery?.delivered === false) {
                console.warn(`[Newsletter] 摘要未发送（${recipient.id}）：${delivery.reason || 'unknown'}`)
                continue
            }
            sentIds.push(recipient.id)
            sent += 1
        } catch (err) {
            console.warn(`[Newsletter] 摘要发送失败（${recipient.id}）：`, err.message)
        }
    }

    if (sentIds.length > 0) {
        await newsletterModel.markDigestSent(sentIds)
        writeSystemLog({
            userId: null,
            action: 'system',
            module: 'newsletter',
            targetType: 'newsletter',
            targetId: null,
            detail: `已发送本期摘要给 ${sent} 位订阅者（${digest.items.length} 条内容，${digest.groups.length} 个主题）`,
        })
    }
    return { sent, skipped: recipients.length - sent, digest }
}

// 每 12 小时最多发一期；由环境变量控制，默认开启但只在 SMTP 就绪时实际发信
function startNewsletterDigest({
    intervalMs = DEFAULT_CHECK_INTERVAL_MS,
    runOnceAtStart = false,
    origin = '',
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    enabled,
    sendMail = sendAlertMail,
    sendDigest = sendDigestOnce,
} = {}) {
    let timer = null
    let running = false
    let stopped = false
    const isEnabled = enabled === undefined
        ? Boolean(config.smtp.host) && process.env.LINBLOG_NEWSLETTER_DIGEST !== 'off'
        : enabled

    const tick = async () => {
        if (!isEnabled || running || stopped) return
        running = true
        try {
            // 已收到过本期摘要的地址跳过；没有任何人需要接收时不扫描内容
            const windowStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
            const recipients = await newsletterModel.listDigestRecipients({
                since: windowStart,
                limit: 1,
            })
            if (recipients.length === 0) return
            await sendDigest({ origin, since: windowStart, sendMail })
        } catch (err) {
            console.warn('[Newsletter] 摘要任务失败：', err.message)
        } finally {
            running = false
        }
    }

    if (isEnabled) {
        timer = setInterval(() => void tick(), intervalMs)
        timer.unref?.()
        if (runOnceAtStart) void tick()
    }

    return {
        stop() {
            stopped = true
            if (timer) clearInterval(timer)
            timer = null
        },
        runOnce: tick,
    }
}

module.exports = {
    buildDigest,
    renderDigestText,
    renderDigestHtml,
    groupDigestItems,
    collectDigestContent,
    sendDigestOnce,
    startNewsletterDigest,
    DEFAULT_LOOKBACK_DAYS,
}
