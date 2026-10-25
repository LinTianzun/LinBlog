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
export function getSystemLogs(
  params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    module?: string;
    action?: string;
  } = {}
) {
  return request.get<ApiResult<SystemLogPageData>>("/systemLog", { params });
}
