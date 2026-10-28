<template>
    <div class="edit-gallery">
        <div class="edit-gallery-topbar">
            <div>
                <yk-space align="center" size="m">
                    <p class="edit-gallery-topbar-title">
                        {{ isEditing ? '编辑摄影图库' : '新建摄影图库' }}
                    </p>
                    <yk-tag v-if="stateLabel" :color="stateColor" shape="round">{{ stateLabel }}</yk-tag>
                </yk-space>
                <yk-text v-if="saveMoment" type="secondary">{{ saveMoment }}</yk-text>
            </div>
            <yk-space align="center">
                <yk-button type="secondary" @click="router.push('/gallery')">返回列表</yk-button>
                <yk-button type="secondary" :loading="submitting === 'save'" @click="submitGallery('save')">
                    保存
                </yk-button>
                <yk-button v-if="canPublish && article?.state !== 'published'"
                    :loading="submitting === 'publish'" @click="submitGallery('publish')">
                    发布
                </yk-button>
                <yk-button v-if="canPublish && article?.state === 'published'" type="secondary"
                    :loading="submitting === 'withdraw'" @click="submitGallery('withdraw')">
                    撤回
                </yk-button>
            </yk-space>
        </div>

        <div v-if="loading" class="edit-gallery-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载图库...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="edit-gallery-state">
            <yk-empty description="无法打开图库">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-space>
                    <yk-button type="secondary" @click="loadGallery">重新加载</yk-button>
                    <yk-button @click="router.push('/gallery')">返回列表</yk-button>
                </yk-space>
            </yk-empty>
        </div>

        <div v-else class="edit-gallery-body">
            <editphoto ref="photoRef" :initial-photos="initialPhotos" :initial-cover="initialCover"
                class="edit-gallery-body-photos" @change="handlePhotosChange" />
            <div class="edit-gallery-body-tag">
                <forms :classify="1" :initial-data="initialForm" @formData="handleFormData" />
            </div>
        </div>
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
    parseGalleryContent,
    updateArticle,
    updateArticleStatus,
} from '../api/article'
import { getArticleStateLabel } from '../api/article'
import editphoto from '../components/gallery/editPhoto.vue'
import forms from '../components/forms/forms.vue'
import { momentDay } from '../utils/moment'
import { useContentAccess } from '../utils/contentAccess.ts'

