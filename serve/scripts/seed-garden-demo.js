/**
 * 数字花园演示数据。
 *
 * 用途：本地或演示环境里快速看到花园的真实效果——
 * 互相关联的双链、#标签、反向链接、图谱里的枢纽节点与孤立笔记。
 *
 * 运行：
 *   cd serve
 *   node --env-file=.env scripts/seed-garden-demo.js            # 写入/更新
 *   node --env-file=.env scripts/seed-garden-demo.js --dry-run  # 只打印计划
 *   node --env-file=.env scripts/seed-garden-demo.js --clean    # 删除演示数据
 *
 * 幂等：以正文末尾的 DEMO_MARKER 识别演示笔记，重复运行只会更新正文与链接。
 * 不会改动用户自己写的笔记，也不会碰博客文章/图库/随笔。
 */
const noteModel = require('../model/dbModel/note/index')
const { query, initDatabase, closeDatabase } = require('../model/db/dbnew')

const DEMO_MARKER = '<!-- garden-demo -->'

const NOTES = [
    {
        title: '什么是数字花园',
        state: 'published',
        daysAgo: 42,
        content: `数字花园不是“写完就归档”的博客，而是一块持续修剪的园地：笔记可以只写一半，先连上相关的想法，之后再慢慢补齐。

#知识管理 #写作

## 它和博客的区别

- 博客：一篇一篇，按时间排列，目标是“发布”
- 花园：一篇一篇，按链接排列，目标是“生长”

所以花园里的笔记允许不完整。真正重要的是连接：想继续往下读，可以看 [[双链怎么写]]，或者从 [[我的花园使用手册]] 开始逛。

> 一条笔记的价值，一半来自它自己，一半来自它连向谁。`,
    },
    {
        title: '双链怎么写',
        state: 'published',
        daysAgo: 40,
        content: `双链是花园的骨架。这里支持两种写法：

1. \`[[笔记标题]]\`：按标题连接，标题相同的笔记会指向同一篇
2. \`[显示文字](note://12)\`：按 ID 连接，标题改了也不会断

#知识管理 #Markdown

## 写作时的习惯

- 先写正文，最后再补链接，不要为了链接打断思路
- 一个自然段里出现另一个概念，就顺手加一条双链
- 不确定要连到哪时，可以直接写标题；等那篇笔记发布后，灰色链接会自动变成可跳转的绿色

代码块里的 \`[[示例]]\` 不会被当成链接，可以放心写文档。

继续读：[[什么是数字花园]] · [[反向链接为什么重要]]`,
    },
    {
        title: '反向链接为什么重要',
        state: 'published',
        daysAgo: 36,
        content: `正向链接告诉你“这一篇通往哪里”，反向链接告诉你“别人从哪里找到你”。

#知识管理

## 三种容易被忽略的用法

- 给旧笔记补上“后来我改主意了”的新笔记引用
- 把零散的短笔记汇总成一篇索引，反向链接会自然形成目录
- 发现某篇笔记被很多地方引用，说明它是花园的枢纽，值得写得更完整

在门户花园里打开任意一篇，底部会列出所有指向它的笔记。

相关：[[双链怎么写]] · [[花园的标签怎么用]]`,
    },
    {
        title: '花园的标签怎么用',
        state: 'published',
        daysAgo: 30,
        content: `标签和双链不是竞争关系，它们解决不同的问题。

#知识管理 #标签

## 分工

- **双链**：表达具体关系，比如“这篇是对那篇的补充”
- **标签**：表达宽泛的归属，比如“都属于 #知识管理”

## 建议

控制标签数量，优先用 5–15 个常青标签；临时标签用完就可以删掉。标签写太多，和没有标签效果差不多。

看图谱时，点顶部标签可以只聚焦同主题的笔记子图。

相关：[[反向链接为什么重要]]`,
    },
    {
        title: '我的花园使用手册',
        state: 'published',
        daysAgo: 26,
        content: `这篇是花园的入口，会随使用习惯不断更新。

#花园 #索引

## 最近在做的

- 每周日花 20 分钟修剪旧笔记的链接
- 新笔记先发布，允许它暂时是半成品
- 每季度整理一次标签

## 从这里开始

- 入门：[[什么是数字花园]] → [[双链怎么写]]
- 方法：[[反向链接为什么重要]] · [[花园的标签怎么用]]
- 具体实践：[[用花园整理技术笔记]] · [[花园与博客如何分工]]

---

这是一篇索引型笔记，不带正文观点，只负责把路径铺好。`,
    },
    {
        title: '用花园整理技术笔记',
        state: 'published',
        daysAgo: 18,
        content: `技术笔记最容易变成“收藏夹”，花园可以把它变成可检索的结构。

#技术笔记 #知识管理

## 我的做法

- 一个概念一篇，不按课程或文章分篇
- 每篇开头先写一句话结论，避免以后自己看不懂
- 踩坑记录单独成篇，再用双链挂到概念笔记下面

## 一个例子

学 Vue 响应式时，我拆成了三篇：依赖收集、触发更新、调度器。它们互相双链，之后再遇到相关问题可以直接定位。

相关：[[前端知识怎么串联]] · [[什么是数字花园]]`,
    },
    {
        title: '前端知识怎么串联',
        state: 'published',
        daysAgo: 15,
        content: `前端知识碎、更新快，单靠目录很难维持结构。我用的办法是“概念图 + 双链”。

#前端 #技术笔记

## 几个主轴

- 渲染：浏览器如何解析、布局、绘制
- 状态：框架如何追踪变化
- 构建：模块如何被打包与缓存
- 体验：性能、可访问性、交互细节

每个主轴下再挂具体笔记。主轴本身也会随理解加深而重写。

相关：[[用花园整理技术笔记]]`,
    },
    {
        title: '花园与博客如何分工',
        state: 'published',
        daysAgo: 9,
        content: `花园和博客不是二选一，我更愿意把它们当成同一个站点的两种节奏。

#花园 #写作

## 我的分法

- 花园笔记：几百字，允许残缺，随时改
- 博客文章：成篇，有完整论证，发布后少量修订
- 入口：笔记靠双链与标签，文章靠时间线、系列与 RSS

一条花园笔记被反复引用、补充到足够完整时，就可以整理成一篇博客文章，再用双链指回去。

相关：[[什么是数字花园]] · [[我的花园使用手册]]`,
    },
    {
        title: '关于花园的疑问（草稿）',
        state: 'draft',
        daysAgo: 2,
        content: `草稿示例：只有自己能看到，不会被索引到公开花园、图谱或分享卡片里。

#草稿

- 要不要给花园加订阅？
- 笔记数量变多后，图谱会不会太乱？
- 是否可以按“最近修改”做一条时间轴？

想法还没成型，先放着。`,
    },
]

