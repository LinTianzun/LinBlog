import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConflictReport,
  describeContentPreview,
  diffLines,
  galleryPhotoDiff,
  parseGalleryPhotos,
  previewValue,
  stripHtmlToLines,
} from "../src/utils/conflictCompare.ts";
import type { WorkflowSnapshot } from "../src/utils/articleWorkflow.ts";

const base: WorkflowSnapshot = {
  title: "标题",
  content: "<p>第一段</p><p>第二段</p>",
  subsetId: 2,
  label: "Vue",
  introduce: "简介",
  cover: "cover.jpg",
};

test("富文本抽取按块级标签分段并解码实体", () => {
  const lines = stripHtmlToLines(
    "<h2>标题</h2><!-- 注释 --><p>第一段&amp;第二段</p>" +
      "<p>带 <strong>加粗</strong> 的段落<br>换行</p>"
  );
  assert.deepEqual(lines, ["标题", "第一段&第二段", "带 加粗 的段落", "换行"]);
  assert.deepEqual(stripHtmlToLines(""), []);
});

test("diffLines 输出 same/removed/added 合并序列", () => {
  const diff = diffLines(["a", "b", "c"], ["a", "B", "c", "d"]);
  assert.deepEqual(diff, [
    { type: "same", text: "a" },
    { type: "removed", text: "b" },
    { type: "added", text: "B" },
    { type: "same", text: "c" },
    { type: "added", text: "d" },
  ]);
  assert.deepEqual(diffLines([], []), []);
});

test("diffLines 超过行数上限时退化为整段替换", () => {
  const before = Array.from({ length: 401 }, (_, i) => `旧${i}`);
  const after = Array.from({ length: 401 }, (_, i) => `新${i}`);
  const diff = diffLines(before, after);
  assert.equal(diff.length, 802);
  assert.equal(diff[0].type, "removed");
  assert.equal(diff[401].type, "added");
});

test("previewValue 截断超长文本并提示空值", () => {
  assert.equal(previewValue("短文本"), "短文本");
  const long = previewValue("x".repeat(130));
  assert.equal(long.length, 123);
  assert.ok(long.endsWith("..."));
  assert.equal(previewValue("   "), "（空）");
  assert.equal(previewValue(null), "（空）");
});

test("图库图片差异统计新增与删除并去重", () => {
  assert.deepEqual(galleryPhotoDiff(["a.jpg", "b.jpg", "a.jpg"], ["b.jpg", "c.jpg"]), {
    added: ["c.jpg"],
    removed: ["a.jpg"],
  });
});

test("图库工作稿正文安全解析为图片列表", () => {
  assert.deepEqual(parseGalleryPhotos(JSON.stringify(["a.jpg"])), ["a.jpg"]);
  assert.deepEqual(parseGalleryPhotos("not-json"), []);
  assert.deepEqual(parseGalleryPhotos(JSON.stringify({ name: 1 })), []);
  assert.deepEqual(parseGalleryPhotos(""), []);
});

test("冲突报告标注双方修改的字段与冲突标记", () => {
  const report = buildConflictReport({
    base,
    local: {
      ...base,
      title: "我的标题",
      introduce: "我的摘要",
      content: "<p>第一段</p><p>我改的第二段</p>",
    },
    remote: {
      ...base,
      title: "对方标题",
      content: "<p>第一段</p><p>对方改的第二段</p>",
    },
    classify: "article",
    remoteRevision: 6,
    remoteSavedAt: "2026-10-30T10:00:00Z",
  });

  const title = report.fields.find(row => row.key === "title");
  assert.ok(title);
  assert.equal(title.conflict, true);
  const introduce = report.fields.find(row => row.key === "introduce");
  assert.ok(introduce);
  assert.equal(introduce.conflict, false);
  assert.equal(introduce.remoteChanged, false);
  const content = report.fields.find(row => row.key === "content");
  assert.ok(content);
  assert.equal(content.conflict, true);
  assert.ok(report.contentDiff.remote.some(line => line.type === "added"));
  assert.ok(report.contentDiff.local.length > 0);
  assert.equal(report.remoteRevision, 6);
  assert.equal(report.hasConflict, true);
  assert.equal(report.onlyLocalChanged, false);
  assert.equal(report.onlyRemoteChanged, false);
});

test("只有一方修改时给出单向标记且不算冲突", () => {
  const onlyRemote = buildConflictReport({
    base,
    local: base,
    remote: { ...base, title: "对方标题" },
    classify: "article",
    remoteRevision: 7,
    remoteSavedAt: null,
  });
  assert.equal(onlyRemote.onlyRemoteChanged, true);
  assert.equal(onlyRemote.onlyLocalChanged, false);
  assert.equal(onlyRemote.hasConflict, false);

  const onlyLocal = buildConflictReport({
    base,
    local: { ...base, cover: "new-cover.jpg" },
    remote: base,
    classify: "article",
    remoteRevision: 8,
    remoteSavedAt: null,
  });
  assert.equal(onlyLocal.onlyLocalChanged, true);
  assert.equal(onlyLocal.onlyRemoteChanged, false);
  assert.equal(onlyLocal.hasConflict, false);
});

test("双方改成相同内容不标记冲突", () => {
  const report = buildConflictReport({
    base,
    local: { ...base, title: "相同标题" },
    remote: { ...base, title: "相同标题", introduce: "对方顺手补了摘要" },
    classify: "article",
    remoteRevision: 9,
    remoteSavedAt: null,
  });
  const title = report.fields.find(row => row.key === "title");
  assert.equal(title?.conflict, false);
  assert.equal(report.hasConflict, false);
  assert.equal(report.onlyRemoteChanged, false);
  assert.equal(report.onlyLocalChanged, false);
});

test("正文预览按类型区分文章与图库", () => {
  assert.match(describeContentPreview("<p>第一段</p><p>第二段</p>", "article"), /第一段/);
  assert.equal(
    describeContentPreview(JSON.stringify(["a.jpg", "b.jpg"]), "image"),
    "2 张图片"
  );
  assert.equal(describeContentPreview(JSON.stringify([]), "image"), "无图片");
});

test("图库冲突报告按共同基线统计对方图片增删", () => {
  const galleryBase: WorkflowSnapshot = {
    ...base,
    content: JSON.stringify(["a.jpg", "b.jpg"]),
  };
  const report = buildConflictReport({
    base: galleryBase,
    local: galleryBase,
    remote: { ...galleryBase, content: JSON.stringify(["a.jpg", "c.jpg"]) },
    classify: "image",
    remoteRevision: 10,
    remoteSavedAt: null,
  });
  assert.deepEqual(report.photos, { added: ["c.jpg"], removed: ["b.jpg"] });
  assert.deepEqual(report.contentDiff, { remote: [], local: [] });
  const content = report.fields.find(row => row.key === "content");
  assert.equal(content?.label, "图片");
  assert.equal(content?.remotePreview, "2 张图片");
});
