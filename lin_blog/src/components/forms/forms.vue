<template>
    <div class="forms" :class="{ formsHeight: props.classify === 0, 'forms-gallery': props.classify === 1 }">
        <div class="forms-layout">
            <div class="forms-content">
                <input type="text" class="forms-title" v-model="formData.title" maxlength="150"
                    placeholder="请输入标题">

                <div class="forms-meta">
                    <yk-dropdown :title="subsetName || '选择分类'" type="secondary" size="s" trigger="click"
                        @selected="subsetSelect">
                        <yk-dropdown-item v-for="(item, index) in subsetList" :key="index"
                            :value="item.id">{{item.name}}</yk-dropdown-item>
                    </yk-dropdown>
                    <yk-space class="forms-tags" align="center" size="s">
                        <yk-tag v-for="(tag, index) in formData.label" :key="index" class="tag" shape="round"
                            @close="deleteLabel(tag)" closeable>
                            {{ tag }}
                        </yk-tag>
                        <yk-text @click="showModal" style="cursor: pointer;white-space: nowrap;" type="third"
                            v-show="formData.label.length<3">
                            插入标签
                        </yk-text>
                    </yk-space>
                </div>

                <div class="forms-intro" :class="{ introduce: props.classify === 0 }">
                    <div v-if="showAiEntry" class="forms-ai-bar">
                        <yk-button type="secondary" size="s" :loading="aiBusy"
                            @click="requestAiSuggestion">
                            AI 建议
                        </yk-button>
                        <yk-text type="third">根据标题与正文生成简介和标签，确认后才会填充</yk-text>
                    </div>
                    <div v-if="showGalleryAiEntry" class="forms-ai-bar">
                        <yk-button type="secondary" size="s" :loading="galleryAiBusy"
                            @click="requestGalleryCuration">
                            AI 策展建议
                        </yk-button>
                        <yk-input v-model="galleryAiTheme" class="forms-ai-theme" size="s" :limit="300"
                            placeholder="补充主题，如：春日海岸、城市黄昏" clearable />
                    </div>
                    <yk-text-area v-model="formData.introduce" clearable placeholder="请输入简介" :auto-size="raws"
                        :max-length="512"></yk-text-area>
                    <p v-if="aiError" class="forms-ai-error">{{ aiError }}</p>
                    <p v-if="galleryAiError" class="forms-ai-error">{{ galleryAiError }}</p>
                    <div v-if="aiSuggestion" class="forms-ai-suggestion">
                        <p class="forms-ai-suggestion-title">
                            AI 生成的简介与标签（采用后将覆盖当前简介，并补充标签）：
                        </p>
                        <p class="forms-ai-suggestion-summary">{{ aiSuggestion.summary }}</p>
                        <yk-space wrap size="s">
                            <yk-tag v-for="tag in aiSuggestion.labels" :key="tag" shape="round">
                                {{ tag }}
                            </yk-tag>
                        </yk-space>
                        <yk-space size="s" class="forms-ai-suggestion-actions">
                            <yk-button size="s" @click="applyAiSuggestion">采用建议</yk-button>
                            <yk-button type="secondary" size="s" @click="dismissAiSuggestion">忽略</yk-button>
                        </yk-space>
                    </div>
                    <div v-if="galleryAiSuggestion" class="forms-ai-suggestion">
                        <p class="forms-ai-suggestion-title">
                            AI 生成的图库策展建议（逐项采用，不会自动覆盖当前内容）：
                        </p>
                        <p v-if="galleryAiSuggestion.degraded" class="forms-ai-degraded">
                            默认模型暂时不可用，本次由「{{ galleryAiSuggestion.modelName }}」生成
                        </p>
                        <div class="forms-gallery-curation">
                            <div v-for="title in galleryAiSuggestion.titles" :key="title" class="forms-gallery-curation-item">
                                <p class="forms-gallery-curation-text">{{ title }}</p>
                                <yk-button size="s" type="secondary" @click="applyGalleryTitle(title)">采用标题</yk-button>
                            </div>
                            <div class="forms-gallery-curation-item is-column">
                                <p class="forms-gallery-curation-text">{{ galleryAiSuggestion.summary }}</p>
                                <yk-button size="s" type="secondary" @click="applyGallerySummary">采用简介</yk-button>
                            </div>
                            <div class="forms-gallery-curation-item is-column">
                                <yk-space wrap size="s">
                                    <yk-tag v-for="label in galleryAiSuggestion.labels" :key="label" shape="round">
                                        {{ label }}
                                    </yk-tag>
                                </yk-space>
                                <yk-button size="s" type="secondary" :disabled="formData.label.length >= 3"
                                    @click="applyGalleryLabels">补充标签</yk-button>
                            </div>
                        </div>
                        <yk-space size="s" class="forms-ai-suggestion-actions">
                            <yk-button type="secondary" size="s" @click="dismissGalleryCuration">忽略</yk-button>
                        </yk-space>
                    </div>
                </div>
            </div>

            <div class="forms-cover" v-if="props.classify == 0">
                <span class="forms-cover-label">文章封面</span>
                <yk-upload :file-list="coverFileList" :upload-url="uploadUrl" :limit="1" :multiple="false"
                    accept="image/jpeg,image/png,image/webp,image/gif" :max-size="8 * 1024 * 1024"
                    desc="上传封面" @handle-success="handleCoverSuccess"
                    @handle-error="handleCoverError" @handle-delete="handleCoverDelete" />
                <ImageSourceActions ai-label="AI 生成封面"
                    :title="formData.title" :introduce="formData.introduce" :content="props.aiContent || ''"
                    @pick="mediaPickerOpen = true" @adopt="applyAiCover" />
                <p v-if="coverUploadError" class="forms-cover-error">
                    {{ coverUploadError }}
                </p>
            </div>
        </div>
    </div>

    <yk-modal v-model="visible" title="标签" size="s" :show-footer="false">
        <yk-space dir="vertical" size="l">
            <yk-input v-model="inputLabel" @submit="addLabel" :limit="5" placeholder="请输入标签回车确定" style="width: 280px;"
                clearable></yk-input>
            <yk-space size="s">
                <yk-tag v-for="(tag, index) in formData.label" :key="index" class="tag" shape="round"
                    @close="deleteLabel(tag)" closeable>
                    {{ tag }}
                </yk-tag>
            </yk-space>
            <yk-space wrap size="s" style="padding-top: 8px;">
                <yk-tag v-for="(tag, index) in labelArr" :key="index" class="tag" shape="round" style="cursor: pointer;"
                    @click="selectLabel(tag)">
                    {{ tag }}
                </yk-tag>
            </yk-space>
        </yk-space>
    </yk-modal>

    <MediaPickerDialog v-model:open="mediaPickerOpen" @select="handleMediaSelect" />
