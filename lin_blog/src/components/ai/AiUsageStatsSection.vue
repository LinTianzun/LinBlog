<template>
    <section class="ai-panel">
        <header class="ai-panel-header">
            <div class="ai-panel-heading">
                <yk-title :level="4" style="margin: 0;">用量统计</yk-title>
                <yk-text type="secondary">近 {{ stats.days }} 天的调用量、成功率与耗时</yk-text>
            </div>
        </header>

        <div class="ai-stats-grid">
            <div class="ai-stats-window">
                <p class="ai-stats-window-title">近 7 天</p>
                <p class="ai-stats-window-total">{{ stats.summary.last7Days.total }}<span>次调用</span></p>
                <ul class="ai-stats-window-facts">
                    <li><span>成功率</span><strong>{{ stats.summary.last7Days.successRate }}%</strong></li>
                    <li><span>平均耗时</span><strong>{{ formatDuration(stats.summary.last7Days.avgDurationMs) }}</strong></li>
                    <li><span>P50 耗时</span><strong>{{ formatDuration(stats.summary.last7Days.p50DurationMs) }}</strong></li>
                    <li><span>P95 耗时</span><strong>{{ formatDuration(stats.summary.last7Days.p95DurationMs) }}</strong></li>
                    <li><span>Token 消耗</span><strong>{{ formatNumber(stats.summary.last7Days.totalTokens) }}</strong></li>
                </ul>
            </div>
            <div class="ai-stats-window">
                <p class="ai-stats-window-title">近 30 天</p>
                <p class="ai-stats-window-total">{{ stats.summary.last30Days.total }}<span>次调用</span></p>
                <ul class="ai-stats-window-facts">
                    <li><span>成功率</span><strong>{{ stats.summary.last30Days.successRate }}%</strong></li>
                    <li><span>平均耗时</span><strong>{{ formatDuration(stats.summary.last30Days.avgDurationMs) }}</strong></li>
                    <li><span>P50 耗时</span><strong>{{ formatDuration(stats.summary.last30Days.p50DurationMs) }}</strong></li>
                    <li><span>P95 耗时</span><strong>{{ formatDuration(stats.summary.last30Days.p95DurationMs) }}</strong></li>
                    <li><span>Token 消耗</span><strong>{{ formatNumber(stats.summary.last30Days.totalTokens) }}</strong></li>
                </ul>
            </div>
            <div class="ai-stats-window">
                <p class="ai-stats-window-title">累计</p>
                <p class="ai-stats-window-total">{{ stats.summary.all.total }}<span>次调用</span></p>
                <ul class="ai-stats-window-facts">
                    <li><span>失败次数</span><strong>{{ stats.summary.all.failed }}</strong></li>
                    <li><span>P50 耗时</span><strong>{{ formatDuration(stats.summary.all.p50DurationMs) }}</strong></li>
                    <li><span>P95 耗时</span><strong>{{ formatDuration(stats.summary.all.p95DurationMs) }}</strong></li>
                    <li><span>待确认图片</span><strong>{{ stats.pending.total }} 张</strong></li>
                    <li><span>占用空间</span><strong>{{ formatBytes(stats.pending.bytes) }}</strong></li>
                </ul>
            </div>
        </div>

        <div class="ai-stats-breaks">
            <div class="ai-stats-break">
                <p class="ai-stats-break-title">按模型</p>
                <yk-empty v-if="stats.byModel.length === 0" description="暂无数据" />
                <ul v-else class="ai-stats-list">
                    <li v-for="row in stats.byModel" :key="row.modelName || 'unknown'">
                        <div class="ai-stats-list-main">
                            <strong>{{ row.modelName || '未记录模型' }}</strong>
                            <span>{{ row.total }} 次 · 成功率 {{ row.successRate }}%</span>
                        </div>
                        <div class="ai-stats-list-side">
                            <span>{{ formatDuration(row.avgDurationMs) }}</span>
                            <span>{{ formatNumber(row.promptTokens + row.completionTokens) }} token</span>
                        </div>
                    </li>
                </ul>
            </div>
            <div class="ai-stats-break">
                <p class="ai-stats-break-title">按功能</p>
                <yk-empty v-if="stats.byFeature.length === 0" description="暂无数据" />
                <ul v-else class="ai-stats-list">
                    <li v-for="row in stats.byFeature" :key="row.feature">
                        <div class="ai-stats-list-main">
                            <strong>{{ featureLabel(row.feature) }}</strong>
                            <span>{{ row.total }} 次 · 成功率 {{ row.successRate }}%</span>
                        </div>
                        <div class="ai-stats-list-side">
                            <span>平均 {{ formatDuration(row.avgDurationMs) }}</span>
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <div class="ai-stats-breaks">
            <div class="ai-stats-break">
                <p class="ai-stats-break-title">模型健康</p>
                <yk-empty v-if="stats.health.length === 0" description="尚未进行连通性测试" />
                <ul v-else class="ai-stats-list">
                    <li v-for="row in stats.health" :key="row.modelId">
                        <div class="ai-stats-list-main">
                            <strong>{{ row.modelName }}</strong>
                            <span>
                                平均 {{ formatDuration(row.avgLatencyMs) }} · 成功率 {{ row.successRate }}%
                                <template v-if="row.lastError"> · {{ row.lastError }}</template>
                            </span>
                        </div>
                        <div class="ai-stats-list-side">
                            <span>最近测试 {{ formatTime(row.lastTestAt) }}</span>
                            <yk-tag v-if="row.consecutiveFailures > 0" size="s" type="danger">
                                连续失败 {{ row.consecutiveFailures }} 次
                            </yk-tag>
                        </div>
                    </li>
                </ul>
            </div>
            <div class="ai-stats-break">
                <p class="ai-stats-break-title">每日趋势</p>
                <yk-empty v-if="stats.trend.length === 0" description="暂无数据" />
                <div v-else class="ai-trend-chart">
                    <LineChart :data="trendChartData" chart-height="160px" />
                </div>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { LineChart } from '../echarts'
    import type { AiUsageStats } from '../../api/ai'
    import {
        aiFeatureLabel,
        buildAiTrendChartData,
        formatAiBytes,
        formatAiDuration,
        formatAiNumber,
    } from '../../utils/aiManage'

    const props = defineProps<{
        stats: AiUsageStats
    }>()

    const formatDuration = formatAiDuration
    const formatNumber = formatAiNumber
    const formatBytes = formatAiBytes
    const featureLabel = aiFeatureLabel

    const trendChartData = computed(() => buildAiTrendChartData(props.stats))

    // 后端回传 ISO（UTC），这里统一按访客本地时区显示，避免出现「差 8 小时」的错觉
    const formatTime = (value: string | null | undefined): string => {
        if (!value) return '-'
        const date = new Date(String(value).includes('T')
            ? String(value)
            : String(value).replace(' ', 'T'))
        if (Number.isNaN(date.getTime())) {
            return String(value).replace('T', ' ').slice(0, 16)
        }
        const pad = (input: number): string => String(input).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
</script>

<style lang="less" scoped>
    .ai-panel {
        width: 100%;
        padding: 20px 22px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
    }

    .ai-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
    }

    .ai-panel-heading {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .ai-stats-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: @space-m;
    }

    .ai-stats-window {
        padding: 16px 18px;
        border-radius: 14px;
        background: var(--admin-surface-soft, var(--bgColor2));
        border: 1px solid var(--admin-line, var(--gray1));
    }

    .ai-stats-window-title {
        margin: 0 0 6px;
        font-size: 12px;
        color: var(--gray7);
    }

    .ai-stats-window-total {
        margin: 0 0 12px;
        font-size: 26px;
        font-weight: 700;
        color: var(--gray);
        line-height: 1.1;

        span {
            margin-left: 6px;
            font-size: 12px;
            font-weight: 400;
            color: var(--gray7);
        }
    }

    .ai-stats-window-facts {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 8px;

        li {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            font-size: 13px;
            color: var(--gray7);

            strong {
                color: var(--gray);
                font-weight: 600;
            }
        }
    }

    .ai-stats-breaks {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: @space-l;
        margin-top: @space-l;
    }

    .ai-trend-chart {
        margin-top: 4px;
        width: 100%;
        min-width: 0;
    }

    .ai-stats-break {
        min-width: 0;
    }

    .ai-stats-break-title {
        margin: 0 0 10px;
        font-size: 13px;
        font-weight: 600;
        color: var(--gray);
    }

    .ai-stats-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;

        li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 11px 12px;
            border-radius: 12px;
            transition: background @animatb;

            &:hover {
                background: var(--admin-surface-soft, var(--bgColor2));
            }
        }
    }

    .ai-stats-list-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;

        strong {
            color: var(--gray);
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        span {
            font-size: 12px;
            color: var(--gray7);
        }
    }

    .ai-stats-list-side {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        font-size: 12px;
        color: var(--gray7);
    }

    @media (max-width: 1100px) {
        .ai-stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .ai-stats-breaks {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 720px) {
        .ai-stats-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
