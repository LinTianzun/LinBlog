import request from "../utils/request";

// 总览聚合统计（与后端 /api/overview/summary 对齐）
export interface OverviewSummary {
  article: number;
  gallery: number;
  // 本地文件总大小（字节），前端格式化成 KB/MB/GB
  file: number | null;
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

// 近一周/近一月访问趋势与设备/系统分布
export interface VisitPoint {
  date: string;
  count: number;
}

export interface PieItem {
  key: string;
  name: string;
  value: number;
}

export interface VisitStats {
  visit: VisitPoint[];
  device: PieItem[];
  website: PieItem[];
}

export function getVisitStats(period: "week" | "moon") {
  return request.get<ApiResult<VisitStats>>("/overview/visitStats", {
    params: { period },
  });
}
