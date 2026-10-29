// 一次性工具：把 src/utils/themes.ts 里的渐变预设派生出 theme-presets.less 的渐变段。
// 用法：node gen-gradient-themes.cjs（改配色请先改 themes.ts）
const fs = require('fs')
const path = require('path')

const THEMES = path.join(__dirname, 'src/utils/themes.ts')
const LESS = path.join(__dirname, 'src/style/theme-presets.less')

const hex2rgb = (h) => {
    const s = h.replace('#', '')
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
const rgb2hex = (arr) =>
    '#' + arr.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => {
    const A = hex2rgb(a)
    const B = hex2rgb(b)
    return rgb2hex([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * t))
}
const lighten = (c, t) => mix(c, '#ffffff', t)
const darken = (c, t) => mix(c, '#000000', t)
const rgba = (c, a) => {
    const [r, g, b] = hex2rgb(c)
    return `rgba(${r}, ${g}, ${b}, ${a})`
}

const src = fs.readFileSync(THEMES, 'utf8')
const re = /id: '([^']+)',\s*\n\s*name: '([^']+)',\s*\n\s*base: '([^']+)',\s*\n\s*kind: 'gradient',\s*\n\s*primary: '([^']+)',\s*\n\s*background: '([^']+)',\s*\n\s*preview: '([^']+)',\s*\n\s*gradient: '([^']+)'\s*\}/g

const blocks = []
let m
while ((m = re.exec(src)) !== null) {
    const [, id, name, base, primary, , , gradient] = m
    const stops = gradient.match(/#[0-9a-fA-F]{6}/g) || []
    const [c0, c1, c2] = stops
    const isDark = base === 'dark'
    const L = []
    L.push(`// ${name}：${isDark ? '深色' : '浅色'}渐变`)
    L.push(`:root[data-theme-preset='${id}'] {`)
    L.push(`    --portal-page-gradient: ${gradient};`)
    L.push(`    --pcolor: ${primary};`)
    ;['0.08', '0.12', '0.16', '0.24', '0.32'].forEach((a, i) => {
        L.push(`    --pcolor${i + 1}: ${rgba(primary, a)};`)
    })
    L.push(`    --pcolor6: ${lighten(primary, 0.14)};`)
    L.push(`    --pcolor8: ${darken(primary, 0.10)};`)
    L.push(`    --pcolor9: ${darken(primary, 0.18)};`)
    L.push(`    --pcolor10: ${darken(primary, 0.30)};`)
    L.push(`    --lcolor: ${primary};`)
    if (isDark) {
        // 卡片面比页面底色亮一档，深色下才有前后层次
        L.push(`    --bgColor1: ${lighten(c1, 0.10)};`)
        L.push(`    --bgColor2: ${c1};`)
        L.push(`    --bgColor3: ${lighten(c1, 0.20)};`)
        L.push(`    --bgColor4: ${lighten(c1, 0.28)};`)
        L.push(`    --bgColor5: ${c0};`)
    } else {
        // 卡片面保持近白，页面底色负责渐变观感，避免卡片跟着一起发灰
        L.push(`    --bgColor1: ${lighten(c0, 0.6)};`)
        L.push(`    --bgColor2: ${c1};`)
        L.push(`    --bgColor3: ${c2};`)
        L.push(`    --bgColor4: ${darken(c2, 0.08)};`)
        L.push(`    --bgColor5: ${lighten(c0, 0.6)};`)
    }
    L.push(`    --bgGradient: ${gradient};`)
    if (isDark) L.push(`    --gray: #ffffff;`)
    L.push(`}`)
    blocks.push(L.join('\n'))
}

const header = [
    '// ===== 渐变色系 =====',
    '// 本段由 src/utils/themes.ts 的渐变预设派生，改配色请改 themes.ts 后跑',
    '// node gen-gradient-themes.cjs 重新生成，避免两处色值漂移。',
    '// 页面底色另写入 --bgGradient / --portal-page-gradient；--bgColor2 仍是纯色，',
    '// 因为它要参与 color-mix()，不接受渐变值。',
    '',
    ''
].join('\n')

let less = fs.readFileSync(LESS, 'utf8')
const marker = '// ===== 渐变色系 ====='
const idx = less.indexOf(marker)
if (idx < 0) throw new Error('找不到渐变段标记')
less = less.slice(0, idx) + header + blocks.join('\n\n') + '\n'
fs.writeFileSync(LESS, less)
console.log('已生成', blocks.length, '套渐变预设变量')
