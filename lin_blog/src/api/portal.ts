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

// 排序方式：latest 按时间倒序，hot 按浏览量倒序
export type PortalSort = "latest" | "hot";

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
      // 门户文章列表默认 article；图库橱窗传 classify=image 复用同一公开接口
      classify: params.classify || "article",
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

export interface LikeState {
  liked: boolean;
  likes: number;
}

// 点赞状态：匿名可读，登录后 liked 反映自己是否已赞
export function getLikeState(articleId: number) {
  return request.get<ApiResult<LikeState>>(`/public/praise/${articleId}`);
}

// 切换点赞（需登录，匿名返回 401）
export function toggleLike(articleId: number) {
  return request.post<ApiResult<LikeState>>(`/public/praise/${articleId}`);
}

export interface CreateCommentResult {
  commentId: number;
  articleId: number;
  parentId: number;
  createdAt: string;
}

// 门户发表评论（需登录，后端复用后台同一套校验）
export function createPublicComment(data: {
  articleId: number;
  content: string;
  parentId?: number;
}) {
  return request.post<ApiResult<CreateCommentResult>>("/public/comment", data);
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

// 门户公开随笔（后端 /api/public/diary，仅返回正常状态）
export interface PortalDiary {
  id: number;
  title: string;
  content: string;
  picture: string[];
  weatherId: number | null;
  weatherName: string | null;
  views: number;
  createdAt: string;
}

// 天气分面：后端按全量统计，切换天气时数量不随分页变化
export interface PortalWeatherFacet {
  weatherName: string;
  count: number;
}

export interface PortalDiaryPage {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  weatherFacet: PortalWeatherFacet[];
  facetTotal: number;
  list: PortalDiary[];
}

export function getPublicDiaries(
  params: {
    page?: number;
    pageSize?: number;
    sort?: PortalSort;
    weather?: string;
    keyword?: string;
  } = {}
) {
  return request.get<ApiResult<PortalDiaryPage>>("/public/diary", { params });
}

export interface ViewRecordResult {
  targetType: string;
  targetId: number;
  counted: boolean;
  views: number;
}

// 门户浏览计数：匿名可调用，后端按访客做去重，返回最新浏览量
export function recordView(targetType: "article" | "image" | "diary", targetId: number) {
  return request.post<ApiResult<ViewRecordResult>>("/public/view", {
    targetType,
    targetId,
  });
}
