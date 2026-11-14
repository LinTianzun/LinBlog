<template>
    <yk-space dir="vertical" size="l" class="admin-page insight-page">
        <top-title name="站点洞察" description="查看访客在找什么，以及哪些页面最容易走丢" :is-search="false">
            <template #custom>
                <yk-button type="primary" :loading="loading" @click="loadStats(days)">
                    刷新数据
                </yk-button>
            </template>
        </top-title>

        <div v-if="errorMessage" class="insight-banner">{{ errorMessage }}</div>

        <div v-if="loading && !stats" class="insight-loading">
            <yk-spinner size="m" />
            <span>正在汇总搜索与 404 记录...</span>
        </div>

        <template v-else-if="stats">
            <section class="insight-hero" aria-label="站点洞察概览">
                <div class="insight-hero-copy">
                    <span class="insight-kicker">SEARCH & LOST PAGES · {{ formatDateTime(stats.generatedAt) }}</span>
                    <h2>{{ overviewTitle }}</h2>
                    <p>
                        搜索与 404 只记录关键词和页面路径，不关联访客身份。
                        数据保留最近 {{ stats.days }} 天，适合用来补内容、修链接和调整导航。
                    </p>
                    <div class="insight-signal">
                        <span class="insight-signal-track" aria-hidden="true">
                            <i :style="{ width: `${semanticPercent}%` }" />
                        </span>
                        <span>语义搜索占 {{ semanticPercent }}%</span>
                    </div>
                </div>
                <div class="insight-periods" role="group" aria-label="统计周期">
                    <span class="insight-periods-label">统计周期</span>
                    <button v-for="item in periodOptions" :key="item" type="button" class="insight-period"
                        :class="{ 'is-active': days === item }" :disabled="loading" @click="changeDays(item)">
                        {{ item }} 天
                    </button>
                </div>
            </section>

            <section class="insight-facts" aria-label="站点数据摘要">
                <article class="insight-fact">
                    <span>站内搜索</span>
                    <strong>{{ stats.summary.searches }}</strong>
                    <small>{{ stats.summary.uniqueSearchTerms }} 个独立搜索词</small>
                </article>
                <article class="insight-fact is-warning">
                    <span>零结果搜索</span>
                    <strong>{{ stats.summary.zeroResultSearches }}</strong>
                    <small>可能代表内容缺口或叫法不一致</small>
                </article>
                <article class="insight-fact is-danger">
                    <span>404 访问</span>
                    <strong>{{ stats.summary.notFound }}</strong>
                    <small>{{ stats.summary.uniqueNotFoundPaths }} 个不存在的页面</small>
                </article>
                <article class="insight-fact is-neutral">
                    <span>搜索方式</span>
                    <strong>{{ semanticPercent }}%</strong>
                    <small>普通 {{ stats.summary.standardSearches }} · 语义 {{ stats.summary.semanticSearches }}</small>
                </article>
            </section>

            <section class="insight-card insight-trend-card" aria-label="搜索与 404 趋势">
                <header class="insight-card-head">
                    <div>
                        <span class="insight-section-kicker">TREND</span>
                        <h3>每日趋势</h3>
                    </div>
                    <div class="insight-legend" aria-hidden="true">
                        <span><i class="is-search" />搜索</span>
                        <span><i class="is-lost" />404</span>
                    </div>
                </header>
                <div class="insight-trend-scroll">
                    <div class="insight-trend" :style="{ '--trend-columns': stats.trend.length }">
                        <div v-for="(point, index) in stats.trend" :key="point.date" class="trend-column"
                            :class="{ 'is-latest': index === stats.trend.length - 1 }"
                            :title="`${point.date}：搜索 ${point.searches} 次，404 ${point.notFound} 次`">
                            <div class="trend-bars">
                                <span class="trend-bar is-search"
                                    :style="{ height: trendHeight(point.searches) }" />
                                <span class="trend-bar is-lost"
                                    :style="{ height: trendHeight(point.notFound) }" />
                            </div>
                            <span class="trend-date">{{ point.date }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <div class="insight-grid">
                <section class="insight-card" aria-label="热门搜索词">
                    <header class="insight-card-head">
                        <div>
                            <span class="insight-section-kicker">SEARCH TERMS</span>
                            <h3>访客在找什么</h3>
                        </div>
                        <span class="insight-count">TOP {{ stats.searchTerms.length }}</span>
                    </header>

                    <ol v-if="stats.searchTerms.length" class="insight-rank-list">
                        <li v-for="(item, index) in stats.searchTerms" :key="item.keyword" class="insight-rank-row">
                            <span class="rank-index" :class="{ 'is-hot': index < 3 }">{{ index + 1 }}</span>
                            <div class="rank-main">
                                <RouterLink class="rank-name"
                                    :to="{ path: '/portal/articles', query: { keyword: item.keyword } }"
                                    target="_blank" rel="noopener">
                                    {{ item.keyword }}
                                </RouterLink>
                                <span class="rank-meta">
                                    最近 {{ formatDate(item.lastAt) }}
                                    <template v-if="item.zeroResults > 0">
                                        · {{ item.zeroResults }} 次无结果
                                    </template>
                                </span>
                                <span class="rank-meter" aria-hidden="true">
                                    <i :style="{ width: `${meterWidth(item.searches, maxSearchCount)}%` }" />
                                </span>
                            </div>
                            <strong class="rank-value">{{ item.searches }}</strong>
                        </li>
                    </ol>
                    <div v-else class="insight-empty">
                        <strong>还没有搜索记录</strong>
                        <p>门户访客使用搜索后，会在这里沉淀关键词。</p>
                    </div>
                </section>

                <section class="insight-card" aria-label="404 页面">
                    <header class="insight-card-head">
                        <div>
                            <span class="insight-section-kicker">LOST PAGES</span>
                            <h3>哪些页面最容易走丢</h3>
                        </div>
                        <span class="insight-count">TOP {{ stats.notFoundPaths.length }}</span>
                    </header>

                    <ol v-if="stats.notFoundPaths.length" class="insight-rank-list">
                        <li v-for="(item, index) in stats.notFoundPaths" :key="item.path" class="insight-rank-row">
                            <span class="rank-index" :class="{ 'is-hot': index < 3 }">{{ index + 1 }}</span>
                            <div class="rank-main">
                                <a class="rank-name is-path" :href="item.path" target="_blank" rel="noopener">
                                    {{ item.path }}
                                </a>
                                <span class="rank-meta">最近 {{ formatDate(item.lastAt) }}</span>
                                <span class="rank-meter is-danger" aria-hidden="true">
                                    <i :style="{ width: `${meterWidth(item.hits, maxNotFoundHits)}%` }" />
                                </span>
                            </div>
                            <strong class="rank-value is-danger">{{ item.hits }}</strong>
                        </li>
                    </ol>
                    <div v-else class="insight-empty">
                        <strong>没有发现 404 页面</strong>
                        <p>当前周期内门户没有产生失效路径。</p>
                    </div>
                </section>
            </div>
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import { getSiteEventStats, type SiteEventStats } from '../api/siteAnalytics'

const periodOptions = [7, 30, 90]
const days = ref(7)
const stats = ref<SiteEventStats | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const overviewTitle = computed(() => {
    if (!stats.value) return '正在读取站点洞察'
    if (stats.value.summary.searches === 0 && stats.value.summary.notFound === 0) {
        return '这段时间还没有搜索和 404 记录'
    }
    if (stats.value.summary.zeroResultSearches > 0) {
        return `有 ${stats.value.summary.zeroResultSearches} 次搜索没有找到内容`
    }
    if (stats.value.summary.notFound > 0) {
        return `发现 ${stats.value.summary.notFound} 次 404 访问`
    }
    return '搜索命中稳定，暂未发现失效页面'
})

const semanticPercent = computed(() => {
    const total = stats.value?.summary.searches || 0
    if (!total) return 0
    return Math.round(((stats.value?.summary.semanticSearches || 0) / total) * 100)
})

const maxTrendValue = computed(() => {
    const points = stats.value?.trend || []
    return Math.max(1, ...points.map(point => Math.max(point.searches, point.notFound)))
})

const maxSearchCount = computed(() => {
    const terms = stats.value?.searchTerms || []
    return Math.max(1, ...terms.map(item => item.searches))
})

const maxNotFoundHits = computed(() => {
    const paths = stats.value?.notFoundPaths || []
    return Math.max(1, ...paths.map(item => item.hits))
})

const meterWidth = (value: number, max: number): number => {
    if (value <= 0) return 0
    return Math.max(5, Math.round((value / Math.max(1, max)) * 100))
}

const trendHeight = (value: number): string => {
    if (value <= 0) return '2px'
    return `${Math.max(6, Math.round((value / maxTrendValue.value) * 100))}%`
}

const getErrorMessage = (error: unknown): string => {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
    return responseMessage || (error instanceof Error ? error.message : '站点洞察加载失败')
}

const formatDate = (value?: string | null): string => {
    if (!value) return '未知'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleDateString('zh-CN')
}

const formatDateTime = (value?: string | null): string => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', { hour12: false })
}

