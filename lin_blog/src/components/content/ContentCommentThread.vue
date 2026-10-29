<!--
    单条评论（含其二级回复）：前台与后台的文章 / 图库 / 随笔详情共用。
    前后台共用的部分是：头像、作者行、时间与点赞、正文、回复操作、举报/删除菜单，
    以及二级回复的浅底 + 左侧强调线排版；差异部分用插槽留给调用方。
-->
<template>
    <div class="cc-thread">
        <yk-avatar :size="avatarSize" :img-url="root.userAvatar || undefined" class="cc-avatar" />
        <div class="cc-main">
            <div class="cc-head">
                <div class="cc-author-line">
                    <span class="cc-user">{{ root.userName || authorFallback }}</span>
                    <span v-if="isReply" class="cc-reply-to">
                        回复 {{ root.replyToUserName || '该用户' }}
                    </span>
                </div>
                <div class="cc-head-right">
                    <slot name="badges" />
                    <time>{{ formatCommentTime(root.createdAt) }}</time>
                    <button v-if="canLike" type="button" class="cc-like" :class="{ liked: root.liked }"
                        :disabled="likeBusy" :title="likeTitle" @click="emit('like')">
                        <IconLikeFill v-if="root.liked" />
                        <IconLikeOutline v-else />
                        {{ root.likes }}
                    </button>
                </div>
            </div>

            <p class="cc-content">{{ root.content }}</p>

            <div class="cc-actions">
                <div class="cc-actions-left">
                    <button v-if="canReply" type="button" class="cc-action" @click="emit('reply')">
                        <IconCommentOutline />回复
                    </button>
                    <button v-if="replies.length" type="button" class="cc-action is-toggle"
                        @click="emit('toggle')">
                        <template v-if="expanded">
                            <IconUpOutline />收起回复
                        </template>
                        <template v-else>
                            <IconDownOutline />展开 {{ replies.length }} 条回复
                        </template>
                    </button>
                    <slot name="actions-left" />
                </div>

                <yk-popover v-if="canReport || canDelete" :open="menuOpen" trigger="click"
                    placement="bottomRight" :arrow="false" overlay-class="cc-action-popover"
                    @update:open="(open: boolean) => emit('update:menuOpen', open)">
                    <button type="button" class="cc-more" title="更多操作" aria-label="更多操作">
                        <IconMoreOutline />
                    </button>
                    <template #popover>
                        <div class="cc-menu">
                            <button v-if="canReport" type="button" @click="emit('report')">
                                <IconWarningOutline />举报
                            </button>
                            <button v-if="canDelete" type="button" :disabled="!canConfirmDelete"
                                :class="{ 'is-danger': deleteConfirming }" @click="emit('delete')">
                                <IconDeleteOutline />
                                {{ deleteConfirming ? '确认删除' : '删除' }}
                            </button>
                        </div>
                    </template>
                </yk-popover>
            </div>

            <slot name="composer" />

            <div v-if="replies.length && expanded" class="cc-replies">
                <div v-for="reply in replies" :key="reply.id" class="cc-reply">
                    <yk-avatar :size="26" :img-url="reply.userAvatar || undefined" />
                    <div class="cc-reply-body">
                        <div class="cc-head">
                            <div class="cc-author-line">
                                <span class="cc-user">{{ reply.userName || authorFallback }}</span>
                                <span class="cc-reply-to">
                                    回复 {{ reply.replyToUserName || root.userName || '该用户' }}
                                </span>
                            </div>
                            <div class="cc-head-right">
                                <time>{{ formatCommentTime(reply.createdAt) }}</time>
                                <button v-if="canLike" type="button" class="cc-like"
                                    :class="{ liked: reply.liked }" :disabled="isReplyLikeBusy(reply.id)"
                                    :title="likeTitle" @click="emit('like-reply', reply.id)">
                                    <IconLikeFill v-if="reply.liked" />
                                    <IconLikeOutline v-else />
                                    {{ reply.likes }}
                                </button>
                            </div>
                        </div>
                        <p class="cc-content">{{ reply.content }}</p>
                        <div class="cc-actions is-reply">
                            <button v-if="canReply" type="button" class="cc-action"
                                @click="emit('reply-to', reply.id)">
                                <IconCommentOutline />回复
                            </button>
                            <yk-popover v-if="canReport || canDelete" :open="replyMenuOpen === reply.id"
                                trigger="click" placement="bottomRight" :arrow="false"
                                overlay-class="cc-action-popover"
                                @update:open="(open: boolean) => emit('update:replyMenuOpen', { id: reply.id, open })">
                                <button type="button" class="cc-more" title="更多操作" aria-label="更多操作">
                                    <IconMoreOutline />
                                </button>
                        <template #popover>
                            <div class="cc-menu">
                                <button v-if="canReport" type="button"
                                            @click="emit('report-reply', reply.id)">
                                            <IconWarningOutline />举报
                                        </button>
                                        <button v-if="canDelete" type="button"
                                            :disabled="!canDeleteReply(reply.id)"
                                            :class="{ 'is-danger': deleteConfirmingReplyId === reply.id }"
                                            @click="emit('delete-reply', reply.id)">
                                            <IconDeleteOutline />
                                            {{ deleteConfirmingReplyId === reply.id ? '确认删除' : '删除' }}
                                        </button>
                                    </div>
                                </template>
                            </yk-popover>
                        </div>
                <slot name="reply-composer" :reply="reply" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import {
    IconCommentOutline,
    IconDownOutline,
    IconLikeFill,
    IconLikeOutline,
    IconMoreOutline,
    IconUpOutline,
    IconWarningOutline,
    IconDeleteOutline,
} from '@yike-design/ui/es/components/svg-icon'
import { formatCommentTime, type ContentComment } from './comment.ts'

