import request from "../utils/request";

export interface CommentArticle {
  id: number | null;
  title: string;
}

export interface CommentItem {
  id: number;
  userId: number;
  userName: string | null;
  userAvatar: string | null;
  article: CommentArticle;
  parentId: number;
  content: string;
  complaint: number;
  isRead: number;
  createdAt: string;
}

export interface CommentPageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: CommentItem[];
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

// 全局评论列表（总览评论卡片）
export function getComments(params: { page?: number; pageSize?: number } = {}) {
  return request.get<ApiResult<CommentPageData>>("/comment", { params });
}

// 删除评论（后端校验：仅本人或管理员）
export function deleteComment(id: number) {
  return request.delete<ApiResult<never>>(`/comment/${id}`);
}
