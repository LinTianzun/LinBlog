/**
 * 花园图谱的纯计算部分：布局、缩放与碰撞。
 * 抽离成纯函数便于在 node 环境单测，不依赖 DOM 与渲染库。
 */

export interface GraphInputNode {
  id: number
  title: string
  tags?: string[]
  outgoingLinks?: number
  incomingLinks?: number
}

export interface GraphInputEdge {
  source: number
  target: number
}

export interface LayoutNode {
  id: number
  title: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  degree: number
  tags: string[]
  outgoingLinks: number
  incomingLinks: number
}

export interface LayoutEdge {
  source: number
  target: number
}

export interface LayoutOptions {
  width?: number
  height?: number
  iterations?: number
  seed?: number
}

const CENTER_BIAS = 0.012
const MAX_VELOCITY = 12
const MIN_RADIUS = 5
const MAX_RADIUS = 13

// 可复现的伪随机：同一个 seed 每次布局一致，测试与截图才有稳定基线
export function createRandom(seed = 42): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0xffffffff
  }
}

export function nodeRadius(node: GraphInputNode): number {
  const degree = Number(node.outgoingLinks || 0) + Number(node.incomingLinks || 0)
  return Math.min(MAX_RADIUS, MIN_RADIUS + Math.sqrt(degree) * 2.4)
}

/**
 * 力导向布局：斥力 + 弹簧 + 向心力。
 * 节点数量不多（个人花园通常几十到几百篇），固定迭代比逐帧模拟更容易测试，
 * 结果直接交给 SVG 渲染。
 */
