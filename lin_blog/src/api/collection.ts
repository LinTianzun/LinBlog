import request from "../utils/request";
import type { ArticleItem } from "./article";

export interface CollectionSummary {
  id: number;
  name: string;
  description: string;
  cover: string;
  sort: number;
  status: number;
  articleCount: number;
  publishedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionArticle
  extends Pick<
    ArticleItem,
    | "id"
    | "userId"
    | "title"
    | "introduce"
    | "cover"
    | "classify"
    | "state"
    | "label"
    | "views"
    | "likes"
    | "comments"
    | "subsetId"
    | "subsetName"
    | "createdAt"
    | "updatedAt"
    | "publishedAt"
  > {
  memberSort: number;
}

export interface CollectionDetail extends CollectionSummary {
  articles: CollectionArticle[];
}

export interface CollectionListData {
  count: number;
  list: CollectionSummary[];
}

export interface CollectionPayload {
  name: string;
  description?: string;
  cover?: string;
  sort?: number;
  articleIds?: number[];
}

export interface CollectionVersionSummary {
  id: number;
  collectionId: number;
  revision: number;
  name: string;
  description: string;
  cover: string;
  sort: number;
  articleCount: number;
  articleTitles: string[];
  source: "manual" | "rollback";
  operatorName: string;
  createdAt: string;
}

export interface CollectionVersionArticle {
  id: number;
  title: string;
  introduce?: string;
  cover?: string;
  classify?: string;
  state?: string;
  subsetId?: number;
  subsetName?: string;
  missing?: boolean;
}

export interface CollectionVersionDetail {
  id: number;
  collectionId: number;
  revision: number;
  name: string;
  description: string;
  cover: string;
  sort: number;
  source: "manual" | "rollback";
  operatorName: string;
  createdAt: string;
  articleIds: number[];
  articles: CollectionVersionArticle[];
}

export interface CollectionVersionMetaChange {
  field: "name" | "description" | "cover" | "sort";
  label: string;
  before: string;
  after: string;
}

export interface CollectionVersionArticleChange {
  kind: "added" | "removed" | "moved";
  id: number;
  title: string;
  state?: string;
  subsetName?: string;
  missing?: boolean;
  fromPosition: number | null;
  toPosition: number | null;
}

export interface CollectionVersionDiff {
  version: {
    id: number;
    revision: number;
    name: string;
    source: "manual" | "rollback";
    operatorName: string;
    createdAt: string;
  };
  current: {
    name: string;
    description: string;
    cover: string;
    sort: number;
    articleCount: number;
    publishedCount: number;
    updatedAt: string;
  };
  metaChanges: CollectionVersionMetaChange[];
  articleChanges: CollectionVersionArticleChange[];
  summary: {
    metaCount: number;
    added: number;
    removed: number;
    moved: number;
    unchanged: number;
    hasChanges: boolean;
  };
}

export interface CollectionVersionPage {
  list: CollectionVersionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

export interface ArticleSeriesLink {
  id: number;
  title: string;
}

export interface ArticleSeriesContext {
  id: number;
  name: string;
  description: string;
  cover: string;
  position: number;
  total: number;
  previous: ArticleSeriesLink | null;
  next: ArticleSeriesLink | null;
}

export interface ArticleSeriesData {
  count: number;
  list: ArticleSeriesContext[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export function getPublicCollections() {
  return request.get<ApiResult<CollectionListData>>("/public/collection");
}

export function getPublicCollectionById(id: number) {
  return request.get<ApiResult<CollectionDetail>>(`/public/collection/${id}`);
}

export function getArticleSeries(articleId: number) {
  return request.get<ApiResult<ArticleSeriesData>>(
    `/public/collection/article/${articleId}`
  );
}

export function getCollections() {
  return request.get<ApiResult<CollectionListData>>("/collection");
}

export function getCollectionById(id: number) {
  return request.get<ApiResult<CollectionDetail>>(`/collection/${id}`);
}

export function createCollection(data: CollectionPayload) {
  return request.post<ApiResult<{ collectionId: number; revision: number }>>(
    "/collection",
    data
  );
}

export function updateCollection(id: number, data: Partial<CollectionPayload>) {
  return request.put<
    ApiResult<{ collectionId: number; revision: number; articleCount: number }>
  >(`/collection/${id}`, data);
}

export function deleteCollection(id: number) {
  return request.delete<ApiResult<never>>(`/collection/${id}`);
}

export function setCollectionArticles(id: number, articleIds: number[]) {
  return request.put<
    ApiResult<{ collectionId: number; articleCount: number }>
  >(`/collection/${id}/articles`, { articleIds });
}

export function getCollectionVersions(
  id: number,
  params: { page?: number; pageSize?: number } = {}
) {
  return request.get<ApiResult<CollectionVersionPage>>(
    `/collection/${id}/versions`,
    { params }
  );
}

export function getCollectionVersion(id: number, versionId: number) {
  return request.get<ApiResult<CollectionVersionDetail>>(
    `/collection/${id}/versions/${versionId}`
  );
}

export function getCollectionVersionDiff(id: number, versionId: number) {
  return request.get<ApiResult<CollectionVersionDiff>>(
    `/collection/${id}/versions/${versionId}/diff`
  );
}

export function restoreCollectionVersion(id: number, versionId: number) {
  return request.post<
    ApiResult<{
      collectionId: number;
      revision: number;
      restoredFrom: number;
      skippedArticleIds: number[];
    }>
  >(`/collection/${id}/versions/${versionId}/restore`);
}
