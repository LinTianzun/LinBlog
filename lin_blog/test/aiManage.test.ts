import assert from 'node:assert/strict'
import test from 'node:test'
import {
    aiFeatureLabel,
    buildAiTrendChartData,
    formatAiBytes,
    formatAiDuration,
    formatAiNumber,
} from '../src/utils/aiManage.ts'

test('AI 功能标识转换为页面文案', () => {
    assert.equal(aiFeatureLabel('suggest'), '写作建议')
    assert.equal(aiFeatureLabel('prompt-preview'), '提示词试跑')
    assert.equal(aiFeatureLabel('unknown-feature'), 'unknown-feature')
})

test('AI 耗时、数值与字节数按量级格式化', () => {
    assert.equal(formatAiDuration(0), '-')
    assert.equal(formatAiDuration(860), '860 毫秒')
    assert.equal(formatAiDuration(1540), '1.5 秒')
    assert.equal(formatAiNumber(999), '999')
    assert.equal(formatAiNumber(1234).replace(',', ''), '1234')
    assert.equal(formatAiNumber(12345), '1.2 万')
    assert.equal(formatAiBytes(0), '0 B')
    assert.equal(formatAiBytes(2048), '2.0 KB')
    assert.equal(formatAiBytes(1536 * 1024), '1.5 MB')
})

test('AI 每日趋势转换成图表数据', () => {
    const stats = {
        trend: [
            { day: '2026-11-01', total: 3, success: 3, tokens: 10 },
            { day: '2026-11-02', total: 5, success: 4, tokens: 12 },
        ],
    } as never
    assert.deepEqual(buildAiTrendChartData(stats), [
        { date: '2026-11-01', count: 3 },
        { date: '2026-11-02', count: 5 },
    ])
    assert.deepEqual(buildAiTrendChartData(null), [])
})
