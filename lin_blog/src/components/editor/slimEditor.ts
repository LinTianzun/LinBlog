/**
 * 裁剪版 wangEditor。
 *
 * 官方 `@wangeditor/editor` 是预打包整包，静态包含 video / 上传图片等全部模块，
 * 无法通过 tree-shaking 剔除未用功能，产物约 800KB。
 *
 * 这里用 `@wangeditor/core` 手动装配需要的模块，并对外暴露与整包同签名的
 * `createEditor` / `createToolbar` / `DomEditor`，配合 vite alias 后
 * `@wangeditor/editor-for-vue` 无需任何改动即可继续使用。
 *
 * 未引入 video-module 与 upload-image-module：编辑器内的视频/图片上传并未配置
 * （图片走封面上传），而这两个模块会带来较大依赖。表格、代码块、列表均保留。
 *
 * 注意：core 自身不提供任何菜单默认配置（`toolbarKeys` 默认为空数组），
 * 官方整包的默认工具栏、悬浮菜单与代码高亮 decorate 都由 Boot 注入，
 * 因此这些默认值必须在这里一并复刻，否则工具栏会渲染成空容器。
 */
import {
    coreCreateEditor,
    coreCreateToolbar,
    registerMenu,
    registerRenderElemConf,
    registerStyleHandler,
    registerElemToHtmlConf,
    registerStyleToHtmlHandler,
    registerPreParseHtmlConf,
    registerParseElemHtmlConf,
    registerParseStyleHtmlHandler,
    DomEditor,
    type IModuleConf,
    type IEditorConfig,
    type IToolbarConfig,
    type IDomEditor,
} from '@wangeditor/core'
import basicModules from '@wangeditor/basic-modules'
import tableModule from '@wangeditor/table-module'
import listModule from '@wangeditor/list-module'
import {
    wangEditorCodeHighlightModule,
    wangEditorCodeHighLightDecorate,
} from '@wangeditor/code-highlight'

export { DomEditor }
export type { IEditorConfig, IToolbarConfig, IDomEditor }

/** 模块自带的编辑器插件（core 无注册表，需收集后传给 createEditor） */
const editorPlugins: NonNullable<IModuleConf['editorPlugin']>[] = []

/** 与官方整包的 Boot 等价：把模块的各类配置注册进 core */
function registerModule(module: Partial<IModuleConf>): void {
    module.menus?.forEach(item => registerMenu(item))
    module.renderElems?.forEach(item => registerRenderElemConf(item))
    if (module.renderStyle) registerStyleHandler(module.renderStyle)
    module.elemsToHtml?.forEach(item => registerElemToHtmlConf(item))
    if (module.styleToHtml) registerStyleToHtmlHandler(module.styleToHtml)
    module.preParseHtml?.forEach(item => registerPreParseHtmlConf(item))
    module.parseElemsHtml?.forEach(item => registerParseElemHtmlConf(item))
    if (module.parseStyleHtml) registerParseStyleHtmlHandler(module.parseStyleHtml)
    // editorPlugin 用于模块给编辑器实例挂载自定义方法（如表格、代码块），
    // core 没有注册表，官方整包是收集后传给 createEditor 的 plugins
    if (module.editorPlugin) editorPlugins.push(module.editorPlugin)
}

// basic-modules 导出的是模块数组，其余是单个模块
basicModules.forEach(registerModule)
registerModule(tableModule)
registerModule(listModule)
registerModule(wangEditorCodeHighlightModule)

type ToolbarItem = string | { key: string; title: string; iconSvg: string; menuKeys: string[] }

/** 悬浮菜单（选中文本/图片/表格/代码块时浮出的操作条），与官方整包保持一致 */
const hoverbarKeys: NonNullable<IEditorConfig['hoverbarKeys']> = {
    link: { menuKeys: ['editLink', 'unLink', 'viewLink'] },
    image: {
        menuKeys: [
            'imageWidth30',
            'imageWidth50',
            'imageWidth100',
            'editImage',
            'viewImageLink',
            'deleteImage',
        ],
    },
    pre: { menuKeys: ['enter', 'codeBlock', 'codeSelectLang'] },
    table: {
        menuKeys: [
            'enter',
            'tableHeader',
            'tableFullWidth',
            'insertTableRow',
            'deleteTableRow',
            'insertTableCol',
            'deleteTableCol',
            'deleteTable',
        ],
    },
    divider: { menuKeys: ['enter'] },
}

/** 默认（default 模式）编辑器配置：悬浮菜单 + 代码块高亮 decorate */
const defaultEditorConfig: Partial<IEditorConfig> = {
    hoverbarKeys: {
        ...hoverbarKeys,
        text: {
            menuKeys: [
                'headerSelect',
                'insertLink',
                'bulletedList',
                '|',
                'bold',
                'through',
                'color',
                'bgColor',
                'clearStyle',
            ],
        },
    },
    decorate: wangEditorCodeHighLightDecorate,
}

/** simple 模式编辑器配置：不带 text 悬浮菜单（官方 simple 配置同样没有） */
const simpleEditorConfig: Partial<IEditorConfig> = {
    hoverbarKeys,
    decorate: wangEditorCodeHighLightDecorate,
}

