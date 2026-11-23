<template>
    <yk-space dir="vertical" size="l" class="admin-page tidy-page">
        <top-title name="待整理笔记" description="找出还没有双链的笔记与断掉的链接，顺手指一条回去的路"
            :is-search="false">
            <template #custom>
                <yk-button type="secondary" :loading="loading" @click="loadTidy">刷新</yk-button>
                <router-link class="tidy-back" to="/notes">返回花园</router-link>
            </template>
        </top-title>

        <div v-if="errorMessage" class="tidy-banner is-error">{{ errorMessage }}</div>

        <section class="tidy-hero" aria-label="花园整理概览">
            <div class="tidy-hero-copy">
                <span class="tidy-kicker">GARDEN INVENTORY</span>
                <p class="tidy-hero-title">
                    <template v-if="tidy.summary.orphan + tidy.summary.broken === 0 && !loading">
                        花园的路径是通的
                    </template>
                    <template v-else>
                        还有 {{ tidy.summary.orphan + tidy.summary.broken }} 处可以接上的路
                    </template>
                </p>
                <p class="tidy-hero-note">
                    双链让访客能在想法之间走动。下面按「没有链接」和「断掉的链接」分开列出，每条都附上几篇可能相关的笔记。
                </p>
            </div>
            <dl class="tidy-meter">
                <div class="tidy-meter-item">
                    <dt>已发布</dt>
                    <dd>{{ tidy.summary.published }}</dd>
                </div>
                <div class="tidy-meter-item is-warn">
                    <dt>没有双链</dt>
                    <dd>{{ tidy.summary.orphan }}</dd>
                </div>
                <div class="tidy-meter-item is-danger">
                    <dt>断链</dt>
                    <dd>{{ tidy.summary.broken }}</dd>
                </div>
            </dl>
        </section>

        <div v-if="loading" class="tidy-state">
            <yk-spinner size="m" />
        </div>

        <template v-else>
            <section class="tidy-section" aria-labelledby="tidy-orphan">
                <header class="tidy-head">
                    <div class="tidy-head-copy">
                        <span class="tidy-kicker">NO LINKS</span>
                        <h2 id="tidy-orphan">还没有双链的笔记</h2>
                        <p>这些笔记既没有指向别人，也没有被别人指向，访客很难从花园里走到它们。</p>
                    </div>
                    <b class="tidy-count" :class="{ 'is-clear': !tidy.orphans.length }">
                        {{ tidy.orphans.length }}
                    </b>
                </header>

                <div v-if="!tidy.orphans.length" class="tidy-empty">
                    <span class="tidy-empty-mark">🌿</span>
                    <strong>每篇公开笔记都至少有一条双链</strong>
                    <span>花园的路径是通的，去门户看看访客会怎么走。</span>
                </div>
                <div v-else class="tidy-list">
                    <article v-for="item in tidy.orphans" :key="item.id" class="tidy-card">
                        <header class="tidy-card-head">
                            <div class="tidy-card-copy">
                                <span class="tidy-card-meta">{{ formatDate(item.updatedAt) }}</span>
                                <router-link class="tidy-card-title" :to="`/notes?note=${item.id}`">
                                    {{ item.title }}
                                </router-link>
                                <p class="tidy-card-excerpt">{{ item.excerpt || '空白笔记' }}</p>
                                <span v-if="item.tags.length" class="tidy-tags">
                                    <span v-for="tag in item.tags" :key="tag">#{{ tag }}</span>
                                </span>
                            </div>
                            <div class="tidy-card-actions">
                                <!-- 写作闭环：把笔记与推荐双链一起带进新建文章 -->
                                <router-link v-if="item.upgradedArticle && item.articleLinked" class="tidy-linked"
                                    :to="`/portal/articles?open=${item.upgradedArticle.id}`" target="_blank" rel="noopener">
                                    链接到文章
                                </router-link>
                                <button v-else type="button" class="tidy-upgrade" :disabled="upgradingId === item.id"
                                    @click="upgradeToArticle(item)">
                                    {{ upgradeLabel(item) }}
                                </button>
                                <a v-if="item.id" class="tidy-preview" :href="`/portal/notes?open=${item.id}`"
                                    target="_blank" rel="noopener">
                                    预览
                                    <IconRightOutline />
                                </a>
                            </div>
                        </header>

                        <div v-if="item.suggestions.length" class="tidy-suggest">
                            <p class="tidy-suggest-label">建议连向</p>
                            <ul>
                                <li v-for="s in item.suggestions" :key="s.key || s.id">
                                    <span class="tidy-suggest-title">{{ s.title }}</span>
                                    <span class="tidy-suggest-meta">
                                        <span v-for="reason in s.reasons" :key="reason" class="tidy-chip">{{ reason }}</span>
                                        <span v-if="!s.reasons.length" class="tidy-chip is-quiet">标题相近</span>
                                        <span v-if="s.kind !== 'article'" class="tidy-ref">{{ s.incomingLinks }} 处引用</span>
                                    </span>
                                    <a v-if="s.kind === 'article' && s.url" class="tidy-copy" :href="s.url"
                                        target="_blank" rel="noopener">
                                        打开长文
                                    </a>
                                    <button v-else type="button" class="tidy-copy" @click="copyLink(item, s)">
                                        复制双链
                                    </button>
                                </li>
                            </ul>
                        </div>
                        <p v-else class="tidy-suggest-empty">
                            暂时没有相近的笔记。先用 <code>#标签</code> 给它归类，或再多写几篇相关笔记。
                        </p>
                    </article>
                </div>
            </section>

            <section class="tidy-section" aria-labelledby="tidy-broken">
                <header class="tidy-head">
                    <div class="tidy-head-copy">
                        <span class="tidy-kicker">BROKEN LINKS</span>
                        <h2 id="tidy-broken">指向未公开标题的链接</h2>
                        <p>这些双链的目标还不存在、或仍是草稿。访客看到的是不可点击的灰色文字。</p>
                    </div>
                    <b class="tidy-count" :class="{ 'is-danger': tidy.brokenLinks.length, 'is-clear': !tidy.brokenLinks.length }">
                        {{ tidy.brokenLinks.length }}
                    </b>
                </header>

                <div v-if="!tidy.brokenLinks.length" class="tidy-empty">
                    <span class="tidy-empty-mark">🔗</span>
                    <strong>没有断链</strong>
                    <span>所有双链都能跳到公开笔记。</span>
                </div>
                <div v-else class="tidy-list">
                    <article v-for="item in tidy.brokenLinks" :key="item.id" class="tidy-card is-broken">
                        <header class="tidy-card-head">
                            <div class="tidy-card-copy">
                                <span class="tidy-card-meta">{{ formatDate(item.updatedAt) }}</span>
                                <router-link class="tidy-card-title" :to="`/notes?note=${item.id}`">
                                    {{ item.title }}
                                </router-link>
                                <p class="tidy-card-excerpt">{{ item.excerpt || '空白笔记' }}</p>
                            </div>
                            <div class="tidy-card-actions">
                                <router-link v-if="item.upgradedArticle && item.articleLinked" class="tidy-linked"
                                    :to="`/portal/articles?open=${item.upgradedArticle.id}`" target="_blank" rel="noopener">
                                    链接到文章
                                </router-link>
                                <button v-else type="button" class="tidy-upgrade" :disabled="upgradingId === item.id"
                                    @click="upgradeToArticle(item)">
                                    {{ upgradeLabel(item) }}
                                </button>
                            </div>
                        </header>
                        <div class="tidy-missing">
                            <span class="tidy-missing-label">找不到的目标</span>
                            <ul>
                                <li v-for="title in item.missingLinks" :key="title">
                                    <code>[[{{ title }}]]</code>
                                </li>
                            </ul>
                        </div>
                        <div v-if="item.suggestions.length" class="tidy-suggest">
                            <p class="tidy-suggest-label">也许想连的是</p>
                            <ul>
                                <li v-for="s in item.suggestions" :key="s.key || s.id">
                                    <span class="tidy-suggest-title">{{ s.title }}</span>
                                    <span class="tidy-suggest-meta">
                                        <span v-for="reason in s.reasons" :key="reason" class="tidy-chip">{{ reason }}</span>
                                        <span v-if="!s.reasons.length" class="tidy-chip is-quiet">标题相近</span>
                                        <span v-if="s.kind !== 'article'" class="tidy-ref">{{ s.incomingLinks }} 处引用</span>
                                    </span>
                                    <a v-if="s.kind === 'article' && s.url" class="tidy-copy" :href="s.url"
                                        target="_blank" rel="noopener">
                                        打开长文
                                    </a>
                                    <button v-else type="button" class="tidy-copy" @click="copyLink(item, s)">
                                        复制双链
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </article>
                </div>
            </section>
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
import { getCurrentInstance, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
    getNoteById,
    getNoteTidy,
    type TidyNote,
    type TidyReport,
    type TidySuggestion,
} from '../api/note'
import { buildArticleDraft } from '../utils/noteToArticle'
import { NEW_ARTICLE_DRAFT_KIND, writeLocalDraft } from '../utils/localDraft'

