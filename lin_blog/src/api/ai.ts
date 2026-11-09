import request from "../utils/request";
import type { ApiResult } from "./article";

export interface AiSuggestion {
  summary: string;
  labels: string[];
}

export type AiWritingAction = "polish" | "shorten" | "expand" | "continue";

export interface AiWritingSuggestion {
  action: AiWritingAction;
  text: string;
}

export interface AiCoverSuggestion {
  token: string;
  dataUri: string;
  prompt: string;
}

// 后台「AI 管理」使用的接入模型（密钥只返回掩码，不回传明文）
export interface AiModelItem {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  apiKeyMasked: string;
  chatModel: string;
  imageModel: string;
  imageSize: string;
  timeoutMs: number;
  enabled: boolean;
  isDefault: boolean;
  remark: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiModelPayload {
  name: string;
  provider?: string;
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  imageModel?: string;
  imageSize?: string;
  timeoutMs?: number;
  enabled?: boolean;
  isDefault?: boolean;
  remark?: string;
}

export interface AiSettings {
  quotaEnabled: boolean;
  dailyLimitPerUser: number;
  monthlyLimitPerUser: number;
  superAdminUnlimited: boolean;
}

export interface AiUsageRecord {
  id: number;
  userId: number;
  username: string;
  feature: string;
  modelName: string;
  status: string;
  detail: string;
  createdAt: string;
}

export interface AiMyUsage {
  daily: number;
  monthly: number;
  quotaEnabled: boolean;
  dailyLimitPerUser: number;
  monthlyLimitPerUser: number;
}

// AI 写作建议：按需生成简介与标签，仅作为建议展示，作者确认后才填充表单
export function suggestArticleMeta(params: {
  title: string;
  content: string;
}) {
  return request.post<ApiResult<AiSuggestion>>("/ai/suggest", params);
}

export function rewriteArticleText(params: {
  action: AiWritingAction;
  text: string;
  title?: string;
}) {
  return request.post<ApiResult<AiWritingSuggestion>>("/ai/writing", params);
}

// AI 封面：先返回 data URI 预览，作者点「采用」后才会落库为正式封面
export function generateCoverImage(params: {
  title: string;
  introduce?: string;
  content?: string;
}) {
  return request.post<ApiResult<AiCoverSuggestion>>("/ai/cover", params);
}

export function confirmCoverImage(token: string) {
  return request.post<ApiResult<{ url: string }>>("/ai/cover/confirm", { token });
}

// 通用别名：同一套接口同时服务文章封面、随笔配图与图库配图
export const generateAiImage = generateCoverImage;
export const confirmAiImage = confirmCoverImage;

// ─── AI 管理（需要 ai.manage 权限）─────────────────────────────
export function getAiModels() {
  return request.get<ApiResult<{ list: AiModelItem[] }>>("/ai/models");
}

export function createAiModel(payload: AiModelPayload) {
  return request.post<ApiResult<AiModelItem>>("/ai/models", payload);
}

export function updateAiModel(id: number, payload: Partial<AiModelPayload>) {
  return request.put<ApiResult<AiModelItem>>(`/ai/models/${id}`, payload);
}

export function deleteAiModel(id: number) {
  return request.delete<ApiResult<null>>(`/ai/models/${id}`);
}

export function testAiModel(id: number) {
  return request.post<ApiResult<{ ok: boolean; status?: number }>>(`/ai/models/${id}/test`);
}

// 从环境变量导入：把 .env 里的 AI 密钥转成后台可管理的模型记录
export function importAiModelFromEnv() {
  return request.post<ApiResult<AiModelItem>>("/ai/models/import-env");
}

export function getAiSettings() {
  return request.get<ApiResult<AiSettings>>("/ai/settings");
}

export function updateAiSettings(payload: AiSettings) {
  return request.put<ApiResult<AiSettings>>("/ai/settings", payload);
}

export function getAiUsage(limit = 50) {
  return request.get<ApiResult<{ list: AiUsageRecord[] }>>("/ai/usage", { params: { limit } });
}

export function getMyAiUsage() {
  return request.get<ApiResult<AiMyUsage>>("/ai/usage/me");
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
