<template>
    <yk-space dir="vertical" size="l" class="admin-page collection-page">
        <top-title name="内容系列" description="把分散的文章整理成有顺序、可连续阅读的专题" :is-search="false">
            <template #custom>
                <yk-button type="primary" @click="startCreate">+ 新建系列</yk-button>
            </template>
        </top-title>

        <div v-if="errorMessage" class="collection-banner is-error">{{ errorMessage }}</div>
        <div v-else-if="noticeMessage" class="collection-banner is-success">{{ noticeMessage }}</div>

        <div class="collection-shell">
            <aside class="collection-sidebar" aria-label="系列列表">
                <header class="collection-sidebar-head">
                    <div>
                        <span class="collection-sidebar-kicker">专题书架</span>
                        <strong>全部系列</strong>
                    </div>
                    <b>{{ collections.length }}</b>
                </header>

                <div v-if="loadingList" class="collection-sidebar-state">
                    <yk-spinner size="s" />
                </div>
                <div v-else-if="collections.length === 0" class="collection-sidebar-state">
                    还没有系列
                </div>
                <div v-else class="collection-list">
                    <button v-for="item in collections" :key="item.id" type="button" class="collection-item"
                        :class="{ 'is-active': !isCreating && activeId === item.id }" @click="selectCollection(item.id)">
                        <span class="collection-item-cover" :class="{ 'is-empty': !item.cover }">
                            <img v-if="item.cover" :src="item.cover" :alt="item.name" />
                            <span v-else>{{ item.name.trim().charAt(0) || '系' }}</span>
                        </span>
                        <span class="collection-item-copy">
                            <strong>{{ item.name }}</strong>
                            <small>
                                {{ item.publishedCount }} 篇已发布
                                <template v-if="item.articleCount !== item.publishedCount">
                                    · {{ item.articleCount }} 篇成员
                                </template>
                            </small>
                        </span>
                    </button>
                </div>
            </aside>

            <section class="collection-editor" aria-label="系列编辑">
                <div v-if="loadingDetail" class="collection-editor-state">
                    <yk-spinner size="m" />
                </div>

                <div v-else-if="!isCreating && !activeCollection" class="collection-editor-state">
                    <span class="collection-empty-mark">系</span>
                    <strong>先选择一个系列</strong>
                    <p>也可以点击右上角新建系列，把相关文章按阅读顺序串起来。</p>
                </div>

                <template v-else>
                    <header class="collection-editor-head">
                        <div class="collection-editor-title">
                            <span class="collection-kicker">{{ isCreating ? 'NEW COLLECTION' : 'COLLECTION EDITOR' }}</span>
                            <h2>{{ isCreating ? '新建系列' : form.name || '未命名系列' }}</h2>
                            <p>系列会出现在门户“系列”页，访客可按顺序连续阅读。</p>
                            <div class="collection-editor-meta">
                                <span>{{ selectedIds.length }} 篇文章</span>
                                <span>{{ isCreating ? '等待创建' : `${activeCollection?.publishedCount || 0} 篇已发布` }}</span>
                            </div>
                        </div>
                        <div class="collection-editor-actions">
                            <a v-if="!isCreating && activeId" class="collection-preview-link"
                                :href="`/portal/series?collection=${activeId}`" target="_blank" rel="noopener">
                                预览系列
                            </a>
                            <yk-button v-if="!isCreating" type="danger" size="s" :disabled="saving"
                                @click="handleDelete">
                                删除系列
                            </yk-button>
                        </div>
                    </header>

                    <div class="collection-editor-body">
                        <section class="collection-details-card" aria-label="系列基本信息">
                            <header class="collection-section-head">
                                <div>
                                    <span class="collection-section-label">基本信息</span>
                                    <p>名称和说明会直接展示在门户的系列卡片中。</p>
                                </div>
                            </header>

                            <div class="collection-form-grid">
                                <label class="collection-field">
                                    <span>系列名称 <i>*</i></span>
                                    <input v-model="form.name" class="collection-input" type="text" maxlength="80"
                                        placeholder="例如：从零搭一个个人博客" />
                                </label>
                                <label class="collection-field">
                                    <span>排序权重</span>
                                    <input v-model.number="form.sort" class="collection-input" type="number" min="0"
                                        step="1" placeholder="越大越靠前" />
                                </label>
                                <label class="collection-field collection-field--full">
                                    <span>系列说明</span>
                                    <textarea v-model="form.description" class="collection-textarea" rows="4"
                                        maxlength="500" placeholder="这段说明会展示在门户系列卡片和详情页" />
                                </label>
                            </div>
                        </section>

                        <aside class="collection-cover-card" aria-label="系列封面">
                            <header class="collection-section-head">
                                <div>
                                    <span class="collection-section-label">系列封面</span>
                                    <p>从本地选择，或直接使用素材库图片。</p>
                                </div>
                            </header>

                            <div class="collection-cover-upload">
                                <yk-upload :file-list="coverFileList"
                                    :upload-url="uploadUrl" :limit="1" :multiple="false"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    :max-size="8 * 1024 * 1024" desc="上传本地图片"
                                    @handle-success="handleCoverSuccess"
                                    @handle-error="handleCoverError"
                                    @handle-delete="handleCoverDelete" />
                            </div>

                            <button type="button" class="collection-media-button"
                                @click="mediaPickerOpen = true">
                                <IconFolderOpenOutline />
                                从素材库选择
                            </button>

                            <p class="collection-cover-hint">
                                推荐 16:10 横图，支持 JPG、PNG、WebP 和 GIF，最大 8MB。
                            </p>
                            <p v-if="coverUploadError" class="collection-cover-error">
                                {{ coverUploadError }}
                            </p>
                        </aside>
                    </div>

                    <div class="collection-members">
                        <section class="collection-member-panel" aria-label="系列内文章顺序">
                            <header class="collection-panel-head">
                                <div>
                                    <h3>系列内文章</h3>
                                    <p>按当前顺序展示，越靠前越先读到。</p>
                                </div>
                                <yk-tag size="s" type="primary">{{ selectedIds.length }} 篇</yk-tag>
                            </header>

                            <div v-if="selectedArticles.length === 0" class="collection-panel-empty">
                                还没有添加文章，从右侧挑选文章加入系列。
                            </div>
                            <ol v-else class="collection-selected-list">
                                <li v-for="(article, index) in selectedArticles" :key="article.id"
                                    class="collection-selected-item">
                                    <span class="collection-order">{{ String(index + 1).padStart(2, '0') }}</span>
                                    <span class="collection-article-cover" :class="{ 'is-empty': !article.cover }">
                                        <img v-if="article.cover" :src="article.cover" :alt="article.title"
                                            loading="lazy" />
                                        <span v-else>{{ article.title.trim().charAt(0) || '文' }}</span>
                                    </span>
                                    <span class="collection-selected-copy">
                                        <strong>{{ article.title }}</strong>
                                        <small>
                                            {{ article.subsetName || '未分类' }} ·
                                            {{ article.state === 'published' ? '已发布' : '未发布' }}
                                        </small>
                                    </span>
                                    <span class="collection-row-actions">
                                        <button type="button" class="collection-icon-button" title="上移"
                                            :disabled="index === 0" @click="moveArticle(index, -1)">↑</button>
                                        <button type="button" class="collection-icon-button" title="下移"
                                            :disabled="index === selectedArticles.length - 1"
                                            @click="moveArticle(index, 1)">↓</button>
                                        <button type="button" class="collection-remove-button"
                                            @click="removeArticle(article.id)">移除</button>
                                    </span>
                                </li>
                            </ol>
                        </section>

                        <section class="collection-member-panel" aria-label="可选文章">
                            <header class="collection-panel-head">
                                <div>
                                    <h3>添加文章</h3>
                                    <p>只列出博客文章，草稿也可以先加入系列。</p>
                                </div>
                                <RouterLink class="collection-new-article" to="/editarticle"
                                    target="_blank" rel="noopener">
                                    + 新建文章
                                </RouterLink>
                            </header>

                            <input v-model="articleKeyword" class="collection-input collection-search"
                                type="search" placeholder="搜索标题或简介" />

                            <div v-if="loadingArticles" class="collection-panel-empty">
                                <yk-spinner size="s" />
                            </div>
                            <div v-else-if="availableArticles.length === 0" class="collection-panel-empty">
                                暂无可添加的文章。
                            </div>
                            <div v-else class="collection-available-list">
                                <button v-for="article in availableArticles" :key="article.id" type="button"
                                    class="collection-available-item" @click="addArticle(article.id)">
                                    <span class="collection-article-cover" :class="{ 'is-empty': !article.cover }">
                                        <img v-if="article.cover" :src="article.cover" :alt="article.title"
                                            loading="lazy" />
                                        <span v-else>{{ article.title.trim().charAt(0) || '文' }}</span>
                                    </span>
                                    <span class="collection-selected-copy">
                                        <strong>{{ article.title }}</strong>
                                        <small>
                                            {{ article.subsetName || '未分类' }} ·
                                            {{ article.state === 'published' ? '已发布' : '未发布' }}
                                        </small>
                                    </span>
                                    <span class="collection-add-mark">+</span>
                                </button>
                            </div>
                        </section>
                    </div>

                    <footer class="collection-editor-foot">
                        <span class="collection-foot-note">
                            {{ isCreating ? '创建后会自动保存当前文章顺序' : '修改名称、说明和文章顺序后统一保存' }}
                        </span>
                        <div class="collection-foot-actions">
                            <yk-button v-if="isCreating" type="secondary" :disabled="saving"
                                @click="cancelCreate">取消</yk-button>
                            <yk-button type="primary" :loading="saving" @click="handleSave">
                                {{ isCreating ? '创建系列' : '保存修改' }}
                            </yk-button>
                        </div>
                    </footer>
                </template>
            </section>
        </div>

        <MediaPickerDialog v-model:open="mediaPickerOpen" @select="handleMediaSelect" />
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, reactive, ref } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import MediaPickerDialog from '../components/common/MediaPickerDialog.vue'
import { getArticles, type ArticleItem } from '../api/article'
import { getRequestErrorMessage } from '../api/file'
import {
    createCollection,
    deleteCollection,
    getCollectionById,
    getCollections,
    setCollectionArticles,
    updateCollection,
    type CollectionSummary,
} from '../api/collection'
import { buildImageUploadUrl } from '../utils/uploadUrl'

