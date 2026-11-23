const sharp = require('sharp')

const SITE_NAME = '林知雨 · 个人刊物'
const DEFAULT_DESCRIPTION = '林知雨的个人博客，记录代码、摄影与日常。'
const WIDTH = 1200
const HEIGHT = 630

const PALETTES = {
    home: {
        start: '#101827',
        end: '#1f3b4d',
        accent: '#7dd3fc',
        glow: '#38bdf8',
        label: '个人刊物 / JOURNAL',
    },
    article: {
        start: '#111827',
        end: '#243b53',
        accent: '#86efac',
        glow: '#34d399',
        label: '文章 / ESSAY',
    },
    gallery: {
        start: '#1c1917',
        end: '#4c2d2a',
        accent: '#fcd34d',
        glow: '#fb923c',
        label: '摄影 / PHOTOGRAPHS',
    },
    diary: {
        start: '#0f172a',
        end: '#164e63',
        accent: '#a7f3d0',
        glow: '#22d3ee',
        label: '随笔 / MICRO JOURNAL',
    },
    series: {
        start: '#161326',
        end: '#3b2d56',
        accent: '#c4b5fd',
        glow: '#8b5cf6',
        label: '系列 / COLLECTION',
    },
    note: {
        start: '#121b17',
        end: '#1f3d33',
        accent: '#86efac',
        glow: '#10b981',
        label: '花园 / DIGITAL GARDEN',
    },
}

// 文章主题色：由标签集合稳定映射，站点仍保持统一的深色阅读气质
const OG_THEME_PALETTES = [
    {
        start: '#0b1c2c',
        end: '#1c3f5a',
        accent: '#7dd3fc',
        glow: '#38bdf8',
    },
    {
        start: '#0f1f1a',
        end: '#1f4a38',
        accent: '#86efac',
        glow: '#34d399',
    },
    {
        start: '#171127',
        end: '#38265c',
        accent: '#c4b5fd',
        glow: '#8b5cf6',
    },
    {
        start: '#1f1310',
        end: '#4a231b',
        accent: '#fdba74',
        glow: '#fb923c',
    },
    {
        start: '#24101a',
        end: '#4c2131',
        accent: '#f9a8d4',
        glow: '#ec4899',
    },
    {
        start: '#1b1710',
        end: '#443720',
        accent: '#fcd34d',
        glow: '#f59e0b',
    },
]

function normalizeThemeTags(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',')
    const seen = new Set()
    const tags = []
    for (const item of source) {
        const tag = String(item || '').trim().toLowerCase()
        if (!tag || seen.has(tag)) continue
        seen.add(tag)
        tags.push(tag)
    }
    return tags.sort()
}

function hashThemeKey(value) {
    const text = String(value || '')
    let hash = 2166136261
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function resolveOgTheme(value) {
    const tags = normalizeThemeTags(value)
    if (tags.length === 0) return null
    return OG_THEME_PALETTES[hashThemeKey(tags.join('|')) % OG_THEME_PALETTES.length]
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function plainText(value) {
    return String(value || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
}

function textUnits(char) {
    if (/\s/.test(char)) return 0.4
    return char.codePointAt(0) > 255 ? 1 : 0.56
}

function truncateByUnits(value, maxUnits) {
    const chars = Array.from(String(value || ''))
    let units = 0
    for (let index = 0; index < chars.length; index += 1) {
        const next = textUnits(chars[index])
        if (units + next > maxUnits) {
            return index <= 0
                ? '…'
                : `${chars.slice(0, index).join('').trimEnd()}…`
        }
        units += next
    }
    return chars.join('')
}

// CJK 没有空格断词，换行时尽量落在标点之后，避免把短语拆开
const BREAK_AFTER = new Set(['，', '。', '、', '；', '：', '！', '？', ' ', '·', '/'])

function wrapText(value, maxUnits, maxLines) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text) return ['']

    const lines = []
    let line = ''
    let units = 0
    let breakIndex = -1
    for (const char of Array.from(text)) {
        const charUnits = textUnits(char)
        if (units + charUnits > maxUnits && line) {
            const chars = Array.from(line)
            const cutIndex = breakIndex > chars.length * 0.55 ? breakIndex + 1 : chars.length
            lines.push(chars.slice(0, cutIndex).join('').trimEnd())
            // 已达到行数上限：立即截断，避免把剩余文字挤进同一行
            if (lines.length >= maxLines) {
                return lines.map((item, index) => (
                    index === maxLines - 1 && item.length > 0 ? `${item}…` : item
                ))
            }
            line = chars.slice(cutIndex).join('')
            units = Array.from(line).reduce((total, item) => total + textUnits(item), 0)
            breakIndex = -1
        }
        line += char
        units += charUnits
        if (BREAK_AFTER.has(char)) breakIndex = Array.from(line).length - 1
    }

    if (lines.length < maxLines && line.trim()) lines.push(line.trimEnd())
    return lines.length > 0 ? lines.slice(0, maxLines) : ['']
}

function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}.${month}.${day}`
}

function displayUrl(value) {
    const raw = String(value || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    return truncateByUnits(raw, 66)
}

function renderTextLines(lines, {
    x,
    y,
    fontSize,
    lineHeight,
    fill,
    weight = 400,
    letterSpacing = 0,
    opacity = 1,
}) {
    return lines.map((line, index) => (
        `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" ` +
        `font-size="${fontSize}" font-weight="${weight}" letter-spacing="${letterSpacing}" ` +
        `opacity="${opacity}">${escapeXml(line)}</text>`
    )).join('')
}

