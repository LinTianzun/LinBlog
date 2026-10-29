// 前后台共用的评论数据契约与派生逻辑。
// 文章/图库走文章评论表，随笔走独立评论表，两侧字段略有差异，
// 这里统一成一份最小形状，展示层不再关心底层是哪张表。
// 前后台共用的评论数据契约与派生逻辑。
// 文章/图库走文章评论表，随笔走独立评论表，两侧字段略有差异，
// 这里统一成一份最小形状，展示层不再关心底层是哪张表。
//
// 这里的类型对具体评论类型保持泛型：两侧完整类型（带 replyToCommentId、isRead 等
// 私有字段）可以直接流入，不需要在调用处 as 掉类型，也不会丢失子类型信息。
export interface ContentComment {
    id: number
    userId: number
    userName: string | null
    userAvatar: string | null
    parentId: number
    replyToUserName?: string | null
    content: string
    likes: number
    liked: boolean
    complaint: number
    createdAt: string
}

export interface ContentCommentThread<T extends ContentComment = ContentComment> {
    root: T
    replies: T[]
}

export function isCommentOwner(
    comment: Pick<ContentComment, 'userId'>,
    currentUserId?: number | null
): boolean {
    return Boolean(
        currentUserId &&
        Number(comment.userId) === Number(currentUserId)
    )
}

/**
 * 组织评论树：一级按最新在前，二级按时间正序挂在所属评论下。
 * 前后台六处详情原本各自写了一遍这段逻辑，这里统一。
 */
export function buildCommentThreads<T extends ContentComment>(list: T[]): ContentCommentThread<T>[] {
    const roots = list.filter(item => !item.parentId)
    const replies = list.filter(item => item.parentId)

    return roots
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(root => ({
            root,
            replies: replies
                .filter(item => Number(item.parentId) === Number(root.id))
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        }))
}

// 回复目标展示：门户有 replyToUserName 字段直接展示；
// 后台随笔评论把「回复 @某人」拼进了 content，这里按缺失字段回落到隐藏。
export function formatCommentTime(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
}

export function formatCommentMoment(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
