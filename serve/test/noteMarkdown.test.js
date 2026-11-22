const assert = require('node:assert/strict')
const test = require('node:test')

const {
    renderMarkdown,
    extractNoteLinks,
    extractNoteTags,
    excerptMarkdown,
    stripMarkdown,
} = require('../utils/noteMarkdown')

test('双链提取同时支持 [[标题]] 与 note://ID，并去重', () => {
    const links = extractNoteLinks(`
# 花园入口
参考 [[速记：GPU 管线]]，再读 [[速记：GPU 管线]]。
[旧版入口](note://12) 和 [再读一次](note://12)
外部 [链接](https://example.com) 与代码 \`[[不算]]\` 也不应重复。
`)

    assert.deepEqual(links.titles, ['速记：GPU 管线'])
    assert.deepEqual(links.ids, [12])
})

test('Markdown 渲染转义 HTML，并给双链补公开地址', () => {
    const html = renderMarkdown(`# 标题 <script>

正文 **加粗** 与 \`code\`。

- 第一项 [[已发布笔记]]
- 第二项 [[还不存在的笔记]]

[直达](note://7)

> 引用 & 说明

\`\`\`js
console.log('<img>')
\`\`\`
`, {
        resolveTitle: title => (title === '已发布笔记' ? { id: 3 } : null),
    })

    assert.doesNotMatch(html, /<script>/)
    assert.match(html, /&lt;script&gt;/)
    assert.match(html, /<strong>加粗<\/strong>/)
    assert.match(html, /href="\/portal\/notes\?open=3"/)
    assert.match(html, /note-link-missing[^>]*>还不存在的笔记<\/span>/)
    assert.match(html, /href="\/portal\/notes\?open=7"/)
    assert.match(html, /<blockquote>引用 &amp; 说明<\/blockquote>/)
    assert.match(html, /console\.log\(&#39;&lt;img&gt;&#39;\)/)
    assert.doesNotMatch(html, /<img>/)
})

test('#标签只统计正文，代码块里的示例不计入，渲染成独立样式', () => {
    const markdown = [
        '# 花园 #知识管理',
        '',
        '正文里的 #双链 与 #Vue3 都算标签。',
        '',
        '```md',
        '# 这是代码里的标题',
        '```',
        '',
        '行内 `#不算` 也不计入。',
    ].join('\n')

    assert.deepEqual(extractNoteTags(markdown), ['知识管理', '双链', 'vue3'])
    const html = renderMarkdown('正文里的 #双链 与 #vue3')
    assert.match(html, /<span class="note-tag">#双链<\/span>/)
    assert.match(html, /<span class="note-tag">#vue3<\/span>/)
})

test('摘要剥离 Markdown 标记与代码块，保留可读正文', () => {
    const markdown = `
# 一篇笔记

\`\`\`js
const hidden = true
\`\`\`

正文带 [普通链接](https://example.com) 与 [[双链]]，还有 **强调**。
`
    assert.equal(excerptMarkdown(markdown, 60).includes('const hidden'), false)
    assert.match(stripMarkdown(markdown), /正文带 普通链接 与 双链，还有 强调/)
})
