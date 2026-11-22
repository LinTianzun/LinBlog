<template>
    <yk-modal :model-value="open" :title="note?.title || '花园笔记'" size="l" :show-footer="false"
        :closeable="true" @update:model-value="handleVisibleChange">
        <div v-if="note" class="garden-detail">
            <header class="garden-head">
                <p class="garden-meta">
                    <span>{{ formatDate(note.publishedAt || note.updatedAt) }}</span>
                    <span v-if="note.updatedAt">更新于 {{ formatDate(note.updatedAt) }}</span>
                </p>
                <h2 class="garden-title">{{ note.title }}</h2>
            </header>

            <div class="garden-prose" v-html="note.html" @click="handleProseClick" />

            <!-- 从笔记长成的文章：花园里的想法整理成正式长文的唯一出口 -->
            <section v-if="note.upgradedArticle" class="garden-upgraded" aria-label="升级成长文">
                <span class="upgraded-mark" aria-hidden="true">→</span>
                <div class="upgraded-copy">
                    <p class="upgraded-label">这篇笔记长大成了文章</p>
                    <p class="upgraded-title">{{ note.upgradedArticle.title }}</p>
                </div>
                <router-link class="upgraded-link"
                    :to="{ path: '/portal/articles', query: { open: String(note.upgradedArticle.id) } }"
                    @click="emit('close')">
                    去读完整版
                    <IconRightOutline />
                </router-link>
            </section>

            <!-- 双向浏览：出发链接告诉你这一篇通往哪里，反向链接告诉你从哪来 -->
            <section v-if="note.outgoing?.length || note.backlinks?.length" class="garden-links" aria-label="双链">
                <div v-if="note.outgoing?.length" class="garden-links-col">
                    <p class="backlinks-label">这一篇通向 · {{ note.outgoing.length }}</p>
                    <ul>
                        <li v-for="item in note.outgoing" :key="item.id">
                            <button type="button" class="backlink" @click="$emit('open-note', item.id)">
                                {{ item.title }}
                            </button>
                        </li>
                    </ul>
                </div>
                <div v-if="note.backlinks?.length" class="garden-links-col">
                    <p class="backlinks-label">指向这里的笔记 · {{ note.backlinks.length }}</p>
                    <ul>
                        <li v-for="item in note.backlinks" :key="item.id">
                            <button type="button" class="backlink" @click="$emit('open-note', item.id)">
                                {{ item.title }}
                            </button>
                        </li>
                    </ul>
                </div>
            </section>

            <!-- 没有双链但主题相近的笔记：补上「顺着想法走」的另一条路径 -->
            <section v-if="relatedNotes.length" class="garden-backlinks garden-related" aria-label="相关笔记">
                <p class="backlinks-label">主题相近 · {{ relatedNotes.length }}</p>
                <ul>
                    <li v-for="item in relatedNotes" :key="item.doc.id">
                        <button type="button" class="backlink" @click="$emit('open-note', item.doc.id)">
                            {{ item.doc.title }}
                            <small v-if="item.reasons.length">{{ item.reasons[0] }}</small>
                        </button>
                    </li>
                </ul>
            </section>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { IconRightOutline } from '@yike-design/ui/es/components/svg-icon'
import type { GardenNote } from '../../api/note'
import { findSimilar, type SimilarityDoc } from '../../utils/contentSimilarity'

const props = defineProps<{
    open: boolean
    note: GardenNote | null
    // 花园索引里已加载的公开笔记，用于现算主题相近的推荐
    pool?: GardenNote[]
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'open-note', id: number): void
}>()

const formatDate = (value?: string | null): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

const handleVisibleChange = (visible: boolean) => {
    if (!visible) emit('close')
}

const relatedNotes = computed(() => {
    const current = props.note
    if (!current || !props.pool?.length) return []
    const toDoc = (note: GardenNote): SimilarityDoc => ({
        id: note.id,
        kind: 'note',
        title: note.title,
        description: note.excerpt,
        content: note.html,
    })
    return findSimilar(toDoc(current), props.pool.map(toDoc), {
        limit: 3,
        crossKind: false,
    })
})