const proxy = getCurrentInstance()?.proxy as {
    $message?: (options: { type: 'primary' | 'warning' | 'error'; message: string }) => void
} | null | undefined

const loading = ref(false)
const errorMessage = ref('')
const upgradingId = ref<number | null>(null)
const router = useRouter()
// 变量名不要叫 report：Vue 的 setup 编译产物会占用部分通用标识符，
// 之前同名导致模板里拿到 undefined，整页直接进 ErrorBoundary
const tidy = ref<TidyReport>({
    orphans: [],
    brokenLinks: [],
    summary: { published: 0, orphan: 0, broken: 0 },
})

const loadTidy = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
        const result = await getNoteTidy(3)
        // 接口返回缺字段时（老版本后端、代理异常）也要能渲染空清单，而不是整页崩掉
        const data = result?.data
        if (result?.code === 200 && data) {
            tidy.value = {
                orphans: Array.isArray(data.orphans) ? data.orphans : [],
                brokenLinks: Array.isArray(data.brokenLinks) ? data.brokenLinks : [],
                summary: {
                    published: Number(data.summary?.published) || 0,
                    orphan: Number(data.summary?.orphan) || 0,
                    broken: Number(data.summary?.broken) || 0,
                },
            }
        }
    } catch {
        errorMessage.value = '待整理清单加载失败，请稍后重试'
    } finally {
        loading.value = false
    }
}

