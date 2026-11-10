/**
 * AI 提示词模板。
 *
 * 这里保存每个功能的内置默认提示词，同时定义模板支持哪些变量。
 * 管理员可以在「AI 管理」页面覆盖这些提示词；模板为空或被停用时，
 * aiClient 会回退到这里的默认内容，保证功能不会因为模板写坏而不可用。
 */

// 变量说明会展示在后台模板编辑面板上，作者据此知道能填哪些占位符
const DEFAULT_TEMPLATES = [
    {
        key: 'suggest',
        name: '写作建议',
        description: '根据文章标题与正文生成简介和标签',
        variables: '{{title}} 文章标题\n{{content}} 正文纯文本',
        content: [
            '你是一名中文博客编辑助手。请根据文章标题和正文，生成一段面向读者的简介和 2-4 个内容标签。',
            '要求：',
            '1. 简介不超过 120 字，概括文章主题，不夸大、不剧透细节；',
            '2. 标签使用简短名词短语，贴合文章主题，不要重复标题里已有的完整短语；',
            '3. 只输出一个 JSON 对象，格式为 {"summary":"...","labels":["..."]}，不要输出任何解释或 Markdown 代码块。',
            '',
            `标题：{{title}}`,
            `正文：{{content}}`
        ].join('\n')
    },
    {
        key: 'writing',
        name: '写作辅助',
        description: '润色、精简、扩写与续写正文',
        variables: '{{action}} 动作标识（polish/shorten/expand/continue）\n{{actionLabel}} 动作中文名\n{{title}} 文章标题（可为空）\n{{text}} 原文片段',
        content: [
            '你是一名中文博客编辑助手。请根据要求改写或续写用户提供的正文片段。',
            '{{requirement}}',
            '2. 只输出处理后的纯文本，不要解释、标题、Markdown 代码块或引号；',
            '3. 保留原文语言，使用博客可读的自然段落；',
            '',
            '{{titleLine}}',
            `原文片段：{{text}}`
        ].join('\n')
    },
    {
        key: 'cover',
        name: '封面配图',
        description: '生成文章封面插画或随笔配图',
        variables: '{{title}} 文章标题\n{{introduce}} 文章简介（可为空）\n{{content}} 正文摘要（可为空）',
        content: [
            '你是一名博客封面插画师。请根据文章信息生成一张封面插画。',
            '要求：',
            '1. 现代简约的编辑插画风格，构图有呼吸感，色彩协调；',
            '2. 不要出现任何文字、字母、数字、水印或 Logo；',
            '3. 避免具体人物特写，用意象、场景与氛围表达主题；',
            '',
            `文章标题：{{title}}`,
            '{{introduceLine}}',
            '{{contentLine}}'
        ].join('\n')
    },
    {
        key: 'gallery',
        name: '图库策展',
        description: '为摄影图库生成候选标题、简介与标签',
        variables: '{{title}} 当前标题\n{{introduce}} 当前简介\n{{theme}} 作者补充主题\n{{photoCount}} 照片数量',
        content: [
            '你是一名中文摄影图库策展编辑。请根据当前图库信息和作者补充主题，给出候选元信息。',
            '要求：',
            '1. 给出 3 个候选标题，每个不超过 24 字，风格一致但表达角度不同；',
            '2. 给出一段不超过 160 字的策展简介，说明画面氛围、主题与适合的浏览情境；',
            '3. 给出 2-4 个简短标签，不要编造照片中无法判断的事实；',
            '4. 只输出一个 JSON 对象，格式为 {"titles":["..."],"summary":"...","labels":["..."]}，不要输出解释或 Markdown 代码块。',
            '',
            `当前标题：{{title}}`,
            `当前简介：{{introduce}}`,
            `作者补充主题：{{theme}}`,
            `照片数量：{{photoCount}}`
        ].join('\n')
    },
    {
        key: 'search',
        name: '语义搜索',
        description: '把自然语言查询扩展成可检索关键词',
        variables: '{{query}} 用户查询',
        content: [
            '你是一名中文站内搜索助手。请把用户的自然语言查询扩展成 2-5 个可以直接用于站内全文检索的关键词。',
            '要求：',
            '1. 关键词要用中文短语，覆盖同义词、近义词与常见别名；',
            '2. 不要输出原查询里已有的完整词组；',
            '3. 每个关键词不超过 8 个字，彼此不重复；',
            '4. 只输出一个 JSON 对象，格式为 {"terms":["..."]}，不要输出解释或 Markdown 代码块。',
            '',
            `用户查询：{{query}}`
        ].join('\n')
    },
    {
        key: 'message',
        name: '私信拟回复',
        description: '根据对话上下文生成候选回复话术',
        variables: '{{peerName}} 对话对方\n{{history}} 最近对话\n{{tone}} 作者期望的语气（可为空）',
        content: [
            '你是一名中文博客博主，正在回复读者的私信。请根据对话上下文给出候选回复。',
            '要求：',
            '1. 给出 2 条候选回复，语气不同：一条热情友好，一条简洁克制；',
            '2. 每条不超过 120 字，口语化、直接，不要客套长文；',
            '3. 不要编造事实、不要承诺做不到的事，也不要替作者做决定；',
            '4. 只输出一个 JSON 对象，格式为 {"replies":["...","..."]}，不要输出解释或 Markdown 代码块。',
            '{{toneLine}}',
            '',
            `对话对方：{{peerName}}`,
            '最近对话：',
            '{{history}}'
        ].join('\n')
    },
    {
        key: 'operations',
        name: '运营周报',
        description: '根据真实统计数据组织周报文字',
        variables: '{{days}} 统计周期天数\n{{visits}} 页面访问次数\n{{visitors}} 独立访客数\n{{mobileVisits}} 移动端访问次数\n{{comments}} 新增评论数\n{{messages}} 新增私信数\n{{publishedArticles}} 新增文章数\n{{publishedGalleries}} 新增图库数\n{{topPaths}} 热门路径\n{{aiTotal}} AI 调用总次数\n{{aiSuccessRate}} AI 成功率\n{{aiAvgDuration}} AI 平均耗时',
        content: [
            '你是一名中文博客运营助理。请根据下面这一周的站点统计数据写一份简短的运营周报。',
            '要求：',
            '1. 只使用给出的数字，不要编造任何未提供的数据或对比结论；',
            '2. 输出 3-4 个小节标题（如「本周概况」「内容表现」「互动情况」「下周建议」），每节 1-3 句话；',
            '3. 语气客观平实，数字变化只做陈述，不要夸大；',
            '4. 不要输出 Markdown 标记（#、*、-），用纯文本小标题与句子；',
            '5. 只输出周报正文，不要额外解释。',
            '',
            `统计周期：最近 {{days}} 天`,
            `页面访问：{{visits}} 次，独立访客 {{visitors}} 人，移动端访问 {{mobileVisits}} 次`,
            `新增发布：文章 {{publishedArticles}} 篇，图库 {{publishedGalleries}} 组`,
            `新增评论：{{comments}} 条，新增私信：{{messages}} 条`,
            `热门路径：{{topPaths}}`,
            `AI 调用：共 {{aiTotal}} 次，成功率 {{aiSuccessRate}}%，平均耗时 {{aiAvgDuration}} 毫秒`
        ].join('\n')
    },
    {
        key: 'report-review',
        name: '举报辅助',
        description: '对举报内容给出处置建议',
        variables: '{{reasonLabel}} 读者选择的举报原因\n{{detail}} 读者补充说明\n{{commentUserName}} 被举报评论作者\n{{commentContent}} 被举报评论内容\n{{sourceTitle}} 所在内容标题\n{{complaint}} 累计被举报次数',
        content: [
            '你是一名中文内容社区的审核助理。请根据举报信息给出处置建议。',
            '要求：',
            '1. 判断举报是否成立，只能取 "成立"、"部分成立"、"不成立" 三种；',
            '2. 给出一个更贴切的举报原因，只能取：spam（广告或引流）、abuse（辱骂或攻击）、porn（色情或低俗）、illegal（违法或危险）、misinformation（虚假或误导）、other（其他原因）；',
            '3. 建议处置只能取：process（删除评论并标记已处理）、dismiss（忽略举报）、warn（保留评论但标记已处理）；',
            '4. 写一段不超过 80 字的处理备注，说明判断依据；',
            '5. 只输出一个 JSON 对象，格式为 {"verdict":"...","reason":"...","action":"...","note":"..."}，不要输出解释或 Markdown 代码块。',
            '',
            `举报原因（读者选择）：{{reasonLabel}}`,
            `读者补充说明：{{detail}}`,
            `被举报评论作者：{{commentUserName}}`,
            `被举报评论内容：{{commentContent}}`,
            `所在内容：{{sourceTitle}}`,
            `该评论累计被举报：{{complaint}} 次`
        ].join('\n')
    },
    {
        key: 'ask',
        name: '门户问答',
        description: '基于站内已发布文章回答访客提问',
        variables: '{{context}} 站内文章片段\n{{question}} 访客问题',
        content: [
            '你是一名博客站主的助手，负责根据站内已发布的文章回答访客的问题。',
            '要求：',
            '1. 只能依据下面给出的文章片段回答，不要编造片段里没有的信息；',
            '2. 如果片段不足以回答，请直接说明没有找到相关内容，并邀请访客换个说法；',
            '3. 引用了哪几篇内容，就在答案末尾用 [1]、[2] 这样的编号标出来；',
            '4. 用简体中文回答，语气自然，不要使用 Markdown 标题或代码块；',
            '',
            '站内文章片段：',
            '{{context}}',
            '',
            `访客问题：{{question}}`
        ].join('\n')
    },
    {
        key: 'freeform',
        name: '自由创作',
        description: '自定义提示词的试跑功能，不绑定业务入口',
        variables: '{{input}} 自由输入内容',
        content: [
            '你是一名中文创作助手。请根据用户输入自由创作。',
            '要求：',
            '1. 使用简体中文，输出自然、连贯、可读；',
            '2. 不要额外解释创作过程；',
            '',
            `创作输入：{{input}}`
        ].join('\n')
    },
    {
        key: 'prompt-assistant',
        name: 'AI 提示词助手',
        description: '根据现有模板与需求生成可直接保存的候选提示词',
        variables: [
            '{{task}} optimize=优化现有模板 / create=新建模板',
            '{{featureName}} 所属功能中文名',
            '{{featureKey}} 所属功能标识',
            '{{variableList}} 可用变量清单',
            '{{requirement}} 作者补充需求',
            '{{currentContent}} 现有模板正文'
        ].join('\n'),
        content: [
            '你是一名中文博客系统的 AI 提示词工程师，负责维护能被后端模板引擎渲染的提示词模板。',
            '目标功能：{{featureName}}（{{featureKey}}）',
            '任务：{{taskLabel}}',
            '',
            '必须遵守：',
            '1. 只返回一个 JSON 对象，不要 Markdown 代码块或解释；',
            '2. 返回字段固定为 {"content":"...","summary":"..."}；',
            '3. content 是可直接保存的模板正文，控制在 20000 字符以内；',
            '4. 只能使用「可用变量」中列出的变量名，占位符写成 {{variable}}，不要发明新变量；',
            '5. 保留必要的输出格式约束，例如只输出 JSON、只输出正文、不要水印；',
            '6. summary 用一句不超过 80 字的中文说明模板用途和改进点。',
            '',
            '可用变量：',
            '{{variableList}}',
            '',
            '{{requirementTitle}}',
            '{{requirement}}',
            '',
            '现有模板：',
            '{{currentContent}}',
            '',
            '{{closingInstruction}}'
        ].join('\n')
    }
]

