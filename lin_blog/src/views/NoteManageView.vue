<template>
    <yk-space dir="vertical" size="l" class="admin-page note-page">
        <top-title name="数字花园" description="用双链把零散想法连成一张会生长的知识网" :is-search="false">
            <template #custom>
                <yk-button type="primary" @click="startCreate">+ 新建笔记</yk-button>
            </template>
        </top-title>

        <div v-if="errorMessage" class="note-banner is-error">{{ errorMessage }}</div>
        <div v-else-if="noticeMessage" class="note-banner is-success">{{ noticeMessage }}</div>

        <div class="note-shell">
            <aside class="note-sidebar" aria-label="笔记列表">
                <header class="note-sidebar-head">
                    <div>
                        <span class="note-sidebar-kicker">花园目录</span>
                        <strong>全部笔记</strong>
                    </div>
                    <b>{{ summary.all }}</b>
                </header>

                <div class="note-filters">
                    <button v-for="item in stateFilters" :key="item.value" type="button" class="note-filter"
                        :class="{ 'is-active': stateFilter === item.value }" @click="setStateFilter(item.value)">
                        {{ item.label }} <span>{{ item.value ? summary[item.value] : summary.all }}</span>
                    </button>
                </div>

                <label class="note-search">
                    <input v-model="keyword" type="search" placeholder="搜索标题或正文" aria-label="搜索笔记"
                        @keyup.enter="reloadList" />
                </label>

                <div v-if="loadingList" class="note-sidebar-state">
                    <yk-spinner size="s" />
                </div>
                <div v-else-if="notes.length === 0" class="note-sidebar-state">
                    还没有笔记
                </div>
                <div v-else class="note-list">
                    <button v-for="item in notes" :key="item.id" type="button" class="note-item"
                        :class="{ 'is-active': !isCreating && activeId === item.id }" @click="selectNote(item.id)">
                        <span class="note-item-copy">
                            <strong>{{ item.title }}</strong>
                            <small>{{ item.excerpt || '空白笔记' }}</small>
                        </span>
                        <span class="note-item-meta">
                            <span :class="['note-state', `is-${item.state}`]">
                                {{ item.state === 'published' ? '已公开' : '草稿' }}
                            </span>
                            <span>{{ item.outgoingLinks }} → · {{ item.incomingLinks }} ←</span>
                        </span>
                    </button>
                </div>

                <AdminPager v-if="totalPage > 1" v-model:page="page" :page-size="pageSize" :total="listTotal"
                    :disabled="loadingList" @change="loadNotes" />
            </aside>

            <section class="note-editor" aria-label="笔记编辑">
                <div v-if="loadingDetail" class="note-editor-state">
                    <yk-spinner size="m" />
                </div>

                <div v-else-if="!isCreating && !activeNote" class="note-editor-state">
                    <span class="note-empty-mark">园</span>
                    <strong>先选择一篇笔记</strong>
                    <p>也可以新建笔记，用 [[标题]] 或 [文字](note://ID) 建立双链。</p>
                </div>

                <template v-else>
                    <header class="note-editor-head">
                        <div>
                            <span class="note-kicker">{{ isCreating ? 'NEW NOTE' : 'GARDEN EDITOR' }}</span>
                            <h2>{{ form.title || '未命名笔记' }}</h2>
                            <p v-if="!isCreating" class="note-editor-meta">
                                <span>更新于 {{ formatDate(activeNote?.updatedAt) }}</span>
                                <span>{{ activeNote?.outgoingLinks || 0 }} 条出发链接</span>
                                <span>{{ activeNote?.incomingLinks || 0 }} 条反向链接</span>
                            </p>
                        </div>
                        <div class="note-editor-actions">
                            <a v-if="!isCreating && form.state === 'published'" class="note-preview-link"
                                :href="`/portal/notes?open=${activeId}`" target="_blank" rel="noopener">
                                预览花园
                            </a>
                            <yk-button v-if="!isCreating" type="danger" size="s" :disabled="saving"
                                @click="handleDelete">删除</yk-button>
                            <yk-button type="secondary" size="s" :loading="saving" @click="handleSave('draft')">
                                存为草稿
                            </yk-button>
                            <yk-button type="primary" size="s" :loading="saving" @click="handleSave('published')">
                                {{ form.state === 'published' ? '保存更新' : '发布到花园' }}
                            </yk-button>
                        </div>
                    </header>

                    <div class="note-editor-body">
                        <div class="note-writing">
                            <label class="note-field">
                                <span>标题 <i>*</i></span>
                                <input v-model="form.title" class="note-input" type="text" maxlength="150"
                                    placeholder="用一个能被双链引用的标题" />
                            </label>

                            <div class="note-editor-tabs" role="tablist" aria-label="编辑模式">
                                <button v-for="tab in tabs" :key="tab.value" type="button" role="tab"
                                    :aria-selected="tabMode === tab.value"
                                    :class="{ 'is-active': tabMode === tab.value }" @click="tabMode = tab.value">
                                    {{ tab.label }}
                                </button>
                            </div>

                            <textarea v-if="tabMode === 'edit'" v-model="form.content" class="note-textarea"
                                spellcheck="false" placeholder="支持 # 标题、- 列表、> 引用、``` 代码块，以及 [[另一篇笔记]] 双链"></textarea>
                            <pre v-else ref="previewRef" class="note-preview" v-html="previewHtml"></pre>


                        </div>

                        <aside class="note-tips" aria-label="双链提示">
                            <span class="note-tips-label">双链语法</span>
                            <p><code>[[笔记标题]]</code> 按标题连接，标题相同时指向同一篇。</p>
                            <p><code>[文字](note://12)</code> 按 ID 连接，适合标题会改的常青笔记。</p>
                            <p>只有「已公开」的笔记会出现在门户花园与分享卡片里，草稿只对自己可见。</p>
                            <p>正文里的 <code>#标签</code> 会出现在知识图谱的标签过滤里，用来聚合同主题笔记。</p>
                        </aside>
                    </div>
                </template>
            </section>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import AdminPager from '../components/common/AdminPager.vue'
import {
    createNote,
    deleteNote,
    getNoteById,
    getNoteSummary,
    getNotes,
    updateNote,
    type NoteState,
    type NoteSummary,
    type OwnedNote,
} from '../api/note'

type MessageOptions = {
    type: 'primary' | 'warning' | 'error'
    message: string
}

const proxy = getCurrentInstance()?.proxy as {
    $message?: (options: MessageOptions) => void
} | null | undefined

const notes = ref<OwnedNote[]>([])
const summary = ref<NoteSummary>({ all: 0, draft: 0, published: 0 })
const page = ref(1)
const pageSize = 20
const listTotal = ref(0)
const totalPage = ref(0)
const loadingList = ref(false)
const loadingDetail = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const noticeMessage = ref('')

const stateFilter = ref<'' | NoteState>('')
const keyword = ref('')

const isCreating = ref(false)
const activeId = ref<number | null>(null)
const activeNote = ref<OwnedNote | null>(null)
const tabMode = ref<'edit' | 'preview'>('edit')
const form = ref({ title: '', content: '', state: 'draft' as NoteState })

const stateFilters = computed(() => [
    { value: '' as const, label: '全部', totalFallback: summary.value.all },
    { value: 'draft' as const, label: '草稿', totalFallback: 0 },
    { value: 'published' as const, label: '已公开', totalFallback: 0 },
])

const tabs = [
    { value: 'edit' as const, label: '编辑' },
    { value: 'preview' as const, label: '预览' },
]

const notice = (type: MessageOptions['type'], message: string) => {
    proxy?.$message?.({ type, message })
}

const formatDate = (value?: string | null): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

// 后台预览只做轻量替身：与门户一致的排版由服务端渲染负责，这里保证可读与双链高亮
const escapeHtml = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const previewHtml = computed(() => {
    const raw = form.value.content || ''
    return escapeHtml(raw)
        .replace(/\[\[([^\[\]\n]{1,150})\]\]/g, '<mark class="note-wikilink">[[$1]]</mark>')
        .replace(/\[([^\]]+)\]\(note:\/\/(\d+)\)/g, '<mark class="note-wikilink">$1</mark>')
        .replace(/^### (.+)$/gm, '<strong class="note-h3">$1</strong>')
        .replace(/^## (.+)$/gm, '<strong class="note-h2">$1</strong>')
        .replace(/^# (.+)$/gm, '<strong class="note-h1">$1</strong>')
})

const loadNotes = async () => {
    loadingList.value = true
    try {
        const result = await getNotes({
            page: page.value,
            pageSize,
            state: stateFilter.value || undefined,
            keyword: keyword.value.trim() || undefined,
        })
        if (result.code === 200 && result.data) {
            notes.value = result.data.list
            listTotal.value = result.data.total
            totalPage.value = result.data.totalPage
        }
    } catch {
        notes.value = []
    } finally {
        loadingList.value = false
    }
}

const loadSummary = async () => {
    try {
        const result = await getNoteSummary()
        if (result.code === 200 && result.data) summary.value = result.data
    } catch {
        // 统计失败不阻断编辑
    }
}

const reloadList = () => {
    page.value = 1
    void loadNotes()
}

const setStateFilter = (value: '' | NoteState) => {
    stateFilter.value = value
    reloadList()
}

const startCreate = () => {
    isCreating.value = true
    activeId.value = null
    activeNote.value = null
    form.value = { title: '', content: '', state: 'draft' }
    tabMode.value = 'edit'
    errorMessage.value = ''
    noticeMessage.value = ''
}

const selectNote = async (id: number) => {
    isCreating.value = false
    activeId.value = id
    loadingDetail.value = true
    errorMessage.value = ''
    try {
        const result = await getNoteById(id)
        if (result.code === 200 && result.data) {
            activeNote.value = result.data
            form.value = {
                title: result.data.title,
                content: result.data.content,
                state: result.data.state,
            }
        }
    } catch {
        errorMessage.value = '笔记加载失败，请稍后重试'
    } finally {
        loadingDetail.value = false
    }
}

const handleSave = async (state: NoteState) => {
    const title = form.value.title.trim()
    if (!title) {
        notice('warning', '请先填写笔记标题')
        return
    }

    saving.value = true
    errorMessage.value = ''
    try {
        if (isCreating.value) {
            const result = await createNote({ title, content: form.value.content, state })
            if (result.code === 200 && result.data) {
                isCreating.value = false
                notice('primary', state === 'published' ? '笔记已发布到花园' : '草稿已保存')
                await Promise.all([loadNotes(), loadSummary()])
                await selectNote(result.data.noteId)
            }
        } else if (activeId.value) {
            const result = await updateNote(activeId.value, {
                title,
                content: form.value.content,
                state,
            })
            if (result.code === 200) {
                form.value.state = result.data?.state || state
                notice('primary', '笔记已更新')
                await Promise.all([loadNotes(), loadSummary()])
                await selectNote(activeId.value)
            }
        }
    } catch {
        errorMessage.value = '保存失败，请检查网络或稍后重试'
    } finally {
        saving.value = false
    }
}

const handleDelete = async () => {
    if (!activeId.value || !window.confirm('删除后双链会一并解除，确定删除这篇笔记吗？')) return
    try {
        const result = await deleteNote(activeId.value)
        if (result.code === 200) {
            activeId.value = null
            activeNote.value = null
            form.value = { title: '', content: '', state: 'draft' }
            notice('primary', '笔记已删除')
            await Promise.all([loadNotes(), loadSummary()])
        }
    } catch {
        errorMessage.value = '删除失败，请稍后重试'
    }
}

onMounted(() => {
    void loadNotes()
    void loadSummary()
})
</script>

<style lang="less" scoped>
.note-banner {
    padding: 10px 16px;
    border-radius: 12px;
    font-size: 13px;

    &.is-error {
        background: color-mix(in srgb, @ecolor 10%, transparent);
        color: @ecolor;
    }

    &.is-success {
        background: color-mix(in srgb, var(--scolor, #1fb4a2) 10%, transparent);
        color: var(--scolor, #1fb4a2);
    }
}

.note-shell {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
}

.note-sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 18px;
    background: var(--bgColor1);
}

.note-sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;

    div {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    strong {
        color: var(--gray);
        font-size: 15px;
    }

    b {
        color: var(--pcolor);
        font-size: 20px;
        font-variant-numeric: tabular-nums;
    }
}

.note-sidebar-kicker {
    color: var(--gray6);
    font-size: 10px;
    letter-spacing: 0.12em;
}

.note-filters {
    display: flex;
    gap: 6px;
}

.note-filter {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 9px;
    background: transparent;
    color: var(--gray8);
    font-size: 12px;
    cursor: pointer;

    span {
        color: var(--gray6);
        font-size: 11px;
    }

    &.is-active {
        border-color: var(--pcolor);
        background: var(--pcolor1);
        color: var(--pcolor);

        span {
            color: var(--pcolor);
        }
    }
}

.note-search input {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 10px;
    background: var(--bgColor2);
    color: var(--gray);
    font-size: 13px;
    outline: none;

    &:focus {
        border-color: var(--pcolor);
    }
}

.note-sidebar-state {
    display: grid;
    place-items: center;
    padding: 30px 0;
    color: var(--gray6);
    font-size: 13px;
}

.note-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 60vh;
    overflow-y: auto;
}

.note-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.16s ease, background 0.16s ease;

    &:hover {
        background: var(--bgColor2);
    }

    &.is-active {
        border-color: var(--pcolor3);
        background: var(--pcolor1);
    }
}

.note-item-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;

    strong {
        overflow: hidden;
        color: var(--gray);
        font-size: 13px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    small {
        display: -webkit-box;
        overflow: hidden;
        color: var(--gray6);
        font-size: 11px;
        line-height: 1.5;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
    }
}

.note-item-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--gray6);
    font-size: 10px;
}

.note-state {
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 10px;

    &.is-published {
        background: color-mix(in srgb, var(--scolor, #1fb4a2) 14%, transparent);
        color: var(--scolor, #1fb4a2);
    }

    &.is-draft {
        background: color-mix(in srgb, var(--wcolor, #f2a200) 16%, transparent);
        color: var(--wcolor, #f2a200);
    }
}

.note-editor {
    min-height: 60vh;
    padding: 20px 22px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 18px;
    background: var(--bgColor1);
}

.note-editor-state {
    display: flex;
    min-height: 50vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--gray6);
    font-size: 13px;

    strong {
        color: var(--gray);
        font-size: 16px;
    }

    p {
        margin: 0;
    }
}

.note-empty-mark {
    display: grid;
    width: 52px;
    height: 52px;
    place-items: center;
    border-radius: 16px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-family: var(--portal-serif, serif);
    font-size: 22px;
}

.note-editor-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--admin-line, var(--gray1));

    h2 {
        margin: 4px 0 6px;
        color: var(--gray);
        font-size: 20px;
    }
}

.note-kicker {
    color: var(--gray6);
    font-size: 10px;
    letter-spacing: 0.14em;
}

.note-editor-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 0;
    color: var(--gray6);
    font-size: 11px;
}

.note-editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.note-preview-link {
    color: var(--pcolor);
    font-size: 12px;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
}

.note-editor-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 20px;
    margin-top: 16px;
}

.note-writing {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 10px;
}

.note-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--gray8);
    font-size: 12px;

    i {
        color: @ecolor;
        font-style: normal;
    }
}

.note-input,
.note-textarea,
.note-preview {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor2);
    color: var(--gray);
    font-family: inherit;
    outline: none;

    &:focus {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px var(--pcolor1);
    }
}

