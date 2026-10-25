import request from "../utils/request";
import type {
  ApiResult,
  ArticleItem,
  ArticleListParams,
  ArticlePageData,
} from "./article";

export interface PortalComment {
  id: number;
  userId: number;
  userName: string | null;
  userAvatar: string | null;
  parentId: number;
  content: string;
  createdAt: string;
}

export interface PortalCommentPage {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: PortalComment[];
}

export interface PortalSubset {
  id: number;
  name: string;
  classify: string;
  sort: number;
  value: number;
  moment: string;
}

export interface PortalLabel {
  id: number;
  name: string;
  value: number;
  moment: string;
}

// 门户公开接口：无需登录，后端只返回已发布内容
export function getPublicArticles(params: ArticleListParams = {}) {
  return request.get<ApiResult<ArticlePageData>>("/public/article", {
    params: {
      ...params,
      state: "published",
      classify: "article",
    },
  });
}

export function getPublicArticleById(id: number) {
  return request.get<ApiResult<ArticleItem>>(`/public/article/${id}`);
}

export function getPublicComments(articleId: number, page = 1, pageSize = 10) {
  return request.get<ApiResult<PortalCommentPage>>("/public/comment", {
    params: { articleId, page, pageSize },
  });
}

export function getPublicSubsets() {
  return request.get<ApiResult<{ count: number; list: PortalSubset[] }>>(
    "/public/subset",
    { params: { classify: "article" } }
  );
}

export function getPublicLabels() {
  return request.get<ApiResult<{ count: number; list: PortalLabel[] }>>(
    "/public/label"
  );
}