const loadStats = async (period = days.value): Promise<void> => {
    loading.value = true
    errorMessage.value = ''
    try {
        const result = await getSiteEventStats(period)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '站点洞察加载失败')
        }
        stats.value = result.data
        days.value = result.data.days
    } catch (error) {
        errorMessage.value = getErrorMessage(error)
    } finally {
        loading.value = false
    }
}

const changeDays = async (period: number): Promise<void> => {
    if (days.value === period) return
    days.value = period
    await loadStats(period)
}

onMounted(() => {
    void loadStats()
})
</script>

<style lang="less" scoped>
.insight-page {
    --red: #d84a3a;
    --green: #239b67;
    --orange: #d18412;
    --insight-line: color-mix(in srgb, var(--gray1) 84%, transparent);
    --insight-soft: color-mix(in srgb, var(--bgColor2) 76%, transparent);
    --insight-shadow: 0 16px 38px color-mix(in srgb, #1c2540 6%, transparent);
}

.insight-banner {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--red) 28%, var(--insight-line));
    border-radius: 10px;
    color: var(--red);
    background: color-mix(in srgb, var(--red) 8%, var(--bgColor1));
    font-size: 12px;
    line-height: 1.6;
}

.insight-loading {
    display: flex;
    min-height: 300px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--gray6);
    font-size: 12px;
}

