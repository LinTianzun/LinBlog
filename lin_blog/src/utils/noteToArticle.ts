/**
 * 写作闭环：把一篇花园笔记「升级」成长文草稿。
 *
 * 笔记是几百字的想法，文章需要更完整的骨架：
 * - 笔记正文转成 Markdown 小标题结构，保留 #标签 与 [[双链]]
 * - 待整理清单推荐的笔记追加成「相关笔记」双链，升级时顺手把花园的路接上
 * - 输出直接写进新建文章的本机草稿，编辑器打开就能接着写
 */

export interface UpgradeLink {
  id: number
  title: string
  slug?: string
}

export interface UpgradeNote {
  title: string
  content: string
}

/**
 * 正文优先保留作者写过的结构（# 标题、列表、引用、代码块）。
 * 没有任何标题时补一个「原始想法」小节，避免整篇是一段裸文本。
 */
export function noteBodyToMarkdown(content?: string | null): string {
  const body = String(content || '').replace(/\r\n/g, '\n').trim()
  if (!body) return ''
  const hasHeading = /^#{1,6}\s+\S/m.test(body)
  return hasHeading ? body : `## 原始想法\n\n${body}`
}

/**
 * @param note 选中的笔记
 * @param links 待整理清单里推荐的笔记（会写成双链）
 */
export function buildArticleDraft(note: UpgradeNote, links: UpgradeLink[] = []): {
  title: string
  content: string
} {
  const title = String(note.title || '').trim().slice(0, 150)
  const sections: string[] = [noteBodyToMarkdown(note.content)]

  const seen = new Set<string>()
  const related = (Array.isArray(links) ? links : []).filter(link => {
    const name = String(link?.title || '').trim()
    // 不推荐自己，也不重复写同一个标题
    if (!name || name === title || seen.has(name)) return false
    seen.add(name)
    return true
  })

  if (related.length) {
    const stack = related
      .slice(0, 5)
      .map(link => `- [[${String(link.title).trim()}]] —— 花园里的相关笔记`)
      .join('\n')
    sections.push(`## 相关笔记\n\n${stack}`)
  }

  sections.push(
    [
      '## 待补充',
      '',
      '- 把这篇笔记的核心结论写成一句话',
      '- 补一个具体例子或踩坑记录',
      '- 回头在花园笔记里加上指向这篇文章的链接',
    ].join('\n')
  )

  return { title, content: sections.filter(Boolean).join('\n\n') + '\n' }
}
