import request from "../utils/request";

export interface LabelItem {
  id: number;
  name: string;
  value?: number;
  moment: string;
}

export interface LabelPageData {
  count: number;
  list: LabelItem[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

// 标签列表（带文章引用数）
export function getLabels() {
  return request.get<ApiResult<LabelPageData>>("/label");
}

// 新建标签
export function createLabel(data: { name: string }) {
  return request.post<ApiResult<{ labelId: number }>>("/label", data);
}

// 删除标签（被文章使用时后端拒绝）
export function deleteLabel(id: number) {
  return request.delete<ApiResult<never>>(`/label/${id}`);
}
