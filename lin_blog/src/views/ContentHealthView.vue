<template>
    <yk-space dir="vertical" size="l" class="admin-page health-page">
        <top-title name="内容健康" description="检查缺封面、久未更新、空图库与门户失效链接" :is-search="false">
            <template #custom>
                <yk-button type="primary" :loading="loading" @click="loadHealth">
                    重新检查
                </yk-button>
            </template>
        </top-title>

        <div v-if="errorMessage" class="health-banner is-error">{{ errorMessage }}</div>

        <div v-if="loading && !report" class="health-loading">
            <yk-spinner size="m" />
            <span>正在扫描已发布内容...</span>
        </div>

        <template v-else-if="report">
            <section class="health-hero" aria-label="内容健康概览">
                <div class="health-score" :class="scoreTone"
                    :style="{ '--health-score': `${healthScore}%` }">
                    <strong>{{ healthScore }}</strong>
                    <span>健康度</span>
                </div>
                <div class="health-hero-copy">
                    <span class="health-kicker">CONTENT HEALTH · {{ formatDateTime(report.generatedAt) }}</span>
                    <h2>
                        {{ report.summary.issueItems > 0
                            ? `有 ${report.summary.issueItems} 篇内容可以再整理一下`
                            : '目前内容状态很健康' }}
                    </h2>
                    <p>
                        已检查 {{ report.summary.scanned }} 篇已发布内容。
                        检查项包括封面、简介、分类、标签、更新频率、正文长度、图库图片和门户内部链接。
                    </p>
                </div>
                <div class="health-facts">
                    <div class="health-fact">
                        <span>已发布</span>
                        <strong>{{ report.summary.published }}</strong>
                        <small>{{ report.summary.scanned }} 篇参与扫描</small>
                    </div>
                    <div class="health-fact is-success">
                        <span>健康</span>
                        <strong>{{ report.summary.healthy }}</strong>
                        <small>没有发现问题</small>
                    </div>
                    <div class="health-fact is-warning">
                        <span>待处理</span>
                        <strong>{{ report.summary.issueItems }}</strong>
                        <small>至少有一项问题</small>
                    </div>
                    <div class="health-fact is-danger">
                        <span>失效链接</span>
                        <strong>{{ report.summary.byIssue.brokenLinks }}</strong>
                        <small>门户内部链接</small>
                    </div>
                </div>
            </section>

            <section class="health-toolbar" aria-label="健康检查筛选">
                <div class="health-toolbar-group">
                    <span class="health-toolbar-label">久未更新阈值</span>
                    <div class="health-segments">
                        <button v-for="days in staleOptions" :key="days" type="button" class="health-segment"
                            :class="{ 'is-active': report.staleDays === days }" :disabled="loading"
                            @click="changeStaleDays(days)">
                            {{ days }} 天
                        </button>
                    </div>
                </div>

                <div class="health-toolbar-group health-toolbar-group--issues">
                    <span class="health-toolbar-label">问题类型</span>
                    <div class="health-pills">
                        <button type="button" class="health-pill" :class="{ 'is-active': issueFilter === 'all' }"
                            @click="issueFilter = 'all'">
                            全部
                            <b>{{ report.summary.issueItems }}</b>
                        </button>
                        <button v-for="key in visibleIssueKeys" :key="key" type="button" class="health-pill"
                            :class="{ 'is-active': issueFilter === key }" @click="issueFilter = key">
                            {{ issueMeta[key].label }}
                            <b>{{ report.summary.byIssue[key] }}</b>
                        </button>
                    </div>
                </div>
            </section>

            <div v-if="report.truncated" class="health-banner is-notice">
                已发布内容超过本次扫描上限 {{ report.scanLimit }} 篇，当前结果只覆盖最早更新的那一批。
            </div>

            <section v-if="filteredItems.length" class="health-list" aria-label="需要整理的内容">
                <article v-for="item in pagedItems" :key="item.id" class="health-card">
                    <header class="health-card-head">
                        <div class="health-card-title">
                            <span class="health-kind" :class="{ 'is-image': item.classify === 'image' }">
                                {{ item.classify === 'image' ? '图库' : '文章' }}
                            </span>
                            <h3>{{ item.title }}</h3>
                        </div>
                        <div class="health-card-actions">
                            <RouterLink class="health-action" :to="item.editPath">编辑</RouterLink>
                            <a class="health-action is-ghost" :href="item.publicPath" target="_blank"
                                rel="noopener">查看</a>
                        </div>
                    </header>

                    <div class="health-issues">
                        <span v-for="issue in item.issues" :key="issue" class="health-issue"
                            :class="`is-${issueMeta[issue].tone}`">
                            {{ issueMeta[issue].label }}
                        </span>
                    </div>

                    <div v-if="item.brokenLinks.length" class="health-links">
                        <span class="health-links-title">失效链接</span>
                        <div v-for="link in item.brokenLinks" :key="`${link.href}-${link.reason}`"
                            class="health-link-row">
                            <code>{{ link.href }}</code>
                            <em>{{ link.reason }}</em>
                        </div>
                    </div>

                    <footer class="health-card-meta">
                        <span>{{ item.subsetName || '未分类' }}</span>
                        <span v-if="item.label">{{ item.label }}</span>
                        <span>最后更新 {{ formatDate(item.lastTouchedAt) }}</span>
                        <span v-if="item.classify === 'image'">{{ item.imageCount }} 张图片</span>
                        <span v-else>{{ item.contentLength }} 字</span>
                    </footer>
                </article>

                <div class="health-pagination">
                    <AdminPager v-model:page="page" v-model:page-size="pageSize"
                        :total="filteredItems.length" :page-size-options="[10, 20, 50]"
                        :show-page-size="true" :show-total="true" :disabled="loading" />
                </div>
            </section>

            <div v-else class="health-empty">
                <span class="health-empty-mark">✓</span>
                <strong>{{ issueFilter === 'all' ? '没有发现需要处理的内容' : '这个检查项下没有内容' }}</strong>
                <p>可以切换其它问题类型，或调整“久未更新”的判定天数再看。</p>
                <yk-button v-if="issueFilter !== 'all'" type="text" size="s" @click="issueFilter = 'all'">
                    查看全部检查结果
                </yk-button>
            </div>
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import AdminPager from '../components/common/AdminPager.vue'
import {
    getContentHealth,
    type ContentHealthItem,
    type ContentHealthReport,
    type ContentIssueKey,
} from '../api/contentHealth'

