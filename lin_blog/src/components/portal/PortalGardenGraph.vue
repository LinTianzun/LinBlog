<template>
    <section class="garden-graph portal-reveal" aria-label="花园知识图谱">
        <header class="graph-head">
            <div class="graph-copy">
                <span class="graph-kicker">KNOWLEDGE MAP</span>
                <h2>知识图谱</h2>
                <p>
                    {{ nodes.length }} 篇笔记 · {{ edges.length }} 条双链。
                    悬停查看邻居，点击进入笔记。
                </p>
            </div>

            <div class="graph-tools">
                <label class="graph-search">
                    <IconSearchOutline />
                    <input v-model="query" type="search" placeholder="定位一篇笔记"
                        aria-label="在知识图谱中查找笔记" @keyup.enter="focusFirstMatch" />
                </label>
                <button type="button" class="graph-reset" @click="clearFocus">重置视图</button>
            </div>
        </header>

        <div v-if="tagFacets.length" class="graph-tags" aria-label="按标签过滤图谱">
            <button type="button" class="graph-tag" :class="{ 'is-active': !activeTag }" @click="selectTag('')">
                全部标签
            </button>
            <button v-for="tag in tagFacets" :key="tag.name" type="button" class="graph-tag"
                :class="{ 'is-active': activeTag === tag.name }" @click="selectTag(tag.name)">
                #{{ tag.name }}
                <span>{{ tag.count }}</span>
            </button>
        </div>

        <div v-if="nodes.length === 0" class="graph-empty">
            花园里还没有公开笔记。发布第一篇笔记后，这里会长出第一个节点；
            用 <code>[[另一篇笔记]]</code> 互相引用，节点之间就会连起双链。
        </div>
        <div v-else-if="edges.length === 0" class="graph-empty">
            {{ nodes.length }} 个节点还没有连线。在正文里写下 <code>[[另一篇公开笔记的标题]]</code>，
            就能在图谱里连出第一条边。
        </div>

        <div v-else class="graph-canvas">
            <svg :viewBox="viewBox" role="img" :aria-label="`知识图谱，共 ${nodes.length} 个节点`"
                @mouseleave="hoveredId = null">
                <g class="graph-edges">
                    <line v-for="(edge, i) in renderedEdges" :key="`e-${i}`" :x1="edge.x1" :y1="edge.y1"
                        :x2="edge.x2" :y2="edge.y2" :class="{
                            'is-active': edge.active,
                            'is-muted': edge.muted,
                            'is-out': edge.out
                        }" />
                </g>

                <g class="graph-nodes">
                    <g v-for="node in placedNodes" :key="node.id" class="graph-node" :class="{
                        'is-focus': focusSet.has(node.id),
                        'is-muted': (focusId !== null && !focusSet.has(node.id)) || node.out,
                        'is-fresh': node.fresh
                    }" :transform="`translate(${node.x} ${node.y})`" tabindex="0" role="button"
                        :aria-label="`${node.title}，${node.degree} 条连接`"
                        @mouseenter="hoveredId = node.id" @focus="hoveredId = node.id"
                        @blur="hoveredId = null" @click="emit('open-note', node.id)"
                        @keydown.enter.prevent="emit('open-note', node.id)"
                        @keydown.space.prevent="emit('open-note', node.id)">
                        <circle v-if="node.fresh" class="node-pulse" :r="node.radius + 4" />
                        <circle class="node-halo" :r="node.hovered ? node.radius + 7 : node.radius + 3" />
                        <circle class="node-dot" :r="node.radius" :class="{ 'is-fresh': node.fresh }" />
                        <text v-if="node.hovered || node.id === focusId" class="node-label" :y="node.radius + 15"
                            text-anchor="middle">{{ shortTitle(node.title) }}</text>
                    </g>
                </g>
            </svg>
        </div>

        <!-- 花园体检：从计数升级成「该连哪篇、哪些还没接上」，点孤岛可直接开新笔记 -->
        <section v-if="nodes.length" class="graph-insights" aria-label="花园体检">
            <div class="insight-card insight-hubs">
                <p class="insight-label">HUBS · 从枢纽开始逛</p>
                <p v-if="!hubs.length" class="insight-empty">还没有双链，先写下第一篇带 <code>[[标题]]</code> 的笔记。</p>
                <template v-else>
                    <p class="insight-copy">被引用最多的几篇，适合当作进入花园的入口。</p>
                    <ul>
                        <li v-for="(hub, i) in hubs" :key="hub.id">
                            <span class="hub-rank">{{ i + 1 }}</span>
                            <button type="button" class="hub-link" :class="{ 'is-active': focusId === hub.id }"
                                @click="focusHub(hub.id)">
                                {{ hub.title }}
                            </button>
                            <span class="hub-meta">{{ hub.incomingLinks }} 被引 · {{ hub.outgoingLinks }} 出链</span>
                        </li>
                    </ul>
                </template>
            </div>

            <div class="insight-card insight-orphans">
                <p class="insight-label">ORPHANS · 还没接上的想法</p>
                <p v-if="!orphans.length" class="insight-empty is-ok">每篇笔记都至少有一条双链。</p>
                <template v-else>
                    <p class="insight-copy">
                        {{ orphans.length }} 篇没有进出双链。挑一篇，用它的标题在新笔记里写下
                        <code>[[{{ orphans[0].title }}]]</code> 就能接上。
                    </p>
                    <div class="orphan-actions">
                        <button v-for="orphan in orphans.slice(0, 3)" :key="orphan.id" type="button"
                            class="orphan-chip" @click="emit('open-note', orphan.id)">
                            {{ orphan.title }}
                        </button>
                        <router-link class="orphan-write" :to="orphanDraftTarget">
                            挑「{{ orphans[0].title }}」写新笔记
                            <IconRightOutline />
                        </router-link>
                    </div>
                    <button type="button" class="orphan-copy" @click="copyFirstTitle">
                        {{ copied ? '已复制双链语法' : '复制双链语法' }}
                    </button>
                </template>
            </div>

            <p class="insight-foot">
                孤岛不会被读者发现。挑一篇写下去，用 <code>[[标题]]</code> 把它接回主网。
            </p>
        </section>

        <footer class="graph-foot">
            <div class="graph-legend" aria-hidden="true">
                <span class="legend-dot is-strong" /> 常被引用
                <span class="legend-dot" /> 普通笔记
                <span class="legend-line" /> 双链
            </div>
            <ul v-if="topNodes.length" class="graph-top">
                <li v-for="node in topNodes" :key="node.id">
                    <button type="button" :class="{ 'is-active': focusId === node.id }"
                        @click="hoveredId = hoveredId === node.id ? null : node.id"
                        @mouseenter="hoveredId = node.id" @mouseleave="hoveredId = null">
                        {{ node.title }}
                        <span>{{ node.incomingLinks }} ←</span>
                    </button>
                </li>
            </ul>
        </footer>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { IconRightOutline } from '@yike-design/ui/es/components/svg-icon'
