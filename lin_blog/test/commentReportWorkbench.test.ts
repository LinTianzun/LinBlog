import assert from 'node:assert/strict'
import test from 'node:test'
import type { CommentReportItem } from '../src/api/commentReport.ts'
import {
    REPORT_RANGE_OPTIONS,
    extractTrend,
    isAllSelected,
    isCompleteReportRange,
    isValidReportDate,
    normalizeHandleNote,
    pruneSelectedIds,
    rangePresetFromDates,
    resolveReportRange,
    selectableReportIds,
    shortDate,
    toggleId,
    toggleSelectAll,
    trendHeight,
    trendMax,
    trendSummary,
} from '../src/utils/commentReportWorkbench.ts'

function report(id: number, status: 0 | 1 | 2): CommentReportItem {
  return {
    id,
    targetType: 'article',
    commentId: id * 10,
    reason: 'spam',
    detail: '',
    status,
    createdAt: '2026-10-29T10:00:00.000Z',
    handledAt: null,
    handleNote: '',
    handlerName: null,
    reporter: { id: 1, name: '举报人' },
    comment: {
      id: id * 10,
      content: '内容',
      status: 1,
      likes: 0,
      complaint: 1,
      createdAt: '2026-10-29T09:00:00.000Z',
      user: { id: 2, name: '作者', avatar: null },
    },
    source: { type: 'article', id: 5, title: '文章', classify: 'article' },
  }
}

test('时间范围快捷键按本地日期换算起止区间', () => {
  const { startDate, endDate } = resolveReportRange(7)

  assert.match(startDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(endDate, /^\d{4}-\d{2}-\d{2}$/)

  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  assert.equal(spanDays, 6, '近 7 天应含今天，跨度 6 天')

  assert.deepEqual(resolveReportRange(0), { startDate: '', endDate: '' })
})

test('只有成对且合法的日期才构成有效筛选', () => {
  assert.equal(isValidReportDate('2026-10-29'), true)
  // 不存在的日期会被 Date 进位，必须判为非法
  assert.equal(isValidReportDate('2026-02-31'), false)
  assert.equal(isValidReportDate('2026/10/29'), false)
  assert.equal(isValidReportDate(''), false)

  assert.equal(isCompleteReportRange('2026-10-01', '2026-10-31'), true)
  assert.equal(isCompleteReportRange('2026-10-01', ''), false)
  assert.equal(isCompleteReportRange('', '2026-10-31'), false)
})

test('手工选择与快捷键保持一致时高亮对应的区间', () => {
  const weekly = resolveReportRange(7)
  assert.equal(rangePresetFromDates(weekly.startDate, weekly.endDate), 7)
  assert.equal(rangePresetFromDates('2026-01-01', '2026-02-01'), 0)
  assert.equal(rangePresetFromDates('', ''), 0)
  assert.equal(REPORT_RANGE_OPTIONS.length, 3)
})

test('批量选择只允许待处理举报', () => {
  const reports = [report(1, 0), report(2, 1), report(3, 0), report(4, 2)]
  assert.deepEqual(selectableReportIds(reports), [1, 3])
})

test('全选在未选中和部分选中时补齐，在全选中时清空', () => {
  const candidates = [1, 3]

  assert.deepEqual(toggleSelectAll([], candidates), [1, 3])
  assert.deepEqual(toggleSelectAll([1], candidates), [1, 3])
  assert.deepEqual(toggleSelectAll([1, 3], candidates), [])
  // 无可选项时不进入全选态
  assert.deepEqual(toggleSelectAll([], []), [])
  assert.equal(isAllSelected([], []), false)
})

test('单个勾选增删互不干扰', () => {
  assert.deepEqual(toggleId([1, 3], 5), [1, 3, 5])
  assert.deepEqual(toggleId([1, 3], 1), [3])
})

test('刷新后剔除已经不在当前页的选择', () => {
  assert.deepEqual(pruneSelectedIds([1, 2, 3], [2, 3]), [2, 3])
  assert.deepEqual(pruneSelectedIds([1, 2], []), [])
})

test('趋势条按峰值归一化，且不会算出 NaN 高度', () => {
  const trend = [
    { date: '2026-10-27', total: 0, pending: 0, resolved: 0, dismissed: 0 },
    { date: '2026-10-28', total: 4, pending: 1, resolved: 2, dismissed: 1 },
    { date: '2026-10-29', total: 8, pending: 3, resolved: 5, dismissed: 0 },
  ]

  const max = trendMax(trend)
  assert.equal(max, 8)
  assert.equal(trendHeight(8, max), 100)
  assert.equal(trendHeight(4, max), 50)
  assert.equal(trendHeight(0, max), 0)

  // 全 0 的趋势用 1 兜底，避免除零
  const empty = trendMax([
    { date: '2026-10-29', total: 0, pending: 0, resolved: 0, dismissed: 0 },
  ])
  assert.equal(empty, 1)
})

test('趋势汇总给出总量与峰值日期', () => {
  const trend = [
    { date: '2026-10-28', total: 2, pending: 2, resolved: 0, dismissed: 0 },
    { date: '2026-10-29', total: 5, pending: 1, resolved: 4, dismissed: 0 },
  ]
  const summary = trendSummary(trend)

  assert.equal(summary.total, 7)
  assert.equal(summary.peak?.date, '2026-10-29')
  assert.equal(trendSummary([]).peak, null)
})

test('日期摘要与备注裁剪', () => {
  assert.equal(shortDate('2026-10-29'), '10/29')
  assert.equal(shortDate('invalid'), 'invalid')
  assert.equal(normalizeHandleNote('  '.repeat(5)).length, 0)
  assert.equal(normalizeHandleNote('x'.repeat(260)).length, 200)
})

test('趋势缺失时退化为空数组而不是抛错', () => {
  assert.deepEqual(extractTrend(undefined), [])
  assert.deepEqual(
    extractTrend({
      total: 0,
      page: 1,
      pageSize: 10,
      totalPage: 0,
      list: [],
      summary: { total: 0, pending: 0, resolved: 0, dismissed: 0, reasons: {} },
    }),
    []
  )
})
