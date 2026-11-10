/**
 * AI 服务商识别：接口地址看不出服务商时，用常见域名推断一个可读名称，
 * 让「AI 管理」页面里的模型卡片一眼能认出是哪家模型。
 */
const PROVIDER_HINTS = [
    { keyword: 'bigmodel', label: '智谱 GLM' },
    { keyword: 'zhipu', label: '智谱 GLM' },
    { keyword: 'openai', label: 'OpenAI' },
    { keyword: 'deepseek', label: 'DeepSeek' },
    { keyword: 'moonshot', label: 'Moonshot' },
    { keyword: 'dashscope', label: '阿里云百炼' },
    { keyword: 'aliyun', label: '阿里云百炼' },
    { keyword: 'siliconflow', label: '硅基流动' },
    { keyword: 'modelscope', label: '魔搭 ModelScope' },
    { keyword: 'volcengine', label: '火山方舟' },
    { keyword: 'ark.cn', label: '火山方舟' },
    { keyword: 'qianfan', label: '百度千帆' },
    { keyword: 'hunyuan', label: '腾讯混元' },
    { keyword: 'moonshot', label: 'Moonshot' },
    { keyword: 'stepfun', label: '阶跃星辰' },
    { keyword: 'baichuan', label: '百川智能' }
]

/**
 * 根据接口地址与模型名推断服务商名称；识别不出来时退回「自定义模型」。
 */
function guessProviderLabel(baseUrl, model = '') {
    const haystack = `${String(baseUrl || '')} ${String(model || '')}`.toLowerCase()
    const hit = PROVIDER_HINTS.find(item => haystack.includes(item.keyword))
    if (hit) return hit.label
    if (haystack.includes('glm')) return '智谱 GLM'
    return '自定义模型'
}

module.exports = { guessProviderLabel, PROVIDER_HINTS }