import { getPublicGardenGraph, type GardenGraph } from '../../api/note'
import {
    fitViewBox,
    gardenInsights,
    highlightNeighbors,
    layoutGraph,
    topLinkedNodes,
    type LayoutNode,
} from '../../utils/gardenGraph'

const emit = defineEmits<{
    (e: 'open-note', id: number): void
}>()

const graph = ref<GardenGraph>({ nodes: [], edges: [], tags: [] })
const query = ref('')
const hoveredId = ref<number | null>(null)
// 点击「常被引用」列表可把焦点固定住，方便慢慢看一个局部网络
const pinnedId = ref<number | null>(null)
const activeTag = ref('')

// 最近 30 天更新的笔记做轻量高亮，让花园的「生长」看得见
const FRESH_DAYS = 30

const tagFacets = computed(() => (graph.value.tags || []).slice(0, 12))
const hasTagFilter = computed(() => activeTag.value !== '')

const layout = computed(() => layoutGraph(graph.value.nodes, graph.value.edges, {
    width: 960,
    height: 560,
}))

const nodes = computed(() => layout.value.nodes)
const edges = computed(() => layout.value.edges)
const viewBox = computed(() => fitViewBox(layout.value.nodes))

const updatedAtOf = computed(() => {
    const map = new Map<number, number>()
    for (const node of graph.value.nodes) {
        const time = node.updatedAt ? new Date(node.updatedAt).getTime() : NaN
        map.set(node.id, Number.isFinite(time) ? time : 0)
    }
    return map
})

