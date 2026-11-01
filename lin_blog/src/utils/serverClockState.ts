/**
 * 服务器时钟状态：时区偏移与时钟偏差。
 * 独立成无依赖模块，纯函数（scheduledPublish / articleWorkflow）可直接使用，
 * 网络同步逻辑放在 serverClock.ts，避免单测被迫加载 axios。
 */

let offsetMinutes = -new Date().getTimezoneOffset();
let clockSkewMs = 0;

export function getServerOffsetMinutes(): number {
  return offsetMinutes;
}

export function setServerClock(offset: number, skewMs: number): void {
  if (Number.isFinite(offset)) offsetMinutes = offset;
  if (Number.isFinite(skewMs)) clockSkewMs = skewMs;
}

export function resetServerClockState(): void {
  offsetMinutes = -new Date().getTimezoneOffset();
  clockSkewMs = 0;
}

/** 服务器当前时间（毫秒），已计入与浏览器的时钟偏差。 */
export function serverNowMs(): number {
  return Date.now() + clockSkewMs;
}