type PickableArticle = Pick<ArticleItem, 'id' | 'title' | 'state' | 'cover' | 'introduce' | 'subsetName'>
type CoverFile = { name: string; url: string }
type UploadResponse = {
    data?: { url?: string }
    url?: string
}

const proxy = getCurrentInstance()?.proxy as {
    $message?: (options: { type: 'primary' | 'warning' | 'error'; message: string }) => void
} | null | undefined

const collections = ref<CollectionSummary[]>([])
const activeCollection = ref<CollectionSummary | null>(null)
const selectedIds = ref<number[]>([])
const articleMap = ref(new Map<number, PickableArticle>())
const pickerArticles = ref<ArticleItem[]>([])
const articleKeyword = ref('')
const activeId = ref<number | null>(null)
const isCreating = ref(false)
const loadingList = ref(false)
const loadingDetail = ref(false)
const loadingArticles = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const noticeMessage = ref('')
const coverFileList = ref<CoverFile[]>([])
const coverUploadError = ref('')
const mediaPickerOpen = ref(false)
const uploadUrl = ref('')
const uploadTicketBusy = ref(false)

const form = reactive({
    name: '',
    description: '',
    cover: '',
    sort: 0,
})

const getErrorMessage = (error: unknown, fallback: string): string => {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
    return responseMessage || (error instanceof Error ? error.message : fallback)
}

