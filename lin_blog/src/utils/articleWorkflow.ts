import {
  getServerOffsetMinutes,
  serverNowMs,
} from "./serverClockState.ts";
import {
  serverZoneParts,
  serverZoneInputToIso,
  serverZoneInputValue,
} from "./scheduledPublish.ts";

export type WorkflowSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

export const AUTOSAVE_DELAY_MS = 1500;
export const AUTOSAVE_MAX_WAIT_MS = 10_000;

export interface WorkflowSnapshot {
  title: string;
  content: string;
  subsetId: number | null;
  label: string;
  introduce: string;
  cover: string;
}

/**
 * 自动保存比较的是最终会落库的字段，不比较本地表单对象引用。
 * 编辑器会在输入过程中多次 emit，同样的 HTML 不应重复触发保存。
 */
export function serializeWorkflowSnapshot(snapshot: WorkflowSnapshot): string {
  return JSON.stringify({
    title: snapshot.title.trim(),
    content: snapshot.content,
    subsetId: snapshot.subsetId,
    label: snapshot.label,
    introduce: snapshot.introduce.trim(),
    cover: snapshot.cover.trim(),
  });
}

export function hasWorkflowChanges(
  current: WorkflowSnapshot,
  saved: WorkflowSnapshot | null
): boolean {
  if (!saved) return false;
  return serializeWorkflowSnapshot(current) !== serializeWorkflowSnapshot(saved);
}

/**
 * 把 datetime-local 值转为绝对 ISO 字符串。
 * 输入框语义是「服务器时区」，不能按浏览器时区解析——浏览器时区与
 * 服务器/挂钟不一致时会把发布时间算错数小时。
 */
export function localDateTimeToIso(value: string): string | null {
  return serverZoneInputToIso(value);
}

export function isoToLocalDateTime(value?: string | null): string {
  if (!value) return "";
  return serverZoneInputValue(value);
}

export function defaultScheduleValue(
  now = new Date(serverNowMs()),
  offsetMinutes = getServerOffsetMinutes()
): string {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return serverZoneInputValue(next, offsetMinutes);
}

export function formatWorkflowTime(value?: string | null): string {
  if (!value) return "尚未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未保存";
  // 按服务器时区渲染，避免浏览器时区不同导致展示时间偏移
  const parts = serverZoneParts(date);
  if (!parts) return "尚未保存";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hours)}:${pad(parts.minutes)}`;
}

export function workflowSaveLabel(
  status: WorkflowSaveStatus,
  savedAt?: string | null
): string {
  if (status === "saving") return "正在自动保存...";
  if (status === "dirty") return "有未保存修改";
  if (status === "conflict") return "工作稿已在其他窗口更新";
  if (status === "error") return "自动保存失败";
  if (status === "saved" || savedAt) return `${formatWorkflowTime(savedAt)} 已自动保存`;
  return "修改后自动保存";
}

export const VERSION_SOURCE_LABELS: Record<string, string> = {
  manual: "手动保存",
  autosave: "自动保存",
  publish: "发布",
  rollback: "回滚",
  scheduled: "定时发布",
};

export function versionSourceLabel(source: string): string {
  return VERSION_SOURCE_LABELS[source] || source;
}
