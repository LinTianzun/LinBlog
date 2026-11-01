import { getServerOffsetMinutes, serverNowMs } from "./serverClockState.ts";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const pad2 = (part: number) => String(part).padStart(2, "0");

/**
 * 把绝对时间按「服务器时区」拆成日历字段。
 * 用 UTC 毫秒 + 服务器偏移换算，不受浏览器时区影响。
 */
export function serverZoneParts(
  value: string | Date,
  offsetMinutes = getServerOffsetMinutes()
): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
} | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/** 服务器时区下的 `YYYY-MM-DDTHH:mm`，供 datetime-local 输入框。 */
export function serverZoneInputValue(
  value: string | Date,
  offsetMinutes = getServerOffsetMinutes()
): string {
  const parts = serverZoneParts(value, offsetMinutes);
  if (!parts) return "";
  return [
    parts.year,
    "-",
    pad2(parts.month),
    "-",
    pad2(parts.day),
    "T",
    pad2(parts.hours),
    ":",
    pad2(parts.minutes),
  ].join("");
}

/**
 * 把「服务器时区」下的 datetime-local 值转成绝对时间 ISO。
 * 例：偏移 +480 时，`2026-11-01T15:32` → `2026-11-01T07:32:00.000Z`。
 */
export function serverZoneInputToIso(
  value: string,
  offsetMinutes = getServerOffsetMinutes()
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match;
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds || 0)
  );
  if (Number.isNaN(utcMs)) return null;
  return new Date(utcMs - offsetMinutes * 60_000).toISOString();
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isScheduleOverdue(
  value?: string | null,
  now = serverNowMs()
): boolean {
  const date = parseDate(value);
  return Boolean(date && date.getTime() <= now);
}

/**
 * 工作台展示的是运营需要的“还有多久 / 已经晚了多久”，
 * 不再只显示一个绝对时间。精确到分钟足够安排下一次人工处理。
 */
export function scheduleDistanceLabel(
  value?: string | null,
  now = serverNowMs()
): string {
  const date = parseDate(value);
  if (!date) return "时间待确认";

  const diff = date.getTime() - now;
  const overdue = diff <= 0;
  const minutes = Math.max(1, Math.ceil(Math.abs(diff) / 60_000));
  let distance = "";

  if (minutes < 60) {
    distance = `${minutes} 分钟`;
  } else if (minutes < 24 * 60) {
    distance = `${Math.ceil(minutes / 60)} 小时`;
  } else {
    distance = `${Math.ceil(minutes / (24 * 60))} 天`;
  }

  if (overdue) return `已逾期 ${distance}`;
  if (minutes <= 1) return "即将发布";
  return `距发布 ${distance}`;
}

export function scheduleDateParts(value?: string | null): {
  month: string;
  day: string;
  weekday: string;
  time: string;
} {
  const parts = value ? serverZoneParts(value) : null;
  if (!parts) {
    return { month: "--", day: "--", weekday: "待定", time: "--:--" };
  }
  return {
    month: `${parts.month}月`,
    day: pad2(parts.day),
    weekday: `周${WEEKDAYS[parts.weekday]}`,
    time: `${pad2(parts.hours)}:${pad2(parts.minutes)}`,
  };
}

export function scheduledClassifyLabel(classify: string): string {
  return classify === "image" ? "摄影图库" : "博客文章";
}

export interface SchedulePreset {
  key: string;
  label: string;
  value: string;
}

/**
 * 安排发布弹窗的快捷时间：都保证落在未来，并按服务器时区渲染。
 * 关键：不能用浏览器本地方法（getHours/setHours）——浏览器时区与
 * 服务器/挂钟不一致时，"1 小时后"会算到错误时刻。
 */
export function buildSchedulePresets(
  now = new Date(serverNowMs()),
  offsetMinutes = getServerOffsetMinutes()
): SchedulePreset[] {
  const nowMs = now.getTime();
  const oneHourLater = new Date(nowMs + 60 * 60 * 1000);
  const current = serverZoneParts(now, offsetMinutes);
  if (!current) return [];

  // 服务器时区下的「明天 hour:00」换算回绝对时间
  const tomorrowAt = (hour: number): Date => {
    const utcMs = Date.UTC(
      current.year,
      current.month - 1,
      current.day + 1,
      hour,
      0,
      0
    );
    return new Date(utcMs - offsetMinutes * 60_000);
  };
  return [
    { key: "hour", label: "1 小时后", value: serverZoneInputValue(oneHourLater, offsetMinutes) },
    { key: "morning", label: "明早 9:00", value: serverZoneInputValue(tomorrowAt(9), offsetMinutes) },
    { key: "evening", label: "明晚 8:00", value: serverZoneInputValue(tomorrowAt(20), offsetMinutes) },
  ];
}

export interface ScheduleValidation {
  ok: boolean;
  message: string;
}

/** 与后端约束一致：必须能解析，且至少晚于当前 1 分钟。 */
export function validateScheduleValue(
  value: string,
  now = serverNowMs()
): ScheduleValidation {
  if (!value) return { ok: false, message: "请选择发布时间" };
  const iso = serverZoneInputToIso(value);
  if (!iso) {
    return { ok: false, message: "请选择有效的发布时间" };
  }
  if (new Date(iso).getTime() < now + 60_000) {
    return { ok: false, message: "发布时间至少需晚于当前时间 1 分钟" };
  }
  return { ok: true, message: "" };
}

/** 人读时间预览：`11月2日 周一 09:00`，无效输入返回空串。 */
export function scheduleValuePreview(value?: string | null): string {
  if (!value) return "";
  // 输入框值（无时区）按服务器时区解析；带 Z/±偏移的是绝对时间，直接换算
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const parts = hasZone
    ? serverZoneParts(value)
    : serverZoneParts(serverZoneInputToIso(value) || "");
  if (!parts) return "";
  return `${parts.month}月${parts.day}日 周${WEEKDAYS[parts.weekday]} ${pad2(
    parts.hours
  )}:${pad2(parts.minutes)}`;
}
