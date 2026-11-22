import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createRandom,
    fitViewBox,
    gardenInsights,
    graphBounds,
    highlightNeighbors,
    layoutGraph,
    nodeRadius,
    topLinkedNodes,
} from '../src/utils/gardenGraph.ts'

const nodes = [
    { id: 1, title: '入口', outgoingLinks: 2, incomingLinks: 1 },
    { id: 2, title: '双链', outgoingLinks: 1, incomingLinks: 2 },
    { id: 3, title: '花园', outgoingLinks: 0, incomingLinks: 1 },
]

const edges = [
    { source: 1, target: 2 },
    { source: 1, target: 3 },
    { source: 2, target: 1 },
]

test('伪随机数可复现，同一 seed 输出一致', () => {
    const a = createRandom(7)
    const b = createRandom(7)
    assert.deepEqual([a(), a(), a()], [b(), b(), b()])
    assert.notEqual(createRandom(1)(), createRandom(2)())
})

test('节点半径随度数增长但有上限', () => {
    assert.ok(nodeRadius({ id: 1, title: 'a' }) < nodeRadius({ id: 2, title: 'b', incomingLinks: 9 }))
    assert.ok(nodeRadius({ id: 3, title: 'c', incomingLinks: 10000 }) <= 13)
})

test('力导向布局在画布内收敛且结果稳定', () => {
    const first = layoutGraph(nodes, edges, { width: 400, height: 300, iterations: 200 })
    const second = layoutGraph(nodes, edges, { width: 400, height: 300, iterations: 200 })

    assert.equal(first.nodes.length, 3)
    assert.deepEqual(
        first.nodes.map(node => [node.id, node.x, node.y]),
        second.nodes.map(node => [node.id, node.x, node.y])
    )
    for (const node of first.nodes) {
        assert.ok(node.x >= node.radius && node.x <= 400 - node.radius)
        assert.ok(node.y >= node.radius && node.y <= 300 - node.radius)
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y))
    }
})

test('布局丢弃自环与指向未知节点的边', () => {
    const result = layoutGraph(nodes, [
        ...edges,
        { source: 2, target: 2 },
        { source: 1, target: 99 },
    ], { iterations: 20 })
    assert.deepEqual(result.edges, edges)
})

test('单节点居中，空图返回空结果', () => {
    const single = layoutGraph([{ id: 1, title: 'only' }], [], { width: 200, height: 100 })
    assert.equal(single.nodes[0].x, 100)
    assert.equal(single.nodes[0].y, 50)

    const empty = layoutGraph([], [], { width: 200, height: 100 })
    assert.deepEqual(empty.nodes, [])
})

test('包围盒与 viewBox 覆盖所有节点半径', () => {
    const { nodes: laidOut } = layoutGraph(nodes, edges, { width: 300, height: 200, iterations: 100 })
    const bounds = graphBounds(laidOut)
    for (const node of laidOut) {
        assert.ok(bounds.minX <= node.x - node.radius)
        assert.ok(bounds.maxY >= node.y + node.radius)
    }
    assert.match(fitViewBox(laidOut, 10), /^-?\d/)
})

test('邻居高亮包含中心与一跳邻居，空焦点返回空集合', () => {
    assert.deepEqual([...highlightNeighbors(1, edges)].sort(), [1, 2, 3])
    assert.deepEqual([...highlightNeighbors(3, edges)].sort(), [1, 3])
    assert.equal(highlightNeighbors(null, edges).size, 0)
})

test('常被引用按度数排序，忽略孤立节点', () => {
    const { nodes: laidOut } = layoutGraph(
        [...nodes, { id: 4, title: '孤岛' }],
        edges,
        { iterations: 10 }
    )
    const top = topLinkedNodes(laidOut, 2)
    assert.deepEqual(top.map(node => node.id), [2, 1])
})

test('花园体检以边列表为准统计枢纽与孤岛', () => {
    const { hubs, orphans } = gardenInsights(
        [
            ...nodes,
            { id: 4, title: '孤岛', incomingLinks: 3 },
            { id: 5, title: '另一座孤岛' },
        ],
        // 重复边与自环都不能把引用数算多
        [...edges, { source: 1, target: 2 }, { source: 3, target: 3 }]
    )

    // 1 → 2 / 1 → 3 / 2 → 1 / 1 → 2（重复边）：1 被 2 引用且出链最多，是这张网的中心
    assert.deepEqual(hubs.map(hub => [hub.id, hub.incomingLinks, hub.degree]), [
        [1, 1, 3],
        [2, 1, 2],
        [3, 1, 1],
    ])
    // 孤岛按真实边判断：节点计数写着 3 条入链，但没有边指向它
    assert.deepEqual(orphans.map(node => node.id), [4, 5])
})

test('没有双链时所有笔记都是孤岛，枢纽为空', () => {
    const { hubs, orphans } = gardenInsights(nodes, [])
    assert.deepEqual(hubs, [])
    // 孤岛按标题排序，方便作者在列表里扫读
    assert.deepEqual(orphans.map(node => node.title).sort(), ['入口', '双链', '花园'].sort())
})
