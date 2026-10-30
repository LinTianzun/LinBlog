<template>
    <div class="edit-article">
        <div class="edit-article-topbar">
            <div class="edit-article-heading">
                <yk-space align="center" size="m" wrap>
                    <p class="edit-article-topbar-title">
                        {{ isEditing ? '编辑博客文章' : '新建博客文章' }}
                    </p>
                    <yk-tag v-if="stateLabel" :color="stateColor" shape="round">
                        {{ stateLabel }}
                    </yk-tag>
                    <yk-tag v-if="workflow?.hasUnpublishedChanges" shape="round" color="#d98716">
                        有未发布修改
                    </yk-tag>
                </yk-space>
                <div class="edit-article-save-state" :class="`is-${saveStatus}`" aria-live="polite">
                    <IconLoadingOutline v-if="saveStatus === 'saving'" />
                    <IconTickOutline v-else-if="saveStatus === 'saved'" />
                    <span>{{ workflowStatusText }}</span>
                    <button v-if="saveStatus === 'conflict'" type="button"
                        class="edit-article-retry" @click="reloadForConflict">
                        重新加载
                    </button>
                    <button v-else-if="saveStatus === 'error'" type="button"
                        class="edit-article-retry" @click="saveWorkingCopy('manual')">
                        重试
                    </button>
                </div>
            </div>
            <yk-space align="center" wrap>
                <yk-button type="secondary" @click="router.push('/article')">
                    返回列表
                </yk-button>
                <yk-button v-if="isEditing" type="secondary" @click="openPreview">
                    预览
                </yk-button>
                <yk-button v-if="isEditing" type="secondary" @click="versionPanelOpen = true">
                    版本历史
                </yk-button>
                <yk-button v-if="!isEditing && localDraftAvailable" type="secondary"
                    @click="discardLocalDraft">
                    丢弃本机草稿
                </yk-button>
                <yk-button type="secondary" :loading="submitting === 'save'"
                    @click="submitArticle('save')" :disabled="!canEditCurrent">
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

        <div v-if="workflow?.scheduledAt" class="edit-article-schedule-banner">
            <IconTimeOutline />
            <span>计划于 {{ formatWorkflowTime(workflow.scheduledAt) }} 自动发布</span>
            <button type="button" @click="cancelSchedule">取消</button>
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

        <yk-modal :model-value="previewOpen" :title="previewTitle || '发布前预览'" size="l"
            :show-footer="false" content-height="calc(100vh - 150px)"
            @update:model-value="previewOpen = $event">
            <div class="article-preview">
                <div class="article-preview-meta">
                    <span>{{ previewSubsetName || '未分类' }}</span>
                    <span>{{ previewStateLabel }}</span>
                    <span v-if="workflow?.scheduledAt">
                        {{ formatWorkflowTime(workflow.scheduledAt) }} 定时发布
                    </span>
                </div>
                <h1 class="article-preview-title">{{ previewTitle || '未命名文章' }}</h1>
                <p v-if="previewIntroduce" class="article-preview-introduce">
                    {{ previewIntroduce }}
                </p>
                <div class="article-preview-content" v-html="previewHtml"></div>
                <div class="article-preview-actions">
                    <yk-button type="secondary" @click="previewOpen = false">返回编辑</yk-button>
                    <yk-button v-if="canPublish && article?.state === 'published'"
                        :loading="submitting === 'publish'" @click="publishCurrentWorkflow">
                        发布当前工作稿
                    </yk-button>
                </div>
            </div>
        </yk-modal>

        <yk-modal :model-value="scheduleOpen" title="安排定时发布" size="s" :show-footer="false"
            @update:model-value="scheduleOpen = $event">
            <div class="schedule-dialog">
                <p class="schedule-dialog-hint">
                    到点后自动应用当前工作稿并发布。建议先预览，再安排时间。
                </p>
                <label class="schedule-dialog-label">
                    <span>发布时间</span>
                    <input v-model="scheduleValue" type="datetime-local" class="schedule-dialog-input" />
                </label>
                <div class="schedule-dialog-actions">
                    <yk-button type="secondary" @click="scheduleOpen = false">取消</yk-button>
                    <yk-button :loading="submitting === 'schedule'" @click="confirmSchedule">
                        确认安排
                    </yk-button>
                </div>
            </div>
        </yk-modal>

        <ArticleVersionPanel v-model:open="versionPanelOpen" :article-id="articleId"
            @restored="handleVersionRestored" />
    </div>
