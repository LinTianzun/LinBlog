/**
 * 裁剪版 wangEditor 代码高亮模块。
 *
 * 官方模块为了同时支持 20 多种语言，预打包了整套 Prism 语言定义和 core-js
 * polyfill。本站编辑器只提供 CSS / HTML / XML，Prism 默认包中的 JavaScript
 * 则用于兼容已有文章里的代码块。这里保留官方模块的菜单、导入导出和编辑器
 * 语法着色行为，只移除未使用的语言与 DOM 工具依赖。
 */
import {
    DomEditor,
    i18nAddResources,
    type IDomEditor,
    type IElemToHtmlConf,
    type IModuleConf,
    type IOption,
    type ISelectMenu,
    type ParseStyleHtmlFnType,
    type RenderStyleFnType,
} from '@wangeditor/core'
import {
    Element,
    Text,
    Transforms,
    type Descendant,
    type Node,
    type NodeEntry,
    type Range,
} from 'slate'
import {
    CODE_HIGHLIGHT_LANGS,
    codeElemToHtml,
    codeHighlightRanges,
    codeTokenClassName,
    parseCodeLanguage,
} from './slimCodeHighlightCore'

i18nAddResources('en', { highLightModule: { selectLang: 'Language' } })
i18nAddResources('zh-CN', { highLightModule: { selectLang: '选择语言' } })

type CodeElement = Element & {
    type: 'code'
    language?: string
    children: Descendant[]
}

const codeLanguageIcon =
    '<svg viewBox="0 0 1024 1024"><path d="M64 64v896h896V64H64z m487.6 698.8c0 87.2-51.2 127-125.8 127-67.4 0-106.4-34.8-126.4-77l68.6-41.4c13.2 23.4 25.2 43.2 54.2 43.2 27.6 0 45.2-10.8 45.2-53V475.4h84.2v287.4z m199.2 127c-78.2 0-128.8-37.2-153.4-86l68.6-39.6c18 29.4 41.6 51.2 83 51.2 34.8 0 57.2-17.4 57.2-41.6 0-28.8-22.8-39-61.4-56l-21-9c-60.8-25.8-101-58.4-101-127 0-63.2 48.2-111.2 123.2-111.2 53.6 0 92 18.6 119.6 67.4L800 580c-14.4-25.8-30-36-54.2-36-24.6 0-40.2 15.6-40.2 36 0 25.2 15.6 35.4 51.8 51.2l21 9c71.6 30.6 111.8 62 111.8 132.4 0 75.6-59.6 117.2-139.4 117.2z"></path></svg>'

const codeLangs = CODE_HIGHLIGHT_LANGS

class CodeSelectLangMenu implements ISelectMenu {
    readonly title = '选择语言'
    readonly iconSvg = codeLanguageIcon
    readonly tag = 'select'
    readonly width = 95
    readonly selectPanelWidth = 115

    getOptions(editor: IDomEditor): IOption[] {
        const configured = (editor.getMenuConfig('codeSelectLang')?.codeLangs ?? []) as {
            text: string
            value: string
        }[]
        const current = this.getValue(editor)

        return [{ text: 'plain text', value: '' }, ...configured].map(item => ({
            ...item,
            selected: item.value === current,
        }))
    }

    isActive(): boolean {
        return false
    }

    getValue(editor: IDomEditor): string {
        const codeElement = this.getSelectedCodeElement(editor)
        if (!codeElement) return ''

        const language = String(codeElement.language ?? '')
        const configured = (editor.getMenuConfig('codeSelectLang')?.codeLangs ?? []) as {
            value: string
        }[]
        return configured.some(item => item.value === language) ? language : ''
    }

    isDisabled(editor: IDomEditor): boolean {
        return !editor.selection || !this.getSelectedCodeElement(editor)
    }

    exec(editor: IDomEditor, value: string | boolean): void {
        if (!this.getSelectedCodeElement(editor)) return

        Transforms.setNodes(
            editor,
            { language: String(value) } as Partial<CodeElement>,
            { match: node => DomEditor.checkNodeType(node, 'code') }
        )
    }

    private getSelectedCodeElement(editor: IDomEditor): CodeElement | null {
        const codeNode = DomEditor.getSelectedNodeByType(editor, 'code')
        if (!codeNode || !Element.isElement(codeNode)) return null

        const preNode = DomEditor.getParentNode(editor, codeNode)
        return Element.isElement(preNode) && DomEditor.getNodeType(preNode) === 'pre'
            ? (codeNode as CodeElement)
            : null
    }
}

const codeSelectLangMenu = new CodeSelectLangMenu()

const codeToHtml: IElemToHtmlConf = {
    type: 'code',
    elemToHtml(elem, childrenHtml) {
        return codeElemToHtml(String((elem as CodeElement).language ?? ''), childrenHtml)
    },
}

const renderStyle: RenderStyleFnType = (node, vnode) => {
    const className = codeTokenClassName(node as Descendant & Record<string, unknown>)
    if (!className) return vnode

    if (!vnode.data) vnode.data = {}
    if (!vnode.data.props) vnode.data.props = {}
    Object.assign(vnode.data.props, { className })
    return vnode
}

const parseStyleHtml: ParseStyleHtmlFnType = (elem, node, _editor) => {
    if (!Element.isElement(node) || DomEditor.getNodeType(node) !== 'code') return node

    const codeElement = node as CodeElement
    codeElement.language = parseCodeLanguage(elem.getAttribute('class') ?? '')
    return codeElement
}

function getCodeElement(node: Node): CodeElement | null {
    if (!Text.isText(node)) return null

    const codeNode = DomEditor.getParentNode(null, node)
    if (!codeNode || DomEditor.getNodeType(codeNode) !== 'code') return null

    const preNode = DomEditor.getParentNode(null, codeNode)
    return preNode && DomEditor.getNodeType(preNode) === 'pre'
        ? (codeNode as CodeElement)
        : null
}

export const wangEditorCodeHighLightDecorate = ([node, path]: NodeEntry): Range[] => {
    const codeElement = getCodeElement(node)
    if (!codeElement) return []

    return codeHighlightRanges((node as Text).text, String(codeElement.language ?? '')).map(
        ({ type, start, end }) =>
            ({
                [type]: true,
                anchor: { path, offset: start },
                focus: { path, offset: end },
            }) as Range
    )
}

export const wangEditorCodeHighlightModule: Partial<IModuleConf> = {
    renderStyle,
    parseStyleHtml,
    menus: [
        {
            key: 'codeSelectLang',
            factory: () => codeSelectLangMenu,
            config: {
                codeLangs,
            },
        },
    ],
    elemsToHtml: [codeToHtml],
}
