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
                        class="edit-article-retry" @click="openConflictCompare">
                        对比修改
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
                    {{ submitting === 'publish' && publishingFromNote ? '发布并回链…' : '发布' }}
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
            <editor v-model="content" :ai-title="form?.title || ''">
                <forms :classify="0" :initial-data="initialForm" :ai-content="content" @formData="handleFormData" />
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

        <SchedulePublishDialog v-model:open="scheduleOpen" v-model:value="scheduleValue"
            :scheduled-at="workflow?.scheduledAt ?? null" :loading="submitting === 'schedule'"
            :content-title="form?.title || article?.title || ''"
            @confirm="confirmSchedule" @cancel-schedule="cancelSchedule" />

        <ArticleVersionPanel v-model:open="versionPanelOpen" :article-id="articleId"
            @restored="handleVersionRestored" />

        <ConflictCompareDialog :open="conflictOpen" :loading="conflictLoading"
            :error-message="conflictError" :report="conflictReport" classify="article"
            :adopting="adoptingRemote" :keeping="keepingLocal"
            @update:open="conflictOpen = $event" @retry="openConflictCompare"
            @adopt="adoptRemote" @keep="keepLocal" />
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
    formatWorkflowTime,
    hasWorkflowChanges,
    defaultScheduleValue,
    isoToLocalDateTime,
    localDateTimeToIso,
    workflowSaveLabel,
    type WorkflowSaveStatus,
    type WorkflowSnapshot,
} from '../utils/articleWorkflow'
import { buildConflictReport, type ConflictReport } from '../utils/conflictCompare'
import { optimizeRichContentImages } from '../utils/imageOptimization'
import { momentDay } from '../utils/moment'
import { useContentAccess } from '../utils/contentAccess.ts'
import { validateScheduleValue, isScheduleOverdue } from '../utils/scheduledPublish'
import { getAiFeatures, resetAiFeatures } from '../utils/aiMarker.ts'
import { emitPetReaction } from '../utils/desktopPetScene'
import {
    clearLocalDraft,
    hasLocalDraftContent,
    NEW_ARTICLE_DRAFT_KIND,
    readLocalDraft,
    writeLocalDraft,
} from '../utils/localDraft'
import ArticleVersionPanel from '../components/article/ArticleVersionPanel.vue'
import ConflictCompareDialog from '../components/article/ConflictCompareDialog.vue'
import SchedulePublishDialog from '../components/article/SchedulePublishDialog.vue'
import { markUpgradeIntent } from '../utils/upgradeIntent'

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
const scheduleValue = ref('')
const localDraftAvailable = ref(false)
const conflictOpen = ref(false)
const conflictLoading = ref(false)
const conflictError = ref('')
const conflictReport = ref<ConflictReport | null>(null)
const adoptingRemote = ref(false)
const keepingLocal = ref(false)

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
// 新建文章的本机暂存是防抖的；发布后要立刻清草稿，不能让排队中的写入把它写回来
let persistTimer: ReturnType<typeof setTimeout> | null = null
// 草稿里带着来源笔记时，即使用户关掉恢复，也要记住这次是从花园升级过来的
let upgradeDraftPending = false
let upgradeDraftNoteId: number | null = null
let saveInFlight = false
let saveQueued = false
let applyingRemote = false
let mounted = false

