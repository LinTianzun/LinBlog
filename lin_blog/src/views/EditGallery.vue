<template>
    <div class="edit-gallery">
        <div class="edit-gallery-topbar">
            <div class="edit-gallery-heading">
                <yk-space align="center" size="m">
                    <p class="edit-gallery-topbar-title">
                        {{ isEditing ? '编辑摄影图库' : '新建摄影图库' }}
                    </p>
                    <yk-tag v-if="stateLabel" :color="stateColor" shape="round">{{ stateLabel }}</yk-tag>
                    <yk-tag v-if="workflow?.hasUnpublishedChanges" shape="round" color="#d98716">
                        有未发布修改
                    </yk-tag>
                </yk-space>
                <div class="edit-gallery-save-state" :class="`is-${saveStatus}`" aria-live="polite">
                    <IconLoadingOutline v-if="saveStatus === 'saving'" />
                    <IconTickOutline v-else-if="saveStatus === 'saved'" />
                    <span>{{ workflowStatusText }}</span>
                    <button v-if="saveStatus === 'conflict'" type="button"
                        class="edit-gallery-retry" @click="openConflictCompare">
                        对比修改
                    </button>
                    <button v-else-if="saveStatus === 'error'" type="button"
                        class="edit-gallery-retry" @click="saveWorkingCopy('manual')">
                        重试
                    </button>
                </div>
            </div>
            <yk-space align="center" wrap>
                <yk-button type="secondary" @click="router.push('/gallery')">返回列表</yk-button>
                <yk-button v-if="isEditing" type="secondary" @click="previewOpen = true">
                    预览
                </yk-button>
                <yk-button v-if="isEditing" type="secondary" @click="versionPanelOpen = true">
                    版本历史
                </yk-button>
                <yk-button v-if="!isEditing && localDraftAvailable" type="secondary"
                    @click="discardLocalDraft">
                    丢弃本机草稿
                </yk-button>
                <yk-button type="secondary" :loading="submitting === 'save'" @click="submitGallery('save')"
                    :disabled="!canEditCurrent">
                    保存
                </yk-button>
                <yk-dropdown v-if="canPublish && isEditing && article?.state === 'published'"
                    title="定时发布" type="secondary" size="m" trigger="click"
                    @selected="handlePublishMenu">
                    <yk-dropdown-item value="schedule">安排发布时间</yk-dropdown-item>
                    <yk-dropdown-item v-if="workflow?.scheduledAt" value="cancel-schedule">
                        取消定时发布
                    </yk-dropdown-item>
                </yk-dropdown>
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

        <div v-if="workflow?.scheduledAt" class="edit-gallery-schedule-banner">
            <IconTimeOutline />
            <span>计划于 {{ formatWorkflowTime(workflow.scheduledAt) }} 自动发布</span>
            <button type="button" @click="cancelSchedule">取消</button>
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

        <yk-modal :model-value="previewOpen" :title="previewTitle || '发布前预览'" size="l"
            :show-footer="false" content-height="calc(100vh - 150px)"
            @update:model-value="previewOpen = $event">
            <div class="gallery-preview">
                <div class="gallery-preview-meta">
                    <span>{{ previewSubsetName || '未分类' }}</span>
                    <span>{{ previewStateLabel }}</span>
                    <span v-if="workflow?.scheduledAt">
                        {{ formatWorkflowTime(workflow.scheduledAt) }} 定时发布
                    </span>
                </div>
                <h1 class="gallery-preview-title">{{ previewTitle || '未命名图库' }}</h1>
                <p v-if="previewIntroduce" class="gallery-preview-introduce">{{ previewIntroduce }}</p>
                <div v-if="previewPhotos.length" class="gallery-preview-grid">
                    <img v-for="(photo, index) in previewPhotos" :key="`${photo}-${index}`" :src="photo"
                        :alt="`预览图 ${index + 1}`" loading="lazy" />
                </div>
                <yk-empty v-else description="还没有上传图片" />
                <div class="gallery-preview-actions">
                    <yk-button type="secondary" @click="previewOpen = false">返回编辑</yk-button>
                    <yk-button v-if="canPublish && article?.state === 'published'"
                        :loading="submitting === 'publish'" @click="publishCurrentWorkflow">
                        发布当前工作稿
                    </yk-button>
                </div>
            </div>
        </yk-modal>

        <SchedulePublishDialog v-model:open="scheduleOpen" v-model:value="scheduleValue"
            :scheduled-at="workflow?.scheduledAt ?? null" :loading="submitting === 'schedule'"
            :content-title="form?.title || article?.title || ''"
            @confirm="confirmSchedule" @cancel-schedule="cancelSchedule" />

        <ArticleVersionPanel v-model:open="versionPanelOpen" :article-id="articleId" classify="image"
            @restored="handleVersionRestored" />

        <ConflictCompareDialog :open="conflictOpen" :loading="conflictLoading"
            :error-message="conflictError" :report="conflictReport" classify="image"
            :adopting="adoptingRemote" :keeping="keepingLocal"
            @update:open="conflictOpen = $event" @retry="openConflictCompare"
            @adopt="adoptRemote" @keep="keepLocal" />
    </div>
