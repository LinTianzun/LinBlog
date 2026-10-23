<template>
    <yk-modal :model-value="props.modelValue" size="xl" title="文章详情" :show-footer="false"
        :closeable="true" content-height="calc(100vh - 148px)" @update:model-value="handleVisibleChange">
        <div class="article-detail">
            <div v-if="loading" class="article-detail-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在加载文章...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="article-detail-state">
                <yk-empty description="文章加载失败">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-space>
                        <yk-button type="secondary" @click="loadArticle">重新加载</yk-button>
                        <yk-button @click="closeModal">关闭</yk-button>
                    </yk-space>
                </yk-empty>
            </div>

            <article v-else-if="article" class="article-detail-article">
                <header class="article-detail-hero" :class="{ 'is-text-only': !article.cover }">
                    <div class="article-detail-heading">
                        <div class="article-detail-kicker">
                            <yk-tag :class="`state-${article.state}`">{{ stateLabel }}</yk-tag>
                            <span>{{ subsetName }}</span>
                            <span class="article-detail-dot"></span>
                            <span>{{ articleDate }}</span>
                        </div>

                        <h1>{{ article.title }}</h1>
                        <p v-if="article.introduce" class="article-detail-introduce">
                            {{ article.introduce }}
                        </p>

                        <yk-space v-if="labels.length" wrap size="s" class="article-detail-labels">
                            <yk-tag v-for="label in labels" :key="label" shape="round">
                                {{ label }}
                            </yk-tag>
                        </yk-space>
                    </div>

                    <div v-if="article.cover" class="article-detail-cover">
                        <yk-image :src="article.cover" width="100%" height="220" fit="cover"
                            :preview="true" :is-lazy="true" />
                    </div>
                </header>

                <div class="article-detail-actions">
                    <div class="article-detail-metrics">
                        <span><IconEyeOutline />{{ article.views }} 次浏览</span>
                        <span><IconLikeOutline />{{ article.likes }} 次点赞</span>
                        <span><IconCommentOutline />{{ article.comments }} 条评论</span>
                    </div>

                    <yk-space size="s" wrap>
                        <yk-button v-if="canEdit" type="secondary" @click="openEditor">
                            编辑
                        </yk-button>
                        <yk-button v-if="canPublish && article.state !== 'published'"
                            :loading="statusUpdating" @click="changeState('published')">
                            发布
                        </yk-button>
                        <yk-button v-if="canPublish && article.state === 'published'"
                            type="secondary" :loading="statusUpdating" @click="changeState('draft')">
                            撤回
                        </yk-button>
                        <yk-popconfirm v-if="canDelete" placement="bottomRight" trigger="click"
                            title="确认删除" content="删除将不可恢复" @confirm="removeArticle">
                            <yk-button type="secondary">删除</yk-button>
                        </yk-popconfirm>
                    </yk-space>
                </div>

                <div class="article-detail-layout">
                    <div class="article-detail-content" v-html="safeContent"></div>

                    <aside class="article-detail-aside">
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">所属分类</span>
                            <strong>{{ subsetName }}</strong>
                        </div>
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">创建时间</span>
                            <strong>{{ formatArticleDate(article.createdAt) }}</strong>
                        </div>
                        <div v-if="article.publishedAt" class="article-detail-info">
                            <span class="article-detail-info-label">发布时间</span>
                            <strong>{{ formatArticleDate(article.publishedAt) }}</strong>
                        </div>
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">文章状态</span>
                            <strong>{{ stateLabel }}</strong>
                        </div>
                    </aside>
                </div>
            </article>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import type { ArticleItem, ArticleState } from '../api/article'
import {
    deleteArticle,
    formatArticleDate,
    getArticleById,
    getArticleErrorMessage,
    getArticleStateLabel,
    parseArticleLabels,
    updateArticleStatus,
} from '../api/article'
import { useSubsetStore } from '../store/subset'

type Props = {
    modelValue?: boolean
    articleId?: number | null
}

type DetailChangedEvent = {
    type: 'updated' | 'deleted'
    articleId: number
}

type MessageProxy = {
    $message?: (options: {
        type: 'primary' | 'warning' | 'error' | 'success'
        message: string
    }) => void
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: false,
    articleId: null,
})

const emits = defineEmits<{
    'update:modelValue': [value: boolean]
    changed: [event: DetailChangedEvent]
}>()

const router = useRouter()
const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const subsetStore = useSubsetStore()