// 复制的是可直接粘贴到正文的双链语法，而不是给外部用的 URL
const copyLink = async (note: TidyNote, target: TidySuggestion) => {
    const snippet = target.kind === 'article' && target.url
        ? `[${target.title}](${target.url})`
        : note.missingLinks.includes(target.title)
            ? `[[${target.title}]]`
            : `[${target.title}](note://${target.id})`
    try {
        await navigator.clipboard.writeText(snippet)
        proxy?.$message?.({ type: 'primary', message: `已复制：${snippet}` })
    } catch {
        proxy?.$message?.({ type: 'warning', message: `复制失败，请手动输入：${snippet}` })
    }
}

/**
 * 笔记升级成长文：拉一次完整正文，把推荐笔记写成双链，
 * 落进新建文章的本机草稿再跳过去，编辑器打开即可继续。
 */
// 已升级过但正文还没回链的笔记，按钮改成「回笔记补链接」，避免重复开新稿
const upgradeLabel = (note: TidyNote): string => {
    if (upgradingId.value === note.id) return '准备中…'
    if (note.upgradedArticle) return '回笔记补链接'
    return '升级成长文'
}

const upgradeToArticle = async (note: TidyNote) => {
    if (upgradingId.value) return
    if (note.upgradedArticle) {
        await router.push({
            path: '/notes',
            query: {
                note: String(note.id),
                linkArticle: String(note.upgradedArticle.id),
                articleTitle: note.upgradedArticle.title,
                snippet: `## 延伸阅读\n\n- [${note.upgradedArticle.title}](/portal/articles?open=${note.upgradedArticle.id})`,
            },
        })
        return
    }
    upgradingId.value = note.id
    try {
        const detail = await getNoteById(note.id)
        const source = detail?.code === 200 && detail.data ? detail.data : null
        const draft = buildArticleDraft(
            { title: source?.title || note.title, content: source?.content || '' },
            note.suggestions.map(item => ({ id: item.id, title: item.title }))
        )
        // 已有未发布的本机草稿时先确认，避免直接覆盖作者写了一半的内容
        const hasExisting = Boolean(localStorage.getItem(`linblog.local-draft.${NEW_ARTICLE_DRAFT_KIND}`))
        if (hasExisting && !window.confirm('新建文章里已有一份本机草稿，用这篇笔记的升级稿替换它？')) {
            return
        }
        writeLocalDraft(NEW_ARTICLE_DRAFT_KIND, {
            title: draft.title,
            content: draft.content,
            subsetId: null,
            label: '',
            introduce: note.excerpt || '',
            cover: '',
            sourceNoteId: note.id,
        })
        proxy?.$message?.({ type: 'primary', message: '已生成文章草稿，打开编辑器继续写' })
        await router.push('/editarticle')
    } catch {
        proxy?.$message?.({ type: 'error', message: '笔记读取失败，请稍后重试' })
    } finally {
        upgradingId.value = null
    }
}

