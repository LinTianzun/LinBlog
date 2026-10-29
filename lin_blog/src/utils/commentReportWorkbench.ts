import type {
  CommentReportItem,
  CommentReportPageData,
  CommentReportTrendPoint,
} from '../api/commentReport.ts'

export const REPORT_STATE_EVENT = 'linblog:report-state-change'

export function emitReportStateChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REPORT_STATE_EVENT))
  }
}

export const REPORT_DATE_PATTERN = 'YYYY-MM-DD'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 时间范围快捷键对应的天数，0 表示不限 */
export type ReportRangePreset = 0 | 7 | 30

export interface ReportRangeOption {
  value: ReportRangePreset
  label: string
}

export const REPORT_RANGE_OPTIONS: ReportRangeOption[] = [
  { value: 0, label: '不限时间' },
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
]

/**
 * 合法的 YYYY-MM-DD 日期才是有效输入。
 * 像 2026-02-31 这种会被 Date 进位到下个月，这里用回读字符串再比对一次挡掉。
 */
export function isValidReportDate(value: string): boolean {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === value
}

/** 起止日期必须成对且都为合法日期，否则整段范围不参与筛选 */
export function isCompleteReportRange(startDate: string, endDate: string): boolean {
  return isValidReportDate(startDate) && isValidReportDate(endDate)
}

/** 本地时区的今天，避免直接 toISOString 在 UTC+8 早八点前算出昨天 */
function localToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function toDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 按快捷键换算成具体日期区间；不限时间时返回两个空串 */
export function resolveReportRange(preset: ReportRangePreset): {
  startDate: string
  endDate: string
} {
  if (!preset) return { startDate: '', endDate: '' }
  const today = localToday()
  const begin = new Date(today.getTime())
  begin.setDate(begin.getDate() - (preset - 1))
  return { startDate: toDateText(begin), endDate: toDateText(today) }
}

/** 当前 toolbar 里的 preferset 与手工日期冲突时，优先展示手工输入 */
export function rangePresetFromDates(startDate: string, endDate: string): ReportRangePreset {
  if (!isCompleteReportRange(startDate, endDate)) return 0
  for (const option of REPORT_RANGE_OPTIONS) {
    if (!option.value) continue
    const range = resolveReportRange(option.value)
    if (range.startDate === startDate && range.endDate === endDate) return option.value
  }
  return 0
}

/**
 * 只有待处理举报能被勾选批量处理——已处理/已忽略的卡片已经有结论，
 * 混在一起批量操作容易误改历史处理结果。
 */
export function selectableReportIds(reports: CommentReportItem[]): number[] {
  return reports.filter(item => item.status === 0).map(item => item.id)
}

export function isAllSelected(selectedIds: number[], candidates: number[]): boolean {
  return candidates.length > 0 && candidates.every(id => selectedIds.includes(id))
}

/** 切换「全选」：从全选中状态回到空，否则补齐当前全部可选项 */
export function toggleSelectAll(
  selectedIds: number[],
  candidates: number[]
): number[] {
  return isAllSelected(selectedIds, candidates) ? [] : [...candidates]
}

export function toggleId(selectedIds: number[], id: number): number[] {
  return selectedIds.includes(id)
    ? selectedIds.filter(item => item !== id)
    : [...selectedIds, id]
}

/** 列表刷新后丢掉已经不在当前页的选择，避免对看不见的记录发起批量操作 */
export function pruneSelectedIds(
  selectedIds: number[],
  visibleIds: number[]
): number[] {
  const visible = new Set(visibleIds)
  return selectedIds.filter(id => visible.has(id))
}

/**
 * 趋势里“最近一天”的柱状高度上限。
 * 全部为 0 时返回 1，避免除以零后渲染出 NaN 高度。
 */
export function trendMax(trend: CommentReportTrendPoint[]): number {
  const max = trend.reduce((acc, point) => Math.max(acc, point.total), 0)
  return max > 0 ? max : 1
}

/** 趋势条高度百分比，最小保留 2% 让空数据也有可点击的热区 */
export function trendHeight(total: number, max: number): number {
  if (!total) return 0
  return Math.max(2, Math.round((total / max) * 100))
}

export function trendSummary(trend: CommentReportTrendPoint[]): {
  total: number
  peak: CommentReportTrendPoint | null
} {
  const total = trend.reduce((acc, point) => acc + point.total, 0)
  const peak = trend.reduce<CommentReportTrendPoint | null>(
    (acc, point) => (acc === null || point.total > acc.total ? point : acc),
    null
  )
  return { total, peak: peak && peak.total > 0 ? peak : null }
}

/** YYYY-MM-DD 渲染成 M/D，非法输入原样返回，方便排查脏数据 */
export function shortDate(value: string): string {
  if (!isValidReportDate(value)) return value
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

/** 列表数据是否带有可用的趋势（后端未升级时退化为空数组） */
export function extractTrend(
  data: CommentReportPageData | undefined
): CommentReportTrendPoint[] {
  return Array.isArray(data?.trend) ? data.trend : []
}

/** 处理备注统一裁剪到 200 字，与后端 VARCHAR(200) 对齐 */
export function normalizeHandleNote(value: string): string {
  return value.trim().slice(0, 200)
}
