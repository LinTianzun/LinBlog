import assert from 'node:assert/strict'
import test from 'node:test'
import {
    buildDraftListParams,
    draftClassifyLabel,
    draftPublishPermission,
    resolveDraftCounts,
} from '../src/utils/draftBox.ts'

test('草稿列表参数只带非空筛选', () => {
    assert.deepEqual(
        buildDraftListParams({ page: 2, pageSize: 20, classify: '', keyword: '  ' }),
        { page: 2, pageSize: 20, state: 'draft' }
    )
    assert.deepEqual(
        buildDraftListParams({ page: 1, pageSize: 10, classify: 'image', keyword: '海岸' }),
        { page: 1, pageSize: 10, state: 'draft', classify: 'image', keyword: '海岸' }
    )
})

test('页码与每页条数会收敛到合法范围', () => {
    const params = buildDraftListParams({
        page: 0,
        pageSize: -5,
        classify: '',
        keyword: '',
    })
    assert.equal(params.page, 1)
    assert.equal(params.pageSize, 20)
})

test('分类文案与发布权限一一对应', () => {
    assert.equal(draftClassifyLabel('article'), '博客文章')
    assert.equal(draftClassifyLabel('image'), '摄影图库')
    assert.equal(draftPublishPermission('article'), 'article.publish')
    assert.equal(draftPublishPermission('image'), 'gallery.publish')
})

test('草稿统计缺字段或为负数时按 0 处理', () => {
    assert.deepEqual(resolveDraftCounts({ draft: 3 }, { draft: 2 }), {
        article: 3,
        gallery: 2,
        total: 5,
    })
    assert.deepEqual(resolveDraftCounts(null, { draft: -4 }), {
        article: 0,
        gallery: 0,
        total: 0,
    })
    assert.deepEqual(resolveDraftCounts({}, undefined), {
        article: 0,
        gallery: 0,
        total: 0,
    })
})
