import assert from "node:assert/strict";
import test from "node:test";
import {
  isScheduleOverdue,
  scheduleDateParts,
  scheduleDistanceLabel,
  scheduledClassifyLabel,
} from "../src/utils/scheduledPublish.ts";

const now = new Date("2026-10-30T09:00:00+08:00").getTime();

test("定时发布状态按绝对时间判断逾期", () => {
  assert.equal(isScheduleOverdue("2026-10-30T00:59:00.000Z", now), true);
  assert.equal(isScheduleOverdue("2026-10-30T01:01:00.000Z", now), false);
  assert.equal(isScheduleOverdue("not-a-date", now), false);
});

test("倒计时文案区分即将发布、未来和逾期", () => {
  assert.equal(scheduleDistanceLabel("2026-10-30T01:00:30.000Z", now), "即将发布");
  assert.equal(scheduleDistanceLabel("2026-10-30T02:00:00.000Z", now), "距发布 1 小时");
  assert.equal(scheduleDistanceLabel("2026-10-30T00:00:00.000Z", now), "已逾期 1 小时");
});

test("时间块与内容类型使用工作台文案", () => {
  assert.deepEqual(scheduleDateParts("2026-11-01T01:30:00.000Z"), {
    month: "11月",
    day: "01",
    weekday: "周日",
    time: "09:30",
  });
  assert.equal(scheduledClassifyLabel("image"), "摄影图库");
  assert.equal(scheduledClassifyLabel("article"), "博客文章");
});