// 对具体评论类型保持泛型：门户的 PortalComment / DiaryComment 传进来后
// 仍是原类型，调用方处理点赞/举报时不需要再断言。
withDefaults(defineProps<{
    root: ContentComment
    replies: ContentComment[]
    expanded?: boolean
    isReply?: boolean
    avatarSize?: number
    authorFallback?: string
    // 能力与状态由外部按权限矩阵判定，组件只负责排版
    canLike?: boolean
    canReply?: boolean
    canReport?: boolean
    canDelete?: boolean
    canConfirmDelete?: boolean
    deleteConfirming?: boolean
    deleteConfirmingReplyId?: number | null
    canDeleteReply?: (id: number) => boolean
    isReplyLikeBusy?: (id: number) => boolean
    likeBusy?: boolean
    likeTitle?: string
    menuOpen?: boolean
    replyMenuOpen?: number | null
}>(), {
    expanded: false,
    isReply: false,
    avatarSize: 36,
    authorFallback: '匿名用户',
    canLike: false,
    canReply: false,
    canReport: false,
    canDelete: false,
    canConfirmDelete: true,
    deleteConfirming: false,
    deleteConfirmingReplyId: null,
    canDeleteReply: () => true,
    isReplyLikeBusy: () => false,
    likeBusy: false,
    likeTitle: '',
    menuOpen: false,
    replyMenuOpen: null,
})

defineSlots<{
    badges?: () => unknown
    'actions-left'?: () => unknown
    composer?: () => unknown
    'reply-composer'?: (props: { reply: ContentComment }) => unknown
}>()

const emit = defineEmits<{
    (e: 'toggle'): void
    (e: 'reply'): void
    (e: 'reply-to', id: number): void
    (e: 'like'): void
    (e: 'like-reply', id: number): void
    (e: 'report'): void
    (e: 'report-reply', id: number): void
    (e: 'delete'): void
    (e: 'delete-reply', id: number): void
    (e: 'update:menuOpen', value: boolean): void
    (e: 'update:replyMenuOpen', value: { id: number; open: boolean }): void
}>()
</script>

<style lang="less" scoped>
.cc-thread {
    display: flex;
    gap: 12px;
    padding: 16px 0;
    color: var(--cc-ink, var(--admin-ink, var(--gray)));

    & + & {
        border-top: 1px solid var(--cc-line, var(--admin-line, var(--gray1)));
    }
}

.cc-main {
    flex: 1;
    min-width: 0;
}