const ISSUE_ORDER: ContentIssueKey[] = [
    'brokenLinks',
    'missingCover',
    'staleContent',
    'uncategorized',
    'missingLabels',
    'missingIntro',
    'shortContent',
    'emptyGallery',
]

const issueMeta: Record<ContentIssueKey, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
    brokenLinks: { label: '失效链接', tone: 'danger' },
    missingCover: { label: '缺封面', tone: 'warning' },
    staleContent: { label: '久未更新', tone: 'warning' },
    uncategorized: { label: '未分类', tone: 'neutral' },
    missingLabels: { label: '缺标签', tone: 'neutral' },
    missingIntro: { label: '缺简介', tone: 'neutral' },
    shortContent: { label: '正文偏短', tone: 'warning' },
    emptyGallery: { label: '空图库', tone: 'danger' },
}

const staleOptions = [90, 180, 365]
const report = ref<ContentHealthReport | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const issueFilter = ref<'all' | ContentIssueKey>('all')
const page = ref(1)
const pageSize = ref(10)

const healthScore = computed(() => {
    if (!report.value || report.value.summary.scanned === 0) return 100
    return Math.round((report.value.summary.healthy / report.value.summary.scanned) * 100)
})

const scoreTone = computed(() => {
    if (healthScore.value >= 90) return 'is-good'
    if (healthScore.value >= 70) return 'is-warning'
    return 'is-danger'
})

const visibleIssueKeys = computed(() => {
    if (!report.value) return []
    return ISSUE_ORDER.filter(key => report.value!.summary.byIssue[key] > 0)
})

const filteredItems = computed<ContentHealthItem[]>(() => {
    if (!report.value) return []
    if (issueFilter.value === 'all') return report.value.items
    return report.value.items.filter(item => item.issues.includes(issueFilter.value as ContentIssueKey))
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)))

