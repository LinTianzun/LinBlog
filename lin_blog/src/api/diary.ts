import request from "../utils/request";

export interface DiaryItem {
  id: number;
  title: string;
  content: string;
  picture: string[];
  weatherId: number | null;
  weatherName: string | null;
  createdAt: string;
}

export interface DiaryPageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: DiaryItem[];
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

// 日记分页查询（keyword 支持标题/内容搜索）
export function getDiaries(
  params: { page?: number; pageSize?: number; keyword?: string } = {}
) {
  return request.get<ApiResult<DiaryPageData>>("/diary", { params });
}

// 新建日记
export function createDiary(payload: {
  title: string;
  content: string;
  picture?: string[];
  weatherName?: string;
}) {
  return request.post<ApiResult<{ diaryId: number }>>("/diary", payload);
}

// 删除日记
export function deleteDiary(id: number) {
  return request.delete<ApiResult<never>>(`/diary/${id}`);
}
