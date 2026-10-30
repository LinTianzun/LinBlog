import request from "../utils/request";

export interface BackupFileItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupCapacity {
  usedBytes: number;
  maxBytes: number;
  usedPercent: number;
  warnPercent: number;
  level: "ok" | "warning" | "critical";
}

export interface BackupLatestSuccess {
  id: number;
  filename: string;
  size_bytes: number;
  table_count: number | null;
  row_count: number | null;
  duration_ms: number | null;
  trigger_type: "scheduled" | "manual";
  created_at: string;
}

export interface BackupLatestFailure {
  id: number;
  filename: string;
  error_message: string | null;
  created_at: string;
}

export interface BackupLatestDrill {
  id: number;
  filename: string;
  target_database: string | null;
  table_count: number | null;
  row_count: number | null;
  duration_ms: number | null;
  status: "success" | "failed";
  created_at: string;
}

export interface BackupOverviewData {
  backups: BackupFileItem[];
  totalBytes: number;
  totalFiles: number;
  retentionCount: number;
  backupHour: number;
  capacity: BackupCapacity;
  latest: {
    lastSuccess: BackupLatestSuccess | null;
    lastFailure: BackupLatestFailure | null;
    lastDrill: BackupLatestDrill | null;
  };
}

export interface BackupHistoryItem {
  id: number;
  kind: "backup" | "drill";
  filename: string;
  targetDatabase: string | null;
  sizeBytes: number;
  checksum: string | null;
  tableCount: number | null;
  rowCount: number | null;
  durationMs: number | null;
  triggerType: "scheduled" | "manual";
  status: "success" | "failed";
  errorMessage: string | null;
  createdAt: string;
}

export interface BackupHistoryData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: BackupHistoryItem[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

// 从 axios 错误里取出后端返回的提示，取不到时用调用方给的兜底文案
export function getBackupErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试"
): string {
  if (typeof error !== "object" || error === null) return fallback;
  const response = (error as { response?: { data?: { message?: unknown } } })
    .response;
  const message = response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}

// 备份总览：文件列表、容量告警、保留策略与最近执行结果
export function getBackupOverview() {
  return request.get<ApiResult<BackupOverviewData>>("/backup");
}

// 备份与恢复演练历史
export function getBackupHistory(
  params: { page?: number; pageSize?: number; kind?: string; status?: string } = {}
) {
  return request.get<ApiResult<BackupHistoryData>>("/backup/history", { params });
}

// 手动触发一次数据库备份
export function createDatabaseBackup() {
  return request.post<
    ApiResult<{
      filename: string;
      sizeBytes: number;
      tables: number;
      rows: number;
      durationMs: number;
      checksum: string;
      pruned: string[];
    }>
  >("/backup");
}

// 恢复演练：还原到隔离库验证后自动清理
export function runRestoreDrill(filename: string) {
  return request.post<
    ApiResult<{
      filename: string;
      database: string;
      tables: number;
      rows: number;
      triggers: number;
      durationMs: number;
      temporaryDatabaseCleaned: boolean;
    }>
  >("/backup/restore-drill", { filename });
}

// 清理超出保留策略的备份
export function pruneDatabaseBackups() {
  return request.post<
    ApiResult<{ removed: string[]; kept: string[]; retentionCount: number }>
  >("/backup/prune");
}

// 删除单个备份
export function deleteDatabaseBackup(filename: string) {
  return request.delete<ApiResult<{ deleted: boolean; filename: string }>>(
    `/backup/${encodeURIComponent(filename)}`
  );
}

// 备份下载：用 Blob 请求而不是直链，才能带上 Authorization 头；
// 直链无法附加请求头，会把需要鉴权的接口暴露成公开地址。
export function downloadDatabaseBackup(filename: string) {
  return request.get<Blob>(`/backup/${encodeURIComponent(filename)}/download`, {
    responseType: "blob",
  });
}
