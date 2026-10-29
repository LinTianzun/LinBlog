import type { CommentReportReason } from '../api/comment'

export interface CommentReportReasonOption {
  value: CommentReportReason
  label: string
  // 举报弹窗里展示的说明，后台筛选/列表只用 label
  description: string
}

// 举报原因的唯一来源：前台举报弹窗、后台举报处理页共用同一套文案
export const COMMENT_REPORT_REASONS: CommentReportReasonOption[] = [
  { value: 'spam', label: '广告或引流', description: '营销广告、二维码、联系方式等' },
  { value: 'abuse', label: '辱骂或攻击', description: '人身攻击、歧视或恶意骚扰' },
  { value: 'porn', label: '色情或低俗', description: '露骨内容或不适宜图片' },
  { value: 'illegal', label: '违法或危险', description: '违法、诈骗或危险行为' },
  { value: 'misinformation', label: '虚假或误导', description: '谣言、伪科学或严重误导' },
  { value: 'other', label: '其他原因', description: '以上情况均不符合' },
]

export function commentReportReasonLabel(value: string): string {
  return COMMENT_REPORT_REASONS.find(item => item.value === value)?.label || value
}