.cc-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.cc-author-line {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    min-width: 0;
    align-items: baseline;
    gap: 8px;
}

.cc-user {
    font-size: 14px;
    font-weight: 600;
    color: var(--cc-ink, var(--admin-ink, var(--gray)));
}

.cc-reply-to {
    font-size: 12px;
    color: var(--cc-muted, var(--admin-muted, var(--gray6)));
}

.cc-head-right {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    margin-left: auto;

    time {
        font-size: 12px;
        color: var(--cc-muted, var(--admin-muted, var(--gray6)));
        font-variant-numeric: tabular-nums;
    }
}

.cc-like {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--cc-muted, var(--admin-muted, var(--gray6)));
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;

    .yk-icon {
        width: 13px;
        height: 13px;
    }

    &:hover:not(:disabled) {
        border-color: var(--cc-accent, var(--admin-accent, var(--pcolor)));
        color: var(--cc-accent, var(--admin-accent, var(--pcolor)));
    }

    &.liked {
        border-color: var(--cc-accent, var(--admin-accent, var(--pcolor)));
        background: var(--cc-accent-soft, var(--admin-accent-soft, var(--pcolor2)));
        color: var(--cc-accent, var(--admin-accent, var(--pcolor)));
        font-weight: 600;
    }

    &.busy,
    &:disabled {
        cursor: progress;
        opacity: 0.65;
    }
}

.cc-content {
    margin: 6px 0 0;
    font-size: 14.5px;
    line-height: 1.8;
    color: var(--cc-body, var(--admin-body, var(--gray8)));
    word-break: break-word;
}

.cc-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 24px;
    margin-top: 8px;

    // 二级回复同样把三点菜单推到右侧，与一级评论对齐
    &.is-reply {
        justify-content: space-between;
    }
}

.cc-actions-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.cc-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cc-accent, var(--admin-accent, var(--pcolor)));
    font-size: 12.5px;
    cursor: pointer;
    transition: color 0.2s ease, opacity 0.2s ease;

    .yk-icon {
        width: 13px;
        height: 13px;
    }

    &:hover {
        opacity: 0.76;
    }
}

.cc-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--cc-muted, var(--admin-muted, var(--gray6)));
    cursor: pointer;
    transition: color 0.2s ease, background-color 0.2s ease;

    .yk-icon {
        width: 17px;
        height: 17px;
    }

    &:hover {
        background: var(--cc-soft, var(--admin-surface-soft, var(--bgColor2)));
        color: var(--cc-ink, var(--admin-ink, var(--gray)));
    }
}

// 二级回复：浅底 + 左侧强调线，比独立卡片更轻
.cc-replies {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
    padding: 12px 14px 12px 16px;
    border-left: 2px solid var(--cc-accent, var(--admin-accent, var(--pcolor)));
    border-radius: 0 12px 12px 0;
    background: var(--cc-soft, var(--admin-surface-soft, var(--bgColor2)));
}

.cc-reply {
    display: flex;
    gap: 8px;

    & + & {
        padding-top: 12px;
        border-top: 1px dashed var(--cc-line, var(--admin-line, var(--gray1)));
    }
}

.cc-reply-body {
    flex: 1;
    min-width: 0;
}
</style>

<style lang="less">
.cc-action-popover {
    padding: 0 !important;
}

.cc-menu {
    display: flex;
    flex-direction: column;
    min-width: 92px;
    padding: 4px;

    button {
        display: flex;
        align-items: center;
        gap: 7px;
        width: 100%;
        padding: 7px 9px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--cc-body, var(--admin-body, var(--gray8)));
        font-size: 13px;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;

        .yk-icon {
            width: 14px;
            height: 14px;
        }

        &:hover:not(:disabled) {
            background: var(--cc-soft, var(--admin-surface-soft, var(--bgColor2)));
            color: var(--cc-accent, var(--admin-accent, var(--pcolor)));
        }

        &.is-danger {
            color: var(--ecolor, #d2463a);
        }

        &:disabled {
            color: var(--cc-muted, var(--admin-muted, var(--gray6)));
            cursor: not-allowed;
            opacity: 0.5;
        }
    }
}
</style>