function buildOgSvg({
    title = SITE_NAME,
    description = DEFAULT_DESCRIPTION,
    kind = 'home',
    date,
    url,
    label,
    tags,
    themeKey,
} = {}) {
    const basePalette = PALETTES[kind] || PALETTES.home
    const themePalette = resolveOgTheme(themeKey || tags)
    const palette = themePalette
        ? { ...themePalette, label: basePalette.label }
        : basePalette
    const titleLines = wrapText(plainText(title) || SITE_NAME, 13, 3)
    const descriptionLines = wrapText(
        plainText(description) || DEFAULT_DESCRIPTION,
        38,
        2
    )
    const dateText = formatDate(date)
    const urlText = displayUrl(url)
    const eyebrow = label || palette.label
    // 多行标题向上抬高，保证副标题与页脚之间始终有留白
    const titleY = titleLines.length > 1 ? 280 - (titleLines.length - 1) * 20 : 292
    const descriptionY = titleY + titleLines.length * 70 + 28

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.start}"/>
      <stop offset="100%" stop-color="${palette.end}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${palette.glow}" stop-opacity="0.52"/>
      <stop offset="100%" stop-color="${palette.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0.08"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#ffffff" stroke-opacity="0.035"/>
    </pattern>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <circle cx="1040" cy="80" r="360" fill="url(#glow)"/>
  <circle cx="1040" cy="80" r="228" fill="none" stroke="${palette.accent}" stroke-opacity="0.14"/>
  <circle cx="1040" cy="80" r="294" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>
  <path d="M 740 630 C 840 455 1040 445 1200 214" fill="none" stroke="${palette.accent}" stroke-opacity="0.11" stroke-width="2"/>
  <path d="M 100 630 L 1200 630" stroke="url(#accent)" stroke-width="4"/>

  <g font-family="WenQuanYi Micro Hei, Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif">
    <text x="72" y="78" fill="#ffffff" fill-opacity="0.72" font-size="19" letter-spacing="2.5">${escapeXml(SITE_NAME)}</text>
    <text x="72" y="150" fill="${palette.accent}" fill-opacity="0.9" font-size="20" font-weight="600" letter-spacing="4.5">${escapeXml(eyebrow)}</text>
    <rect x="72" y="178" width="52" height="3" rx="1.5" fill="${palette.accent}"/>

    ${renderTextLines(titleLines, {
        x: 72,
        y: titleY,
        fontSize: 58,
        lineHeight: 70,
        fill: '#f8fafc',
        weight: 700,
        letterSpacing: -1,
    })}

    ${renderTextLines(descriptionLines, {
        x: 74,
        y: descriptionY,
        fontSize: 25,
        lineHeight: 38,
        fill: '#cbd5e1',
        opacity: 0.9,
    })}

    <rect x="72" y="520" width="1056" height="1" fill="#ffffff" fill-opacity="0.12"/>
    <text x="72" y="566" fill="#ffffff" fill-opacity="0.58" font-size="19" letter-spacing="1.5">${escapeXml(dateText || 'LINBLOG')}</text>
    <text x="1128" y="566" text-anchor="end" fill="#ffffff" fill-opacity="0.58" font-size="19" letter-spacing="0.5">${escapeXml(urlText || 'linblog')}</text>
  </g>
</svg>`
}

async function renderOgImage(options) {
    const svg = buildOgSvg(options)
    return sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer()
}

module.exports = {
    WIDTH,
    HEIGHT,
    SITE_NAME,
    DEFAULT_DESCRIPTION,
    OG_THEME_PALETTES,
    buildOgSvg,
    resolveOgTheme,
    hashThemeKey,
    renderOgImage,
    escapeXml,
    plainText,
    wrapText,
}
