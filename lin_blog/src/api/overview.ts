import request from "../utils/request";

// 总览聚合统计（与后端 /api/overview/summary 对齐）
export interface OverviewSummary {
  article: number;
  gallery: number;
  // 本地文件总大小（字节），前端格式化成 KB/MB/GB
  file: number;
  diary: number;
  comment: number;
  messageUnread: number;
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export function getOverviewSummary() {
  return request.get<ApiResult<OverviewSummary>>("/overview/summary");
}
