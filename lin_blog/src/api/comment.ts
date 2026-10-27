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
  likes: number;
  liked: boolean;
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

// 评论列表：总览卡片不传 articleId 看全站，后台文章详情传 articleId 只看本篇
export function getComments(
  params: { page?: number; pageSize?: number; articleId?: number } = {}
) {
  return request.get<ApiResult<CommentPageData>>("/comment", { params });
}

export interface CreateCommentResult {
  commentId: number;
  createdAt: string;
}

// 新增评论/回复（需登录；后端只允许两级，parentId>0 表示回复一级评论）
export function createComment(data: {
  articleId: number;
  content: string;
  parentId?: number;
}) {
  return request.post<ApiResult<CreateCommentResult>>("/comment", data);
}

export type CommentTargetType = "article" | "diary";

export interface CommentLikeState {
  liked: boolean;
  likes: number;
}

// 评论点赞/取消（文章评论与随笔评论共用；需登录）
export function toggleCommentLike(data: {
  commentType: CommentTargetType;
  commentId: number;
}) {
  return request.post<ApiResult<CommentLikeState>>("/public/comment/like", data);
}

// 举报评论（同一用户重复举报只记一次）
export function reportComment(data: {
  commentType: CommentTargetType;
  commentId: number;
}) {
  return request.post<ApiResult<{ complaint: number; already: boolean }>>(
    "/public/comment/report",
    data
  );
}

// 删除评论（后端校验：仅本人或管理员）
export function deleteComment(id: number) {
  return request.delete<ApiResult<never>>(`/comment/${id}`);
}
