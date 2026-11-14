import request from "../utils/request";

export interface SystemLogItem {
  id: number;
  userId: number | null;
  username: string;
  userType: string | null;
  action: string;
  module: string;
  targetType: string | null;
  targetId: number | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface SystemLogPageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: SystemLogItem[];
}

export interface SystemLogRiskSummary {
  days: number;
  highRisk: number;
  permissionChanges: number;
  backupOps: number;
  petChanges: number;
  recent: SystemLogItem[];
}

export interface SystemLogPruneResult {
  deleted: number;
  retentionDays: number;
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
  const response = (error as { response?: { data?: { message?: unknown } } })
    .response;
  const message = response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}

// 系统日志分页查询（仅管理员；keyword 匹配详情/目标/用户名）
export type SystemLogSortOrder = "asc" | "desc";

export interface SystemLogFilters {
  keyword?: string;
  module?: string;
  action?: string;
  operator?: string;
  ip?: string;
  targetType?: string;
  targetId?: number;
  risk?: "high";
  startDate?: string;
  endDate?: string;
  sortOrder?: SystemLogSortOrder;
}

export function getSystemLogs(
  params: SystemLogFilters & { page?: number; pageSize?: number } = {}
) {
  return request.get<ApiResult<SystemLogPageData>>("/systemLog", { params });
}

export function getSystemLogRiskSummary(days = 7) {
  return request.get<ApiResult<SystemLogRiskSummary>>("/systemLog/risk-summary", {
    params: { days },
  });
}

export function pruneSystemLogs(days: number) {
  return request.post<ApiResult<SystemLogPruneResult>>("/systemLog/prune", {
    days,
  });
}

export function exportSystemLogs(params: SystemLogFilters = {}) {
  return request.get<Blob>("/systemLog/export", {
    params,
    responseType: "blob",
  });
}
