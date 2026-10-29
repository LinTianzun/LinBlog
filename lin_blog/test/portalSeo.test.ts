import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArticleItem } from '../src/api/article.ts'
import type { PortalDiary } from '../src/api/portal.ts'
import {
    archiveSeoConfig,
    articleSeoConfig,
    diarySeoConfig,
    gallerySeoConfig,
    plainText,
    portalItemUrl,
} from '../src/utils/portalSeo.ts'

const origin = 'https://blog.example.com'

const article: ArticleItem = {
    id: 12,
    userId: 1,
    title: '在雨里写代码',
    subsetId: 2,
    subsetName: '技术',
    classify: 'article',
    label: '工程,生活',
    introduce: '一段关于代码与雨声的记录。',
    cover: '/api/uploads/cover.webp',
    content: '<p>正文内容</p>',
    views: 3,
    likes: 2,
    comments: 1,
    state: 'published',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-02T08:00:00.000Z',
    publishedAt: '2026-10-02T08:00:00.000Z',
}

test('详情链接统一使用 open 查询参数并保留归档页路径', () => {
    assert.equal(
        portalItemUrl('article', 12, origin),
        'https://blog.example.com/portal/articles?open=12'
    )
    assert.equal(
        portalItemUrl('gallery', 8, origin),
        'https://blog.example.com/portal/gallery?open=8'
    )
    assert.equal(
        portalItemUrl('diary', 3, origin),
        'https://blog.example.com/portal/diary?open=3'
    )
})

test('文章 SEO 会生成绝对 canonical、封面与 BlogPosting 结构化数据', () => {
    const config = articleSeoConfig(
        article,
        portalItemUrl('article', article.id, origin),
        origin
    )

    assert.equal(config.title, article.title)
    assert.equal(config.description, article.introduce)
    assert.equal(config.image, 'https://blog.example.com/api/uploads/cover.webp')
    assert.equal(config.type, 'article')
    assert.equal(
        config.url,
        'https://blog.example.com/portal/articles?open=12'
    )
    assert.equal(config.jsonLd?.['@type'], 'BlogPosting')
})

test('图库 SEO 使用图集结构化数据并从首图补封面', () => {
    const config = gallerySeoConfig(
        {
            ...article,
            id: 8,
            classify: 'image',
            cover: null,
            content: JSON.stringify([
                '/api/uploads/photo-1.webp',
                '/api/uploads/photo-2.webp',
            ]),
        },
        portalItemUrl('gallery', 8, origin),
        origin
    )

    assert.equal(config.image, 'https://blog.example.com/api/uploads/photo-1.webp')
    assert.equal(config.jsonLd?.['@type'], 'ImageGallery')
    assert.deepEqual(config.jsonLd?.image, [
        'https://blog.example.com/api/uploads/photo-1.webp',
        'https://blog.example.com/api/uploads/photo-2.webp',
    ])
})

test('随笔 SEO 会清理正文标签并生成摘要', () => {
    const diary: PortalDiary = {
        id: 3,
        title: '下午四点',
        content: '<p>风吹过窗台，<strong>光</strong>落在桌面上。</p>',
        picture: ['/api/uploads/diary.webp'],
        weatherId: 1,
        weatherName: '晴天',
        views: 4,
        likes: 1,
        comments: 0,
        createdAt: '2026-10-03T08:00:00.000Z',
    }
    const config = diarySeoConfig(
        diary,
        portalItemUrl('diary', diary.id, origin),
        origin
    )

    assert.equal(config.description, '风吹过窗台， 光 落在桌面上。')
    assert.equal(config.image, 'https://blog.example.com/api/uploads/diary.webp')
    assert.equal(config.jsonLd?.['@type'], 'BlogPosting')
    assert.equal(plainText('<p>一段 <b>正文</b></p>'), '一段 正文')
})

test('归档页使用稳定 canonical，而不是继承上一篇详情', () => {
    const config = archiveSeoConfig(
        'article',
        'https://blog.example.com/portal/articles'
    )
    assert.equal(config.title, '文章归档')
    assert.equal(config.url, 'https://blog.example.com/portal/articles')
    assert.equal(config.type, 'website')
})
