export interface LocalDraft {
  title: string;
  content: string;
  subsetId: number | null;
  label: string;
  introduce: string;
  cover: string;
  savedAt: string;
}

const STORAGE_PREFIX = "linblog.local-draft.";

function storageKey(kind: string): string {
  return `${STORAGE_PREFIX}${kind}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 新建内容还没有后端 ID，无法使用工作稿接口。
 * 用 localStorage 兜底：刷新、崩溃、误关标签页后仍能把写了一半的内容找回来。
 */
export function readLocalDraft(kind: string): LocalDraft | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(storageKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.title !== "string" || typeof parsed.content !== "string") {
      return null;
    }
    return {
      title: parsed.title,
      content: parsed.content,
      subsetId:
        typeof parsed.subsetId === "number" && Number.isInteger(parsed.subsetId)
          ? parsed.subsetId
          : null,
      label: typeof parsed.label === "string" ? parsed.label : "",
      introduce: typeof parsed.introduce === "string" ? parsed.introduce : "",
      cover: typeof parsed.cover === "string" ? parsed.cover : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeLocalDraft(kind: string, draft: Omit<LocalDraft, "savedAt">): void {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      storageKey(kind),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
    );
  } catch {
    // 隐私模式或配额耗尽：本地兜底失败不能影响正常编辑
  }
}

export function clearLocalDraft(kind: string): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(storageKey(kind));
  } catch {
    // 忽略存储异常
  }
}

/** 只有真正写了内容才值得恢复，避免空表单反复弹提示 */
export function hasLocalDraftContent(draft: LocalDraft | null): draft is LocalDraft {
  if (!draft) return false;
  const plain = draft.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  return draft.title.trim().length > 0 || plain.length > 0 || /<img\b/i.test(draft.content);
}
