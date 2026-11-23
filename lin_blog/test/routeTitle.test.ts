import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveRouteTitle } from '../src/utils/routeTitle.ts'

const route = (path: string, params: Record<string, string> = {}, title?: string) =>
    ({ path, params, meta: title ? { title } : {} }) as unknown as Parameters<typeof resolveRouteTitle>[0]

test('列表页取路由 meta.title', () => {
    assert.equal(resolveRouteTitle(route('/setting', {}, '系统设置')), '系统设置')
    assert.equal(resolveRouteTitle(route('/notes/tidy', {}, '待整理笔记')), '待整理笔记')
})

test('编辑页按 id 区分新建与编辑', () => {
    assert.equal(resolveRouteTitle(route('/editarticle')), '新建博客文章')
    assert.equal(resolveRouteTitle(route('/editarticle/12')), '编辑博客文章')
    assert.equal(resolveRouteTitle(route('/editgallery')), '新建摄影图库')
    assert.equal(resolveRouteTitle(route('/editgallery/7')), '编辑摄影图库')
})

test('缺失标题时回落到管理后台', () => {
    assert.equal(resolveRouteTitle(route('/unknown-page')), 'LinBlog 管理后台')
})
