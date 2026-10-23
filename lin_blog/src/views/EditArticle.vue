<template>
    <div class="edit-article">
        <div class="edit-article-topbar">
            <div>
                <p class="edit-article-topbar-title">
                    {{ isEditing ? '编辑博客文章' : '新建博客文章' }}
                </p>
                <yk-text v-if="saveMoment" type="secondary">{{ saveMoment }}</yk-text>
            </div>
            <yk-space align="center">
                <yk-button type="secondary" @click="router.push('/article')">
                    返回列表
                </yk-button>
                <yk-button type="secondary" :loading="submitting === 'save'"
                    @click="submitArticle('save')" :disabled="!canEditCurrent">
                    保存
                </yk-button>
                <yk-button v-if="canPublish && article?.state !== 'published'"
                    :loading="submitting === 'publish'" @click="submitArticle('publish')"
                    :disabled="!canEditCurrent">
                    发布
                </yk-button>
                <yk-button v-if="canPublish && article?.state === 'published'"
                    type="secondary" :loading="submitting === 'withdraw'"
                    @click="submitArticle('withdraw')">
                    撤回
                </yk-button>
            </yk-space>
        </div>

        <div v-if="loading" class="edit-article-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载文章...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="edit-article-state">
            <yk-empty description="无法打开文章">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-space>
                    <yk-button type="secondary" @click="loadArticle">重新加载</yk-button>
                    <yk-button @click="router.push('/article')">返回列表</yk-button>
                </yk-space>
            </yk-empty>
        </div>

        <yk-space v-else class="edit-article-body">
            <editor v-model="content">
                <forms :classify="0" :initial-data="initialForm" @formData="handleFormData" />
            </editor>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
    ArticleItem,
    CreateArticleParams,
    UpdateArticleParams,
} from '../api/article'
import {
    createArticle,
    formatArticleLabels,
    getArticleById,
    getArticleErrorMessage,
    parseArticleLabels,
    updateArticle,
    updateArticleStatus,
} from '../api/article'
import editor from '../components/editor/editor.vue'
import forms from '../components/forms/forms.vue'
import { momentDay } from '../utils/moment'

type ArticleFormData = {
    title: string
    subsetId?: number
    subsetName?: string
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type SubmitAction = 'save' | 'publish' | 'withdraw'

type MessageProxy = {
    $message?: (options: {
        type: 'primary' | 'warning' | 'error' | 'success'
        message: string
    }) => void
}

const route = useRoute()
const router = useRouter()
const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined

const article = ref<ArticleItem | null>(null)
const form = ref<ArticleFormData | null>(null)
const content = ref('')
const loading = ref(false)
const errorMessage = ref('')
const saveMoment = ref('')
const submitting = ref<SubmitAction | ''>('')

const currentUser = (() => {
    try {
        const saved = localStorage.getItem('userInfo')
        return saved ? JSON.parse(saved) as { id?: number; user_type?: string } : null
    } catch {
        return null
    }
})()

const currentRole = currentUser?.user_type || ''
const articleId = computed(() => {
    const id = Number(route.params.id)
    return Number.isInteger(id) && id > 0 ? id : null
})
const isEditing = computed(() => articleId.value !== null)
const canPublish = computed(() => ['admin', 'editor'].includes(currentRole))
const canEditCurrent = computed(() => {
    if (!isEditing.value) {
        return ['admin', 'editor', 'normal'].includes(currentRole)
    }
    if (!article.value) return false
    if (['admin', 'editor'].includes(currentRole)) return true

    return currentRole === 'normal' &&
        Number(article.value.userId) === Number(currentUser?.id) &&
        ['draft', 'rejected'].includes(article.value.state)
})

const initialForm = computed<Partial<ArticleFormData>>(() => {
    if (!article.value) {
        return {
            title: '',
            subsetId: undefined,
            label: [],
            introduce: '',
            cover: '',
            classify: 0,
        }
    }

    return {
        title: article.value.title,
        subsetId: article.value.subsetId ?? undefined,
        subsetName: article.value.subsetName ?? undefined,
        label: parseArticleLabels(article.value.label),
        introduce: article.value.introduce ?? '',
        cover: article.value.cover ?? '',
        classify: 0,
    }
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

const handleFormData = (data: ArticleFormData): void => {
    form.value = data
}

const loadArticle = async (): Promise<void> => {
    if (!articleId.value) return

    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getArticleById(articleId.value)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '文章加载失败')
        }

        article.value = result.data
        content.value = result.data.content || ''
    } catch (error) {
        errorMessage.value = describeError(error, '文章加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const validateArticle = (): boolean => {
    if (!form.value?.title.trim()) {
        showMessage('warning', '请输入标题')
        return false
    }

    const plainContent = content.value
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .trim()

    if (!plainContent && !/<img\b/i.test(content.value)) {
        showMessage('warning', '请输入文章内容')
        return false
    }

    return true
}

const buildPayload = (): CreateArticleParams => {
    if (!form.value) {
        throw new Error('文章表单尚未准备好')
    }

    return {
        title: form.value.title.trim(),
        content: content.value,
        classify: 'article',
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce.trim(),
        cover: form.value.cover.trim(),
    }
}

const submitArticle = async (action: SubmitAction): Promise<void> => {
    if (submitting.value || !canEditCurrent.value) return
    if (!validateArticle()) return

    submitting.value = action

    try {
        const payload = buildPayload()

        if (!isEditing.value) {
            const created = await createArticle(payload)
            if (created.code !== 200 || !created.data?.articleId) {
                throw new Error(created.message || '文章创建失败')
            }

            const nextId = created.data.articleId

            if (action === 'publish') {
                const published = await updateArticleStatus(nextId, 'published')
                if (published.code !== 200) {
                    throw new Error(published.message || '文章发布失败')
                }
            }

            saveMoment.value = `${momentDay(new Date())} 已保存`
            showMessage('success', action === 'publish' ? '文章已发布' : '文章已保存为草稿')
            await router.push('/article')
            return
        }

        const id = articleId.value
        if (!id) throw new Error('文章ID无效')

        const updateData: UpdateArticleParams = {
            ...payload,
            ...(action === 'publish' ? { state: 'published' as const } : {}),
        }

        const updated = await updateArticle(id, updateData)
        if (updated.code !== 200) {
            throw new Error(updated.message || '文章保存失败')
        }

        if (action === 'withdraw') {
            const withdrawn = await updateArticleStatus(id, 'draft')
            if (withdrawn.code !== 200) {
                throw new Error(withdrawn.message || '文章撤回失败')
            }
        }

        saveMoment.value = `${momentDay(new Date())} 已保存`
        showMessage(
            'success',
            action === 'publish'
                ? '文章已发布'
                : action === 'withdraw'
                    ? '文章已撤回为草稿'
                    : '文章已保存'
        )
        await router.push('/article')
    } catch (error) {
        showMessage('error', describeError(error, '操作失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

onMounted(() => {
    if (isEditing.value) {
        void loadArticle()
    }
})
</script>

<style lang="less" scoped>
.edit-article {
    padding: @space-xl;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;

    &-topbar {
        width: 85%;
        border-radius: @radius-m;
        background: @bg-color-l;
        padding: @space-l @space-xl;
        margin-bottom: @space-l;
        display: flex;
        gap: @space-l;
        justify-content: space-between;
        align-items: center;

        &-title {
            .font-xl();
            font-weight: 600;
            user-select: none;
        }
    }

    &-body {
        width: 85%;
        border-radius: @radius-m;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    &-state {
        width: 85%;
        min-height: 320px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
        border-radius: @radius-m;
        background: @bg-color-l;
    }
}
</style>
