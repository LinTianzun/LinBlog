import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

// 门户所有走响应式图片的位置都必须显式给 sizes：
// 缺省会退化成 100vw，导致移动端按桌面宽度挑图，白白多下 2~4 倍字节。
const responsiveFiles = [
  'src/views/PortalHome.vue',
  'src/views/PortalArticles.vue',
  'src/views/PortalGallery.vue',
  'src/views/PortalDiary.vue',
  'src/components/portal/PortalPhotoWall.vue',
  'src/components/content/ContentDetailHero.vue',
  'src/components/content/ContentPhotoGrid.vue',
  'src/components/content/ContentPhotoStage.vue',
]

function read(file: string): string {
  return readFileSync(new URL(file, `file:///${root.replace(/\\/g, '/')}`), 'utf8')
}

test('门户响应式图片都显式声明 sizes', () => {
  const missing: string[] = []

  for (const file of responsiveFiles) {
    const source = read(file)
    const calls = source.match(/responsiveImageAttrs\(/g) || []
    const sizes = source.match(/\bsizes:/g) || []
    if (calls.length > sizes.length) missing.push(file)
  }

  assert.deepEqual(missing, [], `以下文件有响应式图片未声明 sizes：${missing.join(', ')}`)
})

test('门户 sizes 以移动端为首个条件，不使用纯 100vw', () => {
  const offenders: string[] = []

  for (const file of responsiveFiles) {
    const source = read(file)
    for (const match of source.matchAll(/sizes:\s*(?:'([^']*)'|"([^"]*)"|\?\s*'([^']*)')/g)) {
      const value = (match[1] || match[2] || match[3] || '').trim()
      if (!value) continue
      // 三元写法只校验第一个分支（冒号属于条件语法，不能按 : 切分）
      const first = value.split('?')[0].trim() || value
      if (!first.startsWith('(max-width:') && first !== '100vw') {
        offenders.push(`${file} -> ${value}`)
      }
      // 裸 100vw 等于放弃断点，移动端会按桌面宽度挑图
      if (first === '100vw' && value === '100vw') offenders.push(`${file} -> ${value}`)
    }
  }

  assert.deepEqual(offenders, [], `sizes 首个断点应为 max-width：${offenders.join(' | ')}`)
})