function parseArgs(argv) {
    return {
        dryRun: argv.includes('--dry-run'),
        clean: argv.includes('--clean'),
    }
}

async function resolveOwnerId() {
    const rows = await query(
        `SELECT id FROM users WHERE status = 1 ORDER BY is_super_admin DESC, id ASC LIMIT 1`
    )
    if (!rows[0]) throw new Error('没有可用的用户账号，请先注册一个账号再运行演示数据脚本')
    return Number(rows[0].id)
}

async function cleanDemoNotes(userId, dryRun) {
    const rows = await query(
        `SELECT id, title FROM note WHERE user_id = ? AND content LIKE ?`,
        [userId, `%${DEMO_MARKER}%`]
    )
    if (rows.length === 0) {
        console.log('[garden-demo] 没有找到演示笔记，无需清理')
        return
    }
    for (const row of rows) {
        console.log(`[garden-demo] ${dryRun ? '将删除' : '删除'} #${row.id} ${row.title}`)
        if (!dryRun) await noteModel.deleteNote(Number(row.id), userId)
    }
}

async function upsertDemoNotes(userId, dryRun) {
    const existing = await query(
        `SELECT id, title FROM note WHERE user_id = ? AND content LIKE ?`,
        [userId, `%${DEMO_MARKER}%`]
    )
    const idByTitle = new Map(existing.map(row => [row.title, Number(row.id)]))

    // 第一轮：保证每篇都有 ID，后面才能按标题解析双链
    for (const note of NOTES) {
        const body = `${note.content}\n\n${DEMO_MARKER}`
        if (idByTitle.has(note.title)) {
            console.log(`[garden-demo] ${dryRun ? '将更新' : '更新'} ${note.title}`)
            if (!dryRun) {
                await noteModel.updateNote(idByTitle.get(note.title), {
                    title: note.title,
                    content: body,
                    state: note.state,
                    userId,
                })
            }
            continue
        }
        console.log(`[garden-demo] ${dryRun ? '将创建' : '创建'} ${note.title}（${note.state}）`)
        if (dryRun) continue
        const result = await noteModel.createNote({
            title: note.title,
            content: body,
            state: note.state,
            userId,
        })
        idByTitle.set(note.title, Number(result.noteId))
    }

    // 第二轮：错开发布时间，让图谱的“最近更新”高亮有层次
    if (!dryRun) {
        const now = Date.now()
        for (const note of NOTES) {
            const id = idByTitle.get(note.title)
            if (!id) continue
            const at = new Date(now - note.daysAgo * 24 * 60 * 60 * 1000)
            if (note.state === 'published') {
                await query(
                    `UPDATE note SET published_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
                    [at, at, id, userId]
                )
            } else {
                await query(
                    `UPDATE note SET updated_at = ? WHERE id = ? AND user_id = ?`,
                    [at, id, userId]
                )
            }
        }
    }

    // 第三轮：重建双链索引，让互引两边都能命中
    if (!dryRun) {
        for (const note of NOTES) {
            const id = idByTitle.get(note.title)
            if (!id) continue
            await noteModel.updateNote(id, {
                content: `${note.content}\n\n${DEMO_MARKER}`,
                userId,
            })
        }
    }

    const links = dryRun ? [] : await query(
        `SELECT s.title AS source, t.title AS target
           FROM note_link l
           INNER JOIN note s ON s.id = l.from_note_id
           INNER JOIN note t ON t.id = l.to_note_id
          WHERE s.user_id = ? AND t.user_id = ?
          ORDER BY s.title, t.title`,
        [userId, userId]
    )
    return { links }
}

async function main() {
    const { dryRun, clean } = parseArgs(process.argv.slice(2))
    await initDatabase()
    const userId = await resolveOwnerId()
    console.log(`[garden-demo] 目标作者 user_id=${userId}${dryRun ? '（dry-run，不写库）' : ''}`)

    if (clean) {
        await cleanDemoNotes(userId, dryRun)
        return
    }

    const { links } = await upsertDemoNotes(userId, dryRun)
    if (dryRun) return

    console.log(`\n[garden-demo] 双链索引共 ${links.length} 条：`)
    for (const link of links) console.log(`  ${link.source} → ${link.target}`)
    console.log(`\n[garden-demo] 完成：8 篇公开笔记 + 1 篇草稿`)
    console.log('[garden-demo] 打开 http://localhost:5173/portal/notes 查看列表与图谱')
}

main()
    .catch(err => {
        console.error('[garden-demo] 失败：', err.message)
        process.exitCode = 1
    })
    .finally(() => closeDatabase())
