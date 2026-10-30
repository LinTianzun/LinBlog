/**
 * 裁剪版代码高亮的纯逻辑层：不依赖 @wangeditor/core 与 slate 运行时，
 * 因此可以直接在 node:test 里做单元测试。
 *
 * 官方 `@wangeditor/code-highlight` 预打包了 20 多种 Prism 语言定义，而本站编辑器
 * 只提供 CSS / HTML / XML；Prism 默认包自带 markup/css/clike/javascript，正好覆盖
 * 这些语言与历史文章里的 javascript 代码块，因此这里不再引入任何语言扩展包。
 */
import Prism from 'prismjs'

export interface CodeLanguageOption {
    text: string
    value: string
}

export interface CodeHighlightRange {
    type: string
    start: number
    end: number
}

/** HTML/XML/CSS 是编辑器工具栏实际提供的语言，javascript 用于兼容历史代码块 */
export const CODE_HIGHLIGHT_LANGS: CodeLanguageOption[] = [
    { text: 'CSS', value: 'css' },
    { text: 'HTML', value: 'html' },
    { text: 'XML', value: 'xml' },
    { text: 'JavaScript', value: 'javascript' },
]

export const PRISM_TOKEN_TYPES = [
    'comment',
    'prolog',
    'doctype',
    'cdata',
    'punctuation',
    'namespace',
    'property',
    'tag',
    'boolean',
    'number',
    'constant',
    'symbol',
    'deleted',
    'selector',
    'attr-name',
    'string',
    'builtin',
    'inserted',
    'operator',
    'entity',
    'url',
    'atrule',
    'attr-value',
    'keyword',
    'function',
    'class-name',
    'regex',
    'important',
    'variable',
    'bold',
    'italic',
    'char',
]

/** 与官方一致：language 为空时不写 class，避免生成 `class="language-"` */
export function codeElemToHtml(language: string, childrenHtml: string): string {
    const className = language ? `class="language-${language}"` : ''
    return `<code ${className}>${childrenHtml}</code>`
}

/**
 * 从 code 元素的 class 里读回语言：
 * `language-xxx` 取 xxx（V5 格式），否则整串小写（兼容 V4 如 `class="Javascript"`）。
 */
export function parseCodeLanguage(className: string): string {
    const languageClass = className
        .split(/\s+/)
        .find(item => item.startsWith('language-'))

    return languageClass ? languageClass.slice('language-'.length) : className.toLowerCase()
}

function tokenLength(token: string | Prism.Token): number {
    if (typeof token === 'string') return token.length
    if (typeof token.content === 'string') return token.content.length
    if (Array.isArray(token.content)) {
        return token.content.reduce((total, child) => total + tokenLength(child), 0)
    }
    return tokenLength(token.content)
}

/**
 * 按语言把代码文本切成高亮区间。未收录的语言直接退化为空数组，
 * 这样历史文章里的 python/go 等代码块只会失去着色，不会破坏内容。
 */
export function codeHighlightRanges(text: string, language: string): CodeHighlightRange[] {
    const grammar = language ? Prism.languages[language] : undefined
    if (!grammar) return []

    const ranges: CodeHighlightRange[] = []
    let start = 0
    for (const token of Prism.tokenize(text, grammar)) {
        const end = start + tokenLength(token)
        if (typeof token !== 'string') {
            ranges.push({ type: token.type, start, end })
        }
        start = end
    }
    return ranges
}

/** 官方渲染规则：把命中的 prism token 类型写成 `token <type>` class */
export function codeTokenClassName(leaf: Record<string, unknown>): string {
    const tokenType = PRISM_TOKEN_TYPES.find(type => Boolean(leaf[type]))
    return tokenType ? `token ${tokenType}` : ''
}