const showToast = (type: 'primary' | 'warning' | 'error', message: string): void => {
    proxy?.$message?.({ type, message })
}

const clearFeedback = (): void => {
    errorMessage.value = ''
    noticeMessage.value = ''
}

const selectedArticles = computed(() => selectedIds.value
    .map(id => articleMap.value.get(id))
    .filter((article): article is PickableArticle => Boolean(article)))

const availableArticles = computed(() => {
    const keyword = articleKeyword.value.trim().toLowerCase()
    return pickerArticles.value
        .filter(article => !selectedIds.value.includes(article.id))
        .filter(article => {
            if (!keyword) return true
            return `${article.title} ${article.introduce || ''}`.toLowerCase().includes(keyword)
        })
})

const rememberArticle = (article: PickableArticle): void => {
    const next = new Map(articleMap.value)
    next.set(article.id, article)
    articleMap.value = next
}

const resetForm = (): void => {
    form.name = ''
    form.description = ''
    form.cover = ''
    form.sort = 0
    syncCoverFileList()
}

const syncCoverFileList = (): void => {
    coverFileList.value = form.cover
        ? [{ name: '系列封面', url: form.cover }]
        : []
}

const refreshUploadUrl = async (): Promise<void> => {
    if (uploadTicketBusy.value) return
    uploadTicketBusy.value = true
    try {
        uploadUrl.value = await buildImageUploadUrl()
        coverUploadError.value = ''
    } catch (error) {
        coverUploadError.value = getRequestErrorMessage(error)
    } finally {
        uploadTicketBusy.value = false
    }
}

