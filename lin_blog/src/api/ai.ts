import request from "../utils/request";
import type { ApiResult } from "./article";

export interface AiSuggestion {
  summary: string;
  labels: string[];
  // 首选模型故障时自动降级到备用模型，这里回传实际生效的模型
  degraded?: boolean;
  modelName?: string;
}

export interface AiGalleryCurationSuggestion {
  titles: string[];
  summary: string;
  labels: string[];
  degraded?: boolean;
  modelName?: string;
}

export type AiWritingAction = "polish" | "shorten" | "expand" | "continue";

export interface AiWritingSuggestion {
  action: AiWritingAction;
  text: string;
  degraded?: boolean;
  modelName?: string;
}

export interface AiCoverSuggestion {
  token: string;
  dataUri: string;
  prompt: string;
  degraded?: boolean;
  modelName?: string;
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
  dailyLimitPerUser: number;
  monthlyLimitPerUser: number;
  enabled: boolean;
  isDefault: boolean;
  remark: string;
  createdAt?: string;
  updatedAt?: string;
  health?: AiModelHealth;
}

// 模型健康状态：来自连通性测试的耗时、成功率与连续失败次数
export interface AiModelHealth {
  lastTestAt: string | null;
  lastSuccessAt: string | null;
  lastLatencyMs: number;
  avgLatencyMs: number;
  testCount: number;
  successCount: number;
  successRate: number;
  consecutiveFailures: number;
  lastError: string;
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
  dailyLimitPerUser?: number;
  monthlyLimitPerUser?: number;
  enabled?: boolean;
  isDefault?: boolean;
  remark?: string;
}

export interface AiSettings {
  quotaEnabled: boolean;
  dailyLimitPerUser: number;
  monthlyLimitPerUser: number;
  superAdminUnlimited: boolean;
  // 是否去除服务商成图右下角的「AI生成」标识
  removeWatermark: boolean;
  // crop 裁掉角落（尺寸变小）/ crop-resize 裁剪后缩放回原尺寸
  watermarkMode: "crop" | "crop-resize";
  // 文本与配图任务各自指定的模型；为空时跟随默认模型
  chatModelId: number | null;
  imageModelId: number | null;
}

// AI 运营周报：真实统计 + 模型组织的文字小节
export interface AiOperationsSummary {
  days: number;
  visits: number;
  visitors: number;
  mobileVisits: number;
  comments: number;
  messages: number;
  publishedArticles: number;
  publishedGalleries: number;
  topPaths: { path: string; visits: number }[];
}

export interface AiOperationsReport {
  days: number;
  sections: { title: string; content: string }[];
  summary: AiOperationsSummary;
  degraded?: boolean;
  modelName?: string;
}

export function generateOperationsReport(params: { days?: number }) {
  return request.post<ApiResult<AiOperationsReport>>("/ai/report/operations", params);
}

// AI 举报辅助判断：只给处置建议，处置状态仍由运营自己改
export interface AiReportReview {
  reportId: number;
  verdict: "成立" | "部分成立" | "不成立";
  reason: string;
  reasonLabel: string;
  action: "process" | "dismiss" | "warn";
  note: string;
  degraded?: boolean;
  modelName?: string;
}

export function reviewCommentReport(reportId: number) {
  return request.post<ApiResult<AiReportReview>>("/ai/report/review", { reportId });
}

export interface AiUsageRecord {
  id: number;
  userId: number;
  username: string;
  feature: string;
  modelName: string;
  status: string;
  detail: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  outputChars: number;
  createdAt: string;
}

// 用量统计：总览窗口、按模型/功能分组、每日趋势与待确认图片占用
export interface AiUsageWindow {
  total: number;
  success: number;
  failed: number;
  denied: number;
  successRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  outputChars: number;
}

