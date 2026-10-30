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
 * 把本地 datetime-local 值转为带时区的 ISO 字符串。
 * 浏览器按用户本地时区输入，后端按绝对时间执行，避免部署时区不同导致提前/延后。
 */
export function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToLocalDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

export function defaultScheduleValue(now = new Date()): string {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return isoToLocalDateTime(next.toISOString());
}

export function formatWorkflowTime(value?: string | null): string {
  if (!value) return "尚未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未保存";

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