const articleId = computed(() => {
    const id = Number(route.params.id)
    return Number.isInteger(id) && id > 0 ? id : null
})
const isEditing = computed(() => articleId.value !== null)
// 升级草稿的发布按钮在加载态也保留「回链」文案，作者知道接下来会回到花园
const publishingFromNote = computed(
    () => !isEditing.value && (Boolean(sourceNoteId.value) || upgradeDraftPending)
)
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
        // 从站点洞察的选题清单点「按此题新建文章」时，用搜索词预填标题
        const seededKeyword = typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''
        return {
            title: seededKeyword.slice(0, 150),
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

/**
 * 升级草稿的来源笔记：只在内存里保留，不参与自动保存比较。
 * 新建文章恢复本机草稿时才写入；编辑已有文章不能继承这个状态。
 */
const sourceNoteId = ref<number | null>(null)
let pendingUpgrade: { noteId: number; title: string } | null = null
// 发布收尾时编辑器可能已在卸载，仍要保留来源让收尾逻辑识别这次升级
let publishedFromNote = false

/** 从花园笔记升级来的文章，发布后提示回原笔记补一条指向文章的链接 */
function noteLinkSnippet(articleId: number, noteTitle: string): string {
    return `## 延伸阅读\n\n- [${noteTitle} 的完整版](/portal/articles?open=${articleId})`
}

async function afterPublishFromNote(articleId: number): Promise<void> {
    const noteId = pendingUpgrade?.noteId || sourceNoteId.value || upgradeDraftNoteId
    if (!noteId) return
    const title = form.value?.title?.trim() || pendingUpgrade?.title || '这篇文章'
    const snippet = noteLinkSnippet(articleId, title)
    // 设置标记后，其它旧跳转再取消也不能扫掉这条意图
    const markPublishedFromNote = (): void => {
        publishedFromNote = true
        pendingUpgrade = null
    }
    try {
        markUpgradeIntent({ noteId, articleId, title, snippet })
    } catch {
        // 本机存储不可用时仍按 URL 参数完成本次跳转
    }
    // 先进入花园再提示：编辑器卸载时全局 toast 会被一起带走，作者看不到结果
    const target = {
        path: '/notes',
        query: { note: String(noteId), linkArticle: String(articleId), articleTitle: title, snippet },
    }
    // 路由跳转和组件卸载有先后：从更新钩子里立刻写入，避免旧的发布流程等待期间把来源清空
    markPublishedFromNote()
    await router.push(target)
    showMessage('success', '这篇笔记已升级成文章发布，可以回笔记补一条指向文章的链接')
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
    if (conflictOpen.value) return
    clearAutosaveTimer()
    autosaveTimer = setTimeout(() => void saveWorkingCopy('autosave'), AUTOSAVE_DELAY_MS)
}

function persistLocalDraft(): void {
    if (!currentSnapshot.value || !form.value) return
    if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
    // 发布收尾已经清掉草稿，但草稿可能是从别的页面恢复进来的：
    // 这时不能再把源码写回来，否则下一次打开会误以为还有升级稿
    if (publishedFromNote) return
    const snapshot = currentSnapshot.value
    saveStatus.value = 'saving'
    writeLocalDraft(NEW_ARTICLE_DRAFT_KIND, {
        title: form.value.title,
        content: content.value,
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce,
        cover: form.value.cover,
        sourceNoteId: sourceNoteId.value,
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
    const draft = readLocalDraft(NEW_ARTICLE_DRAFT_KIND)
    upgradeDraftPending = Boolean(draft?.sourceNoteId)
    upgradeDraftNoteId = draft?.sourceNoteId ?? null
    // 「丢弃本机草稿」只对新建文章开放；编辑已有文章时不继承升级稿，
    // 也不该把按钮露出来去清掉与当前文章无关的草稿
    localDraftAvailable.value = !isEditing.value && hasLocalDraftContent(draft)
    if (!localDraftAvailable.value) return
    if (!draft) return

    const confirmed = window.confirm(
        `检测到 ${formatWorkflowTime(draft.savedAt)} 暂存在本机的未发布草稿，是否恢复？`
    )
    if (!confirmed) return

    // 确认恢复后才把升级意图带到发布收尾；页面已在 /editarticle/…，不能再用 push('/editarticle')
    pendingUpgrade = draft.sourceNoteId
        ? { noteId: draft.sourceNoteId, title: draft.title || '这篇文章' }
        : null
    upgradeDraftNoteId = null
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
    sourceNoteId.value = draft.sourceNoteId ?? null
    upgradeDraftPending = false
    // 恢复的草稿仍是新增的「不保存历史记录」路由，追加升级标记供发布后跳回花园
    window.history.replaceState(
        { ...window.history.state, noteUpgrade: Boolean(sourceNoteId.value) },
        '',
        window.location.href
    )
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

    clearLocalDraft(NEW_ARTICLE_DRAFT_KIND)
    localDraftAvailable.value = false
    sourceNoteId.value = null
    upgradeDraftPending = false
    upgradeDraftNoteId = null
    pendingUpgrade = null
    saveStatus.value = 'idle'
    showMessage('primary', '已丢弃本机草稿')
}

function buildPayload(): CreateArticleParams {
    if (!form.value) throw new Error('文章表单尚未准备好')
    // 作者采用过 AI 结果时带上标记，服务端落库后内容会打上「AI 辅助」标记
    const aiFeatures = getAiFeatures()
    return {
        title: form.value.title.trim(),
        content: content.value,
        classify: 'article',
        subsetId: form.value.subsetId ?? null,
        label: formatArticleLabels(form.value.label),
        introduce: form.value.introduce.trim(),
        cover: form.value.cover.trim(),
        ...(aiFeatures.length > 0 ? { aiFeatures } : {}),
        ...(sourceNoteId.value || pendingUpgrade || upgradeDraftNoteId
            ? { sourceNoteId: sourceNoteId.value ?? pendingUpgrade?.noteId ?? upgradeDraftNoteId! }
            : {}),
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
        if (source === 'manual') emitPetReaction('article-saved')
        return true
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status
        saveStatus.value = status === 409 ? 'conflict' : 'error'
        if (source === 'manual') {
            showMessage('error', describeError(error, '保存失败，请稍后重试'))
            emitPetReaction('save-failed')
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
        // 打开已有文章时重新统计：本次编辑采用 AI 才会再记一次
        resetAiFeatures()
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
            clearLocalDraft(NEW_ARTICLE_DRAFT_KIND)
            localDraftAvailable.value = false
            showMessage('success', action === 'publish' ? '文章已发布' : '文章已保存为草稿')
            if (action === 'publish') {
                emitPetReaction('article-published', {
                    actionPath: `/portal/articles?open=${nextId}`,
                    actionLabel: '去看看',
                })
            }
            if (action === 'publish' && (sourceNoteId.value || upgradeDraftPending)) {
                const finishing = afterPublishFromNote(nextId)
                // 已创建为草稿时也要清掉来源，避免它被后续本机编辑继续带着
                sourceNoteId.value = null
                upgradeDraftPending = false
                upgradeDraftNoteId = null
                // 路由 state 不再指向这次升级会话
                window.history.replaceState(
                    { ...window.history.state, noteUpgrade: false },
                    '',
                    window.location.href
                )
                await finishing
                return
            }
            // 新建文章此时没有原生 id，不能再进编辑分支
            upgradeDraftNoteId = null
            // 发布收尾已跳去别处时，不要让旧页面的卸载再改一次地址
            if (!publishedFromNote) await router.push('/article')
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
            emitPetReaction('article-published', {
                actionPath: `/portal/articles?open=${articleId.value}`,
                actionLabel: '去看看',
            })
            if (sourceNoteId.value) {
                try {
                    await afterPublishFromNote(articleId.value!)
                } finally {
                    sourceNoteId.value = null
                }
                if (action === 'publish') return
            }
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
        if (action === 'publish') emitPetReaction('publish-failed')
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
        emitPetReaction('article-published', {
            actionPath: `/portal/articles?open=${articleId.value}`,
            actionLabel: '去看看',
        })
        await loadArticle()
    } catch (error) {
        showMessage('error', describeError(error, '发布失败，请稍后重试'))
        emitPetReaction('publish-failed')
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
        // 改期时预填当前计划时间；已逾期或无计划时预填默认值（1 小时后），
        // 避免弹窗打开即显示校验错误
        scheduleValue.value = workflow.value?.scheduledAt
            && !isScheduleOverdue(workflow.value.scheduledAt)
            ? isoToLocalDateTime(workflow.value.scheduledAt)
            : defaultScheduleValue()
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
    await loadArticle()
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
            classify: 'article',
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
        await loadArticle()
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
            // 新建页没有后端 ID：先落本机草稿，保存成功后由提交逻辑清除
            clearAutosaveTimer()
            if (!lastSavedSnapshot.value || hasWorkflowChanges(snapshot, lastSavedSnapshot.value)) {
                saveStatus.value = 'dirty'
                if (persistTimer) clearTimeout(persistTimer)
                persistTimer = setTimeout(persistLocalDraft, AUTOSAVE_DELAY_MS)
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