const pagedItems = computed<ContentHealthItem[]>(() => {
    const currentPage = Math.min(Math.max(1, page.value), pageCount.value)
    const start = (currentPage - 1) * pageSize.value
    return filteredItems.value.slice(start, start + pageSize.value)
})

const getErrorMessage = (error: unknown): string => {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
    return responseMessage || (error instanceof Error ? error.message : '内容健康检查失败')
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

const loadHealth = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''
    try {
        const result = await getContentHealth(report.value?.staleDays || 180)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '内容健康检查失败')
        }
        report.value = result.data
        if (issueFilter.value !== 'all' && result.data.summary.byIssue[issueFilter.value] === 0) {
            issueFilter.value = 'all'
        }
        page.value = 1
    } catch (error) {
        errorMessage.value = getErrorMessage(error)
    } finally {
        loading.value = false
    }
}

const changeStaleDays = async (days: number): Promise<void> => {
    if (!report.value || report.value.staleDays === days) return
    report.value = { ...report.value, staleDays: days }
    await loadHealth()
}

onMounted(() => {
    void loadHealth()
})

watch(issueFilter, () => {
    page.value = 1
})
</script>

<style lang="less" scoped>
.health-page {
    --red: #d84a3a;
    --green: #239b67;
    --orange: #d18412;
    --health-line: color-mix(in srgb, var(--gray1) 84%, transparent);
    --health-soft: color-mix(in srgb, var(--pcolor1) 44%, var(--bgColor1));
    --health-card-shadow: 0 14px 34px color-mix(in srgb, #1c2540 6%, transparent);
}

.health-banner {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--health-line);
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.6;

    &.is-error {
        color: var(--red);
        background: color-mix(in srgb, var(--red) 8%, var(--bgColor1));
        border-color: color-mix(in srgb, var(--red) 28%, var(--health-line));
    }

    &.is-notice {
        color: var(--orange);
        background: color-mix(in srgb, var(--orange) 8%, var(--bgColor1));
        border-color: color-mix(in srgb, var(--orange) 24%, var(--health-line));
    }
}

.health-loading {
    display: flex;
    min-height: 280px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--gray6);
    font-size: 12px;
}

.health-hero {
    position: relative;
    isolation: isolate;
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 22px;
    align-items: center;
    overflow: hidden;
    padding: 26px;
    border: 1px solid var(--health-line);
    border-radius: 20px;
    background:
        radial-gradient(circle at 4% 0%, color-mix(in srgb, var(--pcolor) 14%, transparent), transparent 34%),
        linear-gradient(135deg, var(--pcolor1), transparent 58%),
        var(--bgColor1);
    box-shadow: var(--health-card-shadow);

    &::before {
        position: absolute;
        z-index: -1;
        inset: 0;
        content: '';
        opacity: 0.34;
        background-image:
            linear-gradient(color-mix(in srgb, var(--pcolor) 12%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--pcolor) 12%, transparent) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: linear-gradient(100deg, #000, transparent 64%);
        pointer-events: none;
    }
}

.health-score {
    position: relative;
    isolation: isolate;
    display: grid;
    width: 116px;
    height: 116px;
    flex: none;
    place-items: center;
    align-content: center;
    gap: 2px;
    border-radius: 50%;
    background:
        conic-gradient(var(--green) var(--health-score, 0%), color-mix(in srgb, var(--green) 12%, var(--gray2)) 0);
    box-shadow:
        0 0 0 1px color-mix(in srgb, var(--green) 20%, var(--health-line)),
        0 14px 30px color-mix(in srgb, var(--green) 11%, transparent);

    &::before {
        position: absolute;
        z-index: -1;
        inset: 7px;
        content: '';
        border-radius: 50%;
        background:
            radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--green) 10%, transparent), transparent 58%),
            var(--bgColor1);
        box-shadow: inset 0 0 0 1px var(--health-line);
    }

    strong {
        position: relative;
        z-index: 1;
        color: var(--green);
        font-size: 38px;
        font-weight: 750;
        line-height: 1;
        font-variant-numeric: tabular-nums;
    }

    span {
        position: relative;
        z-index: 1;
        color: var(--gray6);
        font-size: 10px;
    }

    &.is-warning {
        background:
            conic-gradient(var(--orange) var(--health-score, 0%), color-mix(in srgb, var(--orange) 12%, var(--gray2)) 0);
        box-shadow:
            0 0 0 1px color-mix(in srgb, var(--orange) 24%, var(--health-line)),
            0 14px 30px color-mix(in srgb, var(--orange) 11%, transparent);

        strong {
            color: var(--orange);
        }

        &::before {
            background:
                radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--orange) 10%, transparent), transparent 58%),
                var(--bgColor1);
        }
    }

    &.is-danger {
        background:
            conic-gradient(var(--red) var(--health-score, 0%), color-mix(in srgb, var(--red) 12%, var(--gray2)) 0);
        box-shadow:
            0 0 0 1px color-mix(in srgb, var(--red) 24%, var(--health-line)),
            0 14px 30px color-mix(in srgb, var(--red) 11%, transparent);

        strong {
            color: var(--red);
        }

        &::before {
            background:
                radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--red) 10%, transparent), transparent 58%),
                var(--bgColor1);
        }
    }
}