// 正文里的双链由服务端渲染成 <a data-note-id>，这里接管为站内无刷新切换
const handleProseClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-note-id]')
    if (!target) return
    const id = Number(target.dataset.noteId)
    if (!Number.isSafeInteger(id) || id <= 0) return
    event.preventDefault()
    emit('open-note', id)
}
</script>

<style lang="less" scoped>
.garden-detail {
    display: flex;
    flex-direction: column;
    gap: 26px;
}

.garden-head {
    padding-bottom: 18px;
    border-bottom: 1px solid var(--portal-line-soft);
}

.garden-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 0 0 10px;
    color: var(--portal-text-tertiary);
    font-size: 11px;
    letter-spacing: 0.06em;
}

.garden-title {
    margin: 0;
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: clamp(24px, 3vw, 32px);
    font-weight: 600;
    line-height: 1.35;
}

.garden-prose {
    color: var(--portal-text-secondary);
    font-size: 15px;
    line-height: 1.95;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
        margin: 1.6em 0 0.6em;
        color: var(--portal-text-primary);
        font-family: var(--portal-serif);
        line-height: 1.4;
    }

    :deep(h1:first-child),
    :deep(h2:first-child),
    :deep(h3:first-child) {
        margin-top: 0;
    }

    :deep(p) {
        margin: 0 0 1em;
    }

    :deep(ul),
    :deep(ol) {
        margin: 0 0 1em;
        padding-left: 1.4em;
    }

    :deep(li) {
        margin: 0.3em 0;
    }

    :deep(blockquote) {
        margin: 1.2em 0;
        padding: 12px 18px;
        border-left: 3px solid var(--portal-accent);
        border-radius: 0 12px 12px 0;
        background: color-mix(in srgb, var(--portal-accent) 7%, transparent);
        color: var(--portal-text-secondary);
    }

    :deep(code) {
        padding: 2px 6px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--portal-text-primary) 8%, transparent);
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
        font-size: 0.9em;
    }

    :deep(pre) {
        overflow-x: auto;
        margin: 1.2em 0;
        padding: 16px 18px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--portal-text-primary) 7%, transparent);
        line-height: 1.7;

        code {
            padding: 0;
            background: transparent;
        }
    }

    :deep(a[data-note-id]) {
        color: var(--portal-accent);
        text-decoration: none;
        border-bottom: 1px dashed var(--portal-accent-soft);
        cursor: pointer;
    }

    :deep(.note-link-missing) {
        color: var(--portal-text-tertiary);
        text-decoration: line-through;
    }

    :deep(.note-tag) {
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-size: 0.85em;
    }
}

.garden-backlinks {
    padding-top: 18px;
    border-top: 1px solid var(--portal-line-soft);
}

.garden-upgraded {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 4px 0 18px;
    padding: 14px 18px;
    border: 1px solid color-mix(in srgb, var(--portal-accent) 30%, var(--portal-line-soft));
    border-radius: 16px;
    background: linear-gradient(
        120deg,
        color-mix(in srgb, var(--portal-accent) 10%, transparent),
        transparent 70%
    );
}

.upgraded-mark {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
    font-size: 13px;
    line-height: 26px;
    text-align: center;
}

.upgraded-copy {
    flex: 1;
    min-width: 0;
}

.upgraded-label {
    margin: 0 0 2px;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
}

.upgraded-title {
    overflow: hidden;
    margin: 0;
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.upgraded-link {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--portal-accent);
    color: var(--portal-accent);
    font-size: 12px;
    text-decoration: none;
    transition: background-color 0.18s ease, color 0.18s ease;

    &:hover {
        background: var(--portal-accent);
        color: var(--portal-text-on-accent);
    }
}

.garden-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px 32px;
    padding-top: 18px;
    border-top: 1px solid var(--portal-line-soft);

    &-col ul {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
    }
}

.backlinks-label {
    margin: 0 0 10px;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
}

.garden-backlinks ul {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.backlink {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;

    &:hover {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
        transform: translateY(-1px);
    }

    small {
        color: var(--portal-text-tertiary);
        font-size: 10px;
    }
}

.garden-related .backlink {
    border-style: dashed;
}

@media (max-width: 640px) {
    .garden-upgraded {
        flex-wrap: wrap;
    }

    .upgraded-title {
        white-space: normal;
    }
}
</style>