const handleCoverSuccess = (response: UploadResponse): void => {
    const url = response.data?.url || response.url
    if (!url) return

    coverUploadError.value = ''
    form.cover = url
    syncCoverFileList()
    void refreshUploadUrl()
}

const handleCoverError = (error: unknown): void => {
    const message = typeof error === 'string' && error.trim()
        ? error
        : getRequestErrorMessage(error, '封面上传失败，请稍后重试')
    coverUploadError.value = message
    showToast('error', message)
    void refreshUploadUrl()
}

const handleCoverDelete = (): void => {
    coverUploadError.value = ''
    form.cover = ''
    syncCoverFileList()
    void refreshUploadUrl()
}

const handleMediaSelect = (urls: string[]): void => {
    const url = urls[0]
    if (!url) return

    coverUploadError.value = ''
    form.cover = url
    syncCoverFileList()
}

const startCreate = (): void => {
    isCreating.value = true
    activeId.value = null
    activeCollection.value = null
    selectedIds.value = []
    resetForm()
    clearFeedback()
}

const cancelCreate = (): void => {
    isCreating.value = false
    if (collections.value[0]) {
        void selectCollection(collections.value[0].id)
    } else {
        activeCollection.value = null
        activeId.value = null
    }
}

const loadCollections = async (): Promise<void> => {
    loadingList.value = true
    try {
        const result = await getCollections()
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '系列列表加载失败')
        }
        collections.value = Array.isArray(result.data.list) ? result.data.list : []
    } catch (error) {
        errorMessage.value = getErrorMessage(error, '系列列表加载失败')
    } finally {
        loadingList.value = false
    }
}

const selectCollection = async (id: number): Promise<void> => {
    isCreating.value = false
    activeId.value = id
    loadingDetail.value = true
    clearFeedback()
    try {
        const result = await getCollectionById(id)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '系列详情加载失败')
        }
        const detail = result.data
        activeCollection.value = detail
        form.name = detail.name
        form.description = detail.description
        form.cover = detail.cover
        form.sort = detail.sort
        syncCoverFileList()
        selectedIds.value = detail.articles.map(article => article.id)
        detail.articles.forEach(rememberArticle)
    } catch (error) {
        errorMessage.value = getErrorMessage(error, '系列详情加载失败')
    } finally {
        loadingDetail.value = false
    }
}

const loadPickerArticles = async (): Promise<void> => {
    loadingArticles.value = true
    try {
        const result = await getArticles({ page: 1, pageSize: 100, classify: 'article' })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '文章列表加载失败')
        }
        pickerArticles.value = Array.isArray(result.data.list) ? result.data.list : []
        pickerArticles.value.forEach(rememberArticle)
    } catch (error) {
        errorMessage.value = getErrorMessage(error, '文章列表加载失败')
    } finally {
        loadingArticles.value = false
    }
}

const addArticle = (id: number): void => {
    if (!selectedIds.value.includes(id)) {
        selectedIds.value = [...selectedIds.value, id]
    }
}

const removeArticle = (id: number): void => {
    selectedIds.value = selectedIds.value.filter(item => item !== id)
}

const moveArticle = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= selectedIds.value.length) return
    const next = [...selectedIds.value]
    ;[next[index], next[target]] = [next[target], next[index]]
    selectedIds.value = next
}

