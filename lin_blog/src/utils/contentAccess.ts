import { computed } from 'vue'
import { useSessionStore } from '../store/session'

/**
 * 内容类模块（文章 / 摄影图库 / 随笔）的前端权限判定。
 *
 * 后端在 `serve/config/accessControl.js` 里为三类内容各定义了
 * create / manageOwn / manageAll / publish 权限，前端按同一份语义判定，
 * 不再用 user_type === 'admin' 这类角色硬编码。
 */
export type ContentKind = 'article' | 'gallery' | 'diary'

// 只依赖归属与状态，避免调用方为了判定权限去拼完整的数据结构
export interface ContentItemLike {
  userId?: number | null
  state?: string | null
}

export function readCurrentUserId(): number | null {
  try {
    const saved = localStorage.getItem('userInfo')
    const user = saved ? (JSON.parse(saved) as { id?: number | string }) : null
    const id = Number(user?.id)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function useContentAccess(kind: ContentKind) {
  const session = useSessionStore()

  const canViewAll = computed(() => session.can(`${kind}.viewAll`))
  const canCreate = computed(() => session.can(`${kind}.create`))
  const canManageOwn = computed(() => session.can(`${kind}.manageOwn`))
  const canManageAll = computed(() => session.can(`${kind}.manageAll`))
  // 随笔没有审核状态，后端也没有 diary.publish 权限
  const canPublish = computed(() => kind !== 'diary' && session.can(`${kind}.publish`))

  const isOwn = (item?: ContentItemLike | null): boolean => {
    const currentUserId = readCurrentUserId()
    if (!currentUserId) return false
    return Number(item?.userId) === currentUserId
  }

  // 没有发布权限时不能改动已上线内容，只能继续改草稿或被驳回的稿子
  const isDraftLike = (item?: ContentItemLike | null): boolean =>
    kind === 'diary' || ['draft', 'rejected'].includes(String(item?.state ?? ''))

  const canEdit = (item?: ContentItemLike | null): boolean => {
    if (canManageAll.value) return true
    if (!canManageOwn.value || !isOwn(item)) return false
    return canPublish.value || isDraftLike(item)
  }

  const canDelete = (item?: ContentItemLike | null): boolean => {
    if (canManageAll.value) return true
    return canManageOwn.value && isOwn(item)
  }

  return {
    canViewAll,
    canCreate,
    canManageOwn,
    canManageAll,
    canPublish,
    isOwn,
    canEdit,
    canDelete,
  }
}