.insight-hero {
    position: relative;
    isolation: isolate;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    overflow: hidden;
    padding: 26px;
    border: 1px solid var(--insight-line);
    border-radius: 20px;
    background:
        radial-gradient(circle at 7% 0%, color-mix(in srgb, var(--pcolor) 14%, transparent), transparent 36%),
        linear-gradient(135deg, var(--pcolor1), transparent 62%),
        var(--bgColor1);
    box-shadow: var(--insight-shadow);

    &::after {
        position: absolute;
        z-index: -1;
        right: -4%;
        bottom: -52%;
        width: 42%;
        aspect-ratio: 1;
        content: '';
        border: 1px solid color-mix(in srgb, var(--pcolor) 16%, transparent);
        border-radius: 50%;
        box-shadow:
            0 0 0 26px color-mix(in srgb, var(--pcolor) 4%, transparent),
            0 0 0 58px color-mix(in srgb, var(--pcolor) 3%, transparent);
        pointer-events: none;
    }
}

.insight-hero-copy {
    min-width: 0;

    h2 {
        margin: 6px 0 8px;
        color: var(--gray);
        font-size: 25px;
        line-height: 1.35;
    }

    p {
        max-width: 760px;
        margin: 0;
        color: var(--gray6);
        font-size: 12px;
        line-height: 1.75;
    }
}

.insight-signal {
    display: flex;
    max-width: 430px;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
    color: var(--gray6);
    font-size: 10px;
}