const DEFAULT_TEMPLATE_MAP = new Map(DEFAULT_TEMPLATES.map(item => [item.key, item]))

/**
 * 取出内置默认模板：没有配置或配置被删除时用它兜底。
 */
function getDefaultTemplate(key) {
    return DEFAULT_TEMPLATE_MAP.get(key) || null
}

/**
 * 列出全部内置模板（供后台展示与初始化使用）。
 */
function listDefaultTemplates() {
    return DEFAULT_TEMPLATES.map(item => ({ ...item }))
}

// 空值占位标记：变量为空时先落成标记，渲染完再把只含标记的空行删掉，
// 这样「简介为空」这类可选内容不会在提示词里留下多余空行。
const EMPTY_MARK = '\u0001EMPTY\u0001'

/**
 * 用变量替换模板里的占位符。
 * 未知变量原样保留，避免作者写错变量名时静默丢内容；
 * 变量为空字符串时，对应整行会被移除。
 */
function renderTemplate(content, variables = {}) {
    const rendered = String(content || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
        const value = variables[name]
        if (value === undefined || value === null) return match
        return String(value) === '' ? EMPTY_MARK : String(value)
    })

    return rendered
        .split('\n')
        .filter(line => line.trim() !== EMPTY_MARK)
        .join('\n')
        .replace(new RegExp(EMPTY_MARK, 'g'), '')
}

module.exports = {
    DEFAULT_TEMPLATES,
    getDefaultTemplate,
    listDefaultTemplates,
    renderTemplate
}
