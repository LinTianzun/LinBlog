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
