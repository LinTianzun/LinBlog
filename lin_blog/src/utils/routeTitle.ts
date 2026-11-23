import type { RouteLocationNormalized } from 'vue-router'

// 编辑页的标题按「新建 / 编辑」区分：列表页走静态 meta.title，
// 没有 id 说明是从新建入口进来，否则视为编辑已有内容。
const DYNAMIC_TITLES: Record<string, { create: string; edit: string }> = {
  editarticle: { create: '新建博客文章', edit: '编辑博客文章' },
  editgallery: { create: '新建摄影图库', edit: '编辑摄影图库' },
}

/**
 * 取当前路由应展示的页面标题。
 *
 * 优先使用动态规则（需要区分新建/编辑），其次取 meta.title。
 * 统一在这里兜底，路由 afterEach 只负责把结果交给 applyPrivateSeo。
 */
export function resolveRouteTitle(route: Pick<RouteLocationNormalized, 'path' | 'params' | 'meta'>): string {
  const firstSegment = route.path.split('/').filter(Boolean)[0] || ''
  const dynamic = DYNAMIC_TITLES[firstSegment]
  if (dynamic) {
    // 优先看路径里是否真的带了 id：单测与哨兵路由不一定回填 params
    const pathId = route.path.split('/').filter(Boolean)[1]
    const id = pathId ?? route.params.id
    return id === undefined || id === '' ? dynamic.create : dynamic.edit
  }
  return typeof route.meta.title === 'string' && route.meta.title ? route.meta.title : 'LinBlog 管理后台'
}
