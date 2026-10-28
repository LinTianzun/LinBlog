import request from "../utils/request";

export interface CommentArticle {
  id: number | null;
  title: string;
  // 图库也是 article 表的行（classify=image），总览跳转时要区分入口
  classify?: "article" | "image" | null;
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

export interface DeleteCommentResult {
  // 实际删除条数：删除一级评论时会包含其下所有回复
  deleted: number;
}

// 删除评论（文章与随笔共用；后端校验仅本人或管理员可删）
export function deleteInteractionComment(data: {
  commentType: CommentTargetType;
  commentId: number;
}) {
  return request.post<ApiResult<DeleteCommentResult>>("/public/comment/delete", data);
}

// 删除评论（后端校验：仅本人或管理员）
export function deleteComment(id: number) {
  return request.delete<ApiResult<DeleteCommentResult>>(`/comment/${id}`);
}
