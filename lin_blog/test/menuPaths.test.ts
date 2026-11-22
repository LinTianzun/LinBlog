import assert from 'node:assert/strict'
import test from 'node:test'
import { navLinks } from '../src/utils/menu.ts'

/**
 * 侧栏根级导航会被挂载在任意后台页面下（例如 /notes/tidy）。
 * 只要路径是相对的，vue-router 会把它解析成 /notes/article 这类地址，
 * 直接落到 catch-all 的 404 页面。这里断言所有菜单项都是绝对路径。
 */
test('侧栏菜单全部使用绝对路径', () => {
  assert.ok(navLinks.length > 0)
  for (const item of navLinks) {
    assert.ok(item.path.startsWith('/'), `菜单「${item.name}」的路径不是绝对路径：${item.path}`)
    assert.ok(!item.path.startsWith('//'), `菜单「${item.name}」使用了协议相对路径：${item.path}`)
  }
})

test('菜单路径没有重复', () => {
  const seen = new Set<string>()
  for (const item of navLinks) {
    assert.ok(!seen.has(item.path), `菜单路径重复：${item.path}`)
    seen.add(item.path)
  }
})