export interface AiUsageStats {
  summary: {
    all: AiUsageWindow;
    last7Days: AiUsageWindow;
    last30Days: AiUsageWindow;
  };
  byModel: {
    modelName: string;
    total: number;
    success: number;
    successRate: number;
    avgDurationMs: number;
    promptTokens: number;
    completionTokens: number;
  }[];
  byFeature: {
    feature: string;
    total: number;
    success: number;
    successRate: number;
    avgDurationMs: number;
  }[];
  trend: {
    day: string;
    total: number;
    success: number;
    tokens: number;
  }[];
  pending: {
    total: number;
    bytes: number;
    expired: number;
  };
  health: (AiModelHealth & {
    modelId: number;
    modelName: string;
    enabled: boolean;
  })[];
  days: number;
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

// AI 图库策展：返回候选标题、简介与标签，作者确认后才会填充图库表单
export function suggestGalleryCuration(params: {
  title?: string;
  introduce?: string;
  theme?: string;
  photoCount?: number;
}) {
  return request.post<ApiResult<AiGalleryCurationSuggestion>>("/ai/gallery/curation", params);
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
  return request.post<ApiResult<AiCoverSuggestion>>("/ai/cover", params, {
    timeout: 120000
  });
}

export function confirmCoverImage(token: string) {
  return request.post<ApiResult<{ url: string }>>("/ai/cover/confirm", { token });
}

// AI 图片理解：alt 文本与图库批量描述，只返回候选，作者确认后才写入
export interface AiImageAltResult {
  mode: "alt";
  items: {
    url: string;
    alt: string;
  }[];
  degraded: boolean;
  modelName: string;
}

export interface AiGalleryDescriptionResult {
  mode: "gallery";
  text: string;
  degraded: boolean;
  modelName: string;
}

export type AiImageDescribeResult = AiImageAltResult | AiGalleryDescriptionResult;

export function describeAiImages(params: {
  mode: "alt" | "gallery";
  imageUrls: string[];
  title?: string;
  context?: string;
}) {
  return request.post<ApiResult<AiImageDescribeResult>>("/ai/images/describe", params, {
    timeout: 120000
  });
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
  return request.post<ApiResult<{
    ok: boolean;
    status?: number;
    latencyMs?: number;
    health?: AiModelHealth;
  }>>(`/ai/models/${id}/test`);
}

// 立即巡检全部启用模型：与后台定时巡检共用同一份逻辑
export interface AiHealthCheckResult {
  checkedAt: string;
  total: number;
  failedCount: number;
  results: {
    modelId: number;
    modelName: string;
    ok: boolean;
    latencyMs: number;
    error: string;
  }[];
}

export function checkAllAiModels() {
  return request.post<ApiResult<AiHealthCheckResult>>("/ai/health/check");
}

// 巡检状态：上次巡检时间与各模型最近一次探测结果
export interface AiHealthStatus {
  lastCheckedAt: string | null;
  health: (AiModelHealth & {
    modelId: number;
    modelName: string;
    enabled: boolean;
  })[];
}

export function getAiHealthStatus() {
  return request.get<ApiResult<AiHealthStatus>>("/ai/health");
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

export function getAiUsageStats(days = 30) {
  return request.get<ApiResult<AiUsageStats>>("/ai/usage/stats", { params: { days } });
}

// 提示词模板：把写死在服务端的提示词搬到后台可编辑
export interface AiPromptTemplate {
  id: number | null;
  key: string;
  featureKey: string;
  name: string;
  description: string;
  content: string;
  variables: string;
  enabled: boolean;
  isDefault: boolean;
  customized: boolean;
  updatedAt: string | null;
}

// 各功能当前选用的模板：featureKey → templateKey
export type AiPromptBindings = Record<string, string>;

export interface AiPromptPreviewResult {
  kind: "text" | "image";
  prompt: string;
  text?: string;
  dataUri?: string;
  token?: string;
  degraded: boolean;
  modelName: string;
}

export function previewAiPromptTemplate(payload: {
  featureKey: string;
  content?: string;
  variables?: Record<string, string>;
  // 输出类型：text 走对话模型、image 走图片模型；不传则按所属功能推断
  mode?: "text" | "image";
}) {
  return request.post<ApiResult<AiPromptPreviewResult>>("/ai/prompts/preview", payload, {
    timeout: 120000
  });
}

export interface AiPromptAssistantResult {
  content: string;
  summary: string;
  degraded: boolean;
  modelName: string;
}

export function assistAiPromptTemplate(payload: {
  task: "optimize" | "create";
  featureKey: string;
  content?: string;
  requirement?: string;
  variables?: Record<string, string>;
}) {
  return request.post<ApiResult<AiPromptAssistantResult>>("/ai/prompts/assist", payload, {
    timeout: 120000
  });
}

export function saveAiPreviewImage(token: string) {
  return request.post<ApiResult<{ url: string }>>("/ai/prompts/preview/save", { token });
}

export function getAiPromptTemplates() {
  return request.get<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>("/ai/prompts");
}

// 新建自定义提示词：挂在某个内置功能下，创建后可随时切换选用
export function createAiPromptTemplate(payload: {
  featureKey: string;
  name: string;
  description?: string;
  content: string;
}) {
  return request.post<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>("/ai/prompts", payload);
}

export function updateAiPromptTemplate(
  key: string,
  payload: { content: string; name?: string; description?: string; enabled?: boolean }
) {
  return request.put<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>(`/ai/prompts/${key}`, payload);
}

// 选用模板：该功能后续调用模型时优先使用它
export function selectAiPromptTemplate(key: string) {
  return request.post<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>(`/ai/prompts/${key}/select`);
}

// 删除自定义提示词（内置模板不可删除）
export function deleteAiPromptTemplate(key: string) {
  return request.delete<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>(`/ai/prompts/${key}`);
}

export function resetAiPromptTemplate(key: string) {
  return request.post<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>(`/ai/prompts/${key}/reset`);
}

export interface AiPromptHistoryItem {
  id: number;
  key: string;
  name: string;
  description: string;
  content: string;
  variables: string;
  enabled: boolean;
  operatorName: string;
  createdAt: string;
}

export function getAiPromptHistory(key: string) {
  return request.get<ApiResult<{ list: AiPromptHistoryItem[] }>>(`/ai/prompts/${key}/history`);
}

export function restoreAiPromptHistory(key: string, historyId: number) {
  return request.post<ApiResult<{ list: AiPromptTemplate[]; bindings: AiPromptBindings }>>(
    `/ai/prompts/${key}/history/${historyId}/restore`
  );
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
