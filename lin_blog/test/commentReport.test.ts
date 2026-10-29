import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMMENT_REPORT_REASONS,
  commentReportReasonLabel,
} from '../src/utils/commentReport.ts'

test('举报原因保持 6 类且值唯一', () => {
  assert.equal(COMMENT_REPORT_REASONS.length, 6)
  assert.equal(new Set(COMMENT_REPORT_REASONS.map(item => item.value)).size, 6)
  assert.ok(COMMENT_REPORT_REASONS.every(item => item.label && item.description))
})

test('未知举报原因回退为原始值，避免后台出现空白标签', () => {
  assert.equal(commentReportReasonLabel('spam'), '广告或引流')
  assert.equal(commentReportReasonLabel('legacy-reason'), 'legacy-reason')
})
