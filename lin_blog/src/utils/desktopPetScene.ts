export type PetReactionKind =
  | 'article-published'
  | 'gallery-published'
  | 'article-saved'
  | 'gallery-saved'
  | 'save-failed'
  | 'publish-failed'
  | 'new-message'
  | 'new-comment'
  | 'comment-posted'
  | 'login'
  | 'logout'
  | 'settings-saved'
  | 'vitals-updated'

export interface PetReactionPayload {
  kind: PetReactionKind
  message?: string
  count?: number
  /** 气泡旁的操作按钮，点击后跳转到对应页面 */
  actionPath?: string
  actionLabel?: string
}

const REACTION_EVENT = 'linblog:pet-reaction'

/** 业务页面只负责广播发生了什么，具体动作与文案由桌宠决定 */
export function emitPetReaction(
  kind: PetReactionKind,
  options: Omit<PetReactionPayload, 'kind'> = {}
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<PetReactionPayload>(REACTION_EVENT, {
      detail: { kind, ...options }
    })
  )
}

export function onPetReaction(
  handler: (payload: PetReactionPayload) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<PetReactionPayload>).detail
    if (detail?.kind) handler(detail)
  }
  window.addEventListener(REACTION_EVENT, listener)
  return () => window.removeEventListener(REACTION_EVENT, listener)
}

/** 新评论轮询上次看到的位置；按浏览器保存，避免刷新后重复提醒 */
export const PET_LAST_COMMENT_KEY = 'LINBLOG_PET_LAST_COMMENT_ID'
export const PET_COMMENT_POLL_INTERVAL = 60_000

