const noteModel = require('../model/dbModel/note/index')
const { writeSystemLog } = require('../utils/logHelper')
const {
    renderMarkdown,
    excerptMarkdown,
    extractNoteTags,
    extractNoteLinks,
    normalizeLinkTitle,
} = require('../utils/noteMarkdown')
const { buildTidyReport } = require('../utils/gardenTidy')
const { groupBacklinks, groupOutgoing, groupUpgrades, hasArticleLink } = require('../utils/noteLinkIndex')

const TITLE_MAX = 150
const CONTENT_MAX = 200_000
const STATE_LABELS = { draft: '草稿', published: '已公开' }

function validateNoteInput(body = {}, { partial = false } = {}) {
    const result = {}
    if (body.title !== undefined || !partial) {
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (!title) return { error: '笔记标题不能为空' }
        if (title.length > TITLE_MAX) return { error: `笔记标题不能超过 ${TITLE_MAX} 字` }
        result.title = title
    }
    if (body.content !== undefined || !partial) {
        if (typeof body.content !== 'string') return { error: '笔记正文必须是字符串' }
        if (body.content.length > CONTENT_MAX) return { error: '笔记正文过长，请拆分成多篇笔记' }
        result.content = body.content
    }
    if (body.state !== undefined) {
        if (!['draft', 'published'].includes(body.state)) {
            return { error: 'state 仅支持 draft / published' }
        }
        result.state = body.state
    }
    if (!partial && Object.keys(result).length === 0) {
        return { error: '请填写笔记标题与正文' }
    }
    return { data: result }
}

// 私人笔记列表：按当前登录用户隔离，与公开花园分开
async function getNotes(req, res) {
    try {
        const { page = 1, pageSize = 20, state, keyword } = req.query
        const data = await noteModel.listNotesForOwner({
            userId: req.user.userId,
            page,
            pageSize,
            state,
            keyword,
        })
        res.json({ code: 200, message: '查询成功', data })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记查询失败：' + err.message })
    }
}

async function getNoteById(req, res) {
    try {
        const id = noteModel.parseId(req.params.id)
        if (!id) return res.status(400).json({ code: 400, message: '笔记ID无效' })
        const note = await noteModel.findOwnedNote(id, req.user.userId)
        if (!note) return res.status(404).json({ code: 404, message: '笔记不存在或无权访问' })
        res.json({ code: 200, message: '查询成功', data: note })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记查询失败：' + err.message })
    }
}

async function createNote(req, res) {
    try {
        const check = validateNoteInput(req.body)
        if (check.error) return res.status(400).json({ code: 400, message: check.error })

        const result = await noteModel.createNote({
            ...check.data,
            userId: req.user.userId,
        })
        writeSystemLog({
            userId: req.user.userId,
            action: 'create',
            module: 'note',
            targetType: 'note',
            targetId: result.noteId,
            detail: `创建笔记「${check.data.title}」`,
            ip: req.ip || null,
        })
        res.status(201).json({ code: 200, message: '笔记已保存', data: result })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记创建失败：' + err.message })
    }
}

async function updateNote(req, res) {
    try {
        const id = noteModel.parseId(req.params.id)
        if (!id) return res.status(400).json({ code: 400, message: '笔记ID无效' })
        const check = validateNoteInput(req.body, { partial: true })
        if (check.error) return res.status(400).json({ code: 400, message: check.error })
        if (Object.keys(check.data).length === 0) {
            return res.status(400).json({ code: 400, message: '请至少提交一个更新字段' })
        }

        const result = await noteModel.updateNote(id, {
            ...check.data,
            userId: req.user.userId,
        })
        if (!result.found) return res.status(404).json({ code: 404, message: '笔记不存在或无权修改' })

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'note',
            targetType: 'note',
            targetId: id,
            detail: `更新笔记（${STATE_LABELS[result.state] || result.state}）`,
            ip: req.ip || null,
        })
        res.json({ code: 200, message: '笔记已更新', data: result })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记更新失败：' + err.message })
    }
}

