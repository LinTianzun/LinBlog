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
  // 后台卡片区分「评论」与「回复」：一级评论数与回复数由后端按 parent_id 统计
  rootComments?: number;
  replyComments?: number;

  state: ArticleDatabaseState;

  /** 已发布内容存在未上线的工作稿 */
  hasUnpublishedChanges?: boolean;
  /** 计划发布时间；有值时表示已安排定时发布 */
  scheduledAt?: string | null;

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
  uncategorized?: boolean;
  label?: string;
  keyword?: string;
  // 列表排序：latest 按时间倒序（默认），hot 按浏览量倒序
  sort?: "latest" | "hot";
}

export interface ArticlePageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: ArticleItem[];
}

export interface ArticleStateSummary {
  all: number;
  published: number;
  draft: number;
  rejected: number;
  uncategorized: number;
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

export type ArticleVersionSource =
  | "manual"
  | "autosave"
  | "publish"
  | "rollback"
  | "scheduled";

export interface ArticleWorkingCopy {
  title: string;
  subsetId: number | null;
  classify: ArticleClassify;
  label: string;
  introduce: string;
  content: string;
  cover: string;
  state: ArticleState;
}

export interface ArticleWorkflowState {
  articleId: number;
  classify: ArticleClassify;
  state: ArticleState;
  revision: number;
  savedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  workingCopy: ArticleWorkingCopy;
}

export interface SaveArticleDraftParams extends CreateArticleParams {
  revision?: number;
  source?: "manual" | "autosave";
}

export interface SaveArticleDraftResult {
  articleId: number;
  revision: number;
  savedAt: string;
  hasUnpublishedChanges: boolean;
}

export interface ArticleVersionSummary {
  id: number;
  articleId: number;
  revision: number;
  title: string;
  subsetId: number | null;
  classify: ArticleClassify;
  label: string | null;
  introduce: string | null;
  cover: string | null;
  state: ArticleState;
  source: ArticleVersionSource;
  createdBy: number | null;
  createdAt: string;
  contentLength: number;
  /** 图库版本的图片数量，文章版本为 undefined */
  mediaCount?: number;
}

export interface ArticleVersionDetail extends Omit<ArticleVersionSummary, "contentLength"> {
  content: string;
}

export interface ArticleVersionPage {
  list: ArticleVersionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

export interface ScheduledArticleItem {
  id: number;
  userId: number | null;
  ownerName: string | null;
  title: string;
  classify: ArticleClassify;
  state: ArticleDatabaseState;
  scheduledAt: string;
  hasUnpublishedChanges: boolean;
  draftSavedAt: string | null;
  updatedAt: string;
}

export interface ScheduledArticleSummary {
  total: number;
  upcoming: number;
  overdue: number;
}

export interface ScheduledArticlePage {
  list: ScheduledArticleItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  summary: ScheduledArticleSummary;
}

export interface ScheduledArticleParams {
  page?: number;
  pageSize?: number;
  classify?: ArticleClassify;
}

const articleStateLabels: Record<ArticleState, string> = {
  draft: "草稿",
  published: "已发布",
  rejected: "已驳回",
};

// 后端用逗号字符串存储标签，前端表单使用数组。
export function parseArticleLabels(label?: string | null): string[] {
  if (!label) return [];

  return label
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatArticleLabels(labels: string[]): string {
  return labels.map((item) => item.trim()).filter(Boolean).join(",");
}

// 图库 content 存 JSON 字符串，展示时解析为图片 URL 数组
export function parseGalleryContent(content?: string | null): string[] {
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // 兼容旧数据
    return [];
  }
}

export function getArticleStateLabel(
  state?: ArticleDatabaseState | null
): string {
  if (!state || state === "deleted") return "未知状态";
  return articleStateLabels[state];
}

// 列表封面：优先文章 cover，其次正文首图；都没有返回空，
// 由调用方改用排印占位，避免列表里重复出现同一张误导性默认图
export function extractArticleCover(article?: {
  cover?: string | null;
  content?: string | null;
}): string {
  if (!article) return "";
  if (article.cover) return article.cover;
  const first = article.content?.match(/<img[^>]+src="([^"]+)"/)?.[1];
  return first || "";
}

export function formatArticleDate(value?: string | null): string {
  if (!value) return "暂无时间";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// 把接口请求错误转成可直接展示的中文提示。
export function getArticleErrorMessage(
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

// 分页查询文章
export function getArticles(params: ArticleListParams = {}) {
  return request.get<ApiResult<ArticlePageData>>("/article", {
    params,
  });
}

// 文章状态统计（状态页签展示）
export function getArticleStateSummary(classify: ArticleClassify = "article") {
  return request.get<ApiResult<ArticleStateSummary>>(
    "/article/state/summary",
    { params: { classify } }
  );
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

export function getArticleWorkflow(id: number) {
  return request.get<ApiResult<ArticleWorkflowState>>(
    `/article/${id}/workflow`
  );
}

export function saveArticleDraft(id: number, data: SaveArticleDraftParams) {
  return request.post<ApiResult<SaveArticleDraftResult>>(
    `/article/${id}/workflow/draft`,
    data
  );
}

export function getArticleVersions(
  id: number,
  params: { page?: number; pageSize?: number } = {}
) {
  return request.get<ApiResult<ArticleVersionPage>>(
    `/article/${id}/versions`,
    { params }
  );
}

export function getArticleVersion(id: number, versionId: number) {
  return request.get<ApiResult<ArticleVersionDetail>>(
    `/article/${id}/versions/${versionId}`
  );
}

export function restoreArticleVersion(id: number, versionId: number) {
  return request.post<
    ApiResult<{ articleId: number; revision: number; restoredFrom: number }>
  >(`/article/${id}/versions/${versionId}/restore`);
}

export function publishArticleWorkflow(id: number) {
  return request.post<
    ApiResult<{ articleId: number; state: ArticleState; revision: number }>
  >(`/article/${id}/workflow/publish`);
}

export function scheduleArticlePublish(id: number, scheduledAt: string) {
  return request.post<
    ApiResult<{ articleId: number; scheduledAt: string }>
  >(`/article/${id}/workflow/schedule`, { scheduledAt });
}

export function cancelArticleSchedule(id: number) {
  return request.delete<ApiResult<{ articleId: number }>>(
    `/article/${id}/workflow/schedule`
  );
}

// 定时发布工作台：按内容类型与当前账号可管理范围收窄
export function getScheduledArticles(params: ScheduledArticleParams = {}) {
  return request.get<ApiResult<ScheduledArticlePage>>("/article/scheduled", {
    params,
  });
}
