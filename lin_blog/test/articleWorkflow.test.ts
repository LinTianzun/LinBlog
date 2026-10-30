import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultScheduleValue,
  hasWorkflowChanges,
  isoToLocalDateTime,
  localDateTimeToIso,
  serializeWorkflowSnapshot,
  versionSourceLabel,
  workflowSaveLabel,
} from "../src/utils/articleWorkflow.ts";

const base = {
  title: "标题",
  content: "<p>正文</p>",
  subsetId: 2,
  label: "Vue",
  introduce: "简介",
  cover: "/cover.jpg",
};

test("工作稿快照忽略首尾空白，但保留正文 HTML", () => {
  const normalized = serializeWorkflowSnapshot({
    ...base,
    title: "  标题  ",
    introduce: "  简介 ",
    cover: " /cover.jpg ",
  });
  assert.equal(normalized, serializeWorkflowSnapshot(base));
  assert.equal(hasWorkflowChanges(base, null), false);
  assert.equal(
    hasWorkflowChanges({ ...base, content: "<p>新正文</p>" }, base),
    true
  );
});

test("本地时间与 ISO 时间可往返转换", () => {
  const local = "2026-10-31T09:30";
  const iso = localDateTimeToIso(local);
  assert.ok(iso);
  assert.equal(isoToLocalDateTime(iso), local);
  assert.equal(localDateTimeToIso(""), null);
  assert.equal(localDateTimeToIso("not-a-date"), null);
});

test("默认计划时间为当前时间一小时后", () => {
  const now = new Date("2026-10-30T08:15:45");
  const value = defaultScheduleValue(now);
  assert.equal(value, "2026-10-30T09:15");
});

test("保存状态与版本来源有稳定文案", () => {
  assert.match(workflowSaveLabel("dirty"), /未保存/);
  assert.match(workflowSaveLabel("saving"), /正在自动保存/);
  assert.match(workflowSaveLabel("saved", "2026-10-30T08:00:00Z"), /已自动保存/);
  assert.equal(versionSourceLabel("rollback"), "回滚");
  assert.equal(versionSourceLabel("unknown"), "unknown");
});