async function deleteNote(req, res) {
    try {
        const id = noteModel.parseId(req.params.id)
        if (!id) return res.status(400).json({ code: 400, message: '笔记ID无效' })
        const deleted = await noteModel.deleteNote(id, req.user.userId)
        if (!deleted) return res.status(404).json({ code: 404, message: '笔记不存在或无权删除' })
        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'note',
            targetType: 'note',
            targetId: id,
            detail: '删除笔记（双链随之解除）',
            ip: req.ip || null,
        })
        res.json({ code: 200, message: '笔记已删除' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记删除失败：' + err.message })
    }
}

async function getNoteSummary(req, res) {
    try {
        const data = await noteModel.countNotesByState(req.user.userId)
        res.json({ code: 200, message: '查询成功', data })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记统计失败：' + err.message })
    }
}

/**
 * 公开花园：一次返回索引与正文渲染结果，前端点击即可在本地切换，
 * 不额外暴露私人草稿。双链未命中时显示为灰色残缺链接。
 */
async function getPublicGarden(_req, res) {
    try {
        const notes = await noteModel.listPublicNotes()
        const list = await Promise.all(notes.map(async note => {
            const links = await noteModel.resolvePublicLinks(note.id, note.content)
            const { titles } = extractNoteLinks(note.content)
            return {
                id: Number(note.id),
                title: note.title,
                slug: note.slug,
                excerpt: note.excerpt || excerptMarkdown(note.content, 140),
                tags: extractNoteTags(note.content),
                publishedAt: note.publishedAt,
                updatedAt: note.updatedAt,
                outgoingLinks: Number(note.outgoingLinks || 0),
                incomingLinks: Number(note.incomingLinks || 0),
                missingLinks: titles.length - Object.keys(links.titles).length,
                html: renderMarkdown(note.content, {
                    resolveTitle: title => links.titles[normalizeLinkTitle(title)] || null,
                }),
            }
        }))
        // 反向链接聚合：索引里每条笔记带上指向它的标题，门户卡片与详情共用，
        // 打开详情时无需再等一次请求
        const inbound = await noteModel.listBacklinksAggregated(list.map(note => note.id))
        const byTarget = groupBacklinks(inbound)
        const outbound = await noteModel.listOutgoingLinksAggregated(list.map(note => note.id))
        const bySource = groupOutgoing(outbound)
        for (const note of list) {
            note.backlinks = byTarget.get(note.id) || []
            note.outgoing = bySource.get(note.id) || []
        }

        res.set('Cache-Control', 'no-cache')
        res.json({
            code: 200,
            message: list.length > 0 ? '查询成功' : '花园里还没有公开笔记',
            data: {
                total: list.length,
                list,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '花园加载失败：' + err.message })
    }
}

async function getPublicNote(req, res) {
    try {
        const id = noteModel.parseId(req.params.id)
        if (!id) return res.status(400).json({ code: 400, message: '笔记ID无效' })
        const note = await noteModel.findPublicNoteById(id)
        if (!note) return res.status(404).json({ code: 404, message: '这篇笔记还没有公开' })

        const links = await noteModel.resolvePublicLinks(note.id, note.content)
        const backlinks = await noteModel.listBacklinks(note.id)
        const outgoing = await noteModel.listOutgoingLinks(note.id)
        res.json({
            code: 200,
            message: '查询成功',
            data: {
                id: Number(note.id),
                title: note.title,
                slug: note.slug,
                publishedAt: note.publishedAt,
                updatedAt: note.updatedAt,
                html: renderMarkdown(note.content, {
                    resolveTitle: title => links.titles[normalizeLinkTitle(title)] || null,
                }),
                backlinks: backlinks.map(item => ({
                    id: Number(item.id),
                    title: item.title,
                    slug: item.slug,
                })),
                outgoing: outgoing.map(item => ({
                    id: Number(item.id),
                    title: item.title,
                    slug: item.slug,
                })),
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '笔记查询失败：' + err.message })
    }
}

// 花园图谱：节点=已发布笔记，边=两端都公开的双链
async function getPublicGardenGraph(_req, res) {
    try {
        const [notes, edges, tags] = await Promise.all([
            noteModel.listPublicNotes(),
            noteModel.listPublicGraphEdges(),
            noteModel.listPublicGraphLabels(),
        ])
        res.set('Cache-Control', 'no-cache')
        res.json({
            code: 200,
            message: '查询成功',
            data: {
                nodes: notes.map(note => ({
                    id: Number(note.id),
                    title: note.title,
                    slug: note.slug,
                    tags: extractNoteTags(note.content),
                    publishedAt: note.publishedAt,
                    updatedAt: note.updatedAt,
                    outgoingLinks: Number(note.outgoingLinks || 0),
                    incomingLinks: Number(note.incomingLinks || 0),
                })),
                edges: edges.map(edge => ({
                    source: Number(edge.source),
                    target: Number(edge.target),
                })),
                // 标签分面：节点上带 tags，前端可据此过滤与聚焦
                tags,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '花园图谱加载失败：' + err.message })
    }
}

/**
 * 花园「待整理」：只读作者自己的笔记。
 * 列出没有任何双链的笔记与断链笔记，并给出可连接的标题建议。
 */
async function getNoteTidy(req, res) {
    try {
        const { limit } = req.query
        const notes = (await noteModel.listNotesForTidy(req.user.userId)).map(note => ({
            ...note,
            tags: extractNoteTags(note.content),
        }))
        const suggestLimit = Math.min(Math.max(Number(limit) || 3, 1), 5)
        const report = buildTidyReport(notes, { limit: suggestLimit })

        // 升级关系：文章发布后提示回原笔记补一条指向它的链接
        const upgradedRows = await noteModel.listUpgradedArticles(notes.map(note => note.id))
        const upgradedByNote = groupUpgrades(upgradedRows)
        const contentById = new Map(notes.map(note => [Number(note.id), String(note.content || '')]))
        for (const item of [...report.orphans, ...report.brokenLinks]) {
            const upgraded = upgradedByNote.get(item.id) || null
            item.upgradedArticle = upgraded
            // 正文里已经有指向这篇文章的链接时不再提示
            item.articleLinked = upgraded ? hasArticleLink(contentById.get(item.id), upgraded.id) : false
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: report,
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '待整理清单加载失败：' + err.message })
    }
}

/**
 * 单篇笔记的升级关系，供笔记编辑页在文章发布后提示补链接。
 */
async function getNoteUpgrade(req, res) {
    try {
        const id = noteModel.parseId(req.params.id)
        if (!id) return res.status(400).json({ code: 400, message: '笔记ID无效' })
        const note = await noteModel.findOwnedNote(id, req.user.userId)
        if (!note) return res.status(404).json({ code: 404, message: '笔记不存在或无权访问' })

        const rows = await noteModel.findUpgradedArticle(id)
        const article = rows[0]
            ? {
                id: Number(rows[0].id),
                title: rows[0].title,
                state: rows[0].state,
                publishedAt: rows[0].publishedAt,
            }
            : null
        res.json({
            code: 200,
            message: '查询成功',
            data: {
                article,
                articleLinked: article ? hasArticleLink(note.content, article.id) : false,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '升级关系查询失败：' + err.message })
    }
}

module.exports = {
    getNotes,
    getNoteById,
    createNote,
    updateNote,
    deleteNote,
    getNoteSummary,
    getPublicGarden,
    getPublicNote,
    getPublicGardenGraph,
    getNoteTidy,
    getNoteUpgrade,
    validateNoteInput,
}