// 以最新一篇笔记的时间为锚，而不是浏览器时钟：数据来自服务端，时区差异不会误判
const latestUpdatedAt = computed(() => Math.max(0, ...updatedAtOf.value.values()))
const freshThreshold = computed(() => latestUpdatedAt.value - FRESH_DAYS * 24 * 60 * 60 * 1000)

const isFresh = (node: LayoutNode): boolean => {
    const time = updatedAtOf.value.get(node.id) || 0
    return time > 0 && time >= freshThreshold.value
}

// 标签过滤只淡化不剔除：保留整体轮廓，聚焦的标签子图仍处在原位
const taggedNodeIds = computed(() => {
    if (!activeTag.value) return null
    return new Set(
        nodes.value
            .filter(node => node.tags.includes(activeTag.value))
            .map(node => node.id)
    )
})

const searchMatches = computed(() => {
    const term = query.value.trim().toLowerCase()
    if (!term) return null
    return new Set(
        nodes.value
            .filter(node => node.title.toLowerCase().includes(term))
            .map(node => node.id)
    )
})

const focusId = computed<number | null>(() => {
    return hoveredId.value ?? pinnedId.value
})

const focusSet = computed(() => highlightNeighbors(focusId.value, edges.value))

const positionOf = computed(() => {
    const map = new Map<number, LayoutNode>()
    for (const node of nodes.value) map.set(node.id, node)
    return map
})

const placedNodes = computed(() => nodes.value.map(node => ({
    ...node,
    hovered: node.id === focusId.value || Boolean(searchMatches.value?.has(node.id)),
    out: hasTagFilter.value && !taggedNodeIds.value?.has(node.id),
    fresh: isFresh(node),
})))

const renderedEdges = computed(() => edges.value.map(edge => {
    const source = positionOf.value.get(edge.source)
    const target = positionOf.value.get(edge.target)
    if (!source || !target) return null
    return {
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        active: focusId.value !== null
            && (edge.source === focusId.value || edge.target === focusId.value),
        muted: focusId.value !== null
            && edge.source !== focusId.value
            && edge.target !== focusId.value,
        out: Boolean(taggedNodeIds.value)
            && !(taggedNodeIds.value?.has(edge.source) && taggedNodeIds.value?.has(edge.target)),
    }
}).filter((edge): edge is NonNullable<typeof edge> => edge !== null))

const topNodes = computed(() => topLinkedNodes(nodes.value, 6))

// 枢纽/孤岛都按边列表算，和图里画出的线保持同一口径
const insights = computed(() => gardenInsights(graph.value.nodes, graph.value.edges))
const hubs = computed(() => insights.value.hubs)
const orphans = computed(() => insights.value.orphans)

const copied = ref(false)

const focusHub = (id: number) => {
    pinnedId.value = pinnedId.value === id ? null : id
}

// 编辑器支持用 ?keyword= 预填标题，孤岛标题直接变成新笔记的起点
const orphanDraftTarget = computed(() => {
    const orphan = orphans.value[0]
    if (!orphan) return '/editarticle'
    return { path: '/editarticle', query: { keyword: `${orphan.title}的延伸` } }
})

const copyFirstTitle = async () => {
    const orphan = orphans.value[0]
    if (!orphan) return
    try {
        await navigator.clipboard.writeText(`[[${orphan.title}]]`)
        copied.value = true
        window.setTimeout(() => { copied.value = false }, 1600)
    } catch {
        // 剪贴板不可用时保持原文案，作者仍可按提示手写
    }
}

// 过长的中文标题在节点下方只显示前 12 个字，完整标题在 aria-label 与列表里
const shortTitle = (title: string): string => (
    title.length > 12 ? `${title.slice(0, 12)}…` : title
)

const focusFirstMatch = () => {
    const first = searchMatches.value?.values().next().value
    if (typeof first === 'number') pinnedId.value = first
}

const clearFocus = () => {
    pinnedId.value = null
    hoveredId.value = null
    query.value = ''
}