const article = ref<ArticleItem | null>(null)
const loading = ref(false)
const statusUpdating = ref(false)
const errorMessage = ref('')

const currentUser = (() => {
    try {
        const saved = localStorage.getItem('userInfo')
        return saved ? JSON.parse(saved) as { id?: number; user_type?: string } : null
    } catch {
        return null
    }
})()

const currentRole = currentUser?.user_type || ''
const stateLabel = computed(() => getArticleStateLabel(article.value?.state))
const labels = computed(() => parseArticleLabels(article.value?.label))
const articleDate = computed(() => formatArticleDate(
    article.value?.publishedAt || article.value?.createdAt
))
const subsetName = computed(
    () => article.value?.subsetName ||
        subsetStore.subsetName(article.value?.subsetId ?? undefined) ||
        '未分类'
)
const canPublish = computed(() => ['admin', 'editor'].includes(currentRole))
const canEdit = computed(() => {
    if (!article.value) return false
    if (['admin', 'editor'].includes(currentRole)) return true
    return currentRole === 'normal' &&
        Number(article.value.userId) === Number(currentUser?.id) &&
        ['draft', 'rejected'].includes(article.value.state)
})
const canDelete = computed(() => {
    if (!article.value) return false
    if (['admin', 'editor'].includes(currentRole)) return true
    return currentRole === 'normal' &&
        Number(article.value.userId) === Number(currentUser?.id)
})
const safeContent = computed(() => {
    const html = article.value?.content || '<p>暂无正文</p>'
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
    })
})

const showMessage = (
    type: 'primary' | 'warning' | 'error' | 'success',
    message: string
): void => {
    proxy?.$message?.({ type, message })
}

const describeError = (error: unknown, fallback: string): string => {
    const responseMessage = getArticleErrorMessage(error, '')
    if (responseMessage) return responseMessage
    return error instanceof Error && error.message ? error.message : fallback
}

const closeModal = (): void => {
    emits('update:modelValue', false)
}

const handleVisibleChange = (visible: boolean): void => {
    emits('update:modelValue', visible)
}