const handleSave = async (): Promise<void> => {
    clearFeedback()
    const name = form.name.trim()
    if (!name) {
        errorMessage.value = '系列名称不能为空'
        return
    }

    saving.value = true
    try {
        let collectionId = activeId.value
        let createdNow = false
        if (isCreating.value) {
            const created = await createCollection({
                name,
                description: form.description.trim(),
                cover: form.cover.trim(),
                sort: Number(form.sort) || 0,
            })
            if (created.code !== 200 || !created.data) {
                throw new Error(created.message || '系列创建失败')
            }
            collectionId = created.data.collectionId
            createdNow = true
            // 创建成功但文章保存失败时，切到编辑态，重试不会再建出第二个系列
            isCreating.value = false
            activeId.value = collectionId
            activeCollection.value = {
                id: collectionId,
                name,
                description: form.description.trim(),
                cover: form.cover.trim(),
                sort: Number(form.sort) || 0,
                status: 1,
                articleCount: 0,
                publishedCount: 0,
                createdAt: '',
                updatedAt: '',
            }
        } else if (collectionId) {
            const updated = await updateCollection(collectionId, {
                name,
                description: form.description.trim(),
                cover: form.cover.trim(),
                sort: Number(form.sort) || 0,
            })
            if (updated.code !== 200) {
                throw new Error(updated.message || '系列更新失败')
            }
        }

        if (collectionId) {
            const saved = await setCollectionArticles(collectionId, selectedIds.value)
            if (saved.code !== 200) {
                throw new Error(saved.message || '系列文章保存失败')
            }
        }

        noticeMessage.value = createdNow ? '系列创建成功' : '系列已保存'
        showToast('primary', noticeMessage.value)
        await loadCollections()
        if (collectionId) {
            await selectCollection(collectionId)
        }
    } catch (error) {
        errorMessage.value = getErrorMessage(error, '系列保存失败')
        showToast('error', errorMessage.value)
    } finally {
        saving.value = false
    }
}

const handleDelete = async (): Promise<void> => {
    if (!activeId.value || !activeCollection.value) return
    if (!window.confirm(`确定删除系列「${activeCollection.value.name}」吗？文章本身不会被删除。`)) {
        return
    }

    saving.value = true
    clearFeedback()
    try {
        const result = await deleteCollection(activeId.value)
        if (result.code !== 200) {
            throw new Error(result.message || '系列删除失败')
        }
        noticeMessage.value = '系列已删除'
        showToast('primary', noticeMessage.value)
        activeId.value = null
        activeCollection.value = null
        selectedIds.value = []
        resetForm()
        await loadCollections()
        if (collections.value[0]) {
            await selectCollection(collections.value[0].id)
        }
    } catch (error) {
        errorMessage.value = getErrorMessage(error, '系列删除失败')
        showToast('error', errorMessage.value)
    } finally {
        saving.value = false
    }
}

onMounted(async () => {
    void refreshUploadUrl()
    await Promise.all([loadCollections(), loadPickerArticles()])
    if (collections.value[0]) {
        await selectCollection(collections.value[0].id)
    }
})
</script>

<style lang="less" scoped>
.collection-page {
    --red: #d84a3a;
    --green: #239b67;
    --collection-line: color-mix(in srgb, var(--gray1) 84%, transparent);
    --collection-soft: color-mix(in srgb, var(--pcolor1) 42%, var(--bgColor1));
    --collection-card: color-mix(in srgb, var(--bgColor1) 92%, var(--pcolor1));
    --collection-shadow: 0 16px 38px color-mix(in srgb, #1c2540 7%, transparent);
}

.collection-banner {
    padding: 10px 14px;
    border: 1px solid var(--collection-line);
    border-radius: 10px;
    font-size: 13px;

    &.is-error {
        color: var(--red);
        background: color-mix(in srgb, var(--red) 8%, var(--bgColor1));
        border-color: color-mix(in srgb, var(--red) 28%, var(--collection-line));
    }

    &.is-success {
        color: var(--green);
        background: color-mix(in srgb, var(--green) 8%, var(--bgColor1));
        border-color: color-mix(in srgb, var(--green) 26%, var(--collection-line));
    }
}

.collection-shell {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(220px, 264px) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
}

.collection-sidebar,
.collection-editor {
    border: 1px solid var(--collection-line);
    border-radius: 18px;
    background: var(--collection-card);
    box-shadow: var(--collection-shadow);
}

.collection-sidebar {
    position: sticky;
    top: 92px;
    overflow: hidden;
    background:
        linear-gradient(180deg,
            color-mix(in srgb, var(--pcolor) 7%, transparent),
            transparent 170px),
        var(--bgColor1);
}

.collection-sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 17px 16px 15px;
    border-bottom: 1px solid var(--collection-line);

    > div {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
    }

    strong {
        color: var(--gray);
        font-size: 14px;
        font-weight: 700;
    }

    b {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border-radius: 9px;
        color: var(--pcolor);
        background: var(--pcolor1);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }
}

