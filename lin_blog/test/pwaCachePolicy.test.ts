import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractPrecacheAssetUrls,
  isCacheablePublicApiPath,
  isCacheableResponse,
  isImageAssetPath,
  isPortalNavigationPath,
  isStaticAssetPath,
} from '../public/sw-policy.js'

test('PWA 仅缓存门户导航', () => {
  assert.equal(isPortalNavigationPath('/portal'), true)
  assert.equal(isPortalNavigationPath('/portal/articles'), true)
  assert.equal(isPortalNavigationPath('/portalx'), false)
  assert.equal(isPortalNavigationPath('/overView'), false)
  assert.equal(isPortalNavigationPath('/loginRegister'), false)
})

test('公共只读内容接口可离线回退，互动与私有接口不缓存', () => {
  for (const pathname of [
    '/api/public/article',
    '/api/public/article/12',
    '/api/public/collection',
    '/api/public/collection/3',
    '/api/public/collection/article/12',
    '/api/public/diary',
    '/api/public/diary/8',
    '/api/public/subset',
    '/api/public/label',
  ]) {
    assert.equal(isCacheablePublicApiPath(pathname), true, pathname)
  }

  for (const pathname of [
    '/api/public/praise/12',
    '/api/public/diary/praise/8',
    '/api/public/comment',
    '/api/public/ai/ask',
    '/api/pet/state',
    '/api/article',
  ]) {
    assert.equal(isCacheablePublicApiPath(pathname), false, pathname)
  }
})

test('静态资源与图片走各自缓存策略', () => {
  assert.equal(isStaticAssetPath('/assets/index-a1b2.js'), true)
  assert.equal(isStaticAssetPath('/portal/banner/dawn-960.webp'), true)
  assert.equal(isStaticAssetPath('/pet/webm/吃饭.webm'), true)
  assert.equal(isStaticAssetPath('/unityWhite.svg'), true)
  assert.equal(isStaticAssetPath('/sw.js'), false)

  assert.equal(isImageAssetPath('/api/uploads/cover.webp'), true)
  assert.equal(isImageAssetPath('/portal/banner/dawn-960.webp'), true)
  assert.equal(isImageAssetPath('/assets/index-a1b2.js'), false)
})

test('从构建后的 index.html 中提取需要预缓存的同源 assets', () => {
  const html = [
    '<link rel="icon" href="/unityWhite.svg">',
    '<link rel="stylesheet" href="/assets/index-a.css">',
    '<script type="module" src="/assets/index-b.js"></script>',
    '<link rel="modulepreload" href="/assets/vendor-c.js">',
    '<script src="https://cdn.example.com/remote.js"></script>',
  ].join('')

  assert.deepEqual(
    extractPrecacheAssetUrls(html, 'https://blog.example.com').sort(),
    ['/assets/index-a.css', '/assets/index-b.js', '/assets/vendor-c.js']
  )
})

test('no-store 或非 200 响应不会进入离线缓存', () => {
  const response = (status: number, cacheControl = '') =>
    new Response('ok', {
      status,
      headers: cacheControl ? { 'Cache-Control': cacheControl } : undefined,
    })

  assert.equal(isCacheableResponse(response(200)), true)
  assert.equal(isCacheableResponse(response(200, 'public, max-age=60')), true)
  assert.equal(isCacheableResponse(response(200, 'no-store')), false)
  assert.equal(isCacheableResponse(response(206)), false)
  assert.equal(isCacheableResponse(response(500)), false)
})