.health-hero-copy {
    min-width: 0;

    h2 {
        margin: 5px 0 7px;
        color: var(--gray);
        font-size: 21px;
        line-height: 1.35;
    }

    p {
        max-width: 720px;
        margin: 0;
        color: var(--gray6);
        font-size: 12px;
        line-height: 1.75;
    }
}

.health-kicker {
    color: var(--pcolor);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
}

.health-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(72px, 1fr));
    gap: 7px;
}

.health-fact {
    min-width: 78px;
    padding: 10px 12px;
    border: 1px solid var(--health-line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bgColor2) 68%, var(--bgColor1));
    backdrop-filter: blur(6px);

    span,
    small {
        display: block;
        color: var(--gray6);
        font-size: 10px;
    }

    strong {
        display: block;
        margin-top: 3px;
        color: var(--gray);
        font-size: 20px;
        line-height: 1;
    }

    small {
        margin-top: 5px;
        font-size: 9px;
        line-height: 1.35;
    }

    &.is-success strong {
        color: var(--green);
    }

    &.is-warning strong {
        color: var(--orange);
    }

    &.is-danger strong {
        color: var(--red);
    }
}

.health-toolbar {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 14px 24px;
    align-items: flex-end;
    padding: 17px 19px;
    border: 1px solid var(--health-line);
    border-radius: 16px;
    background:
        linear-gradient(90deg,
            color-mix(in srgb, var(--bgColor2) 62%, transparent),
            transparent 72%),
        var(--bgColor1);
}

.health-toolbar-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;

    &--issues {
        flex: 1;
    }
}

.health-toolbar-label {
    color: var(--gray6);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.08em;
}

.health-segments,
.health-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.health-segment,
.health-pill {
    border: 1px solid var(--health-line);
    border-radius: 999px;
    color: var(--gray6);
    background: color-mix(in srgb, var(--bgColor2) 74%, var(--bgColor1));
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition:
        color 0.18s ease,
        background 0.18s ease,
        border-color 0.18s ease,
        transform 0.18s ease;

    &:hover:not(:disabled) {
        color: var(--pcolor);
        border-color: color-mix(in srgb, var(--pcolor) 30%, var(--health-line));
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }

    &.is-active {
        border-color: var(--pcolor);
        color: var(--pcolor);
        background: color-mix(in srgb, var(--pcolor) 9%, var(--bgColor1));
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pcolor) 10%, transparent);
    }
}

.health-segment {
    padding: 6px 12px;
}

.health-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;

    b {
        display: grid;
        min-width: 17px;
        height: 17px;
        place-items: center;
        border-radius: 999px;
        background: color-mix(in srgb, currentColor 10%, transparent);
        font-size: 9px;
    }
}

.health-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.health-pagination {
    padding: 4px 2px 0;
}