const selectTag = (name: string) => {
    activeTag.value = activeTag.value === name ? '' : name
    pinnedId.value = null
}

const loadGraph = async () => {
    try {
        const result = await getPublicGardenGraph()
        if (result.code === 200 && result.data) {
            graph.value = result.data
        }
    } catch {
        graph.value = { nodes: [], edges: [], tags: [] }
    }
}

// 笔记发布/删除后回到列表页再次进入图谱时刷新一次数据
watch(() => graph.value.nodes.length, () => {
    pinnedId.value = null
})

// 搜索时自动把焦点放到首个命中，输入完即可看到它连着什么
watch(query, (value) => {
    if (value.trim()) focusFirstMatch()
    else pinnedId.value = null
})

onMounted(() => {
    void loadGraph()
})
</script>

<style lang="less" scoped>
.garden-graph {
    margin-top: 48px;
    padding: 24px 26px 18px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 22px;
    background: color-mix(in srgb, var(--portal-surface) 84%, transparent);
}

.graph-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--portal-line-soft);
}

.graph-kicker {
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
}

.graph-copy {
    h2 {
        margin: 6px 0 4px;
        color: var(--portal-text-primary);
        font-family: var(--portal-serif);
        font-size: 24px;
        font-weight: 600;
    }

    p {
        margin: 0;
        color: var(--portal-text-tertiary);
        font-size: 12px;
    }
}

.graph-tools {
    display: flex;
    align-items: center;
    gap: 8px;
}

.graph-search {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: min(220px, 44vw);
    padding: 7px 12px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
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
        font-size: 12px;
        outline: none;
    }
}

.graph-reset {
    border: none;
    background: transparent;
    color: var(--portal-text-tertiary);
    font-size: 12px;
    cursor: pointer;

    &:hover {
        color: var(--portal-accent);
    }
}

.graph-empty {
    padding: 56px 0;
    color: var(--portal-text-tertiary);
    font-size: 13px;
    line-height: 1.9;
    text-align: center;

    code {
        padding: 1px 6px;
        border-radius: 6px;
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-size: 12px;
    }
}

.graph-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
}

.graph-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-secondary);
    font-size: 11px;
    cursor: pointer;
    transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;

    span {
        color: var(--portal-text-tertiary);
        font-variant-numeric: tabular-nums;
    }

    &:hover {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
    }

    &.is-active {
        border-color: var(--portal-accent);
        background: var(--portal-accent);
        color: var(--portal-text-on-accent);

        span {
            color: inherit;
            opacity: 0.8;
        }
    }
}

.graph-canvas {
    margin-top: 12px;

    svg {
        display: block;
        width: 100%;
        height: clamp(320px, 52vh, 560px);
        overflow: visible;
    }
}

.graph-edges line {
    stroke: color-mix(in srgb, var(--portal-text-secondary) 26%, transparent);
    stroke-width: 1;
    transition: opacity 0.2s ease, stroke 0.2s ease;

    &.is-active {
        stroke: var(--portal-accent);
        stroke-width: 1.6;
    }

    &.is-muted {
        opacity: 0.18;
    }

    &.is-out {
        opacity: 0.08;
    }
}

.graph-node {
    cursor: pointer;
    outline: none;
    transition: opacity 0.2s ease;

    &.is-muted {
        opacity: 0.25;
    }

    &:focus-visible .node-halo {
        stroke: var(--portal-accent);
        stroke-width: 2;
    }
}

.node-halo {
    fill: color-mix(in srgb, var(--portal-accent) 16%, transparent);
    transition: r 0.18s ease;
}

.node-pulse {
    fill: none;
    stroke: var(--portal-accent);
    stroke-width: 1;
    opacity: 0.35;
    transform-box: fill-box;
    transform-origin: center;
    transform: scale(1);
    animation: node-pulse 3.2s ease-out infinite;
}

.node-dot.is-fresh {
    fill: color-mix(in srgb, var(--portal-accent) 78%, var(--portal-text-secondary));
}

.node-dot {
    fill: color-mix(in srgb, var(--portal-text-secondary) 70%, transparent);
    stroke: var(--portal-surface);
    stroke-width: 1.5;
    transition: fill 0.18s ease;
}