</template>

<script lang="ts" setup>
import {
    computed,
    getCurrentInstance,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
    ArticleItem,
    ArticleWorkingCopy,
    ArticleWorkflowState,
    CreateArticleParams,
} from '../api/article'
import {
    cancelArticleSchedule,
    createArticle,
    formatArticleLabels,
    getArticleById,
    getArticleErrorMessage,
    getArticleStateLabel,
    getArticleWorkflow,
    parseArticleLabels,
    parseGalleryContent,
    publishArticleWorkflow,
    saveArticleDraft,
    scheduleArticlePublish,
    updateArticleStatus,
} from '../api/article'
import {
    AUTOSAVE_DELAY_MS,
    formatWorkflowTime,
    hasWorkflowChanges,
    isoToLocalDateTime,
    localDateTimeToIso,
    workflowSaveLabel,
    type WorkflowSaveStatus,
    type WorkflowSnapshot,
} from '../utils/articleWorkflow'
import { buildConflictReport, type ConflictReport } from '../utils/conflictCompare'
import editphoto from '../components/gallery/editPhoto.vue'
import forms from '../components/forms/forms.vue'
import { momentDay } from '../utils/moment'
import { useContentAccess } from '../utils/contentAccess.ts'
import { validateScheduleValue } from '../utils/scheduledPublish'
import {
    clearLocalDraft,
    hasLocalDraftContent,
    readLocalDraft,
    writeLocalDraft,
} from '../utils/localDraft'
import ArticleVersionPanel from '../components/article/ArticleVersionPanel.vue'
import ConflictCompareDialog from '../components/article/ConflictCompareDialog.vue'
import SchedulePublishDialog from '../components/article/SchedulePublishDialog.vue'