.note-input {
    padding: 10px 12px;
    font-size: 15px;
}

.note-editor-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: var(--bgColor2);
    align-self: flex-start;

    button {
        padding: 5px 14px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--gray6);
        font-size: 12px;
        cursor: pointer;

        &.is-active {
            background: var(--pcolor);
            color: #fff;
        }
    }
}

.note-textarea {
    min-height: 44vh;
    padding: 14px 16px;
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    font-size: 13px;
    line-height: 1.8;
    resize: vertical;
}

.note-preview {
    min-height: 44vh;
    margin: 0;
    padding: 16px 18px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.85;
    white-space: pre-wrap;
    word-break: break-word;

    :deep(.note-wikilink) {
        padding: 1px 5px;
        border-radius: 6px;
        background: var(--pcolor1);
        color: var(--pcolor);
        font-family: inherit;
    }

    :deep(.note-h1),
    :deep(.note-h2),
    :deep(.note-h3) {
        display: block;
        margin: 8px 0 4px;
    }
}

.note-tips {
    align-self: start;
    padding: 14px;
    border: 1px dashed var(--admin-line, var(--gray1));
    border-radius: 14px;
    color: var(--gray6);
    font-size: 12px;
    line-height: 1.7;

    p {
        margin: 8px 0 0;
    }

    code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--pcolor1);
        color: var(--pcolor);
        font-size: 11px;
    }
}

.note-tips-label {
    color: var(--gray8);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
}

@media (max-width: 1100px) {
    .note-shell,
    .note-editor-body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