.graph-node.is-focus .node-dot,
.graph-node:hover .node-dot {
    fill: var(--portal-accent);
}

.node-label {
    fill: var(--portal-text-primary);
    font-size: 11px;
    font-weight: 500;
    paint-order: stroke;
    stroke: var(--portal-surface);
    stroke-width: 3px;
    stroke-linejoin: round;
    pointer-events: none;
}

@keyframes node-pulse {
    0% {
        opacity: 0.32;
        transform: scale(1);
    }

    70% {
        opacity: 0;
        transform: scale(1.7);
    }

    100% {
        opacity: 0;
        transform: scale(1.7);
    }
}

@media (prefers-reduced-motion: reduce) {
    .node-pulse {
        animation: none;
    }
}

.graph-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--portal-line-soft);
    color: var(--portal-text-tertiary);
    font-size: 11px;
}

.graph-insights {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    align-items: stretch;
    gap: 12px;
    margin-top: 16px;
}

.insight-card {
    display: flex;
    flex-direction: column;
    padding: 14px 16px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 16px;
    background: color-mix(in srgb, var(--portal-surface) 72%, transparent);
}

.insight-label {
    margin: 0 0 10px;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
}

.insight-copy {
    margin: 0 0 10px;
    color: var(--portal-text-secondary);
    font-size: 12px;
    line-height: 1.75;

    code,
    .insight-empty code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-size: 11px;
    }
}

.insight-empty {
    margin: 0;
    color: var(--portal-text-tertiary);
    font-size: 12px;
    line-height: 1.75;

    &.is-ok {
        color: var(--portal-accent);
    }

    code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-size: 11px;
    }
}

.insight-hubs ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }
}

.hub-rank {
    flex: 0 0 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--portal-accent-soft);
    color: var(--portal-accent);
    font-size: 10px;
    font-weight: 600;
    line-height: 18px;
    text-align: center;
}

.hub-link {
    overflow: hidden;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--portal-text-primary);
    font-size: 12.5px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover,
    &.is-active {
        color: var(--portal-accent);
    }
}

.hub-meta {
    flex: none;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}

.orphan-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.orphan-chip {
    max-width: 160px;
    overflow: hidden;
    padding: 4px 10px;
    border: 1px solid var(--portal-line-soft);
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
    }
}

.orphan-write {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 11px;
    border-radius: 999px;
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
    font-size: 11px;
    text-decoration: none;
    transition: filter 0.18s ease;

    &:hover {
        filter: brightness(1.08);
    }
}

.orphan-copy {
    margin-top: 8px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--portal-text-tertiary);
    font-size: 11px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;

    &:hover {
        color: var(--portal-accent);
    }
}

// 底部说明横跨两列，孤岛卡片短的时候也不留下空洞
.insight-foot {
    grid-column: 1 / -1;
    margin: 2px 0 0;
    color: var(--portal-text-tertiary);
    font-size: 11px;
    line-height: 1.7;

    code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-size: 10px;
    }
}

.graph-legend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.legend-dot {
    width: 8px;
    height: 8px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--portal-accent);
    opacity: 0.55;

    &.is-strong {
        opacity: 1;
    }
}

.legend-line {
    width: 16px;
    height: 1px;
    margin: 0 4px 0 10px;
    background: var(--portal-text-tertiary);
}

.graph-top {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;

    button {
        padding: 4px 10px;
        border: 1px solid var(--portal-line-soft);
        border-radius: 999px;
        background: transparent;
        color: var(--portal-text-secondary);
        font-size: 11px;
        cursor: pointer;
        transition: border-color 0.18s ease, color 0.18s ease;

        span {
            margin-left: 4px;
            color: var(--portal-text-tertiary);
        }

        &:hover,
        &.is-active {
            border-color: var(--portal-accent);
            color: var(--portal-accent);
        }
    }
}

@media (max-width: 720px) {
    .garden-graph {
        padding: 18px 16px 14px;
    }

    .graph-head {
        flex-direction: column;
        align-items: flex-start;
    }

    .graph-insights {
        grid-template-columns: 1fr;
    }
}
</style>
