import request from "../utils/request";

export type SubsetClassify = "article" | "image" | "resource";

export interface SubsetItem {
  id: number;
  name: string;
  classify: SubsetClassify;
  sort: number;
  value?: number;
  moment: string;
}

export interface SubsetPageData {
  count: number;
  list: SubsetItem[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export interface CreateSubsetParams {
  name: string;
  classify: SubsetClassify;
  sort?: number;
}

export interface UpdateSubsetParams {
  name?: string;
  sort?: number;
}

// 分页查询分类（带文章关联数）
export function getSubsets(classify?: SubsetClassify) {
  return request.get<ApiResult<SubsetPageData>>("/subset", {
    params: classify ? { classify } : undefined,
  });
}

// 新建分类
export function createSubset(data: CreateSubsetParams) {
  return request.post<ApiResult<{ subsetId: number }>>("/subset", data);
}

// 更新分类名称/排序
export function updateSubset(id: number, data: UpdateSubsetParams) {
  return request.put<ApiResult<never>>(`/subset/${id}`, data);
}

// 删除分类（有文章时后端拒绝）
export function deleteSubset(id: number) {
  return request.delete<ApiResult<never>>(`/subset/${id}`);
}
