const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isScheduleOverdue(
  value?: string | null,
  now = Date.now()
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
  now = Date.now()
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
  const date = parseDate(value);
  if (!date) {
    return { month: "--", day: "--", weekday: "待定", time: "--:--" };
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    month: `${date.getMonth() + 1}月`,
    day: pad(date.getDate()),
    weekday: `周${WEEKDAYS[date.getDay()]}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function scheduledClassifyLabel(classify: string): string {
  return classify === "image" ? "摄影图库" : "博客文章";
}

/** datetime-local 输入框需要的本地时间字符串（YYYY-MM-DDTHH:mm）。 */
function toLocalInputValue(date: Date): string {
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

export interface SchedulePreset {
  key: string;
  label: string;
  value: string;
}

/** 安排发布弹窗的快捷时间：都保证落在未来。 */
export function buildSchedulePresets(now = new Date()): SchedulePreset[] {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  oneHourLater.setSeconds(0, 0);
  const tomorrowAt = (hour: number): Date => {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  return [
    { key: "hour", label: "1 小时后", value: toLocalInputValue(oneHourLater) },
    { key: "morning", label: "明早 9:00", value: toLocalInputValue(tomorrowAt(9)) },
    { key: "evening", label: "明晚 8:00", value: toLocalInputValue(tomorrowAt(20)) },
  ];
}

export interface ScheduleValidation {
  ok: boolean;
  message: string;
}

/** 与后端约束一致：必须能解析，且至少晚于当前 1 分钟。 */
export function validateScheduleValue(
  value: string,
  now = Date.now()
): ScheduleValidation {
  if (!value) return { ok: false, message: "请选择发布时间" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "请选择有效的发布时间" };
  }
  if (date.getTime() < now + 60_000) {
    return { ok: false, message: "发布时间至少需晚于当前时间 1 分钟" };
  }
  return { ok: true, message: "" };
}

/** 人读时间预览：`11月2日 周一 09:00`，无效输入返回空串。 */
export function scheduleValuePreview(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 周${
    WEEKDAYS[date.getDay()]
  } ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