type GalleryFormData = {
    title: string
    subsetId?: number
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type PhotoChangePayload = {
    photos: string[]
    cover: string
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
const form = ref<GalleryFormData | null>(null)
const photos = ref<string[]>([])
const cover = ref('')
const loading = ref(false)
const errorMessage = ref('')
const saveMoment = ref('')
const submitting = ref<SubmitAction | ''>('')

const articleId = computed(() => {
    const id = Number(route.params.id)
    return Number.isInteger(id) && id > 0 ? id : null
})
const isEditing = computed(() => articleId.value !== null)
const access = useContentAccess('gallery')
const canPublish = access.canPublish
const stateLabel = computed(() => isEditing.value && article.value
    ? getArticleStateLabel(article.value.state)
    : '草稿')
const stateColor = computed(() => {
    if (article.value?.state === 'published') return '#1f9d63'
    if (article.value?.state === 'rejected') return '#d84a3a'
    return '#2b5aed'
})

const initialPhotos = computed(() => parseGalleryContent(article.value?.content))
const initialCover = computed(() => article.value?.cover || initialPhotos.value[0] || '')

const initialForm = computed<Partial<GalleryFormData>>(() => {
    if (!article.value) {
        return {
            title: '',
            subsetId: undefined,
            label: [],
            introduce: '',
            cover: '',
            classify: 1,
        }
    }

    return {
        title: article.value.title,
        subsetId: article.value.subsetId ?? undefined,
        label: parseArticleLabels(article.value.label),
        introduce: article.value.introduce ?? '',
        cover: article.value.cover ?? '',
        classify: 1,
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

const handleFormData = (data: GalleryFormData): void => {
    form.value = data
}

const handlePhotosChange = (payload: PhotoChangePayload): void => {
    photos.value = payload.photos
    cover.value = payload.cover
}

const loadGallery = async (): Promise<void> => {
    if (!articleId.value) return

    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getArticleById(articleId.value)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '图库加载失败')
        }

        article.value = result.data
        photos.value = parseGalleryContent(result.data.content)
        cover.value = result.data.cover || photos.value[0] || ''
    } catch (error) {
        errorMessage.value = describeError(error, '图库加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const validateGallery = (): boolean => {
    if (!form.value?.title.trim()) {
        showMessage('warning', '请输入标题')
        return false
    }

    if (photos.value.length === 0) {
        showMessage('warning', '请至少上传一张图片')
        return false
    }

    return true
}

const buildPayload = (): CreateArticleParams => {
    if (!form.value) {
        throw new Error('图库表单尚未准备好')
    }

    return {
        title: form.value.title.trim(),
        content: JSON.stringify(photos.value),
        classify: 'image',
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce.trim(),
        cover: cover.value || photos.value[0] || '',
    }
}

const submitGallery = async (action: SubmitAction): Promise<void> => {
    if (submitting.value) return
    if (!validateGallery()) return

    submitting.value = action

    try {
        const payload = buildPayload()

        if (!isEditing.value) {
            const created = await createArticle(payload)
            if (created.code !== 200 || !created.data?.articleId) {
                throw new Error(created.message || '图库创建失败')
            }

            const nextId = created.data.articleId

            if (action === 'publish') {
                const published = await updateArticleStatus(nextId, 'published')
                if (published.code !== 200) {
                    throw new Error(published.message || '图库发布失败')
                }
            }

            saveMoment.value = `${momentDay(new Date())} 已保存`
            showMessage('success', action === 'publish' ? '图库已发布' : '图库已保存为草稿')
            //  保存后留在当前页并进入编辑态，让用户看到最新状态标识
            await router.replace(`/editgallery/${nextId}`)
            await loadGallery()
            return
        }

        const id = articleId.value
        if (!id) throw new Error('图库ID无效')

        const updateData: UpdateArticleParams = {
            ...payload,
            ...(action === 'publish' ? { state: 'published' as const } : {}),
        }

        const updated = await updateArticle(id, updateData)
        if (updated.code !== 200) {
            throw new Error(updated.message || '图库保存失败')
        }

        if (action === 'withdraw') {
            const withdrawn = await updateArticleStatus(id, 'draft')
            if (withdrawn.code !== 200) {
                throw new Error(withdrawn.message || '图库撤回失败')
            }
        }

        saveMoment.value = `${momentDay(new Date())} 已保存`
        showMessage(
            'success',
            action === 'publish'
                ? '图库已发布'
                : action === 'withdraw'
                    ? '图库已撤回为草稿'
                    : '图库已保存'
        )
        await loadGallery()
        return
    } catch (error) {
        showMessage('error', describeError(error, '操作失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

onMounted(() => {
    if (isEditing.value) {
        void loadGallery()
    }
})
</script>

<style lang="less" scoped>
.edit-gallery {
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
        display: flex;
        align-items: stretch;
        gap: @space-l;

        &-photos {
            min-width: 0;
            flex: 1 1 auto;
        }

        &-tag {
            width: clamp(320px, 31%, 420px);
            background: @bg-color-l;
            border-radius: @radius-m;
            flex: none;
            display: flex;
            padding: @space-l @space-xl;
            align-self: stretch;
            border: 1px solid var(--admin-line, transparent);
            box-shadow: var(--admin-shadow-sm, none);

            :deep(.forms) {
                width: 100%;
            }
        }
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

    @media (max-width: 900px) {
        &-body {
            width: 92%;
            flex-direction: column;
        }

        &-body-tag {
            width: 100%;
        }
    }
}
</style>