</template>

<script lang="ts" setup>
import {
    computed,
    defineAsyncComponent,
    getCurrentInstance,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
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
    publishArticleWorkflow,
    saveArticleDraft,
    scheduleArticlePublish,
    updateArticleStatus,
} from '../api/article'
import {
    AUTOSAVE_DELAY_MS,
    defaultScheduleValue,
    formatWorkflowTime,
    hasWorkflowChanges,
    localDateTimeToIso,
    workflowSaveLabel,
    type WorkflowSaveStatus,
    type WorkflowSnapshot,
} from '../utils/articleWorkflow'
import { optimizeRichContentImages } from '../utils/imageOptimization'
import { momentDay } from '../utils/moment'
import { useContentAccess } from '../utils/contentAccess.ts'
import {
    clearLocalDraft,
    hasLocalDraftContent,
    readLocalDraft,
    writeLocalDraft,
} from '../utils/localDraft'
import ArticleVersionPanel from '../components/article/ArticleVersionPanel.vue'

const editor = defineAsyncComponent(() => import('../components/editor/editor.vue'))
import forms from '../components/forms/forms.vue'

type ArticleFormData = {
    title: string
    subsetId?: number
    subsetName?: string
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type SubmitAction = 'save' | 'publish' | 'withdraw' | 'schedule'

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
// 表单初值只在加载/回滚时确定一次：若直接依赖 workflow，自动保存成功后会
// 重新求值 initialForm，把用户刚输入的内容覆盖回线上标题。
const loadedCopy = ref<ArticleWorkingCopy | null>(null)
const form = ref<ArticleFormData | null>(null)
const content = ref('')
const loading = ref(false)
const errorMessage = ref('')
const saveMoment = ref('')
const submitting = ref<SubmitAction | ''>('')
const saveStatus = ref<WorkflowSaveStatus>('idle')
const lastSavedSnapshot = ref<WorkflowSnapshot | null>(null)
const versionPanelOpen = ref(false)
const previewOpen = ref(false)
const scheduleOpen = ref(false)
const scheduleValue = ref(defaultScheduleValue())
const localDraftAvailable = ref(false)

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
const access = useContentAccess('article')
const canPublish = access.canPublish
const canEditCurrent = computed(() => {
    if (!isEditing.value) return access.canCreate.value
    return access.canEdit(article.value)
})

const stateLabel = computed(() => {
    if (!isEditing.value) return '草稿'
    return article.value ? getArticleStateLabel(article.value.state) : ''
})
const stateColor = computed(() => {
    if (article.value?.state === 'published') return '#1f9d63'
    if (article.value?.state === 'rejected') return '#d84a3a'
    return '#2b5aed'
})

const initialForm = computed<Partial<ArticleFormData>>(() => {
    const source = loadedCopy.value
    if (!source) {
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
        title: source.title,
        subsetId: source.subsetId ?? undefined,
        subsetName: article.value?.subsetName ?? undefined,
        label: parseArticleLabels(source.label),
        introduce: source.introduce ?? '',
        cover: source.cover ?? '',
        classify: 0,
    }
})

const previewTitle = computed(() => form.value?.title?.trim() || '')
const previewIntroduce = computed(() => form.value?.introduce?.trim() || '')
const previewSubsetName = computed(() => form.value?.subsetName || '')
const previewStateLabel = computed(() => stateLabel.value)
const previewHtml = computed(() =>
    optimizeRichContentImages(
        DOMPurify.sanitize(content.value || '<p>暂无正文</p>', {
            USE_PROFILES: { html: true },
        })
    )
)

const currentSnapshot = computed<WorkflowSnapshot | null>(() => {
    if (!form.value) return null
    return {
        title: form.value.title,
        content: content.value,
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce,
        cover: form.value.cover,
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

const handleFormData = (data: ArticleFormData): void => {
    form.value = data
}

function clearAutosaveTimer(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = null
}

function scheduleAutosave(): void {
    if (!mounted || !isEditing.value || !canEditCurrent.value || applyingRemote) return
    clearAutosaveTimer()
    autosaveTimer = setTimeout(() => void saveWorkingCopy('autosave'), AUTOSAVE_DELAY_MS)
}

function persistLocalDraft(): void {
    if (!currentSnapshot.value || !form.value) return
    const snapshot = currentSnapshot.value
    saveStatus.value = 'saving'
    writeLocalDraft('article-new', {
        title: form.value.title,
        content: content.value,
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce,
        cover: form.value.cover,
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
    const draft = readLocalDraft('article-new')
    if (!hasLocalDraftContent(draft)) return

    const confirmed = window.confirm(
        `检测到 ${formatWorkflowTime(draft.savedAt)} 暂存在本机的未发布草稿，是否恢复？`
    )
    if (!confirmed) return

    applyingRemote = true
    loadedCopy.value = {
        title: draft.title,
        subsetId: draft.subsetId,
        classify: 'article',
        label: draft.label,
        introduce: draft.introduce,
        content: draft.content,
        cover: draft.cover,
        state: 'draft',
    }
    content.value = draft.content
    lastSavedSnapshot.value = null
    localDraftAvailable.value = true
    saveStatus.value = 'dirty'
    void nextTick(() => {
        applyingRemote = false
    })
}

function discardLocalDraft(): void {
    const confirmed = window.confirm('丢弃本机暂存草稿？此操作不可恢复。')
    if (!confirmed) return

    clearLocalDraft('article-new')
    localDraftAvailable.value = false
    saveStatus.value = 'idle'
    showMessage('primary', '已丢弃本机草稿')
}

function buildPayload(): CreateArticleParams {
    if (!form.value) throw new Error('文章表单尚未准备好')
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

async function loadArticle(): Promise<void> {
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
            throw new Error(articleResult.message || '文章加载失败')
        }
        if (workflowResult.code !== 200 || !workflowResult.data) {
            throw new Error(workflowResult.message || '工作稿加载失败')
        }

        article.value = articleResult.data
        workflow.value = workflowResult.data
        loadedCopy.value = workflowResult.data.workingCopy
        content.value = workflowResult.data.workingCopy.content || ''
        scheduleValue.value = defaultScheduleValue()
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
        errorMessage.value = describeError(error, '文章加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

function validateArticle(): boolean {
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

async function submitArticle(action: 'save' | 'publish' | 'withdraw'): Promise<void> {
    if (submitting.value || !canEditCurrent.value) return
    if (!validateArticle()) return

    submitting.value = action
    try {
        if (!isEditing.value) {
            const created = await createArticle(buildPayload())
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
            clearLocalDraft('article-new')
            localDraftAvailable.value = false
            showMessage('success', action === 'publish' ? '文章已发布' : '文章已保存为草稿')
            await router.push('/article')
            return
        }

        if (action === 'publish' && article.value?.state === 'published') {
            await publishCurrentWorkflow()
            return
        }

        const saved = await saveWorkingCopy('manual')
        if (!saved) return

        if (action === 'publish') {
            const published = await updateArticleStatus(articleId.value!, 'published')
            if (published.code !== 200) {
                throw new Error(published.message || '文章发布失败')
            }
            showMessage('success', '文章已发布')
            await loadArticle()
            return
        }

        if (action === 'withdraw') {
            const withdrawn = await updateArticleStatus(articleId.value!, 'draft')
            if (withdrawn.code !== 200) {
                throw new Error(withdrawn.message || '文章撤回失败')
            }
            showMessage('success', '文章已撤回为草稿')
            await loadArticle()
            return
        }

        showMessage('success', '文章已保存')
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
        await loadArticle()
    } catch (error) {
        showMessage('error', describeError(error, '发布失败，请稍后重试'))
    } finally {
        submitting.value = ''
    }
}

function openPreview(): void {
    if (!form.value) return
    previewOpen.value = true
}

function handlePublishMenu(value: string | number): void {
    if (value === 'schedule') {
        scheduleValue.value = defaultScheduleValue()
        scheduleOpen.value = true
        return
    }
    if (value === 'cancel-schedule') void cancelSchedule()
}

async function confirmSchedule(): Promise<void> {
    if (!articleId.value || submitting.value) return
    const iso = localDateTimeToIso(scheduleValue.value)
    if (!iso) {
        showMessage('warning', '请选择有效的发布时间')
        return
    }
    if (new Date(iso).getTime() < Date.now() + 60_000) {
        showMessage('warning', '发布时间至少需晚于当前时间 1 分钟')
        return
    }

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
    await loadArticle()
}

async function reloadForConflict(): Promise<void> {
    const confirmed = window.confirm(
        '其他窗口已保存更新的工作稿。重新加载会丢弃当前页面尚未保存的修改，是否继续？'
    )
    if (!confirmed) return
    await loadArticle()
}

watch(
    currentSnapshot,
    (snapshot) => {
        if (!snapshot || applyingRemote || !mounted) return
        if (!canEditCurrent.value) return

        if (!isEditing.value) {
            // 新建页没有后端 ID：先落本机草稿，保存成功后由提交逻辑清除
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
    if (isEditing.value) void loadArticle()
    else restoreLocalDraft()
})

onBeforeUnmount(() => {
    mounted = false
    clearAutosaveTimer()
    window.removeEventListener('beforeunload', handleBeforeUnload)
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

.article-preview {
    max-width: 760px;
    margin: 0 auto;
    padding-bottom: @space-xl;
}

.article-preview-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: @font-color-s;
    font-size: @size-s;
}

.article-preview-title {
    margin: @space-m 0 0;
    font-size: 32px;
    line-height: 1.35;
    color: @font-color-l;
}

.article-preview-introduce {
    margin: @space-m 0 @space-xl;
    padding-bottom: @space-l;
    border-bottom: 1px solid @line-color-s;
    color: @font-color-m;
    line-height: 1.8;
}

.article-preview-content {
    color: @font-color-l;
    line-height: 1.95;
    word-break: break-word;

    :deep(h1),
    :deep(h2),
    :deep(h3) {
        margin: 1.4em 0 0.6em;
        line-height: 1.4;
    }

    :deep(img) {
        display: block;
        max-width: 100%;
        height: auto;
        margin: @space-l auto;
        border-radius: @radius-s;
    }

    :deep(blockquote) {
        margin: @space-l 0;
        padding-left: @space-m;
        border-left: 3px solid @pcolor;
        color: @font-color-m;
    }

    :deep(pre) {
        padding: @space-m;
        overflow-x: auto;
        border-radius: @radius-s;
        background: @bg-color-s;
    }

    :deep(table) {
        width: 100%;
        border-collapse: collapse;

        th,
        td {
            padding: 8px 12px;
            border: 1px solid @line-color-s;
            text-align: left;
        }
    }
}

.article-preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: @space-m;
    margin-top: @space-xl;
    padding-top: @space-l;
    border-top: 1px solid @line-color-s;
}

.schedule-dialog {
    display: flex;
    flex-direction: column;
    gap: @space-l;
}

.schedule-dialog-hint {
    margin: 0;
    color: @font-color-s;
    font-size: @size-s;
    line-height: 1.7;
}

.schedule-dialog-label {
    display: flex;
    flex-direction: column;
    gap: @space-s;
    color: @font-color-m;
    font-size: @size-s;
}

.schedule-dialog-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid @line-color-m;
    border-radius: @radius-s;
    background: @bg-color-l;
    color: @font-color-l;
    outline: none;

    &:focus {
        border-color: @pcolor;
    }
}

.schedule-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: @space-m;
}

@media (max-width: 900px) {
    .edit-article {
        &-topbar,
        &-body,
        &-schedule-banner {
            width: 100%;
        }

        &-topbar {
            align-items: flex-start;
            flex-direction: column;
        }
    }

    .article-preview-title {
        font-size: 26px;
    }
}
</style>
