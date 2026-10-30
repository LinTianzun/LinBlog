import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSchedulePresets,
  isScheduleOverdue,
  scheduleDateParts,
  scheduleValuePreview,
  scheduleDistanceLabel,
  scheduledClassifyLabel,
  validateScheduleValue,
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

test("快捷预设基于当前时间生成且全部在未来", () => {
  const base = new Date("2026-10-30T09:00:00+08:00");
  const presets = buildSchedulePresets(base);
  assert.deepEqual(
    presets.map(preset => preset.label),
    ["1 小时后", "明早 9:00", "明晚 8:00"]
  );
  assert.equal(presets[0].value, "2026-10-30T10:00");
  assert.equal(presets[1].value, "2026-10-31T09:00");
  assert.equal(presets[2].value, "2026-10-31T20:00");
  for (const preset of presets) {
    assert.ok(new Date(preset.value).getTime() > base.getTime());
  }
});

test("发布时间校验拒绝空值、非法值与过近时间", () => {
  assert.match(validateScheduleValue("", now).message, /请选择发布时间/);
  assert.match(validateScheduleValue("not-a-date", now).message, /有效/);
  assert.match(
    validateScheduleValue("2026-10-30T09:00", now).message,
    /至少需晚于当前时间 1 分钟/
  );
  assert.equal(validateScheduleValue("2026-10-30T09:01", now).ok, true);
});

test("发布时间预览输出人读中文格式", () => {
  assert.equal(scheduleValuePreview("2026-11-01T01:30:00.000Z"), "11月1日 周日 09:30");
  assert.equal(scheduleValuePreview("bad"), "");
  assert.equal(scheduleValuePreview(null), "");
});