const loadArticle = async (): Promise<void> => {
    const id = Number(props.articleId)
    if (!Number.isInteger(id) || id <= 0) {
        article.value = null
        errorMessage.value = '文章ID无效'
        return
    }

    loading.value = true
    errorMessage.value = ''
    article.value = null

    try {
        const result = await getArticleById(id)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '文章加载失败')
        }
        article.value = result.data
    } catch (error) {
        errorMessage.value = describeError(error, '文章加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const openEditor = (): void => {
    if (!article.value) return
    const id = article.value.id
    closeModal()
    void router.push(`/editarticle/${id}`)
}

const changeState = async (state: ArticleState): Promise<void> => {
    if (!article.value || statusUpdating.value) return

    statusUpdating.value = true
    try {
        const result = await updateArticleStatus(article.value.id, state)
        if (result.code !== 200) {
            throw new Error(result.message || '文章状态修改失败')
        }
        showMessage('success', result.message || '文章状态已更新')
        emits('changed', { type: 'updated', articleId: article.value.id })
        await loadArticle()
    } catch (error) {
        showMessage('error', describeError(error, '状态修改失败，请稍后重试'))
    } finally {
        statusUpdating.value = false
    }
}

const removeArticle = async (): Promise<void> => {
    if (!article.value) return
    const id = article.value.id

    try {
        const result = await deleteArticle(id)
        if (result.code !== 200) {
            throw new Error(result.message || '文章删除失败')
        }
        showMessage('success', '文章已删除')
        emits('changed', { type: 'deleted', articleId: id })
        closeModal()
    } catch (error) {
        showMessage('error', describeError(error, '文章删除失败，请稍后重试'))
    }
}

watch(
    [() => props.modelValue, () => props.articleId],
    ([visible, articleId]) => {
        if (visible && articleId) {
            void loadArticle()
        }
    },
    { immediate: true }
)
</script>

<style lang="less" scoped>
.article-detail {
    min-height: 360px;

    &-state {
        min-height: 360px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-article {
        display: flex;
        flex-direction: column;
        gap: @space-xl;
    }

    &-hero {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(240px, 340px);
        gap: clamp(24px, 4vw, 56px);
        align-items: center;
        overflow: hidden;
        padding: clamp(28px, 4vw, 52px);
        border-radius: 24px;
        background:
            radial-gradient(circle at 92% 4%, rgba(43, 90, 237, 0.2), transparent 38%),
            linear-gradient(135deg, #f7f9ff 0%, @bg-color-l 56%, #eef3ff 100%);

        &::after {
            content: "";
            position: absolute;
            right: -70px;
            bottom: -120px;
            width: 280px;
            height: 280px;
            border: 1px solid rgba(43, 90, 237, 0.16);
            border-radius: 50%;
            pointer-events: none;
        }

        &.is-text-only {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    &-heading {
        position: relative;
        z-index: 1;
        min-width: 0;

        h1 {
            margin: @space-l 0 @space-m;
            color: @font-color-l;
            font-size: clamp(30px, 4.4vw, 52px);
            line-height: 1.16;
            letter-spacing: -0.02em;
            overflow-wrap: anywhere;
        }
    }

    &-kicker {
        display: flex;
        flex-wrap: wrap;
        gap: @space-s;
        align-items: center;
        color: @font-color-s;
        font-size: @size-s;
        letter-spacing: 0.04em;
    }

    &-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: @font-color-s;
        opacity: 0.5;
    }

    &-introduce {
        max-width: 760px;
        .font-m();
        color: @font-color-s;
        line-height: 1.85;
        overflow-wrap: anywhere;
    }

    &-labels {
        margin-top: @space-l;
    }

    &-cover {
        position: relative;
        z-index: 1;
        overflow: hidden;
        border-radius: 18px;
        background: @bg-color-s;
        box-shadow: 0 22px 50px rgba(21, 38, 79, 0.16);
    }

    &-actions {
        display: flex;
        gap: @space-l;
        align-items: center;
        justify-content: space-between;
        padding-bottom: @space-l;
        border-bottom: 1px solid @line-color-m;
    }

    &-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: @space-l;
        color: @font-color-s;
        font-size: @size-s;

        span {
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }

        .yk-icon {
            width: 16px;
            height: 16px;
        }
    }

    &-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 210px;
        gap: clamp(28px, 5vw, 72px);
        align-items: start;
    }

    &-content {
        min-width: 0;
        color: @font-color-l;
        font-size: 16px;
        line-height: 1.9;
        overflow-wrap: anywhere;

        :deep(> :first-child) {
            margin-top: 0;
        }

        :deep(h1),
        :deep(h2),
        :deep(h3),
        :deep(h4) {
            margin: 1.6em 0 0.65em;
            color: @font-color-l;
            line-height: 1.35;
        }

        :deep(p) {
            margin: 0 0 1.15em;
        }

        :deep(img),
        :deep(video) {
            max-width: 100%;
            height: auto;
            margin: @space-l 0;
            border-radius: @radius-m;
        }

        :deep(pre) {
            overflow-x: auto;
            padding: @space-l;
            border-radius: @radius-m;
            background: #151b2b;
            color: #eef2ff;
        }

        :deep(code) {
            padding: 2px 6px;
            border-radius: 6px;
            background: @bg-color-s;
            font-size: 0.9em;
        }

        :deep(pre code) {
            padding: 0;
            background: transparent;
        }

        :deep(blockquote) {
            margin: @space-l 0;
            padding: @space-m @space-l;
            border-left: 4px solid @pcolor;
            background: @bg-color-s;
            color: @font-color-s;
        }

        :deep(a) {
            color: @pcolor;
        }
    }

    &-aside {
        position: sticky;
        top: 0;
        display: flex;
        flex-direction: column;
        gap: @space-l;
        padding: @space-l;
        border-radius: @radius-m;
        background: @bg-color-s;
    }

    &-info {
        display: flex;
        flex-direction: column;
        gap: 6px;

        strong {
            color: @font-color-l;
            font-size: @size-m;
            font-weight: 500;
            overflow-wrap: anywhere;
        }

        &-label {
            color: @font-color-s;
            font-size: @size-s;
        }
    }

    .state-published {
        color: #1f8a5b;
        background: rgba(31, 157, 99, 0.12);
    }

    .state-rejected {
        color: #c63e32;
        background: rgba(218, 80, 66, 0.12);
    }
}

@media (max-width: 900px) {
    .article-detail {
        &-hero,
        &-layout {
            grid-template-columns: minmax(0, 1fr);
        }

        &-cover {
            order: -1;
            width: 100%;
        }

        &-actions {
            align-items: flex-start;
            flex-direction: column;
        }

        &-aside {
            position: static;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
}

@media (max-width: 560px) {
    .article-detail {
        &-hero {
            padding: @space-l;
        }

        &-aside {
            grid-template-columns: minmax(0, 1fr);
        }
    }
}
</style>
