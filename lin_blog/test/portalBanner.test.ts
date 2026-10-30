import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import {
  bannerSrc,
  bannerSrcset,
  preloadBannerSlide,
  shouldRenderSlide,
} from '../src/utils/portalBanner.ts'

test('shouldRenderSlide 只保留当前与相邻两张', () => {
  const total = 9
  const visible = Array.from({ length: total }, (_, i) =>
    shouldRenderSlide(i, 0, total)
  )
  // 0 当前、1 下一张、8 上一张（处理了环绕）
  assert.deepEqual(visible, [true, true, false, false, false, false, false, false, true])
  assert.equal(visible.filter(Boolean).length, 3)
})

test('shouldRenderSlide 在尾部环绕时同样成立', () => {
  const total = 9
  assert.equal(shouldRenderSlide(8, 8, total), true)
  assert.equal(shouldRenderSlide(0, 8, total), true)
  assert.equal(shouldRenderSlide(7, 8, total), true)
  assert.equal(shouldRenderSlide(6, 8, total), false)
})

test('shouldRenderSlide 在幻灯片很少时全渲染', () => {
  assert.equal(shouldRenderSlide(0, 0, 2), true)
  assert.equal(shouldRenderSlide(1, 0, 2), true)
  assert.equal(shouldRenderSlide(0, 0, 1), true)
})

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
})

test('bannerSrc 按宽度替换静态资产后缀', () => {
  assert.equal(bannerSrc('/portal/banner/dawn-1920.webp'), '/portal/banner/dawn-1920.webp')
  assert.equal(bannerSrc('/portal/banner/dawn-1920.webp', 960), '/portal/banner/dawn-960.webp')
  // 命名不匹配时原样返回，不会拼出不存在的资源
  assert.equal(bannerSrc('/portal/banner/dawn.webp', 960), '/portal/banner/dawn.webp')
})

test('bannerSrcset 生成 960/1920 两档候选', () => {
  assert.equal(
    bannerSrcset('/portal/banner/dusk-1920.webp'),
    '/portal/banner/dusk-960.webp 960w, /portal/banner/dusk-1920.webp 1920w'
  )
})

// preloadBannerSlide 直接操作 document.head，这里用最小替身验证去重与换图行为
interface FakeLink extends Record<string, unknown> {
  dataset: Record<string, string>
  attrs: Record<string, string>
}

function stubDocument() {
  const links: FakeLink[] = []
  const document = {
    head: {
      appendChild(link: FakeLink) {
        links.push(link)
        return link
      },
      querySelector(selector: string) {
        void selector
        return links.at(-1) ?? null
      },
    },
    createElement() {
      const link: FakeLink = {
        rel: '',
        href: '',
        dataset: {},
        attrs: {},
        setAttribute(key: string, value: string) {
          link.attrs[key] = value
        },
        remove() {
          const index = links.indexOf(link)
          if (index >= 0) links.splice(index, 1)
        },
      }
      return link
    },
  }
  ;(globalThis as { document?: unknown }).document = document
  return { document, links }
}

test('preloadBannerSlide 只保留当前这一张并带上 imagesrcset', () => {
  const { links } = stubDocument()

  preloadBannerSlide('/portal/banner/dawn-1920.webp')
  assert.equal(links.length, 1)
  assert.equal(links[0].rel, 'preload')
  assert.equal(links[0].href, '/portal/banner/dawn-1920.webp')
  assert.equal(links[0].attrs.imagesrcset, bannerSrcset('/portal/banner/dawn-1920.webp'))
  assert.equal(links[0].attrs.imagesizes, '100vw')
  assert.equal(links[0].attrs.fetchpriority, 'high')

  // 同一张重复调用不新增节点
  preloadBannerSlide('/portal/banner/dawn-1920.webp')
  assert.equal(links.length, 1)

  // 轮播切换后替换成新的那一张，避免 head 里堆积 9 个 preload
  preloadBannerSlide('/portal/banner/dusk-1920.webp')
  assert.equal(links.length, 1)
  assert.equal(links[0].href, '/portal/banner/dusk-1920.webp')
})

test('无 document 时 preloadBannerSlide 静默跳过', () => {
  delete (globalThis as { document?: unknown }).document
  assert.doesNotThrow(() => preloadBannerSlide('/portal/banner/dawn-1920.webp'))
})
