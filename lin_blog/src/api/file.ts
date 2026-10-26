import request from "../utils/request";

export interface FileItem {
  id: number;
  fileName: string;
  format: string;
  size: number | null;
  url: string;
  subsetId: number | null;
  createdAt: string;
}

export interface FilePageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: FileItem[];
}

export interface FileSubsetCount {
  id: number;
  name: string;
  classify: string;
  sort: number;
  moment: string;
  value: number;
}

export interface FileSummaryData {
  all: number;
  uncategorized: number;
  subsets: FileSubsetCount[];
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

// 文件分页查询
export function getFiles(
  params: {
    page?: number;
    pageSize?: number;
    subsetId?: number;
    uncategorized?: boolean;
    keyword?: string;
  } = {}
) {
  return request.get<ApiResult<FilePageData>>("/file", { params });
}

// 文件统计（分组栏计数）
export function getFileSummary() {
  return request.get<ApiResult<FileSummaryData>>("/file/summary");
}

// 上传地址：yk-upload 内部自己发 XHR，无法附加请求头，
// 因此凭证只能走 query。这里用一次性短期票据代替登录 token，
// 避免长期 JWT 出现在 URL 与服务器访问日志中。
export function getFileUploadUrl(ticket: string, subsetId?: number): string {
  const query = new URLSearchParams({ ticket });
  if (subsetId && subsetId > 0) query.set("subsetId", String(subsetId));
  return `/api/file/upload?${query.toString()}`;
}

// 批量移动分组，subsetId 传 undefined 表示移入未分类
export function moveFiles(fileIds: number[], subsetId?: number) {
  return request.patch<ApiResult<{ movedCount: number }>>("/file/move", {
    fileIds,
    subsetId,
  });
}

// 批量删除文件
export function deleteFiles(fileIds: number[]) {
  return request.delete<ApiResult<{ deletedCount: number }>>("/file", {
    data: { fileIds },
  });
}