.health-card {
    position: relative;
    overflow: hidden;
    padding: 17px 19px 15px;
    border: 1px solid var(--health-line);
    border-radius: 15px;
    background: var(--bgColor1);
    box-shadow: 0 1px 0 color-mix(in srgb, #fff 24%, transparent);
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        transform 0.18s ease;

    &::before {
        position: absolute;
        top: 16px;
        bottom: 16px;
        left: 0;
        width: 3px;
        content: '';
        border-radius: 0 3px 3px 0;
        background: color-mix(in srgb, var(--pcolor) 48%, transparent);
    }

    &:hover {
        border-color: color-mix(in srgb, var(--pcolor) 24%, var(--health-line));
        box-shadow: var(--health-card-shadow);
        transform: translateY(-1px);
    }
}

.health-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.health-card-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;

    h3 {
        overflow: hidden;
        margin: 0;
        color: var(--gray);
        font-size: 14px;
        font-weight: 650;
        line-height: 1.45;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.health-kind {
    flex: none;
    padding: 2px 7px;
    border-radius: 5px;
    color: var(--pcolor);
    background: var(--pcolor1);
    font-size: 9px;
    font-weight: 650;

    &.is-image {
        color: var(--green);
        background: color-mix(in srgb, var(--green) 10%, transparent);
    }
}

.health-card-actions {
    display: flex;
    flex: none;
    gap: 5px;
}

.health-action {
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--pcolor);
    font-size: 11px;
    text-decoration: none;

    &:hover {
        background: var(--pcolor1);
    }

    &.is-ghost {
        color: var(--gray6);

        &:hover {
            color: var(--gray);
            background: var(--bgColor2);
        }
    }
}

.health-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 10px;
}

.health-issue {
    padding: 3px 8px;
    border: 1px solid var(--health-line);
    border-radius: 999px;
    color: var(--gray6);
    background: var(--bgColor2);
    font-size: 10px;

    &.is-danger {
        color: var(--red);
        border-color: color-mix(in srgb, var(--red) 25%, var(--health-line));
        background: color-mix(in srgb, var(--red) 7%, var(--bgColor1));
    }

    &.is-warning {
        color: var(--orange);
        border-color: color-mix(in srgb, var(--orange) 25%, var(--health-line));
        background: color-mix(in srgb, var(--orange) 7%, var(--bgColor1));
    }
}

.health-links {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 10px;
    padding: 10px 11px;
    border: 1px solid color-mix(in srgb, var(--red) 18%, var(--health-line));
    border-radius: 8px;
    background: color-mix(in srgb, var(--red) 4%, var(--bgColor1));
}

.health-links-title {
    color: var(--red);
    font-size: 10px;
    font-weight: 650;
}

.health-link-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-size: 10px;

    code {
        padding: 2px 5px;
        border-radius: 4px;
        color: var(--gray);
        background: var(--bgColor2);
        word-break: break-all;
    }

    em {
        color: var(--red);
        font-style: normal;
    }
}

.health-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed var(--health-line);
    color: var(--gray6);
    font-size: 10px;
}

.health-empty {
    display: flex;
    min-height: 230px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 30px;
    border: 1px dashed var(--health-line);
    border-radius: 14px;
    background: var(--bgColor1);
    text-align: center;

    strong {
        color: var(--gray);
        font-size: 15px;
    }

    p {
        max-width: 420px;
        margin: 0;
        color: var(--gray6);
        font-size: 12px;
        line-height: 1.7;
    }
}

.health-empty-mark {
    display: grid;
    width: 48px;
    height: 48px;
    place-items: center;
    border-radius: 50%;
    color: var(--green);
    background: color-mix(in srgb, var(--green) 10%, var(--bgColor1));
    font-size: 25px;
    font-weight: 700;
}

@media (max-width: 1000px) {
    .health-hero {
        grid-template-columns: auto minmax(0, 1fr);
    }

    .health-facts {
        grid-column: 1 / -1;
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}

@media (max-width: 680px) {
    .health-hero {
        grid-template-columns: 1fr;
        text-align: center;
    }

    .health-score {
        justify-self: center;
    }

    .health-facts {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .health-card-head {
        flex-direction: column;
    }

    .health-card-actions {
        align-self: flex-end;
    }
}
</style>