const moreStyleIcon =
    '<svg viewBox="0 0 1024 1024"><path d="M204.8 505.6m-76.8 0a76.8 76.8 0 1 0 153.6 0 76.8 76.8 0 1 0-153.6 0Z"></path><path d="M505.6 505.6m-76.8 0a76.8 76.8 0 1 0 153.6 0 76.8 76.8 0 1 0-153.6 0Z"></path><path d="M806.4 505.6m-76.8 0a76.8 76.8 0 1 0 153.6 0 76.8 76.8 0 1 0-153.6 0Z"></path></svg>'
const justifyIcon =
    '<svg viewBox="0 0 1024 1024"><path d="M768 793.6v102.4H51.2v-102.4h716.8z m204.8-230.4v102.4H51.2v-102.4h921.6z m-204.8-230.4v102.4H51.2v-102.4h716.8zM972.8 102.4v102.4H51.2V102.4h921.6z"></path></svg>'
const indentIcon =
    '<svg viewBox="0 0 1024 1024"><path d="M0 64h1024v128H0z m384 192h640v128H384z m0 192h640v128H384z m0 192h640v128H384zM0 832h1024v128H0z m0-128V320l256 192z"></path></svg>'
const imageIcon =
    '<svg viewBox="0 0 1024 1024"><path d="M959.877 128l0.123 0.123v767.775l-0.123 0.122H64.102l-0.122-0.122V128.123l0.122-0.123h895.775zM960 64H64C28.795 64 0 92.795 0 128v768c0 35.205 28.795 64 64 64h896c35.205 0 64-28.795 64-64V128c0-35.205-28.795-64-64-64zM832 288.01c0 53.023-42.988 96.01-96.01 96.01s-96.01-42.987-96.01-96.01S682.967 192 735.99 192 832 234.988 832 288.01zM896 832H128V704l224.01-384 256 320h64l224.01-192z"></path></svg>'

/**
 * 默认工具栏菜单，取自官方整包 `setToolbarConfig`。
 * 未引入 video / upload-image 模块，故移除 group-video 与 uploadImage，
 * 其余菜单（标题、样式、颜色、列表、对齐、缩进、表情、链接、图片、表格、代码块、分割线、撤销重做、全屏）全部保留。
 */
const defaultToolbarKeys: ToolbarItem[] = [
    'headerSelect',
    'blockquote',
    '|',
    'bold',
    'underline',
    'italic',
    {
        key: 'group-more-style',
        title: '更多',
        iconSvg: moreStyleIcon,
        menuKeys: ['through', 'code', 'sup', 'sub', 'clearStyle'],
    },
    'color',
    'bgColor',
    '|',
    'fontSize',
    'fontFamily',
    'lineHeight',
    '|',
    'bulletedList',
    'numberedList',
    'todo',
    {
        key: 'group-justify',
        title: '对齐',
        iconSvg: justifyIcon,
        menuKeys: ['justifyLeft', 'justifyRight', 'justifyCenter', 'justifyJustify'],
    },
    {
        key: 'group-indent',
        title: '缩进',
        iconSvg: indentIcon,
        menuKeys: ['indent', 'delIndent'],
    },
    '|',
    'emotion',
    'insertLink',
    {
        key: 'group-image',
        title: '图片',
        iconSvg: imageIcon,
        menuKeys: ['insertImage'],
    },
    'insertTable',
    'codeBlock',
    'divider',
    '|',
    'undo',
    'redo',
    '|',
    'fullScreen',
]

/** simple 模式工具栏，同样来自官方 `setSimpleToolbarConfig`（去掉图片上传入口） */
const simpleToolbarKeys: ToolbarItem[] = [
    'blockquote',
    'header1',
    'header2',
    'header3',
    '|',
    'bold',
    'underline',
    'italic',
    'through',
    'color',
    'bgColor',
    'clearStyle',
    '|',
    'bulletedList',
    'numberedList',
    'todo',
    'justifyLeft',
    'justifyRight',
    'justifyCenter',
    '|',
    'insertLink',
    {
        key: 'group-image',
        title: '图片',
        iconSvg: imageIcon,
        menuKeys: ['insertImage'],
    },
    'insertTable',
    'codeBlock',
    '|',
    'undo',
    'redo',
    '|',
    'fullScreen',
]

const defaultToolbarConfig: Partial<IToolbarConfig> = { toolbarKeys: defaultToolbarKeys }
const simpleToolbarConfig: Partial<IToolbarConfig> = { toolbarKeys: simpleToolbarKeys }

function isSimpleMode(mode?: string): boolean {
    return mode === 'simple'
}

export function createEditor(option: {
    selector: string | Element
    config: Partial<IEditorConfig>
    html?: string
    mode?: string
}): IDomEditor {
    const base = isSimpleMode(option.mode) ? simpleEditorConfig : defaultEditorConfig
    return coreCreateEditor({
        ...option,
        config: { ...base, ...option.config },
        plugins: editorPlugins,
    })
}

export function createToolbar(option: {
    editor: IDomEditor | null
    selector: string | Element
    config?: Partial<IToolbarConfig>
    mode?: string
}): ReturnType<typeof coreCreateToolbar> {
    const base = isSimpleMode(option.mode) ? simpleToolbarConfig : defaultToolbarConfig
    return coreCreateToolbar(option.editor, {
        selector: option.selector,
        config: { ...base, ...option.config },
    })
}

export { registerMenu }
