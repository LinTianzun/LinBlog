<template>
    <PortalLayout active-path="/portal/notes">
        <PortalPageHeader index="05" kicker="DIGITAL GARDEN" title="花园"
            :description="`共 ${notes.length} 篇公开笔记。这里不是整理完毕的文章，而是正在生长的想法，用双链彼此连接。`"
            aside-label="NOTES & THOUGHTS" :aside-value="`${notes.length} 篇`"
            aside-note="顺着链接慢慢走，比按目录读更像逛一座花园。">
            <div class="garden-toolbar">
                <label class="garden-search">
                    <IconSearchOutline />
                    <input v-model="keyword" type="search" placeholder="搜索标题或摘要"
                        aria-label="搜索花园笔记" />
                </label>
                <button v-if="keyword" type="button" class="garden-clear" @click="keyword = ''">
                    清空
                </button>
                <button type="button" class="garden-mode" :class="{ 'is-active': viewMode === 'map' }"
                    :aria-pressed="viewMode === 'map'"
                    @click="viewMode = viewMode === 'map' ? 'list' : 'map'">
                    {{ viewMode === 'map' ? '列表视图' : '图谱视图' }}
                </button>
            </div>
        </PortalPageHeader>

        <div v-if="tagFacets.length && viewMode === 'list'" class="garden-tags" aria-label="按标签筛选笔记">
            <button type="button" class="garden-tag" :class="{ 'is-active': !activeTag }" @click="activeTag = ''">
                全部
            </button>
            <button v-for="tag in tagFacets" :key="tag" type="button" class="garden-tag"
                :class="{ 'is-active': activeTag === tag }" :aria-pressed="activeTag === tag"
                @click="activeTag = activeTag === tag ? '' : tag">
                #{{ tag }}
            </button>
        </div>

        <section class="garden-area">
            <PortalGardenGraph v-if="viewMode === 'map'" @open-note="openNoteById" />

            <div v-if="loading" class="garden-state">
                <yk-spinner size="m" />
            </div>

            <div v-else-if="viewMode === 'list' && filteredNotes.length" class="garden-grid">
                <button v-for="(note, i) in filteredNotes" :key="note.id" type="button" class="garden-card"
                    :style="{ '--stagger': `${Math.min(i, 10) * 45}ms` }" @click="openNote(note)">
                    <span class="card-topline">
                        <span>{{ formatDate(note.publishedAt) }}</span>
                        <span v-if="note.incomingLinks" class="card-links">
                            {{ note.incomingLinks }} 条反向链接
                        </span>
                    </span>
                    <span class="card-title">{{ note.title }}</span>
                    <span class="card-excerpt">{{ note.excerpt }}</span>
                    <span v-if="note.tags?.length" class="card-tags">
                        <span v-for="tag in note.tags.slice(0, 3)" :key="tag">#{{ tag }}</span>
                    </span>
                    <span class="card-foot">
                        <span>{{ note.outgoingLinks || 0 }} 条双链</span>
                        <IconRightOutline />
                    </span>
                </button>
            </div>

            <div v-else-if="viewMode === 'list'" class="garden-state">
                <yk-empty :description="keyword ? '没有匹配的笔记' : '花园里还没有公开笔记'" />
            </div>
        </section>

        <PortalGardenDetail :open="detailVisible" :note="activeNote" :pool="notes" @close="closeNote"
            @open-note="openNoteById" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPageHeader from '../components/portal/PortalPageHeader.vue'
import PortalGardenDetail from '../components/portal/PortalGardenDetail.vue'
import PortalGardenGraph from '../components/portal/PortalGardenGraph.vue'
import { getPublicGarden, getPublicNote, type GardenNote } from '../api/note'
import {
    applyPortalSeo,
    archiveSeoConfig,
    noteSeoConfig,
} from '../utils/portalSeo'

const route = useRoute()
const router = useRouter()

const notes = ref<GardenNote[]>([])
const loading = ref(false)
const keyword = ref('')
const viewMode = ref<'list' | 'map'>('list')
const activeTag = ref('')
const detailVisible = ref(false)
const activeNote = ref<GardenNote | null>(null)

const filteredNotes = computed(() => {
    const term = keyword.value.trim().toLowerCase()
    return notes.value.filter(note => {
        if (activeTag.value && !(note.tags || []).includes(activeTag.value)) return false
        if (!term) return true
        const haystack = `${note.title} ${note.excerpt || ''} ${(note.tags || []).join(' ')}`
        return haystack.toLowerCase().includes(term)
    })
})

// 标签按出现次数排序；「按标签」按钮在全部 → 高频标签之间轮换
const tagFacets = computed(() => {
    const counts = new Map<string, number>()
    for (const note of notes.value) {
        for (const tag of note.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1)
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([name]) => name)
})

