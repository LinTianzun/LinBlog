import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLocalDraft,
  hasLocalDraftContent,
  readLocalDraft,
  writeLocalDraft,
} from "../src/utils/localDraft.ts";

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

test("本机草稿可写入、读回并清除", () => {
  (globalThis as { localStorage?: MemoryStorage }).localStorage = new MemoryStorage();

  writeLocalDraft("article-new", {
    title: "  标题  ",
    content: "<p>正文</p>",
    subsetId: 3,
    label: "Vue,写作",
    introduce: "简介",
    cover: "/api/uploads/a.jpg",
  });

  const draft = readLocalDraft("article-new");
  assert.equal(draft?.title, "  标题  ");
  assert.equal(draft?.content, "<p>正文</p>");
  assert.equal(draft?.subsetId, 3);
  assert.ok(draft?.savedAt);

  clearLocalDraft("article-new");
  assert.equal(readLocalDraft("article-new"), null);
});

test("不同内容类型的本机草稿互不覆盖", () => {
  (globalThis as { localStorage?: MemoryStorage }).localStorage = new MemoryStorage();

  writeLocalDraft("article-new", {
    title: "文章",
    content: "<p>文章正文</p>",
    subsetId: null,
    label: "",
    introduce: "",
    cover: "",
  });
  writeLocalDraft("gallery-new", {
    title: "图库",
    content: JSON.stringify(["/api/uploads/1.jpg"]),
    subsetId: null,
    label: "",
    introduce: "",
    cover: "/api/uploads/1.jpg",
  });

  assert.equal(readLocalDraft("article-new")?.title, "文章");
  assert.equal(readLocalDraft("gallery-new")?.title, "图库");
});

test("损坏或不合规的本地草稿会被忽略", () => {
  (globalThis as { localStorage?: MemoryStorage }).localStorage = new MemoryStorage();

  globalThis.localStorage.setItem("linblog.local-draft.article-new", "{not json");
  assert.equal(readLocalDraft("article-new"), null);

  globalThis.localStorage.setItem(
    "linblog.local-draft.article-new",
    JSON.stringify({ title: 1, content: null })
  );
  assert.equal(readLocalDraft("article-new"), null);
});

test("空白表单不算有效草稿，标题或图片任一有内容即算", () => {
  const empty = {
    title: "  ",
    content: "<p>&nbsp;</p>",
    subsetId: null,
    label: "",
    introduce: "",
    cover: "",
    savedAt: "",
  };
  assert.equal(hasLocalDraftContent(empty), false);
  assert.equal(hasLocalDraftContent(null), false);
  assert.equal(hasLocalDraftContent({ ...empty, title: "标题" }), true);
  assert.equal(hasLocalDraftContent({ ...empty, content: "<img src='/a.jpg'>" }), true);
});
