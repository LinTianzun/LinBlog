import type { WorkflowSnapshot } from "./articleWorkflow";

// 冲突对比是纯函数模块：不依赖 axios / DOM，可以被 node:test 直接导入。

export type ConflictClassify = "article" | "image";

export type ConflictFieldKey =
  | "title"
  | "label"
  | "introduce"
  | "cover"
  | "subsetId"
  | "content";

export interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

export interface ConflictFieldRow {
  key: ConflictFieldKey;
  label: string;
  localChanged: boolean;
  remoteChanged: boolean;
  conflict: boolean;
  localPreview: string;
  remotePreview: string;
}

export interface ConflictReport {
  classify: ConflictClassify;
  remoteRevision: number;
  remoteSavedAt: string | null;
  fields: ConflictFieldRow[];
  /** 正文按「共同基线 → 对方 / 本窗口」两个方向做行级 diff */
  contentDiff: {
    remote: DiffLine[];
    local: DiffLine[];
  };
  /** 图库图片按「共同基线 → 对方」统计增删 */
  photos: {
    added: string[];
    removed: string[];
  };
  hasConflict: boolean;
  onlyLocalChanged: boolean;
  onlyRemoteChanged: boolean;
}

export interface BuildConflictReportParams {
  /** 本窗口加载（或最近一次保存成功）时的共同基线快照 */
  base: WorkflowSnapshot | null;
  /** 本窗口当前编辑器内容 */
  local: WorkflowSnapshot;
  /** 服务器上其他窗口保存的最新工作稿 */
  remote: WorkflowSnapshot;
  classify: ConflictClassify;
  remoteRevision: number;
  remoteSavedAt: string | null;
}

interface FieldDef {
  key: Exclude<ConflictFieldKey, "content">;
  label: string;
  value: (snapshot: WorkflowSnapshot) => string;
  preview: (value: string) => string;
}

const DIFF_LINE_LIMIT = 400;
const PREVIEW_MAX_LENGTH = 120;

const EMPTY_SNAPSHOT: WorkflowSnapshot = {
  title: "",
  content: "",
  subsetId: null,
  label: "",
  introduce: "",
  cover: "",
};

const FIELD_DEFS: FieldDef[] = [
  { key: "title", label: "标题", value: s => s.title.trim(), preview: previewValue },
  { key: "label", label: "标签", value: s => s.label.trim(), preview: previewValue },
  {
    key: "introduce",
    label: "摘要",
    value: s => s.introduce.trim(),
    preview: previewValue,
  },
  { key: "cover", label: "封面", value: s => s.cover.trim(), preview: previewValue },
  {
    key: "subsetId",
    label: "分类",
    value: s => (s.subsetId === null ? "" : String(s.subsetId)),
    preview: value => (value ? `分类 ${value}` : "未分类"),
  },
];

export function previewValue(
  value: string | null | undefined,
  max = PREVIEW_MAX_LENGTH
): string {
  const text = (value ?? "").trim();
  if (!text) return "（空）";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** 富文本抽成非空文本行，供正文 diff 使用；块级标签换行、行内标签剔除。 */
export function stripHtmlToLines(html: string): string[] {
  if (!html) return [];
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/** 图库工作稿的 content 是 JSON.stringify(string[])，这里安全解析。 */
export function parseGalleryPhotos(content: string): string[] {
  if (!content) return [];
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * 行级 LCS diff。removed 表示「before 有、after 没有」，added 相反。
 * 超长正文（任一侧超过 400 行）退化为整段替换，避免 O(n²) 表格过大。
 */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  if (before.length === 0 && after.length === 0) return [];
  if (before.length > DIFF_LINE_LIMIT || after.length > DIFF_LINE_LIMIT) {
    return [
      ...before.map(text => ({ type: "removed" as const, text })),
      ...after.map(text => ({ type: "added" as const, text })),
    ];
  }

  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0)
  );
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      result.push({ type: "same", text: before[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: "removed", text: before[i] });
      i++;
    } else {
      result.push({ type: "added", text: after[j] });
      j++;
    }
  }
  while (i < rows) {
    result.push({ type: "removed", text: before[i] });
    i++;
  }
  while (j < cols) {
    result.push({ type: "added", text: after[j] });
    j++;
  }
  return result;
}

export function galleryPhotoDiff(
  before: string[],
  after: string[]
): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...new Set(after.filter(url => !beforeSet.has(url)))],
    removed: [...new Set(before.filter(url => !afterSet.has(url)))],
  };
}

/** 字段行里的正文预览：文章给纯文本摘要，图库给图片数量。 */
export function describeContentPreview(
  content: string,
  classify: ConflictClassify
): string {
  if (classify === "image") {
    const photos = parseGalleryPhotos(content);
    return photos.length > 0 ? `${photos.length} 张图片` : "无图片";
  }
  const text = stripHtmlToLines(content).join(" ");
  return previewValue(text);
}

export function buildConflictReport(
  params: BuildConflictReportParams
): ConflictReport {
  const base = params.base ?? EMPTY_SNAPSHOT;
  const { local, remote, classify, remoteRevision, remoteSavedAt } = params;

  const fields: ConflictFieldRow[] = [];
  for (const def of FIELD_DEFS) {
    const baseValue = def.value(base);
    const localValue = def.value(local);
    const remoteValue = def.value(remote);
    const localChanged = localValue !== baseValue;
    const remoteChanged = remoteValue !== baseValue;
    if (!localChanged && !remoteChanged) continue;
    fields.push({
      key: def.key,
      label: def.label,
      localChanged,
      remoteChanged,
      // 双方改成了相同值不算冲突，无需用户裁决
      conflict: localChanged && remoteChanged && localValue !== remoteValue,
      localPreview: def.preview(localValue),
      remotePreview: def.preview(remoteValue),
    });
  }

  const contentLocalChanged = local.content !== base.content;
  const contentRemoteChanged = remote.content !== base.content;
  if (contentLocalChanged || contentRemoteChanged) {
    fields.push({
      key: "content",
      label: classify === "image" ? "图片" : "正文",
      localChanged: contentLocalChanged,
      remoteChanged: contentRemoteChanged,
      conflict:
        contentLocalChanged &&
        contentRemoteChanged &&
        local.content !== remote.content,
      localPreview: describeContentPreview(local.content, classify),
      remotePreview: describeContentPreview(remote.content, classify),
    });
  }

  const isArticle = classify === "article";
  const baseLines = isArticle ? stripHtmlToLines(base.content) : [];
  return {
    classify,
    remoteRevision,
    remoteSavedAt,
    fields,
    contentDiff: {
      remote: isArticle
        ? diffLines(baseLines, stripHtmlToLines(remote.content))
        : [],
      local: isArticle
        ? diffLines(baseLines, stripHtmlToLines(local.content))
        : [],
    },
    photos: isArticle
      ? { added: [], removed: [] }
      : galleryPhotoDiff(
          parseGalleryPhotos(base.content),
          parseGalleryPhotos(remote.content)
        ),
    hasConflict: fields.some(row => row.conflict),
    onlyLocalChanged: fields.length > 0 && fields.every(row => !row.remoteChanged),
    onlyRemoteChanged: fields.length > 0 && fields.every(row => !row.localChanged),
  };
}
