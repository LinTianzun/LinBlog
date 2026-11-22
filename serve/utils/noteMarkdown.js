// 数字花园笔记使用 Markdown 存储，但这里不引入完整解析器：
// 编辑器负责把 Markdown 转成正文，服务端只负责标题清理、双链索引与纯文本摘要。

const WIKI_LINK_PATTERN = /\[\[([^\[\]\n]{1,150})\]\]/g
const INLINE_LINK_PATTERN = /\[[^\]\n]*\]\(note:\/\/(\d+)\)/g
const TAG_PATTERN = /(^|[\s（(【])#([\p{L}\p{N}_-]{1,24})/gu

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function stripMarkdown(value) {
    return String(value || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(WIKI_LINK_PATTERN, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s{0,3}[-*+]\s+/gm, '')
        .replace(/^\s{0,3}\d+\.\s+/gm, '')
        .replace(/[*_~]{1,3}/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function excerptMarkdown(value, maxLength = 180) {
    const text = stripMarkdown(value)
    if (!text) return ''
    if (text.length <= maxLength) return text
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeLinkTitle(value) {
    return stripMarkdown(String(value || ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 150)
}

/**
 * 提取笔记正文里的 #标签，供图谱与花园索引分面使用。
 * 代码块与行内代码里只是示例，不参与统计。
 */
function extractNoteTags(markdown) {
    const text = String(markdown || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]*`/g, ' ')
    const tags = new Set()
    for (const match of text.matchAll(TAG_PATTERN)) {
        const tag = match[2].toLowerCase()
        if (tag) tags.add(tag)
    }
    return [...tags]
}

/**
 * 从正文提取双链。
 * 语法：
 * - [[笔记标题]]：按标题匹配
 * - [文字](note://12)：按 ID 引用（允许标题被改写）
 */
function extractNoteLinks(markdown) {
    const byTitle = new Set()
    const byId = new Set()
    // 代码块与行内代码里的 [[...]] 只是示例，不参与双链索引
    const text = String(markdown || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]*`/g, ' ')

    for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
        const title = normalizeLinkTitle(match[1])
        if (title) byTitle.add(title)
    }
    for (const match of text.matchAll(INLINE_LINK_PATTERN)) {
        const id = Number(match[1])
        if (Number.isSafeInteger(id) && id > 0) byId.add(id)
    }

    return { titles: [...byTitle], ids: [...byId] }
}

function renderInlineMarkdown(value, { resolveTitle } = {}) {
    // 先转义 HTML，再恢复受控语法，避免直接回显用户 HTML
    let html = escapeHtml(value)
    html = html
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => (
            /^(https?:\/\/|\/)/.test(url)
                ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />`
                : '')
        )
        .replace(/\[\[([^\[\]\n]{1,150})\]\]/g, (_, title) => {
            const label = String(title).trim()
            const resolved = typeof resolveTitle === 'function' ? resolveTitle(label) : null
            return resolved?.id
                ? `<a class="note-link" href="/portal/notes?open=${resolved.id}" data-note-id="${resolved.id}">${escapeHtml(label)}</a>`
                : `<span class="note-link-missing" title="这篇笔记还没有公开或尚未创建">${escapeHtml(label)}</span>`
        })
        .replace(/\[([^\]]+)\]\((note:\/\/\d+|https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (_, label, url) => {
            const href = url.startsWith('note://')
                ? `/portal/notes?open=${url.slice('note://'.length)}`
                : url
            // note:// 显式引用也带上目标 ID，门户详情里可以直接切换笔记
            const noteAttr = url.startsWith('note://')
                ? ` data-note-id="${url.slice('note://'.length)}"`
                : ''
            return `<a href="${escapeHtml(href)}"${noteAttr}${href.startsWith('/') ? '' : ' rel="noopener"'}>${escapeHtml(label)}</a>`
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(TAG_PATTERN, (_, prefix, tag) => (
            `${prefix}<span class="note-tag">#${tag}</span>`
        ))
    return html
}

/**
 * 轻量 Markdown 渲染：覆盖数字花园常用的段落、标题、列表、引用、代码块与分隔线。
 * 输出会先做 HTML 转义，再由受控的 inline 规则恢复有限的富文本。
 */
function renderMarkdown(markdown, { resolveTitle } = {}) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
    const html = []
    let listType = ''
    let inCode = false
    let codeLines = []
    let paragraph = []

    const closeList = () => {
        if (listType) {
            html.push(`</${listType}>`)
            listType = ''
        }
    }
    const flushParagraph = () => {
        if (paragraph.length === 0) return
        html.push(`<p>${renderInlineMarkdown(paragraph.join(' '), { resolveTitle })}</p>`)
        paragraph = []
    }
    const openList = (type) => {
        closeList()
        html.push(`<${type}>`)
        listType = type
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (/^```/.test(line)) {
            if (inCode) {
                html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
                codeLines = []
                inCode = false
            } else {
                flushParagraph()
                closeList()
                inCode = true
            }
            continue
        }
        if (inCode) {
            codeLines.push(rawLine)
            continue
        }
        if (!line.trim()) {
            flushParagraph()
            closeList()
            continue
        }
        if (/^\s{0,3}---+$/.test(line)) {
            flushParagraph()
            closeList()
            html.push('<hr />')
            continue
        }
        const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+)$/)
        if (heading) {
            flushParagraph()
            closeList()
            const level = heading[1].length
            html.push(`<h${level}>${renderInlineMarkdown(heading[2], { resolveTitle })}</h${level}>`)
            continue
        }
        const quote = line.match(/^\s{0,3}>\s?(.+)$/)
        if (quote) {
            flushParagraph()
            closeList()
            html.push(`<blockquote>${renderInlineMarkdown(quote[1], { resolveTitle })}</blockquote>`)
            continue
        }
        const ordered = line.match(/^\s{0,3}(\d+)\.\s+(.+)$/)
        if (ordered) {
            flushParagraph()
            if (listType !== 'ol') openList('ol')
            html.push(`<li value="${Number(ordered[1]) || 1}">${renderInlineMarkdown(ordered[2], { resolveTitle })}</li>`)
            continue
        }
        const bullet = line.match(/^\s{0,3}[-*+]\s+(.+)$/)
        if (bullet) {
            flushParagraph()
            if (listType !== 'ul') openList('ul')
            html.push(`<li>${renderInlineMarkdown(bullet[1], { resolveTitle })}</li>`)
            continue
        }
        if (/^\s{4,}\S/.test(rawLine)) {
            flushParagraph()
            closeList()
            html.push(`<pre><code>${escapeHtml(rawLine.slice(4))}</code></pre>`)
            continue
        }
        paragraph.push(line.trim())
    }

    if (inCode && codeLines.length > 0) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
    }
    flushParagraph()
    closeList()
    return html.join('\n')
}

module.exports = {
    escapeHtml,
    stripMarkdown,
    excerptMarkdown,
    extractNoteLinks,
    extractNoteTags,
    renderMarkdown,
    renderInlineMarkdown,
    normalizeLinkTitle,
}