const formatDate = (value?: string | null): string => {
    if (!value) return '未标注日期'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

const loadGarden = async () => {
    loading.value = true
    try {
        const result = await getPublicGarden()
        if (result.code === 200) {
            notes.value = result.data?.list || []
        }
    } catch {
        notes.value = []
    } finally {
        loading.value = false
    }
}

// 详情地址统一用 ?open=id，服务端据此注入分享 meta
const syncQuery = (openId: number | null) => {
    const query: Record<string, string> = {}
    if (openId) query.open = String(openId)
    void router.replace({ path: '/portal/notes', query })
}

const openNote = (note: GardenNote, sync = true) => {
    activeNote.value = note
    detailVisible.value = true
    applyPortalSeo(noteSeoConfig(note))
    if (sync) syncQuery(note.id)
}

const openNoteById = async (id: number, sync = true): Promise<void> => {
    const target = notes.value.find(item => item.id === id)
    if (target) {
        openNote(target, sync)
        return
    }
    try {
        const result = await getPublicNote(id)
        if (result.code === 200 && result.data) openNote(result.data, sync)
    } catch {
        if (sync) syncQuery(null)
    }
}

const closeNote = (sync = true) => {
    detailVisible.value = false
    activeNote.value = null
    applyPortalSeo(archiveSeoConfig('note'))
    if (sync) syncQuery(null)
}

onMounted(async () => {
    applyPortalSeo(archiveSeoConfig('note'))
    await loadGarden()
    if (typeof route.query.open === 'string') {
        const id = Number(route.query.open)
        if (id) void openNoteById(id, false)
    }
})

watch(() => route.query.open, (value) => {
    const id = typeof value === 'string' ? Number(value) : 0
    if (!Number.isSafeInteger(id) || id <= 0) {
        if (detailVisible.value) closeNote(false)
        return
    }
    if (activeNote.value?.id !== id) void openNoteById(id, false)
})
</script>

<style lang="less" scoped>
.garden-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
}

.garden-search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: min(340px, 60vw);
    padding: 8px 14px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
    background: color-mix(in srgb, var(--portal-surface) 80%, transparent);
    color: var(--portal-text-tertiary);

    &:focus-within {
        border-color: var(--portal-accent);
        box-shadow: 0 0 0 3px var(--portal-accent-soft);
    }

    input {
        width: 100%;
        border: none;
        background: transparent;
        color: var(--portal-text-primary);
        font-size: 13px;
        outline: none;

        &::placeholder {
            color: var(--portal-text-tertiary);
        }
    }
}

.garden-clear {
    border: none;
    background: transparent;
    color: var(--portal-text-tertiary);
    font-size: 12px;
    cursor: pointer;

    &:hover {
        color: var(--portal-accent);
    }
}

.garden-mode {
    padding: 7px 14px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    &:hover {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
    }

    &.is-active {
        border-color: var(--portal-accent);
        background: var(--portal-accent);
        color: var(--portal-text-on-accent);
    }
}

.garden-area {
    margin-top: 44px;
    min-height: 40vh;
}

.garden-state {
    display: grid;
    place-items: center;
    padding: 80px 0;
}

.garden-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 18px;
}

.garden-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 190px;
    padding: 20px 22px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 18px;
    background: color-mix(in srgb, var(--portal-surface) 82%, transparent);
    color: inherit;
    text-align: left;
    cursor: pointer;
    animation: garden-rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--stagger, 0ms);
    transition: border-color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;

    &:hover {
        border-color: var(--portal-accent);
        transform: translateY(-3px);
        box-shadow: var(--portal-shadow-soft);
    }
}

.card-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    letter-spacing: 0.08em;
}

.card-links {
    color: var(--portal-accent);
}

.card-title {
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: 19px;
    font-weight: 600;
    line-height: 1.4;
}

.card-excerpt {
    display: -webkit-box;
    overflow: hidden;
    flex: 1;
    color: var(--portal-text-secondary);
    font-size: 13px;
    line-height: 1.75;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
}

.card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--portal-accent);
    font-size: 10px;
}

.garden-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 20px;
}

.garden-tag {
    padding: 5px 12px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;

    &:hover {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
    }

    &.is-active {
        border-color: var(--portal-accent);
        background: var(--portal-accent);
        color: var(--portal-text-on-accent);
    }
}

.card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--portal-text-tertiary);
    font-size: 11px;
}

@keyframes garden-rise {
    from {
        opacity: 0;
        transform: translateY(12px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .garden-card {
        animation: none;
    }
}
</style>
