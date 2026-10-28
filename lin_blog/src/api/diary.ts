import request from "../utils/request";

export interface DiaryItem {
  id: number;
  title: string;
  content: string;
  picture: string[];
  weatherId: number | null;
  weatherName: string | null;
  views: number;
  likes: number;
  comments: number;
  // 后台卡片区分「评论」与「回复」：一级评论数与回复数由后端按 parent_id 统计
  rootComments: number;
  replyComments: number;
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

// 编辑日记（标题/内容/图片/天气全量更新）
export function updateDiary(
  id: number,
  payload: {
    title: string;
    content: string;
    picture?: string[];
    weatherName?: string;
  }
) {
  return request.put<ApiResult<never>>(`/diary/${id}`, payload);
}

// 删除日记
export function deleteDiary(id: number) {
  return request.delete<ApiResult<never>>(`/diary/${id}`);
}
