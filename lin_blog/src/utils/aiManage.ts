import type { AiUsageStats } from '../api/ai'

// AI 管理页的展示规则：功能文案、格式化与趋势图数据组装。
// 抽成纯函数后，视图只负责数据加载与交互，规则可以单独测试。

export const aiFeatureLabels: Record<string, string> = {
    suggest: '写作建议',
    writing: '写作辅助',
    cover: 'AI 配图',
    gallery: '图库策展',
    message: '私信拟回复',
    report: '运营周报',
    'report-review': '举报辅助',
    search: '语义搜索',
    ask: '门户问答',
    'prompt-preview': '提示词试跑',
    'prompt-assistant': '提示词助手',
    'image-alt': '图片描述',
    'gallery-description': '图库批量描述',
}

export function aiFeatureLabel(value: string): string {
    return aiFeatureLabels[value] || value
}

export function formatAiDuration(ms: number): string {
    const value = Number(ms) || 0
    if (value <= 0) return '-'
    if (value < 1000) return `${value} 毫秒`
    return `${(value / 1000).toFixed(1)} 秒`
}

export function formatAiNumber(value: number): string {
    const num = Number(value) || 0
    if (num < 1000) return String(num)
    if (num < 10000) return num.toLocaleString('zh-CN')
    return `${(num / 10000).toFixed(1)} 万`
}

export function formatAiBytes(value: number): string {
    const bytes = Number(value) || 0
    if (bytes <= 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export interface AiTrendPoint {
    date: string
    count: number
}

export function buildAiTrendChartData(stats: AiUsageStats | null | undefined): AiTrendPoint[] {
    return (stats?.trend || []).map(item => ({ date: item.day, count: item.total }))
}
