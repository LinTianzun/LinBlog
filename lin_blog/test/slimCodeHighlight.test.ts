import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CODE_HIGHLIGHT_LANGS,
    codeElemToHtml,
    codeHighlightRanges,
    codeTokenClassName,
    parseCodeLanguage,
} from '../src/components/editor/slimCodeHighlightCore.ts'

test('裁剪后仍覆盖工具栏与历史代码块用到的语言', () => {
    const values = CODE_HIGHLIGHT_LANGS.map(item => item.value)
    assert.deepEqual(values, ['css', 'html', 'xml', 'javascript'])
    assert.equal(new Set(values).size, values.length)
})

test('代码块导出 HTML 与官方格式一致', () => {
    assert.equal(
        codeElemToHtml('css', '.a{color:#fff}'),
        '<code class="language-css">.a{color:#fff}</code>'
    )
    // 未选语言时不能生成空的 language- class
    assert.equal(codeElemToHtml('', 'plain'), '<code >plain</code>')
})

test('读取语言优先 language- 前缀，并兼容旧的整体 class', () => {
    assert.equal(parseCodeLanguage('language-css'), 'css')
    assert.equal(parseCodeLanguage('token language-html'), 'html')
    assert.equal(parseCodeLanguage('Javascript'), 'javascript')
    assert.equal(parseCodeLanguage(''), '')
})

test('CSS / HTML / JavaScript 仍能切出高亮区间', () => {
    const css = codeHighlightRanges('.a { color: #fff; }', 'css')
    assert.ok(css.length > 0, 'CSS 应产生高亮 token')

    const html = codeHighlightRanges('<div id="app">hi</div>', 'html')
    assert.ok(html.length > 0, 'HTML 应产生高亮 token')

    const js = codeHighlightRanges('const a = 100;', 'javascript')
    assert.equal(js[0].type, 'keyword')
    assert.deepEqual([js[0].start, js[0].end], [0, 'const'.length])
})

test('未收录的语言退化为空数组，只失去着色而不丢内容', () => {
    assert.deepEqual(codeHighlightRanges('print("hi")', 'python'), [])
    assert.deepEqual(codeHighlightRanges('plain text', ''), [])
})

test('高亮区间首尾覆盖整段文本，不会错位', () => {
    const text = 'const a = 100;'
    const ranges = codeHighlightRanges(text, 'javascript')
    assert.equal(ranges[ranges.length - 1].end, text.length)
    assert.ok(ranges.every(range => range.end > range.start))
})

test('token class 与官方 `token <type>` 规则一致', () => {
    assert.equal(codeTokenClassName({ keyword: true }), 'token keyword')
    assert.equal(codeTokenClassName({ text: 'x' }), '')
})