// 与花园卡片一致的时间格式，便于一眼对上笔记的修整时间
const formatDate = (value?: string | null): string => {
    if (!value) return '未标注时间'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '未标注时间'
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

onMounted(() => {
    void loadTidy()
})

defineOptions({ name: 'NoteTidyView' })
</script>

<style lang="less" scoped>
.tidy-page {
    max-width: 1080px;
}

.tidy-back {
    margin-left: 8px;
    color: var(--gray8);
    font-size: 13px;
    text-decoration: none;
    transition: color 0.18s ease;

    &:hover {
        color: var(--pcolor);
    }
}

.tidy-banner {
    padding: 10px 16px;
    border-radius: 12px;
    font-size: 13px;

    &.is-error {
        background: color-mix(in srgb, @ecolor 10%, transparent);
        color: @ecolor;
    }
}

// 概览条：左侧一句状态，右侧三格数字，替代原来三块等重大数字卡
.tidy-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px 40px;
    align-items: center;
    padding: 24px 26px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 20px;
    background:
        radial-gradient(circle at 0% 0%, var(--pcolor1), transparent 46%),
        var(--bgColor1);
}

.tidy-hero-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
}

.tidy-hero-title {
    margin: 0;
    color: var(--gray);
    font-size: 20px;
    font-weight: 650;
    line-height: 1.4;
}

.tidy-hero-note {
    max-width: 60ch;
    margin: 0;
    color: var(--gray8);
    font-size: 12px;
    line-height: 1.75;
}

.tidy-meter {
    display: flex;
    gap: 0;
    margin: 0;

    &-item {
        display: flex;
        min-width: 92px;
        flex-direction: column;
        gap: 2px;
        padding: 0 20px;
        border-left: 1px solid var(--admin-line, var(--gray1));

        &:last-child {
            padding-right: 4px;
        }

        dt {
            color: var(--gray6);
            font-size: 11px;
            white-space: nowrap;
        }

        dd {
            margin: 0;
            color: var(--gray);
            font-family: inherit;
            font-size: 26px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            line-height: 1.2;
        }

        &.is-warn dd {
            color: var(--pcolor);
        }

        &.is-warn dt {
            color: var(--pcolor);
        }

        &.is-danger dd,
        &.is-danger dt {
            color: @ecolor;
        }
    }
}

.tidy-kicker {
    color: var(--gray6);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
}

.tidy-state {
    display: grid;
    place-items: center;
    padding: 80px 0;
}

.tidy-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 12px;
}

.tidy-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--admin-line, var(--gray1));

    &-copy {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 4px;
    }

    h2 {
        margin: 2px 0 2px;
        color: var(--gray);
        font-size: 18px;
        font-weight: 650;
    }

    p {
        margin: 0;
        color: var(--gray6);
        font-size: 12px;
        line-height: 1.7;
    }
}

.tidy-count {
    flex-shrink: 0;
    min-width: 40px;
    padding: 2px 12px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    text-align: center;

    &.is-clear {
        background: color-mix(in srgb, var(--gray1) 70%, transparent);
        color: var(--gray6);
    }

    &.is-danger {
        background: color-mix(in srgb, @ecolor 10%, transparent);
        color: @ecolor;
    }
}

.tidy-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 34px 24px;
    border: 1px dashed var(--admin-line, var(--gray1));
    border-radius: 18px;
    color: var(--gray6);
    font-size: 12px;
    text-align: center;

    strong {
        color: var(--gray);
        font-size: 14px;
        font-weight: 600;
    }

    &-mark {
        font-size: 22px;
        line-height: 1;
    }
}

