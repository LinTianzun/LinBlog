import request from "../utils/request";

export interface FileItem {
  id: number;
  fileName: string;
  format: string;
  size: number | null;
  url: string;
  subsetId: number | null;
  createdAt: string;
  // disk=本地磁盘文件；image=文章/图库/随笔上传的内容图片（二进制在 image 表）
  source?: "disk" | "image";
  // 内容图片的内联地址，与 /api/uploads 共用缩略图契约
  rawUrl?: string;
  // 内容图片的归属：被哪些文章、图库、随笔引用
  owners?: FileOwner[];
}

export interface FileOwner {
  type: "article" | "gallery" | "diary";
  id: number;
  title: string;
}

// 素材库选择器使用的图片条目：raw 地址可直接作为文章/图库/随笔图片
export interface MediaImageItem {
  id: number;
  fileName: string;
  format: string;
  size: number | null;
  url: string;
  thumbUrl: string;
  subsetId: number | null;
  subsetName: string | null;
  createdAt: string;
}

export interface MediaImagePageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: MediaImageItem[];
}

// 回收站条目：在文件字段基础上补删除时间与是否仍可恢复
export interface TrashFileItem extends FileItem {
  deletedAt: string | null;
  recoverable: boolean;
}

export interface FilePageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: FileItem[];
}

export interface FileSubsetCount {
  id: number;
  name: string;
  classify: string;
  sort: number;
  moment: string;
  value: number;
}

export interface FileSummaryData {
  all: number;
  uncategorized: number;
  subsets: FileSubsetCount[];
}

export interface FileStorageStatus {
  usedBytes: number;
  maxBytes: number;
  usedPercent: number;
  warnPercent: number;
  level: "ok" | "warning" | "critical";
  local: { bytes: number; files: number };
  mirror: { bytes: number; files: number };
  offsite: {
    enabled: boolean;
    mirror: boolean;
    s3: boolean;
    mirrorDir: string | null;
    s3Bucket: string | null;
  } | null;
}

// 缩略图 LRU 缓存运行状态（存储维护面板）
export interface VariantCacheInfo {
  entries: number;
  bytes: number;
  maxBytes: number;
  hits: number;
  misses: number;
  generations: number;
  evictions: number;
  clears: number;
  // 命中率百分比；没有任何读请求时为 null
  hitRate: number | null;
}

// 磁盘文件 / 内容图片 / 回收站的占用分布
export interface StorageDistributionRow {
  count: number;
  bytes: number;
}

export interface StorageDistribution {
  disk: StorageDistributionRow;
  image: StorageDistributionRow;
  trashDisk: StorageDistributionRow;
  trashImage: StorageDistributionRow;
}

export interface MaintenanceStatsData {
  cache: VariantCacheInfo;
  storage: StorageDistribution;
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
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

// 文件分页查询
export function getFiles(
  params: {
    page?: number;
    pageSize?: number;
    subsetId?: number;
    uncategorized?: boolean;
    keyword?: string;
  } = {}
) {
  return request.get<ApiResult<FilePageData>>("/file", { params });
}

// 文件统计（分组栏计数）
export function getFileSummary() {
  return request.get<ApiResult<FileSummaryData>>("/file/summary");
}

// 素材库图片分页查询（本地文件模块中可内联展示的图片）
export function getImageFiles(
  params: { page?: number; pageSize?: number; keyword?: string } = {}
) {
  return request.get<ApiResult<MediaImagePageData>>("/file/images", { params });
}

// 回收站分页查询
export function getTrashFiles(params: { page?: number; pageSize?: number } = {}) {
  return request.get<ApiResult<FilePageData & { list: TrashFileItem[] }>>(
    "/file/trash",
    { params }
  );
}

// 批量恢复回收站文件
export function restoreFiles(fileIds: number[]) {
  return request.patch<ApiResult<{ restoredCount: number; failedCount: number }>>(
    "/file/restore",
    { fileIds }
  );
}

// 彻底删除回收站文件（仅管理员），删除备份后记录不再出现在回收站
export function purgeTrashFiles(fileIds: number[]) {
  return request.delete<
    ApiResult<{ purgedCount: number; failedCount: number }>
  >("/file/trash", { data: { fileIds } });
}

// 管理员手动触发清理；dryRun 只预演不落盘
export function runFileCleanup(dryRun: boolean) {
  return request.post<ApiResult<Record<string, unknown>>>(
    "/file/maintenance/cleanup",
    { dryRun }
  );
}

// 备份区容量、告警级别与异地副本配置（仅管理员）
export function getFileStorageStatus() {
  return request.get<ApiResult<FileStorageStatus>>("/file/storage/status");
}

// 存储维护面板：缓存命中率与占用分布（仅 file.purge）
export function getMaintenanceStats() {
  return request.get<ApiResult<MaintenanceStatsData>>("/file/maintenance/stats");
}

// 手动清空缩略图缓存（仅 file.purge）
export function clearImageVariantCache() {
  return request.post<ApiResult<{ cache: VariantCacheInfo }>>(
    "/file/maintenance/cache"
  );
}

// 上传地址：yk-upload 内部自己发 XHR，无法附加请求头，
// 因此凭证只能走 query。这里用一次性短期票据代替登录 token，
// 避免长期 JWT 出现在 URL 与服务器访问日志中。
export function getFileUploadUrl(ticket: string, subsetId?: number): string {
  const query = new URLSearchParams({ ticket });
  if (subsetId && subsetId > 0) query.set("subsetId", String(subsetId));
  return `/api/file/upload?${query.toString()}`;
}

// 批量移动分组，subsetId 传 undefined 表示移入未分类
export function moveFiles(fileIds: number[], subsetId?: number) {
  return request.patch<ApiResult<{ movedCount: number }>>("/file/move", {
    fileIds,
    subsetId,
  });
}

// 批量删除文件
export function deleteFiles(fileIds: number[]) {
  return request.delete<
    ApiResult<{
      deletedCount: number;
      backedUpCount: number;
      backupFailedCount: number;
      offsiteFailedCount: number;
      referencedCount: number;
      referenced: { id: number; referenceCount: number }[];
    }>
  >("/file", { data: { fileIds } });
}
