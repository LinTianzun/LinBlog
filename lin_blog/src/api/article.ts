import request from "../utils/request";

export type ArticleState = "draft" | "published" | "rejected";
export type ArticleClassify = "article" | "image";
export type ArticleDatabaseState = ArticleState | "deleted";

export interface ArticleItem {
  id: number;
  userId: number | null;
  title: string;

  subsetId: number | null;
  subsetName?: string | null;

  classify: ArticleClassify;
  label: string | null;
  introduce: string | null;
  cover: string | null;

  content?: string;

  views: number;
  likes: number;
  comments: number;

  state: ArticleDatabaseState;

  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface ArticleListParams {
  page?: number;
  pageSize?: number;
  state?: ArticleState;
  classify?: ArticleClassify;
  subsetId?: number;
}

export interface ArticlePageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: ArticleItem[];
}

export interface CreateArticleParams {
  title: string;
  content: string;
  classify: ArticleClassify;
  subsetId?: number | null;
  label?: string | string[];
  introduce?: string;
  cover?: string;
}

export type UpdateArticleParams = Partial<CreateArticleParams> & {
  state?: ArticleState;
};

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export interface CreateArticleResult {
  articleId: number;
  createdAt: string;
}

export interface UpdateArticleResult {
  articleId: number | string;
  updatedAt: string;
  state: ArticleState | "未修改状态";
}

export interface UpdateArticleStatusResult {
  articleId: number | string;
  state: ArticleState;
  updatedAt: string;
}

// 分页查询文章
export function getArticles(params: ArticleListParams = {}) {
  return request.get<ApiResult<ArticlePageData>>("/article", {
    params,
  });
}

// 查询文章详情
export function getArticleById(id: number) {
  return request.get<ApiResult<ArticleItem>>(`/article/${id}`);
}

// 新增文章（后端默认保存为草稿）
export function createArticle(data: CreateArticleParams) {
  return request.post<ApiResult<CreateArticleResult>>(
    "/article",
    data
  );
}

// 更新文章内容
export function updateArticle(id: number, data: UpdateArticleParams) {
  return request.put<ApiResult<UpdateArticleResult>>(
    `/article/${id}`,
    data
  );
}

// 删除文章
export function deleteArticle(id: number) {
  return request.delete<ApiResult<never>>(`/article/${id}`);
}

// 修改文章状态
export function updateArticleStatus(
  id: number,
  state: ArticleState
) {
  return request.patch<ApiResult<UpdateArticleStatusResult>>(
    `/article/${id}/status`,
    { state }
  );
}