export function layoutGraph(
  nodes: GraphInputNode[],
  edges: GraphInputEdge[],
  options: LayoutOptions = {}
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  const width = options.width ?? 960
  const height = options.height ?? 560
  const iterations = options.iterations ?? 320
  const random = createRandom(options.seed)
  const known = new Set(nodes.map(node => Number(node.id)))

  const layoutNodes: LayoutNode[] = nodes.map(node => {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * Math.min(width, height) * 0.32
    return {
      id: Number(node.id),
      title: node.title,
      x: width / 2 + Math.cos(angle) * distance,
      y: height / 2 + Math.sin(angle) * distance,
      vx: 0,
      vy: 0,
      radius: nodeRadius(node),
      degree: Number(node.outgoingLinks || 0) + Number(node.incomingLinks || 0),
      tags: node.tags ?? [],
      outgoingLinks: Number(node.outgoingLinks || 0),
      incomingLinks: Number(node.incomingLinks || 0),
    }
  })

  const index = new Map(layoutNodes.map((node, i) => [node.id, i]))
  // 去掉自环与指向不存在节点的边，避免布局时出现 NaN
  const layoutEdges: LayoutEdge[] = edges
    .map(edge => ({ source: Number(edge.source), target: Number(edge.target) }))
    .filter(edge =>
      edge.source !== edge.target &&
      known.has(edge.source) &&
      known.has(edge.target)
    )

  const count = layoutNodes.length
  if (count === 0) return { nodes: [], edges: [], width, height }
  if (count === 1) {
    layoutNodes[0].x = width / 2
    layoutNodes[0].y = height / 2
    return { nodes: layoutNodes, edges: layoutEdges, width, height }
  }

  const area = width * height
  const repulsion = (area / count) * 0.08
  const springLength = Math.sqrt(area / count) * 0.5
  const springStrength = 0.045

  for (let step = 0; step < iterations; step += 1) {
    // 温度逐步下降，前段快速展开、后段精细收敛
    const cooling = 1 - step / (iterations + 1)

    for (let i = 0; i < count; i += 1) {
      const a = layoutNodes[i]
      for (let j = i + 1; j < count; j += 1) {
        const b = layoutNodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let distanceSq = dx * dx + dy * dy
        if (distanceSq < 1) {
          dx = (random() - 0.5) || 0.5
          dy = (random() - 0.5) || 0.5
          distanceSq = dx * dx + dy * dy
        }
        const distance = Math.sqrt(distanceSq)
        const force = repulsion / distanceSq
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }

    for (const edge of layoutEdges) {
      const a = layoutNodes[index.get(edge.source) as number]
      const b = layoutNodes[index.get(edge.target) as number]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (distance - springLength) * springStrength
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    for (const node of layoutNodes) {
      node.vx += (width / 2 - node.x) * CENTER_BIAS
      node.vy += (height / 2 - node.y) * CENTER_BIAS
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
      if (speed > MAX_VELOCITY) {
        node.vx = (node.vx / speed) * MAX_VELOCITY
        node.vy = (node.vy / speed) * MAX_VELOCITY
      }
      node.x += node.vx * cooling
      node.y += node.vy * cooling
      node.vx *= 0.72
      node.vy *= 0.72
      // 贴边时反弹，留出节点半径，避免圆心被裁掉
      const pad = node.radius + 4
      node.x = Math.min(width - pad, Math.max(pad, node.x))
      node.y = Math.min(height - pad, Math.max(pad, node.y))
    }
  }

  return { nodes: layoutNodes, edges: layoutEdges, width, height }
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function graphBounds(nodes: LayoutNode[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius)
    minY = Math.min(minY, node.y - node.radius)
    maxX = Math.max(maxX, node.x + node.radius)
    maxY = Math.max(maxY, node.y + node.radius)
  }
  return { minX, minY, maxX, maxY }
}

// 把布局结果的包围盒等比缩放到画布内，相当于 SVG viewBox
export function fitViewBox(nodes: LayoutNode[], padding = 24): string {
  const { minX, minY, maxX, maxY } = graphBounds(nodes)
  const width = Math.max(1, maxX - minX + padding * 2)
  const height = Math.max(1, maxY - minY + padding * 2)
  return `${minX - padding} ${minY - padding} ${width} ${height}`
}

/**
 * 悬停/选中时高亮一跳邻居。
 * 返回的集合包含中心节点本身，渲染时据此淡化其余节点与边。
 */
export function highlightNeighbors(
  centerId: number | null,
  edges: LayoutEdge[]
): Set<number> {
  const result = new Set<number>()
  if (centerId == null) return result
  result.add(centerId)
  for (const edge of edges) {
    if (edge.source === centerId) result.add(edge.target)
    if (edge.target === centerId) result.add(edge.source)
  }
  return result
}

// 按度数排序取前 N 个作为「最常被链接」入口
export function topLinkedNodes(nodes: LayoutNode[], limit = 6): LayoutNode[] {
  return [...nodes]
    .filter(node => node.degree > 0)
    .sort((a, b) => b.degree - a.degree || b.incomingLinks - a.incomingLinks || a.id - b.id)
    .slice(0, limit)
}

export interface GardenHub {
  id: number
  title: string
  degree: number
  incomingLinks: number
  outgoingLinks: number
}

/**
 * 花园体检：按真实边列表统计。
 * 不能用节点上的计数直接推断孤岛——计数和后端边的口径可能不同，
 * 这里统一以 edges 为准，保证列表里点进图谱看到的是同一张网。
 */
export function gardenInsights(
  nodes: GraphInputNode[],
  edges: GraphInputEdge[]
): { hubs: GardenHub[]; orphans: GardenHub[] } {
  const degree = new Map<number, { incoming: number; outgoing: number }>()
  for (const node of nodes) {
    degree.set(Number(node.id), { incoming: 0, outgoing: 0 })
  }
  const seenOut = new Set<string>()
  for (const edge of edges) {
    const source = Number(edge.source)
    const target = Number(edge.target)
    if (source === target) continue
    const from = degree.get(source)
    const to = degree.get(target)
    if (!from || !to) continue
    // 同一对笔记之间只写了一条双链，不把重复的引用算成多条边
    const key = `${source}>${target}`
    if (seenOut.has(key)) continue
    seenOut.add(key)
    from.outgoing += 1
    to.incoming += 1
  }

  const rows: GardenHub[] = nodes.map(node => {
    const id = Number(node.id)
    const links = degree.get(id) || { incoming: 0, outgoing: 0 }
    return {
      id,
      title: node.title,
      degree: links.incoming + links.outgoing,
      incomingLinks: links.incoming,
      outgoingLinks: links.outgoing,
    }
  })

  const hubs = rows
    .filter(row => row.degree > 0)
    .sort((a, b) => b.incomingLinks - a.incomingLinks || b.degree - a.degree || a.id - b.id)
    .slice(0, 3)
  const orphans = rows
    .filter(row => row.degree === 0)
    .sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id)

  return { hubs, orphans }
}