.insight-signal-track {
    position: relative;
    display: block;
    width: 132px;
    height: 5px;
    flex: none;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pcolor) 10%, var(--gray2));

    i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), color-mix(in srgb, var(--pcolor) 54%, var(--scolor, #1fb4a2)));
    }
}

.insight-kicker,
.insight-section-kicker {
    color: var(--pcolor);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
}

.insight-periods {
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
    padding: 4px;
    border: 1px solid var(--insight-line);
    border-radius: 999px;
    background: color-mix(in srgb, var(--bgColor1) 72%, transparent);
    box-shadow: 0 8px 22px color-mix(in srgb, #1c2540 6%, transparent);
    backdrop-filter: blur(8px);
}

.insight-periods-label {
    padding: 0 7px 0 6px;
    color: var(--gray6);
    font-size: 9px;
    font-weight: 650;
}

.insight-period {
    padding: 7px 12px;
    border: 0;
    border-radius: 999px;
    color: var(--gray6);
    background: transparent;
    font: inherit;
    font-size: 11px;
    cursor: pointer;

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }

    &.is-active {
        color: #fff;
        background: var(--pcolor);
        box-shadow: 0 5px 14px var(--pcolor3);
    }
}

.insight-facts {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

.insight-fact {
    position: relative;
    overflow: hidden;
    padding: 16px 17px;
    border: 1px solid var(--insight-line);
    border-radius: 15px;
    background:
        linear-gradient(150deg,
            color-mix(in srgb, var(--bgColor2) 58%, transparent),
            transparent 58%),
        var(--bgColor1);
    box-shadow: 0 8px 24px color-mix(in srgb, #1c2540 4%, transparent);

    &::before {
        position: absolute;
        top: 0;
        right: 17px;
        left: 17px;
        height: 2px;
        content: '';
        border-radius: 0 0 2px 2px;
        background: color-mix(in srgb, var(--pcolor) 34%, transparent);
    }

    span,
    small {
        display: block;
        color: var(--gray6);
        font-size: 10px;
    }

    strong {
        display: block;
        margin: 5px 0 4px;
        color: var(--gray);
        font-size: 28px;
        line-height: 1;
        font-variant-numeric: tabular-nums;
    }

    &.is-warning strong {
        color: var(--orange);
    }

    &.is-warning::before {
        background: color-mix(in srgb, var(--orange) 50%, transparent);
    }

    &.is-danger strong {
        color: var(--red);
    }

    &.is-danger::before {
        background: color-mix(in srgb, var(--red) 50%, transparent);
    }

    &.is-neutral strong {
        color: var(--pcolor);
    }
}

.insight-card {
    width: 100%;
    min-width: 0;
    padding: 20px;
    border: 1px solid var(--insight-line);
    border-radius: 17px;
    background:
        linear-gradient(180deg,
            color-mix(in srgb, var(--bgColor2) 38%, transparent),
            transparent 180px),
        var(--bgColor1);
    box-shadow: var(--insight-shadow);
}

.insight-trend-card {
    background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--pcolor) 7%, transparent), transparent 34%),
        var(--bgColor1);
}

.insight-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;

    h3 {
        margin: 4px 0 0;
        color: var(--gray);
        font-size: 16px;
        line-height: 1.35;
    }
}

.insight-count {
    padding: 3px 8px;
    border-radius: 999px;
    color: var(--gray6);
    background: var(--insight-soft);
    font-size: 9px;
    font-weight: 650;
}

.insight-legend {
    display: flex;
    gap: 12px;
    color: var(--gray6);
    font-size: 10px;

    span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }

    i {
        width: 7px;
        height: 7px;
        border-radius: 2px;

        &.is-search {
            background: var(--pcolor);
        }

        &.is-lost {
            background: var(--red);
        }
    }
}

.insight-trend-scroll {
    overflow-x: auto;
    scrollbar-width: thin;
}

.insight-trend {
    display: grid;
    grid-template-columns: repeat(var(--trend-columns), minmax(18px, 1fr));
    gap: 7px;
    min-width: max(100%, calc(var(--trend-columns) * 22px));
    height: 184px;
    padding: 8px 4px 0;
}

