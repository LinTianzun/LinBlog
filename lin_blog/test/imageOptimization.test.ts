import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IMAGE_WIDTHS,
  imageSrcset,
  isUploadImageUrl,
  optimizeRichContentImages,
  optimizedImageUrl,
  responsiveImageAttrs,
} from '../src/utils/imageOptimization.ts'

test('站内上传图片会生成 webp 缩略图地址', () => {
  const url = optimizedImageUrl('/api/uploads/photo.jpg', 640)

  assert.equal(url, '/api/uploads/photo.jpg?w=640&format=webp')
  assert.equal(isUploadImageUrl(url), true)
})

test('已有查询参数会保留，静态图片和外链保持原样', () => {
  assert.equal(
    optimizedImageUrl('/api/uploads/photo.jpg?v=2', 320),
    '/api/uploads/photo.jpg?v=2&w=320&format=webp'
  )
  assert.equal(
    optimizedImageUrl('/img/photo.jpg', 320),
    '/img/photo.jpg'
  )
  assert.equal(
    optimizedImageUrl('https://cdn.example.com/photo.jpg', 320),
    'https://cdn.example.com/photo.jpg'
  )
})

test('srcset 只对站内上传图片生成并保持升序', () => {
  assert.equal(
    imageSrcset('/api/uploads/photo.webp', [960, 320, 640, 640]),
    [
      '/api/uploads/photo.webp?w=320&format=webp 320w',
      '/api/uploads/photo.webp?w=640&format=webp 640w',
      '/api/uploads/photo.webp?w=960&format=webp 960w',
    ].join(', ')
  )
  assert.equal(imageSrcset('https://cdn.example.com/photo.webp'), '')
})

test('响应式图片属性包含懒加载与异步解码', () => {
  const attrs = responsiveImageAttrs('/api/uploads/photo.jpg', {
    widths: IMAGE_WIDTHS.card,
    sizes: '(max-width: 640px) 100vw, 240px',
    loading: 'eager',
    fetchPriority: 'high',
  })

  assert.equal(attrs.src, '/api/uploads/photo.jpg?w=640&format=webp')
  assert.match(attrs.srcset || '', /240w, .*320w, .*480w, .*640w/)
  assert.equal(attrs.sizes, '(max-width: 640px) 100vw, 240px')
  assert.equal(attrs.loading, 'eager')
  assert.equal(attrs.decoding, 'async')
  assert.equal(attrs.fetchpriority, 'high')
})

test('富文本正文图片会补充响应式地址与懒加载属性', () => {
  const html = optimizeRichContentImages(
    '<p>正文</p><img src="/api/uploads/body.jpg" alt="正文图"><img src="https://cdn.example.com/raw.jpg">'
  )

  assert.match(html, /src="\/api\/uploads\/body\.jpg\?w=960&amp;format=webp"/)
  assert.match(html, /srcset="[^"]+320w[^"]+960w"/)
  assert.match(html, /sizes="\(max-width: 640px\) 100vw, 620px"/)
  assert.match(html, /loading="lazy"/)
  assert.match(html, /decoding="async"/)
  assert.match(html, /<img src="https:\/\/cdn\.example\.com\/raw\.jpg">/)
})