type GalleryFormData = {
    title: string
    subsetId?: number
    subsetName?: string
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type PhotoChangePayload = {
    photos: string[]
    cover: string
}

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
const workflow = ref<ArticleWorkflowState | null>(null)
// 表单初值只在加载/回滚时确定一次，避免自动保存后把用户输入覆盖回线上标题。
const loadedCopy = ref<ArticleWorkingCopy | null>(null)
const form = ref<GalleryFormData | null>(null)
const photos = ref<string[]>([])
const cover = ref('')
const loading = ref(false)
const errorMessage = ref('')
const saveMoment = ref('')
const submitting = ref<'save' | 'publish' | 'withdraw' | 'schedule' | ''>('')
const saveStatus = ref<WorkflowSaveStatus>('idle')
const lastSavedSnapshot = ref<WorkflowSnapshot | null>(null)
const versionPanelOpen = ref(false)
const previewOpen = ref(false)
const scheduleOpen = ref(false)
const scheduleValue = ref('')
const localDraftAvailable = ref(false)
const conflictOpen = ref(false)
const conflictLoading = ref(false)
const conflictError = ref('')
const conflictReport = ref<ConflictReport | null>(null)
const adoptingRemote = ref(false)
const keepingLocal = ref(false)

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let saveInFlight = false
let saveQueued = false
let applyingRemote = false
let mounted = false

const articleId = computed(() => {
    const id = Number(route.params.id)
    return Number.isInteger(id) && id > 0 ? id : null
})
const isEditing = computed(() => articleId.value !== null)
const access = useContentAccess('gallery')
const canPublish = access.canPublish
const canEditCurrent = computed(() => {
    if (!isEditing.value) return access.canCreate.value
    return access.canEdit(article.value)
})
const stateLabel = computed(() => isEditing.value && article.value
    ? getArticleStateLabel(article.value.state)
    : '草稿')
const stateColor = computed(() => {
    if (article.value?.state === 'published') return '#1f9d63'
    if (article.value?.state === 'rejected') return '#d84a3a'
    return '#2b5aed'
})

// 初值必须来自工作稿：已发布图库存在未发布修改时，若用线上 content，
// 编辑区会显示线上图片而不是工作稿，下一次自动保存还会把工作稿覆盖回线上版本。
const initialPhotos = computed(() => parseGalleryContent(loadedCopy.value?.content))
const initialCover = computed(() => loadedCopy.value?.cover || initialPhotos.value[0] || '')

const initialForm = computed<Partial<GalleryFormData>>(() => {
    const source = loadedCopy.value
    if (!source) {
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
        title: source.title,
        subsetId: source.subsetId ?? undefined,
        subsetName: article.value?.subsetName ?? undefined,
        label: parseArticleLabels(source.label),
        introduce: source.introduce ?? '',
        cover: source.cover ?? '',
        classify: 1,
    }
})

const previewTitle = computed(() => form.value?.title?.trim() || '')
const previewIntroduce = computed(() => form.value?.introduce?.trim() || '')
const previewSubsetName = computed(() => form.value?.subsetName || '')
const previewStateLabel = computed(() => stateLabel.value)
const previewPhotos = computed(() => photos.value)

const currentSnapshot = computed<WorkflowSnapshot | null>(() => {
    if (!form.value) return null
    return {
        title: form.value.title,
        content: JSON.stringify(photos.value),
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce,
        cover: cover.value,
    }
})

const workflowStatusText = computed(() => {
    if (!isEditing.value) {
        if (saveStatus.value === 'saving') return '正在暂存到本机...'
        if (saveStatus.value === 'dirty') return '有未保存修改'
        if (localDraftAvailable.value) return '本机草稿已暂存，创建后转为云端自动保存'
        return '内容会自动暂存在本机，创建后转为云端自动保存'
    }
    if (workflow.value?.scheduledAt) {
        return `${formatWorkflowTime(workflow.value.scheduledAt)} 定时发布`
    }
    return workflowSaveLabel(
        saveStatus.value,
        workflow.value?.savedAt || article.value?.updatedAt
    )
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

function clearAutosaveTimer(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = null
}

function scheduleAutosave(): void {
    if (!mounted || !isEditing.value || !canEditCurrent.value || applyingRemote) return
    if (conflictOpen.value) return
    clearAutosaveTimer()
    autosaveTimer = setTimeout(() => void saveWorkingCopy('autosave'), AUTOSAVE_DELAY_MS)
}

function persistLocalDraft(): void {
    if (!currentSnapshot.value || !form.value) return
    const snapshot = currentSnapshot.value
    saveStatus.value = 'saving'
    writeLocalDraft('gallery-new', {
        title: form.value.title,
        content: JSON.stringify(photos.value),
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce,
        cover: cover.value,
    })
    localDraftAvailable.value = true
    lastSavedSnapshot.value = {
        ...snapshot,
        title: snapshot.title.trim(),
        introduce: snapshot.introduce.trim(),
        cover: snapshot.cover.trim(),
    }
    saveStatus.value = 'saved'
}

function restoreLocalDraft(): void {
    const draft = readLocalDraft('gallery-new')
    if (!hasLocalDraftContent(draft)) return

    const confirmed = window.confirm(
        `检测到 ${formatWorkflowTime(draft.savedAt)} 暂存在本机的未发布图库，是否恢复？`
    )
    if (!confirmed) return

    applyingRemote = true
    loadedCopy.value = {
        title: draft.title,
        subsetId: draft.subsetId,
        classify: 'image',
        label: draft.label,
        introduce: draft.introduce,
        content: draft.content,
        cover: draft.cover,
        state: 'draft',
    }
    photos.value = parseGalleryContent(draft.content)
    cover.value = draft.cover || photos.value[0] || ''
    localDraftAvailable.value = true
    saveStatus.value = 'dirty'
    void nextTick(() => {
        applyingRemote = false
    })
}

function discardLocalDraft(): void {
    const confirmed = window.confirm('丢弃本机暂存图库？此操作不可恢复。')
    if (!confirmed) return

    clearLocalDraft('gallery-new')
    localDraftAvailable.value = false
    saveStatus.value = 'idle'
    showMessage('primary', '已丢弃本机草稿')
}

function buildPayload(): CreateArticleParams {
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

async function saveWorkingCopy(source: 'autosave' | 'manual'): Promise<boolean> {
    if (!isEditing.value || !articleId.value || !canEditCurrent.value) return false
    if (saveInFlight) {
        saveQueued = true
        return false
    }
    if (!currentSnapshot.value) return false

    const snapshot = currentSnapshot.value
    if (
        source === 'autosave' &&
        lastSavedSnapshot.value &&
        !hasWorkflowChanges(snapshot, lastSavedSnapshot.value)
    ) {
        saveStatus.value = 'saved'
        return true
    }

    saveInFlight = true
    saveStatus.value = 'saving'
    clearAutosaveTimer()

    try {
        const result = await saveArticleDraft(articleId.value, {
            ...buildPayload(),
            revision: workflow.value?.revision,
            source,
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '工作稿保存失败')
        }

        if (workflow.value) {
            workflow.value = {
                ...workflow.value,
                revision: result.data.revision,
                savedAt: result.data.savedAt,
                hasUnpublishedChanges: result.data.hasUnpublishedChanges,
            }
        }
        lastSavedSnapshot.value = {
            ...snapshot,
            title: snapshot.title.trim(),
            introduce: snapshot.introduce.trim(),
            cover: snapshot.cover.trim(),
        }
        saveStatus.value = 'saved'
        saveMoment.value = `${momentDay(new Date())} 已保存`
        return true
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status
        saveStatus.value = status === 409 ? 'conflict' : 'error'
        if (source === 'manual') {
            showMessage('error', describeError(error, '保存失败，请稍后重试'))
        }
        return false
    } finally {
        saveInFlight = false
        if (saveQueued) {
            saveQueued = false
            scheduleAutosave()
        }
    }
}

const loadGallery = async (): Promise<void> => {
    if (!articleId.value) return

    loading.value = true
    errorMessage.value = ''
    applyingRemote = true

    try {
        const [articleResult, workflowResult] = await Promise.all([
            getArticleById(articleId.value),
            getArticleWorkflow(articleId.value),
        ])
        if (articleResult.code !== 200 || !articleResult.data) {
            throw new Error(articleResult.message || '图库加载失败')
        }
        if (workflowResult.code !== 200 || !workflowResult.data) {
            throw new Error(workflowResult.message || '工作稿加载失败')
        }

        article.value = articleResult.data
        workflow.value = workflowResult.data
        loadedCopy.value = workflowResult.data.workingCopy
        photos.value = parseGalleryContent(workflowResult.data.workingCopy.content)
        cover.value = workflowResult.data.workingCopy.cover || photos.value[0] || ''
        lastSavedSnapshot.value = {
            title: workflowResult.data.workingCopy.title,
            content: workflowResult.data.workingCopy.content,
            subsetId: workflowResult.data.workingCopy.subsetId,
            label: workflowResult.data.workingCopy.label,
            introduce: workflowResult.data.workingCopy.introduce,
            cover: workflowResult.data.workingCopy.cover,
        }
        saveStatus.value = 'saved'

        await nextTick()
        applyingRemote = false
    } catch (error) {
        applyingRemote = false
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

const submitGallery = async (action: 'save' | 'publish' | 'withdraw'): Promise<void> => {
    if (submitting.value) return
    if (!canEditCurrent.value) return
    if (!validateGallery()) return

    submitting.value = action

    try {
        if (!isEditing.value) {
            const payload = buildPayload()
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
            clearLocalDraft('gallery-new')
            localDraftAvailable.value = false
            showMessage('success', action === 'publish' ? '图库已发布' : '图库已保存为草稿')
            //  保存后留在当前页并进入编辑态，让用户看到最新状态标识
            await router.replace(`/editgallery/${nextId}`)
            await loadGallery()
            return
        }

        const id = articleId.value
        if (!id) throw new Error('图库ID无效')

        if (action === 'publish' && article.value?.state === 'published') {
            await publishCurrentWorkflow()
            return
        }

        const saved = await saveWorkingCopy('manual')
        if (!saved) return

        if (action === 'publish') {
            const published = await updateArticleStatus(id, 'published')
            if (published.code !== 200) {
                throw new Error(published.message || '图库发布失败')
            }
            showMessage('success', '图库已发布')
            await loadGallery()
            return
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
            action === 'withdraw' ? '图库已撤回为草稿' : '图库已保存'
        )
        await loadGallery()
        return
    } catch (error) {
        showMessage('error', describeError(error, '操作失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

async function publishCurrentWorkflow(): Promise<void> {
    if (!articleId.value || submitting.value) return
    submitting.value = 'publish'
    try {
        const saved = await saveWorkingCopy('manual')
        if (!saved) return
        const result = await publishArticleWorkflow(articleId.value)
        if (result.code !== 200) throw new Error(result.message || '发布失败')
        previewOpen.value = false
        showMessage('success', '当前工作稿已发布')
        await loadGallery()
    } catch (error) {
        showMessage('error', describeError(error, '发布失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

function handlePublishMenu(value: string | number): void {
    if (value === 'schedule') {
        // 无计划时空着让用户选预设；改期则预填当前计划时间
        scheduleValue.value = workflow.value?.scheduledAt
            ? isoToLocalDateTime(workflow.value.scheduledAt)
            : ''
        scheduleOpen.value = true
        return
    }
    if (value === 'cancel-schedule') void cancelSchedule()
}

async function confirmSchedule(): Promise<void> {
    if (!articleId.value || submitting.value) return
    const validation = validateScheduleValue(scheduleValue.value)
    if (!validation.ok) {
        showMessage('warning', validation.message)
        return
    }
    const iso = localDateTimeToIso(scheduleValue.value)
    if (!iso) return

    submitting.value = 'schedule'
    try {
        const saved = await saveWorkingCopy('manual')
        if (!saved) return
        const result = await scheduleArticlePublish(articleId.value, iso)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '定时发布安排失败')
        }
        if (workflow.value) {
            workflow.value = { ...workflow.value, scheduledAt: result.data.scheduledAt }
        }
        scheduleOpen.value = false
        showMessage('success', `已安排于 ${formatWorkflowTime(result.data.scheduledAt)} 发布`)
    } catch (error) {
        showMessage('error', describeError(error, '定时发布安排失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

async function cancelSchedule(): Promise<void> {
    if (!articleId.value || submitting.value) return
    submitting.value = 'schedule'
    try {
        const result = await cancelArticleSchedule(articleId.value)
        if (result.code !== 200) throw new Error(result.message || '取消定时发布失败')
        if (workflow.value) {
            workflow.value = { ...workflow.value, scheduledAt: null }
        }
        showMessage('success', '已取消定时发布')
    } catch (error) {
        showMessage('error', describeError(error, '取消定时发布失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

async function handleVersionRestored(revision: number): Promise<void> {
    versionPanelOpen.value = false
    showMessage('success', `已恢复为版本工作稿（修订 #${revision}）`)
    await loadGallery()
}

async function openConflictCompare(): Promise<void> {
    if (!articleId.value || !currentSnapshot.value) return
    conflictOpen.value = true
    conflictError.value = ''
    conflictLoading.value = true
    try {
        const result = await getArticleWorkflow(articleId.value)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '工作稿读取失败')
        }
        conflictReport.value = buildConflictReport({
            base: lastSavedSnapshot.value,
            local: currentSnapshot.value,
            remote: result.data.workingCopy,
            classify: 'image',
            remoteRevision: result.data.revision,
            remoteSavedAt: result.data.savedAt,
        })
    } catch (error) {
        conflictError.value = describeError(error, '对方工作稿读取失败，请稍后重试')
    } finally {
        conflictLoading.value = false
    }
}

async function adoptRemote(): Promise<void> {
    if (adoptingRemote.value || keepingLocal.value) return
    adoptingRemote.value = true
    try {
        conflictOpen.value = false
        await loadGallery()
        showMessage('success', '已采用对方版本')
    } finally {
        adoptingRemote.value = false
    }
}

async function keepLocal(): Promise<void> {
    if (!articleId.value || !currentSnapshot.value || keepingLocal.value) return
    if (adoptingRemote.value) return
    const remoteRevision = conflictReport.value?.remoteRevision
    if (!remoteRevision) {
        conflictError.value = '缺少对方修订号，请关闭后重新对比'
        return
    }

    keepingLocal.value = true
    try {
        const result = await saveArticleDraft(articleId.value, {
            ...buildPayload(),
            revision: remoteRevision,
            source: 'manual',
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '工作稿保存失败')
        }
        const snapshot = currentSnapshot.value
        if (workflow.value) {
            workflow.value = {
                ...workflow.value,
                revision: result.data.revision,
                savedAt: result.data.savedAt,
                hasUnpublishedChanges: result.data.hasUnpublishedChanges,
            }
        }
        lastSavedSnapshot.value = {
            ...snapshot,
            title: snapshot.title.trim(),
            introduce: snapshot.introduce.trim(),
            cover: snapshot.cover.trim(),
        }
        saveStatus.value = 'saved'
        saveMoment.value = `${momentDay(new Date())} 已保存`
        conflictOpen.value = false
        showMessage('success', '已保留本窗口修改并覆盖对方')
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 409) {
            // 对方在我方覆盖前又保存了一版：重新拉取最新工作稿刷新对比
            conflictError.value = '对方刚刚又保存了新版本，已刷新为最新差异'
            await openConflictCompare()
        } else {
            conflictError.value = describeError(error, '保存失败，请稍后重试')
        }
    } finally {
        keepingLocal.value = false
    }
}

watch(
    currentSnapshot,
    (snapshot) => {
        if (!snapshot || applyingRemote || !mounted) return
        if (!canEditCurrent.value) return

        if (!isEditing.value) {
            clearAutosaveTimer()
            if (!lastSavedSnapshot.value || hasWorkflowChanges(snapshot, lastSavedSnapshot.value)) {
                saveStatus.value = 'dirty'
                autosaveTimer = setTimeout(persistLocalDraft, AUTOSAVE_DELAY_MS)
            }
            return
        }

        if (hasWorkflowChanges(snapshot, lastSavedSnapshot.value)) {
            saveStatus.value = 'dirty'
            scheduleAutosave()
        }
    },
    { deep: true }
)

function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (saveStatus.value === 'dirty' || saveStatus.value === 'saving') {
        event.preventDefault()
        event.returnValue = ''
    }
}

onMounted(() => {
    mounted = true
    window.addEventListener('beforeunload', handleBeforeUnload)
    if (isEditing.value) {
        void loadGallery()
    } else {
        restoreLocalDraft()
    }
})

onBeforeUnmount(() => {
    mounted = false
    clearAutosaveTimer()
    window.removeEventListener('beforeunload', handleBeforeUnload)
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

    &-heading {
        min-width: 0;
    }

    &-save-state {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        font-size: @size-s;
        color: @font-color-s;

        .yk-icon {
            width: 15px;
            height: 15px;
        }

        &.is-saved {
            color: var(--scolor);
        }

        &.is-conflict,
        &.is-error {
            color: var(--ecolor);
        }
    }

    &-retry {
        border: none;
        background: transparent;
        color: @pcolor;
        cursor: pointer;
        font-size: @size-s;
    }

    &-schedule-banner {
        width: 85%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: @space-l;
        padding: 10px 16px;
        border: 1px solid color-mix(in srgb, var(--pcolor) 22%, transparent);
        border-radius: @radius-s;
        background: color-mix(in srgb, var(--pcolor2) 38%, transparent);
        color: @font-color-m;
        font-size: @size-s;

        .yk-icon {
            color: @pcolor;
        }

        button {
            margin-left: auto;
            border: none;
            background: transparent;
            color: @pcolor;
            cursor: pointer;
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
        &-topbar,
        &-schedule-banner {
            width: 92%;
        }

        &-topbar {
            align-items: flex-start;
            flex-direction: column;
        }

        &-body {
            width: 92%;
            flex-direction: column;
        }

        &-body-tag {
            width: 100%;
        }
    }
}

.gallery-preview {
    max-width: 900px;
    margin: 0 auto;
    padding-bottom: @space-xl;

    &-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        color: @font-color-s;
        font-size: @size-s;
    }

    &-title {
        margin: @space-m 0 0;
        font-size: 30px;
        line-height: 1.35;
        color: @font-color-l;
    }

    &-introduce {
        margin: @space-m 0 @space-xl;
        padding-bottom: @space-l;
        border-bottom: 1px solid @line-color-s;
        color: @font-color-m;
        line-height: 1.8;
    }

    &-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 12px;

        img {
            width: 100%;
            height: 180px;
            object-fit: cover;
            border-radius: @radius-s;
            background: @bg-color-s;
        }
    }

    &-actions {
        display: flex;
        justify-content: flex-end;
        gap: @space-m;
        margin-top: @space-xl;
        padding-top: @space-l;
        border-top: 1px solid @line-color-s;
    }
}

</style>