.trend-column {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    gap: 7px;
}

.trend-bars {
    display: flex;
    width: 100%;
    height: 142px;
    align-items: flex-end;
    justify-content: center;
    gap: 3px;
    border-bottom: 1px solid var(--insight-line);
}

.trend-bar {
    display: block;
    width: 6px;
    min-height: 2px;
    border-radius: 5px 5px 1px 1px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--pcolor) 62%, #fff), var(--pcolor));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--pcolor) 8%, transparent);
    transition: height 0.25s ease;

    &.is-lost {
        background: linear-gradient(180deg, color-mix(in srgb, var(--red) 54%, #fff), var(--red));
        opacity: 0.82;
    }
}

.trend-column.is-latest {
    .trend-bars {
        border-bottom-color: color-mix(in srgb, var(--pcolor) 42%, var(--insight-line));
    }

    .trend-date {
        color: var(--pcolor);
        font-weight: 700;
    }
}

.trend-date {
    overflow: hidden;
    max-width: 100%;
    color: var(--gray6);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform: rotate(-38deg);
    transform-origin: center;
}

.insight-grid {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: 12px;
}

.insight-rank-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.insight-rank-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 9px 11px;
    border: 1px solid transparent;
    border-radius: 12px;
    background:
        linear-gradient(90deg,
            color-mix(in srgb, var(--pcolor) 3%, transparent),
            transparent 72%),
        var(--insight-soft);
    transition: border-color 0.18s ease, background 0.18s ease;

    &:hover {
        border-color: color-mix(in srgb, var(--pcolor) 22%, var(--insight-line));
        background: var(--bgColor1);
    }
}

.rank-index {
    display: grid;
    width: 24px;
    height: 24px;
    flex: none;
    place-items: center;
    border-radius: 8px;
    color: var(--gray6);
    background: color-mix(in srgb, var(--gray2) 72%, transparent);
    font-size: 10px;
    font-weight: 700;

    &.is-hot {
        color: #fff;
        background: var(--pcolor);
    }
}

.rank-main {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 4px;
}

.rank-name {
    overflow: hidden;
    color: var(--gray);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
        color: var(--pcolor);
    }

    &.is-path {
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 11px;
    }
}

.rank-meta {
    overflow: hidden;
    color: var(--gray6);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rank-meter {
    display: block;
    width: 100%;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pcolor) 8%, var(--gray2));

    i {
        display: block;
        height: 100%;
        min-width: 5px;
        border-radius: inherit;
        background: linear-gradient(90deg, color-mix(in srgb, var(--pcolor) 58%, transparent), var(--pcolor));
    }

    &.is-danger {
        background: color-mix(in srgb, var(--red) 8%, var(--gray2));

        i {
            background: linear-gradient(90deg, color-mix(in srgb, var(--red) 52%, transparent), var(--red));
        }
    }
}

.rank-value {
    flex: none;
    color: var(--pcolor);
    font-size: 16px;
    font-variant-numeric: tabular-nums;

    &.is-danger {
        color: var(--red);
    }
}

.insight-empty {
    display: flex;
    min-height: 190px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px dashed var(--insight-line);
    border-radius: 12px;
    text-align: center;

    strong {
        color: var(--gray);
        font-size: 13px;
    }

    p {
        margin: 0;
        color: var(--gray6);
        font-size: 11px;
        line-height: 1.7;
    }
}

@media (max-width: 1040px) {
    .insight-facts {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .insight-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 680px) {
    .insight-hero {
        flex-direction: column;
        align-items: flex-start;

        &::after {
            display: none;
        }
    }

    .insight-periods {
        width: 100%;
        flex-wrap: wrap;
        border-radius: 14px;
    }

    .insight-periods-label {
        width: 100%;
        padding: 2px 6px 4px;
    }

    .insight-period {
        flex: 1;
    }

    .insight-facts {
        grid-template-columns: 1fr;
    }
}
</style>
