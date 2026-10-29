import request from "../utils/request";
import type { CommentReportReason, CommentTargetType } from "./comment";

export type CommentReportStatus = 0 | 1 | 2;
// 图库内容在 article 表中 classify=image，因此来源单独区分为 gallery
export type CommentReportSourceFilter = "article" | "gallery" | "diary";

export interface ReportedCommentAuthor {
  id: number | null;
  name: string;
  avatar: string | null;
}

export interface ReportedComment {
  id: number;
  content: string;
  // null 表示评论已物理不存在；0 表示已删除
  status: number | null;
  likes: number;
  complaint: number;
  createdAt: string | null;
  user: ReportedCommentAuthor;
}

export interface ReportedCommentSource {
  type: CommentTargetType;
  id: number | null;
  title: string;
  classify: "article" | "image" | "diary";
}

export interface CommentReportItem {
  id: number;
  targetType: CommentTargetType;
  commentId: number;
  reason: CommentReportReason | string;
  detail: string;
  status: CommentReportStatus;
  createdAt: string;
  handledAt: string | null;
  // 处理备注：运营处理举报时留下的说明，恢复待处理后清空
  handleNote: string;
  handlerName: string | null;
  reporter: {
    id: number;
    name: string;
  };
  comment: ReportedComment;
  source: ReportedCommentSource;
}

export interface CommentReportTrendPoint {
  date: string;
  total: number;
  pending: number;
  resolved: number;
  dismissed: number;
}

export interface CommentReportSummary {
  total: number;
  pending: number;
  resolved: number;
  dismissed: number;
  reasons: Record<string, number>;
}

export interface CommentReportPageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: CommentReportItem[];
  summary: CommentReportSummary;
  // 趋势为可选：后端尚未升级时前端退化为不展示图表，不阻塞列表
  trend?: CommentReportTrendPoint[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export function getRequestErrorMessage(
  error: unknown,
  fallback = "请求失败，请稍后重试"
): string {
  if (typeof error !== "object" || error === null) return fallback;

  const response = (error as {
    response?: { data?: { message?: unknown } };
  }).response;
  const message = response?.data?.message;

  return typeof message === "string" && message ? message : fallback;
}

// 后台举报处理列表（需 comment.moderate）
export function getCommentReports(
  params: {
    page?: number;
    pageSize?: number;
    status?: CommentReportStatus | "all";
    reason?: CommentReportReason | "";
    targetType?: CommentReportSourceFilter | "";
    keyword?: string;
    startDate?: string;
    endDate?: string;
  } = {}
) {
  return request.get<ApiResult<CommentReportPageData>>("/comment/reports", {
    params,
  });
}

// 处理单条举报：0 恢复待处理 / 1 已处理 / 2 已忽略，可附处理备注
export function updateCommentReportStatus(
  id: number,
  status: 0 | 1 | 2,
  note?: string
) {
  return request.patch<ApiResult<{ id: number; status: number }>>(
    `/comment/reports/${id}`,
    { status, ...(note ? { note } : {}) }
  );
}

// 批量处理举报：一次最多 200 条，返回服务端真实处理条数
export function updateCommentReportStatusBatch(
  ids: number[],
  status: 0 | 1 | 2,
  note?: string
) {
  return request.patch<
    ApiResult<{ updated: number; requested: number; status: number }>
  >("/comment/reports/batch", {
    ids,
    status,
    ...(note ? { note } : {}),
  });
}