</template>

<script lang="ts" setup>
import { ref, watch, onMounted, computed, getCurrentInstance } from 'vue'
import { useSubsetStore } from '../../store/subset.ts'
import { useLabelStore } from '../../store/label.ts'
import { useSessionStore } from '../../store/session.ts'
import { buildImageUploadUrl } from '../../utils/uploadUrl.ts'
import { getRequestErrorMessage } from '../../api/file.ts'
import {
    suggestArticleMeta,
    suggestGalleryCuration,
    getRequestErrorMessage as getAiRequestErrorMessage,
} from '../../api/ai.ts'
import MediaPickerDialog from '../common/MediaPickerDialog.vue'
import ImageSourceActions from '../common/ImageSourceActions.vue'

type FormData = {
    title: string
    subsetId: number | undefined
    subsetName?: string
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type InitialFormData = Partial<FormData>

type SubsetOption = {
    id: number
    name: string
}

type LabelOption = {
    id: number
    name: string
}

type AiSuggestion = {
    summary: string
    labels: string[]
}

type AiGalleryCurationSuggestion = {
    titles: string[]
    summary: string
    labels: string[]
    degraded?: boolean
    modelName?: string
}

type CoverFile = {
    name: string
    url: string
}

type UploadResponse = {
    data?: {
        url?: string
    }
    url?: string
}

const props = withDefaults(defineProps<{
    classify?: number
    initialData?: InitialFormData
    /** 编辑器正文：AI 建议按需读取；图库编辑器不传则不显示 AI 入口 */
    aiContent?: string
    /** 当前图库照片数量，用于让策展建议了解图库规模 */
    photoCount?: number
}>(), {
    classify: 0,
    initialData: undefined,
    aiContent: undefined,
    photoCount: 0,
})

const emits = defineEmits<{
    formData: [data: FormData]
}>()

type MessageProxy = {
    $message?: (options: {
        type: 'primary' | 'warning' | 'error' | 'success'
        message: string
    }) => void
}

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const subsetStore = useSubsetStore()
const labelStore = useLabelStore()

const formData = ref<FormData>({
    title: '',
    subsetId: undefined,
    label: [],
    introduce: '',
    cover: '',
    classify: props.classify,
})

const emitFormData = (): void => {
    emits('formData', {
        ...formData.value,
        label: [...formData.value.label],
    })
}

// 简介行数
const raws = computed(() => {
    if (props.classify === 1) {
        return {
            minRows: 8,
            maxRows: 10,
        }
    }

    return {
        minRows: 4,
        maxRows: 10,
    }
})

// 分类名称
const subsetName = ref<string>('')

// 分类列表
const subsetList = ref<SubsetOption[]>([])

// 封面上传
const coverFileList = ref<CoverFile[]>([])
const coverUploadError = ref('')
const mediaPickerOpen = ref(false)

// AI 建议：仅作为建议展示，作者点「采用建议」后才写入表单字段
// 入口是否出现由 ai.use 权限决定，服务端同样按该权限校验
const session = useSessionStore()
const showAiEntry = computed(() => props.aiContent !== undefined && session.can('ai.use'))
// 图库没有正文，策展建议走独立入口，只受 ai.use 权限约束
const showGalleryAiEntry = computed(() => props.classify === 1 && session.can('ai.use'))
const aiBusy = ref(false)
const aiError = ref('')
const aiSuggestion = ref<AiSuggestion | null>(null)

const requestAiSuggestion = async (): Promise<void> => {
    if (aiBusy.value) return

    const title = formData.value.title.trim()
    const content = (props.aiContent || '').trim()
    if (!title) {
        aiError.value = '请先填写标题，再获取 AI 建议'
        return
    }
    if (!content) {
        aiError.value = '请先写一点正文，再获取 AI 建议'
        return
    }

    aiBusy.value = true
    aiError.value = ''
    try {
        const result = await suggestArticleMeta({ title, content })
        if (result.code === 200 && result.data) {
            aiSuggestion.value = result.data
        } else {
            aiError.value = result.message || 'AI 建议生成失败，请稍后重试'
        }
    } catch (error) {
        aiError.value = getAiRequestErrorMessage(error, 'AI 建议生成失败，请稍后重试')
    } finally {
        aiBusy.value = false
    }
}

const applyAiSuggestion = (): void => {
    const suggestion = aiSuggestion.value
    if (!suggestion) return

    formData.value.introduce = suggestion.summary
    for (const label of suggestion.labels) {
        if (formData.value.label.length >= 3) break
        if (!formData.value.label.includes(label)) {
            formData.value.label.push(label)
            labelArr.value = labelArr.value.filter(item => item !== label)
        }
    }
    aiSuggestion.value = null
}

const dismissAiSuggestion = (): void => {
    aiSuggestion.value = null
}

const galleryAiBusy = ref(false)
const galleryAiError = ref('')
const galleryAiTheme = ref('')
const galleryAiSuggestion = ref<AiGalleryCurationSuggestion | null>(null)

const requestGalleryCuration = async (): Promise<void> => {
    if (galleryAiBusy.value) return

    const title = formData.value.title.trim()
    const introduce = formData.value.introduce.trim()
    const theme = galleryAiTheme.value.trim()
    if (!title && !introduce && !theme) {
        galleryAiError.value = '请先填写标题、简介或补充主题，再获取 AI 策展建议'
        return
    }

    galleryAiBusy.value = true
    galleryAiError.value = ''
    try {
        const result = await suggestGalleryCuration({
            title,
            introduce,
            theme,
            photoCount: props.photoCount || 0,
        })
        if (result.code === 200 && result.data) {
            galleryAiSuggestion.value = result.data
        } else {
            galleryAiError.value = result.message || 'AI 策展建议生成失败，请稍后重试'
        }
    } catch (error) {
        galleryAiError.value = getAiRequestErrorMessage(error, 'AI 策展建议生成失败，请稍后重试')
    } finally {
        galleryAiBusy.value = false
    }
}

const applyGalleryTitle = (title: string): void => {
    formData.value.title = title
    if (galleryAiSuggestion.value?.titles.length) {
        galleryAiSuggestion.value.titles = galleryAiSuggestion.value.titles.filter(item => item !== title)
    }
    if (!galleryAiSuggestion.value?.titles.length) {
        galleryAiSuggestion.value = null
    }
}

const applyGallerySummary = (): void => {
    const suggestion = galleryAiSuggestion.value
    if (!suggestion?.summary) return
    formData.value.introduce = suggestion.summary
    suggestion.summary = ''
}

const applyGalleryLabels = (): void => {
    const suggestion = galleryAiSuggestion.value
    if (!suggestion) return
    const remaining: string[] = []
    for (const label of suggestion.labels) {
        if (formData.value.label.length >= 3) {
            remaining.push(label)
        } else if (!formData.value.label.includes(label)) {
            formData.value.label.push(label)
            labelArr.value = labelArr.value.filter(item => item !== label)
        } else if (!remaining.includes(label)) {
            remaining.push(label)
        }
    }
    suggestion.labels = remaining
    if (!suggestion.summary && !suggestion.labels.length && !suggestion.titles.length) {
        galleryAiSuggestion.value = null
    }
}

const dismissGalleryCuration = (): void => {
    galleryAiSuggestion.value = null
}
// 每次上传前换取一次性票据：URL 里流通的是 5 分钟失效的短期票据，
// 不再是长期有效的登录 token（避免进入访问日志与浏览器历史）
const uploadUrl = ref('')
const ticketBusy = ref(false)

const refreshUploadUrl = async (): Promise<void> => {
    if (ticketBusy.value) return
    ticketBusy.value = true
    try {
        uploadUrl.value = await buildImageUploadUrl()
        coverUploadError.value = ''
    } catch (error) {
        coverUploadError.value = getRequestErrorMessage(error)
    } finally {
        ticketBusy.value = false
    }
}

const syncCoverFileList = () => {
    coverFileList.value = formData.value.cover
        ? [{ name: '文章封面', url: formData.value.cover }]
        : []
}

const handleCoverSuccess = (response: UploadResponse): void => {
    const url = response.data?.url || response.url
    if (!url) return

    coverUploadError.value = ''
    formData.value.cover = url
    coverFileList.value = [{ name: '文章封面', url }]
    // 票据按次消费，上传成功后换一张，避免下次上传拿到已用尽的票据
    void refreshUploadUrl()
}

const handleCoverError = (error: unknown): void => {
    let message = '封面上传失败，请确认后端服务已启动并重新登录后再试'

    if (typeof error === 'string' && error.trim()) {
        message = error
    } else if (typeof error === 'object' && error !== null) {
        const response = error as {
            error?: unknown
            message?: unknown
        }
        const responseMessage = response.error || response.message
        if (typeof responseMessage === 'string' && responseMessage.trim()) {
            message = responseMessage
        }
    }

    coverUploadError.value = message
    proxy?.$message?.({ type: 'error', message })
}

const handleCoverDelete = (): void => {
    coverUploadError.value = ''
    formData.value.cover = ''
    coverFileList.value = []
    void refreshUploadUrl()
}

// 从素材库选择封面：素材库图片与本地文件同源，raw 地址可直接被内容引用
const handleMediaSelect = (urls: string[]): void => {
    const url = urls[0]
    if (!url) return

    coverUploadError.value = ''
    formData.value.cover = url
    coverFileList.value = [{ name: '文章封面', url }]
}

// AI 封面采用后才写入封面字段（图片已由共享组件确认落库）
const applyAiCover = (url: string): void => {
    if (!url) return

    coverUploadError.value = ''
    formData.value.cover = url
    coverFileList.value = [{ name: '文章封面', url }]
}

const getSubset = () => {
    subsetList.value = subsetStore.data.map(item => ({
        id: Number(item.id),
        name: String(item.name),
    }))
    syncSubsetName()
}

const syncSubsetName = () => {
    const selected = subsetList.value.find(
        item => item.id === formData.value.subsetId
    )
    subsetName.value = formData.value.subsetName || selected?.name || ''
}

// 选择分类
const subsetSelect = (value: string | number) => {
    const id = Number(value)
    if (!Number.isFinite(id)) return

    formData.value.subsetId = id

    const selectedSubset = subsetList.value.find(item => item.id === id)
    if (selectedSubset) {
        subsetName.value = selectedSubset.name
        formData.value.subsetName = selectedSubset.name
    }
}

// 标签
const tags = ref<LabelOption[]>([])
const labelArr = ref<string[]>([])
const inputLabel = ref<string>('')

const getTags = () => {
    tags.value = labelStore.data.map((item: { id: string | number; name: string | number }) => ({
        id: Number(item.id),
        name: String(item.name),
    }))
    labelArr.value = tags.value.map((item: LabelOption) => item.name)
}

// 标签弹窗
const visible = ref(false)

const showModal = () => {
    visible.value = true
}

// 新增标签
const addLabel = () => {
    const label = inputLabel.value.trim()

    if (label && formData.value.label.length < 3) {
        if (!formData.value.label.includes(label)) {
            formData.value.label.push(label)
            labelArr.value = labelArr.value.filter(item => item !== label)
        }
    }

    inputLabel.value = ''
}

// 选择标签
const selectLabel = (label: string) => {
    if (
        formData.value.label.length < 3 &&
        !formData.value.label.includes(label)
    ) {
        formData.value.label.push(label)
        labelArr.value = labelArr.value.filter(item => item !== label)
    }
}

// 删除标签
const deleteLabel = (label: string) => {
    formData.value.label = formData.value.label.filter(
        item => item !== label
    )

    if (!labelArr.value.includes(label)) {
        labelArr.value.push(label)
    }
}

// 表单数据变化时通知父组件
watch(
    formData,
    (data) => {
        emits('formData', {
            ...data,
            label: [...data.label],
        })
    },
    { deep: true }
)

watch(
    () => formData.value.subsetId,
    () => {
        syncSubsetName()
    }
)

watch(
    () => props.initialData,
    (data) => {
        if (!data) return

        formData.value = {
            ...formData.value,
            ...data,
            label: Array.isArray(data.label) ? [...data.label] : [],
            classify: props.classify,
        }
        syncSubsetName()
        syncCoverFileList()
        emitFormData()
    },
    { deep: true, immediate: true }
)

onMounted(() => {
    //  分类来自数据库；图库共用文章分组
    void subsetStore.fetchSubsets('article').then(() => getSubset())
    //  标签建议来自数据库字典表
    if (labelStore.data.length === 0) {
        void labelStore.fetchLabels().then(() => getTags())
    } else {
        getTags()
    }
    emitFormData()
    void refreshUploadUrl()
})
</script>


<style lang="less" scoped>
    .forms {
        position: relative;
        width: 100%;
        height: calc(100vh * 0.71);

        @media (max-height: 850px) {
            height: calc(100vh * 0.71);
        }

        @media (min-height: 851px) {
            height: calc(100vh * 0.798);
        }

        &-title {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            font-size: @size-xl;
            font-weight: bold;
            color: @font-color-l;
            align-items: center;
        }

        &-layout {
            display: flex;
            width: 100%;
            gap: @space-xl;
            align-items: flex-start;
        }

        &-content {
            flex: 1;
            min-width: 0;
        }

        &-meta {
            display: flex;
            align-items: center;
            gap: @space-l;
            width: 100%;
            margin-top: @space-l;
        }

        &.forms-gallery {
            height: 100%;
            min-height: 0;
            display: flex;
            flex-direction: column;

            .forms-layout,
            .forms-content {
                height: 100%;
            }

            .forms-content {
                display: flex;
                flex-direction: column;
            }

            .forms-intro {
                flex: 1;
            }

            .forms-title {
                padding-bottom: @space-m;
                border-bottom: 1px solid var(--admin-line, @line-color-s);
            }

            .forms-meta {
                flex-wrap: wrap;
                row-gap: @space-m;
                margin-top: @space-m;
            }

            .forms-tags {
                flex: 1 0 100%;
                flex-wrap: wrap;
                row-gap: @space-s;
            }

            .forms-intro {
                margin-top: @space-l;
                padding-top: @space-l;
                border-top: 1px solid var(--admin-line, @line-color-s);
            }
        }

        &-tags {
            flex: 1;
            min-width: 0;
        }

        .introduce {
            width: 100%;
            border-bottom: 1px solid @gray-2;
            padding-top: @space-xl;
        }

        &-cover {
            flex: 0 0 160px;
            display: flex;
            flex-direction: column;
            gap: @space-s;

            &-label {
                color: @font-color-m;
                font-size: @size-s;
                line-height: 20px;
            }

            &-error {
                max-width: 160px;
                color: #d84a3a;
                font-size: @size-s;
                line-height: 1.5;
                overflow-wrap: anywhere;
            }
        }

        input {
            border: none;
            background: transparent;
            outline: none;

            &::placeholder {
                color: @gray-5;
            }
        }
    }

    .formsHeight {
        height: auto;
        /* background: @bg-color-l; */

        /* @media (max-height: 850px) {
            height: calc(100vh * 0.6);
        }

        @media (min-height: 951px) {
            height: calc(100vh * 0.7);
        } */
    }

    .forms-ai-bar {
        display: flex;
        align-items: center;
        gap: @space-l;
        margin-bottom: @space-m;
    }

    .forms-ai-theme {
        width: min(360px, 100%);
    }

    .forms-ai-error {
        margin-top: @space-s;
        color: #d84a3a;
        font-size: @size-s;
        line-height: 1.5;
    }

    .forms-ai-suggestion {
        margin-top: @space-m;
        padding: @space-l;
        border: 1px solid var(--admin-line, @line-color-s);
        border-radius: 8px;
        background: var(--admin-bg, @bg-color-l);

        &-title {
            margin: 0 0 @space-s;
            color: @font-color-s;
            font-size: @size-s;
            line-height: 1.5;
        }

        &-summary {
            margin: 0 0 @space-m;
            color: @font-color-m;
            font-size: @size-m;
            line-height: 1.7;
            word-break: break-word;
        }

        &-actions {
            margin-top: @space-m;
        }
    }

    .forms-ai-degraded {
        margin: 0 0 @space-s;
        padding: 4px 8px;
        border-radius: 6px;
        background: color-mix(in srgb, #d98716 12%, transparent);
        color: #a86a10;
        font-size: @size-s;
        line-height: 1.5;
    }

    .forms-gallery-curation {
        display: flex;
        flex-direction: column;
        gap: @space-s;
    }

    .forms-gallery-curation-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: @space-m;
        padding: @space-s;
        border: 1px solid var(--admin-line, @line-color-s);
        border-radius: 6px;
        background: var(--admin-card, transparent);

        &.is-column {
            align-items: flex-start;
            flex-direction: column;
        }
    }

    .forms-gallery-curation-text {
        margin: 0;
        color: @font-color-m;
        font-size: @size-m;
        line-height: 1.6;
        word-break: break-word;
    }
</style>
<style lang="less">
    .forms {
        .yk-text-area {
            background-color: transparent;
            border: none;
            border-radius: 0;
            padding: 0;
            /* border-bottom: 1px solid @line-color-m; */
        }

        .yk-text-area__inner {
            font-size: @size-m;
            line-height: 1.5;

            &::placeholder {
                color: @gray-5;
            }
        }

        .forms-cover {
            .yk-upload__picture,
            .yk-upload-picture,
            .yk-upload__picture-button {
                width: 160px;
                height: 120px;
            }

        }

        @media (max-width: 900px) {
            .forms-layout {
                flex-direction: column-reverse;
            }

            .forms-cover {
                width: 100%;
                flex-basis: auto;
            }

            .forms-cover .yk-upload__picture,
            .forms-cover .yk-upload-picture,
            .forms-cover .yk-upload__picture-button {
                width: 160px;
                height: 120px;
            }
        }
    }
</style>