.collection-sidebar-kicker {
    color: var(--pcolor);
    font-size: 9px;
    font-weight: 750;
    letter-spacing: 0.14em;
}

.collection-sidebar-state,
.collection-editor-state {
    display: flex;
    min-height: 180px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: var(--gray6);
    text-align: center;
    font-size: 13px;

    p {
        max-width: 320px;
        margin: 0;
        line-height: 1.7;
    }
}

.collection-empty-mark {
    display: grid;
    width: 52px;
    height: 52px;
    place-items: center;
    border-radius: 16px;
    color: var(--pcolor);
    background: var(--pcolor1);
    font-family: var(--portal-serif, serif);
    font-size: 24px;
}

.collection-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
}

.collection-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
        background 0.18s ease,
        border-color 0.18s ease,
        transform 0.18s ease;

    &:hover {
        background: var(--collection-soft);
        transform: translateX(2px);
    }

    &.is-active {
        border-color: color-mix(in srgb, var(--pcolor) 30%, transparent);
        background:
            linear-gradient(90deg,
                color-mix(in srgb, var(--pcolor) 10%, transparent),
                transparent 88%),
            var(--bgColor1);
        box-shadow: inset 3px 0 0 var(--pcolor);
    }
}

.collection-item-cover {
    display: grid;
    width: 48px;
    height: 48px;
    flex: none;
    place-items: center;
    overflow: hidden;
    border-radius: 11px;
    background: var(--gray2);
    color: var(--pcolor);
    font-family: var(--portal-serif, serif);
    font-size: 18px;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.collection-item-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;

    strong,
    small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    strong {
        color: var(--gray);
        font-size: 13px;
        font-weight: 650;
    }

    small {
        color: var(--gray6);
        font-size: 11px;
    }
}

.collection-editor {
    min-width: 0;
    overflow: hidden;
    background:
        linear-gradient(145deg,
            color-mix(in srgb, var(--pcolor) 4%, transparent),
            transparent 320px),
        var(--bgColor1);
}

.collection-editor-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 24px 26px 20px;
    border-bottom: 1px solid var(--collection-line);
    background:
        radial-gradient(circle at 0 0, color-mix(in srgb, var(--pcolor) 10%, transparent), transparent 38%),
        linear-gradient(120deg, var(--pcolor1), transparent 62%);

    h2 {
        margin: 4px 0 5px;
        color: var(--gray);
        font-size: 24px;
        line-height: 1.25;
    }

    p {
        margin: 0;
        color: var(--gray6);
        font-size: 12px;
    }
}

.collection-editor-title {
    min-width: 0;
}

.collection-editor-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;

    span {
        padding: 4px 9px;
        border: 1px solid color-mix(in srgb, var(--pcolor) 16%, var(--collection-line));
        border-radius: 999px;
        color: var(--gray6);
        background: color-mix(in srgb, var(--bgColor1) 82%, transparent);
        font-size: 10px;
    }
}

.collection-kicker {
    color: var(--pcolor);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
}

.collection-editor-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 9px;
}

.collection-preview-link {
    color: var(--pcolor);
    font-size: 12px;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
}

.collection-editor-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 310px);
    gap: 16px;
    padding: 20px 26px 18px;
    align-items: start;
}

.collection-details-card,
.collection-cover-card {
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--collection-line);
    border-radius: 14px;
    background: color-mix(in srgb, var(--bgColor1) 86%, var(--bgColor2));
}

.collection-cover-card {
    background:
        linear-gradient(160deg,
            color-mix(in srgb, var(--pcolor) 7%, transparent),
            transparent 54%),
        var(--bgColor1);
}

