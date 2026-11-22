export type UpgradeIntent = {
  noteId: number;
  articleId: number;
  title: string;
  snippet: string;
};

const STORAGE_KEY = "linblog.note-upgrade";
// 意图只服务一次发布的收尾：刷新或关掉标签页后不应再触发跳转
const TTL_MS = 30 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function clearUpgradeIntent(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // 清理失败只影响下一次提示的读取
  }
}

export function markUpgradeIntent(intent: UpgradeIntent): void {
  try {
    storage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...intent, savedAt: Date.now() })
    );
  } catch {
    // 本机存储不可用时只失去自动回链提示，不影响发布
  }
}

/** 只读同一篇笔记、同一篇文章的意图，避免误跳到另一次升级会话 */
export function readUpgradeIntent(
  noteId: number,
  articleId: number
): UpgradeIntent | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UpgradeIntent> & {
      savedAt?: number;
    };
    if (Date.now() - Number(parsed.savedAt || 0) > TTL_MS) return null;
    if (Number(parsed.noteId) !== noteId || Number(parsed.articleId) !== articleId) {
      return null;
    }
    if (typeof parsed.snippet !== "string") return null;
    return {
      noteId,
      articleId,
      title: typeof parsed.title === "string" ? parsed.title : "这篇文章",
      snippet: parsed.snippet,
    };
  } catch {
    return null;
  }
}
