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
  return request.post<ApiResult<{ collectionId: number }>>(
    "/collection",
    data
  );
}

export function updateCollection(id: number, data: Partial<CollectionPayload>) {
  return request.put<ApiResult<never>>(`/collection/${id}`, data);
}

export function deleteCollection(id: number) {
  return request.delete<ApiResult<never>>(`/collection/${id}`);
}

export function setCollectionArticles(id: number, articleIds: number[]) {
  return request.put<
    ApiResult<{ collectionId: number; articleCount: number }>
  >(`/collection/${id}/articles`, { articleIds });
}
