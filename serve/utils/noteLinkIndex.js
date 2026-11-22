/**
 * 把 note_link 的扁平行聚合成「目标笔记 -> 入链列表」的索引。
 *
 * 门户花园索引一次请求就能拿到所有笔记的反向链接，
 * 不用为每张卡片再发一次详情请求。纯函数，便于单测。
 */
function groupBacklinks(rows) {
    const index = new Map()
    for (const row of Array.isArray(rows) ? rows : []) {
        const targetId = Number(row.toNoteId ?? row.to_note_id)
        const sourceId = Number(row.id)
        if (!Number.isSafeInteger(targetId) || targetId <= 0) continue
        if (!Number.isSafeInteger(sourceId) || sourceId <= 0) continue

        if (!index.has(targetId)) index.set(targetId, [])
        const list = index.get(targetId)
        // 同一篇笔记重复引用同一个标题时只保留一条
        if (list.some(item => item.id === sourceId)) continue
        list.push({ id: sourceId, title: String(row.title || ''), slug: row.slug || '' })
    }
    return index
}

/**
 * 出发链接同样按来源笔记分组。
 *
 * 花园索引里每张卡片都带着自己的正文快照，点开后不会再请求详情，
 * 所以出链也必须随索引一起下发，否则详情里只有反向链接。
 */
function groupOutgoing(rows) {
    const index = new Map()
    for (const row of Array.isArray(rows) ? rows : []) {
        const sourceId = Number(row.fromNoteId ?? row.from_note_id)
        const targetId = Number(row.id)
        if (!Number.isSafeInteger(sourceId) || sourceId <= 0) continue
        if (!Number.isSafeInteger(targetId) || targetId <= 0) continue
        // 自引用不构成花园路径
        if (sourceId === targetId) continue

        if (!index.has(sourceId)) index.set(sourceId, [])
        const list = index.get(sourceId)
        if (list.some(item => item.id === targetId)) continue
        list.push({ id: targetId, title: String(row.title || ''), slug: row.slug || '' })
    }
    return index
}

module.exports = { groupBacklinks, groupOutgoing }
