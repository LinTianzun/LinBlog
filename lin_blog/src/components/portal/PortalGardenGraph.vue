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
import { getPublicGardenGraph, type GardenGraph } from '../../api/note'
import {
    fitViewBox,
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
    margin-top: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--portal-line-soft);
    color: var(--portal-text-tertiary);
    font-size: 11px;
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
}
</style>