.collection-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px dashed var(--collection-line);

    p {
        margin: 4px 0 0;
        color: var(--gray6);
        font-size: 11px;
        line-height: 1.55;
    }
}

.collection-section-label {
    color: var(--gray);
    font-size: 13px;
    font-weight: 700;
}

.collection-form-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 132px;
    gap: 13px;
}

.collection-cover-upload {
    display: block;
    width: 100%;

    :deep(.yk-upload) {
        width: 100%;
    }

    :deep(.yk-space) {
        width: 100%;
    }

    :deep(.yk-upload__picture),
    :deep(.yk-upload-picture),
    :deep(.yk-upload__picture-button) {
        width: 100%;
        height: auto;
        aspect-ratio: 16 / 10;
        border-radius: 12px;
    }

    :deep(.yk-upload__picture-button) {
        border: 1px dashed color-mix(in srgb, var(--pcolor) 28%, var(--collection-line));
        background:
            radial-gradient(circle at 50% 32%, var(--pcolor1), transparent 46%),
            var(--bgColor2);
    }

    :deep(.picture-desc) {
        gap: 4px;
    }
}

.collection-media-button {
    display: inline-flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 10px;
    border: 1px solid color-mix(in srgb, var(--pcolor) 24%, var(--collection-line));
    border-radius: 10px;
    color: var(--pcolor);
    background: color-mix(in srgb, var(--pcolor) 5%, var(--bgColor1));
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    transition:
        border-color 0.18s ease,
        background 0.18s ease,
        transform 0.18s ease;

    svg {
        font-size: 15px;
    }

    &:hover {
        border-color: color-mix(in srgb, var(--pcolor) 46%, var(--collection-line));
        background: color-mix(in srgb, var(--pcolor) 10%, var(--bgColor1));
        transform: translateY(-1px);
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
}

.collection-cover-hint,
.collection-cover-error {
    margin: 9px 0 0;
    font-size: 10px;
    line-height: 1.55;
}

.collection-cover-hint {
    color: var(--gray6);
}

.collection-cover-error {
    color: var(--red);
    overflow-wrap: anywhere;
}

.collection-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 7px;

    span {
        color: var(--gray6);
        font-size: 12px;
        font-weight: 600;
    }

    i {
        color: var(--red);
        font-style: normal;
    }

    &--full,
    &--wide {
        grid-column: 1 / -1;
    }
}

.collection-input,
.collection-textarea {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid var(--collection-line);
    border-radius: 9px;
    outline: none;
    color: var(--gray);
    background: var(--bgColor2);
    font: inherit;
    font-size: 13px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;

    &:focus {
        border-color: color-mix(in srgb, var(--pcolor) 55%, transparent);
        box-shadow: 0 0 0 3px var(--pcolor1);
    }
}

.collection-input {
    height: 38px;
    padding: 0 11px;
}

.collection-textarea {
    min-height: 78px;
    padding: 10px 11px;
    resize: vertical;
    line-height: 1.65;
}

.collection-members {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    padding: 0 26px 22px;
}

.collection-member-panel {
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--collection-line);
    border-radius: 14px;
    background:
        linear-gradient(180deg,
            color-mix(in srgb, var(--bgColor2) 78%, transparent),
            var(--bgColor1));
}

.collection-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;

    h3 {
        margin: 0 0 3px;
        color: var(--gray);
        font-size: 14px;
    }

    p {
        margin: 0;
        color: var(--gray6);
        font-size: 11px;
        line-height: 1.55;
    }
}

.collection-new-article {
    flex: none;
    padding: 5px 8px;
    border: 1px solid color-mix(in srgb, var(--pcolor) 20%, var(--collection-line));
    border-radius: 8px;
    color: var(--pcolor);
    background: color-mix(in srgb, var(--pcolor) 4%, var(--bgColor1));
    font-size: 10px;
    font-weight: 650;
    line-height: 1.3;
    text-decoration: none;
    transition: background 0.18s ease, border-color 0.18s ease;

    &:hover {
        border-color: color-mix(in srgb, var(--pcolor) 38%, var(--collection-line));
        background: color-mix(in srgb, var(--pcolor) 9%, var(--bgColor1));
    }
}

