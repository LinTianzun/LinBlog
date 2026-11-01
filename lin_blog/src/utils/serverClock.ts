import request from "./request";
import type { ApiResult } from "../api/article";
import {
  getServerOffsetMinutes,
  resetServerClockState,
  serverNowMs,
  setServerClock,
} from "./serverClockState.ts";

export { getServerOffsetMinutes, serverNowMs };

interface ServerTimePayload {
  now: string;
  offsetMinutes: number;
  timeZone: string;
}

let ready: Promise<void> | null = null;

export function serverNow(): Date {
  return new Date(serverNowMs());
}

/**
 * 拉取服务器时间与时区。并发调用共享同一个请求；失败时静默回退，
 * 不让时间同步问题阻断定时发布表单。
 */
export function ensureServerClock(): Promise<void> {
  if (ready) return ready;
  ready = request
    .get<ApiResult<ServerTimePayload>>("/time/now")
    .then((result) => {
      const payload = result?.data;
      if (!payload) return;
      const serverMs = new Date(payload.now).getTime();
      setServerClock(
        Number(payload.offsetMinutes),
        Number.isFinite(serverMs) ? serverMs - Date.now() : NaN
      );
    })
    .catch(() => {
      // 静默回退到浏览器时区
    });
  return ready;
}

/** 测试/登出场景下重置缓存，下一次会重新拉取。 */
export function resetServerClock(): void {
  resetServerClockState();
  ready = null;
}