.tidy-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
    gap: 14px;
}

.tidy-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 18px 20px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 18px;
    background: var(--bgColor1);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        border-color: var(--pcolor3);
        box-shadow: 0 10px 26px -18px var(--pcolor);
    }

    // 断链卡片左侧留一道细色带，扫一眼就能和不连通的笔记区分
    &.is-broken {
        border-left: 3px solid color-mix(in srgb, @ecolor 55%, transparent);
    }
}

.tidy-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.tidy-card-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
}

.tidy-card-meta {
    color: var(--gray6);
    font-size: 10px;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
}

.tidy-card-title {
    color: var(--gray);
    font-size: 16px;
    font-weight: 650;
    line-height: 1.4;
    text-decoration: none;
    transition: color 0.18s ease;

    &:hover {
        color: var(--pcolor);
    }
}

.tidy-card-excerpt {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--gray8);
    font-size: 12px;
    line-height: 1.75;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.tidy-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--pcolor);
    font-size: 11px;
}

.tidy-preview {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 2px;
    padding: 3px 10px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    color: var(--gray6);
    font-size: 11px;
    text-decoration: none;
    transition: color 0.18s ease, border-color 0.18s ease;

    &:hover {
        border-color: var(--pcolor3);
        color: var(--pcolor);
    }
}

.tidy-card-actions {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
}

// 升级成长文是这个页面的主动作，用实色与复制双链、预览区分开
.tidy-upgrade {
    flex-shrink: 0;
    padding: 4px 12px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--pcolor);
    color: #fff;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: filter 0.18s ease, opacity 0.18s ease;

    &:hover:not(:disabled) {
        filter: brightness(1.08);
    }

    &:disabled {
        opacity: 0.6;
        cursor: progress;
    }
}

.tidy-linked {
    flex-shrink: 0;
    padding: 4px 12px;
    border: 1px solid color-mix(in srgb, var(--scolor, #1fb4a2) 40%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--scolor, #1fb4a2) 10%, transparent);
    color: var(--scolor, #1fb4a2);
    font-size: 11px;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color 0.18s ease;

    &:hover {
        background: color-mix(in srgb, var(--scolor, #1fb4a2) 16%, transparent);
    }
}

.tidy-suggest {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--admin-line, var(--gray1));

    ul {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    li {
        display: flex;
        align-items: baseline;
        gap: 8px 10px;
        flex-wrap: wrap;
    }
}

.tidy-suggest-label {
    margin: 0 0 8px;
    color: var(--gray6);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
}

.tidy-suggest-title {
    color: var(--gray);
    font-size: 13px;
    font-weight: 600;
}

.tidy-suggest-meta {
    display: inline-flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--gray6);
    font-size: 11px;
}

.tidy-chip {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 10px;
    line-height: 1.7;

    &.is-quiet {
        background: var(--gray1);
        color: var(--gray6);
    }
}

.tidy-ref {
    color: var(--gray6);
}

.tidy-copy {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 3px 12px;
    border: 1px solid var(--pcolor3);
    border-radius: 999px;
    background: transparent;
    color: var(--pcolor);
    font-size: 11px;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.18s ease;

    &:hover {
        background: var(--pcolor1);
    }
}

.tidy-suggest-empty {
    margin: 12px 0 0;
    color: var(--gray6);
    font-size: 12px;

    code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--pcolor1);
        color: var(--pcolor);
    }
}

.tidy-missing {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, @ecolor 6%, transparent);

    &-label {
        color: var(--gray6);
        font-size: 10px;
        letter-spacing: 0.12em;
    }

    ul {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    code {
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--bgColor1) 70%, transparent);
        color: @ecolor;
        font-size: 11px;
    }
}

@media (max-width: 860px) {
    .tidy-hero {
        grid-template-columns: 1fr;
        gap: 18px;
        padding: 20px;
    }

    .tidy-meter-item {
        flex: 1;
        min-width: 0;
        padding: 0 14px;

        &:first-child {
            padding-left: 0;
            border-left: none;
        }

        dd {
            font-size: 22px;
        }
    }

    .tidy-list {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 560px) {
    .tidy-head {
        align-items: flex-start;
    }

    .tidy-card {
        padding: 16px;
    }

    .tidy-suggest-meta {
        flex-basis: 100%;
    }
}
</style>