.collection-search {
    margin-bottom: 9px;
}

.collection-panel-empty {
    padding: 22px 8px;
    color: var(--gray6);
    text-align: center;
    font-size: 12px;
}

.collection-selected-list,
.collection-available-list {
    display: flex;
    max-height: 350px;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    padding: 0;
    margin: 0;
    list-style: none;
}

.collection-selected-item,
.collection-available-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px;
    border: 1px solid var(--collection-line);
    border-radius: 10px;
    background: var(--bgColor1);
    transition:
        border-color 0.18s ease,
        background 0.18s ease,
        transform 0.18s ease;
}

.collection-available-item {
    width: 100%;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
        border-color: color-mix(in srgb, var(--pcolor) 30%, var(--collection-line));
        background: color-mix(in srgb, var(--pcolor) 3%, var(--bgColor1));
        transform: translateY(-1px);
    }
}

.collection-order {
    display: grid;
    width: 26px;
    height: 26px;
    flex: none;
    place-items: center;
    border-radius: 7px;
    color: var(--pcolor);
    background: var(--pcolor1);
    font-size: 10px;
    font-weight: 700;
}

.collection-article-cover {
    display: grid;
    width: 34px;
    height: 34px;
    flex: none;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    color: var(--pcolor);
    background:
        linear-gradient(145deg,
            color-mix(in srgb, var(--pcolor) 12%, transparent),
            transparent),
        var(--bgColor2);
    font-family: var(--portal-serif, serif);
    font-size: 13px;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    &.is-empty {
        border: 1px dashed color-mix(in srgb, var(--pcolor) 18%, var(--collection-line));
    }
}

.collection-selected-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    strong,
    small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    strong {
        color: var(--gray);
        font-size: 12px;
        font-weight: 600;
    }

    small {
        color: var(--gray6);
        font-size: 10px;
    }
}

.collection-row-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 3px;
}

.collection-icon-button,
.collection-remove-button {
    border: 0;
    color: var(--gray6);
    background: transparent;
    font-size: 11px;
    cursor: pointer;

    &:hover:not(:disabled) {
        color: var(--pcolor);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.3;
    }
}

.collection-icon-button {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    font-size: 13px;
}

.collection-remove-button {
    padding: 3px 4px;
}

.collection-add-mark {
    color: var(--pcolor);
    font-size: 17px;
    font-weight: 300;
}

.collection-editor-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 26px;
    border-top: 1px solid var(--collection-line);
    background:
        linear-gradient(90deg, var(--collection-soft), transparent 70%),
        var(--bgColor1);
}

.collection-foot-note {
    color: var(--gray6);
    font-size: 11px;
}

.collection-foot-actions {
    display: flex;
    flex: none;
    gap: 8px;
}

@media (max-width: 1320px) {
    .collection-editor-body {
        grid-template-columns: 1fr;
    }

    .collection-cover-card {
        display: grid;
        grid-template-columns: minmax(190px, 250px) minmax(0, 1fr);
        gap: 0 16px;
        align-items: start;
    }

    .collection-cover-card .collection-section-head {
        grid-column: 1 / -1;
    }

    .collection-cover-card .collection-media-button {
        grid-column: 2;
        margin-top: 0;
    }

    .collection-cover-card .collection-cover-hint,
    .collection-cover-card .collection-cover-error {
        grid-column: 2;
    }
}

@media (max-width: 1100px) {
    .collection-shell {
        grid-template-columns: 1fr;
    }

    .collection-sidebar {
        position: static;
    }

    .collection-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
}

@media (max-width: 760px) {
    .collection-members {
        grid-template-columns: 1fr;
    }

    .collection-form-grid {
        grid-template-columns: 1fr;
    }

    .collection-editor-head,
    .collection-editor-body,
    .collection-members {
        padding-right: 16px;
        padding-left: 16px;
    }

    .collection-cover-card {
        display: block;
    }

    .collection-cover-card .collection-media-button {
        margin-top: 10px;
    }

    .collection-editor-head,
    .collection-editor-foot {
        flex-direction: column;
        align-items: stretch;
    }

    .collection-editor-actions {
        justify-content: flex-end;
    }

    .collection-foot-actions {
        justify-content: flex-end;
    }
}
</style>
