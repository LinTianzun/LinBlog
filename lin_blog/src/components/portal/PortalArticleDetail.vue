<template>
    <yk-modal :model-value="open" :title="article?.title || '文章详情'" size="xl" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="article" class="detail-content">
            <div class="detail-meta">
                <span v-if="article.subsetName" class="meta-chip">{{ article.subsetName }}</span>
                <time>{{ formatArticleDate(article.publishedAt || article.createdAt) }}</time>
                <span><IconEyeOutline />{{ article.views }}</span>
                <span><IconLikeOutline />{{ article.likes }}</span>
            </div>
            <img v-if="article.cover" class="detail-cover" :src="article.cover" :alt="article.cover" />
            <div class="detail-html" v-html="article.content"></div>

            <div class="comment-section">
                <div class="section-title">
                    评论
                    <yk-tag type="info">{{ comments.length }} 条</yk-tag>
                </div>
                <div v-if="!comments.length" class="empty-comments">还没有评论，来抢沙发吧。</div>
                <div v-for="comment in comments" :key="comment.id" class="comment-item">
                    <yk-avatar :size="36" :img-url="comment.userAvatar || undefined" />
                    <div class="comment-main">
                        <div class="comment-head">
                            <span class="comment-user">{{ comment.userName || '匿名用户' }}</span>
                            <time>{{ formatDateTime(comment.createdAt) }}</time>
                        </div>
                        <p class="comment-content">{{ comment.content }}</p>
                    </div>
                </div>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { formatArticleDate, type ArticleItem } from '../../api/article'
import { getPublicComments, type PortalComment } from '../../api/portal'

const props = defineProps<{
    open: boolean
    article: ArticleItem | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()
const comments = ref<PortalComment[]>([])

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const formatDateTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

watch(
    () => [props.open, props.article?.id] as const,
    async ([open, articleId]) => {
        comments.value = []
        if (!open || !articleId) return
        try {
            const result = await getPublicComments(articleId)
            if (result.code === 200) comments.value = result.data?.list || []
        } catch {
            // 评论区加载失败不打断正文展示
        }
    },
    { immediate: true }
)
</script>

<style lang="less" scoped>
.detail-content {
    // 滚动交给 yk-modal 自身的 scrollbar，避免嵌套双滚动条
    padding-right: 4px;
}

.detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 14px;
    color: @font-color-s;
    font-size: @size-s;

    .meta-chip {
        padding: 2px 10px;
        border-radius: 999px;
            background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

.detail-cover {
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 18px;
}

.detail-html {
    font-size: 15px;
    line-height: 1.85;
    color: @font-color-l;
    word-break: break-word;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
        margin: 1.6em 0 0.6em;
        font-family: var(--portal-serif);
        font-weight: 600;
        line-height: 1.4;
        color: @font-color-l;

        &:first-child {
            margin-top: 0;
        }
    }

    :deep(h1) {
        font-size: 24px;
    }

    :deep(h2) {
        font-size: 21px;
    }

    :deep(h3) {
        font-size: 18px;
    }

    :deep(p) {
        margin: 0 0 1em;
    }

    :deep(a) {
        color: @pcolor;
    }

    :deep(blockquote) {
        margin: 1.2em 0;
        padding: 4px 0 4px 16px;
        border-left: 3px solid @pcolor;
        color: @font-color-m;
    }

    :deep(code) {
        padding: 2px 5px;
        border-radius: 3px;
        background: @bg-color-s;
        font-size: 0.92em;
    }

    :deep(img) {
        max-width: 100%;
        border-radius: 8px;
    }

    :deep(pre) {
        padding: 12px;
        border-radius: 8px;
        background: @bg-color-s;
        overflow-x: auto;

        code {
            padding: 0;
            background: transparent;
        }
    }
}

.comment-section {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid @line-color-s;

    .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        font-size: 15px;
        font-weight: 600;
        color: @font-color-l;
    }

    .empty-comments {
        padding: 18px 0;
        color: @font-color-s;
        font-size: @size-s;
    }
}

.comment-item {
    display: flex;
    gap: 12px;
    padding: 12px 0;

    & + .comment-item {
        border-top: 1px solid @line-color-s;
    }

    .comment-main {
        flex: 1;
        min-width: 0;
    }

    .comment-head {
        display: flex;
        align-items: baseline;
        gap: 10px;

        .comment-user {
            font-weight: 600;
            color: @font-color-l;
        }

        time {
            font-size: @size-ss;
            color: @font-color-s;
        }
    }

    .comment-content {
        margin: 4px 0 0;
        color: @font-color-m;
        line-height: 1.7;
        word-break: break-word;
    }
}
</style>
