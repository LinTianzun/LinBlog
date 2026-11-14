<template>
    <div class="diary-editor">
        <div class="diary-editor-top">
            <div class="diary-editor-top-form">
                <input type="text" class="diary-editor-top-title" placeholder="请输入标题" v-model="diaryForm.title">

                <yk-popover title="选择天气" placement="bottomRight">
                    <template #content>
                        <yk-space wrap :size="[32,20]" style="padding: 16px 8px;">
                            <div class="diary-editor-top-weather" v-for="item in weathers" :key="item.id"
                                :class="{selected:swWeatherId===item.id}">
                                <img :src="item.iconUrl" @click="selectWeather(item)" alt="">
                            </div>
                        </yk-space>
                    </template>

                    <img :src="seWeather" alt="">
                </yk-popover>
            </div>

            <div class="diary-editor-ai-bar" v-if="canUseAi">
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('polish')">AI 润色</yk-button>
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('shorten')">AI 精简</yk-button>
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('expand')">AI 扩写</yk-button>
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('continue')">AI 续写</yk-button>
                <yk-button type="secondary" size="s" :loading="aiImageBusy" @click="requestAiGalleryDescription">
                    AI 描述配图
                </yk-button>
            </div>

            <yk-text-area class="diary-editor-top-content" v-model="diaryForm.content" placeholder="请输入..."
                :max-length="1600" clearable :auto-size="{
                    minRows: 20,
                    maxRows: 20,
                  }">
            </yk-text-area>

            <div v-if="aiWriting" class="diary-editor-ai-result">
                <p class="diary-editor-ai-result-title">
                    AI 生成的{{ getWritingActionLabel(aiWriting.action) }}内容（采用后才会写入编辑器）：
                </p>
                <p v-if="aiWriting.degraded" class="diary-editor-ai-result-degraded">
                    默认模型暂时不可用，本次由「{{ aiWriting.modelName }}」生成
                </p>
                <p class="diary-editor-ai-result-text">{{ aiWriting.text }}</p>
                <div class="diary-editor-ai-result-actions">
                    <yk-button size="s" @click="applyAiWriting">采用</yk-button>
                    <yk-button type="secondary" size="s" @click="dismissAiWriting">忽略</yk-button>
                </div>
            </div>
            <p v-if="aiError" class="diary-editor-ai-error">{{ aiError }}</p>
            <p v-if="aiImageError" class="diary-editor-ai-error">{{ aiImageError }}</p>

            <div v-if="aiGalleryDescription" class="diary-editor-ai-result">
                <p class="diary-editor-ai-result-title">
                    AI 生成的配图描述（采用后会追加到正文）：
                </p>
                <p v-if="aiGalleryDescription.degraded" class="diary-editor-ai-result-degraded">
                    默认模型暂时不可用，本次由「{{ aiGalleryDescription.modelName }}」生成
                </p>
                <p class="diary-editor-ai-result-text">{{ aiGalleryDescription.text }}</p>
                <div class="diary-editor-ai-result-actions">
                    <yk-button size="s" @click="applyAiGalleryDescription">采用描述</yk-button>
                    <yk-button type="secondary" size="s" @click="dismissAiGalleryDescription">忽略</yk-button>
                </div>
            </div>

            <section class="diary-editor-top-picture" aria-label="随笔配图">
                <header class="diary-photo-head">
                    <div>
                        <strong>配图</strong>
                        <span>第一张会作为封面，最多 {{ maxPhotoCount }} 张，单张不超过 8MB。</span>
                    </div>
                    <span class="diary-photo-count">
                        {{ photos.length }} / {{ maxPhotoCount }}
                        <template v-if="pendingPhotos.length > 0"> · 上传中</template>
                    </span>
                </header>

                <div class="diary-editor-top-existing" v-if="photos.length > 0 || pendingPhotos.length > 0">
                    <div class="diary-editor-top-photo" v-for="(url, index) in photos" :key="url">
                        <img :src="url" alt="" loading="lazy">
                        <span class="diary-editor-top-photo-index">{{ index + 1 }}</span>
                        <button type="button" class="diary-editor-top-photo-delete" title="删除这张配图"
                            @click="removePhoto(url)">
                            <IconDeleteOutline />
                        </button>
                        <div class="diary-editor-top-photo-actions">
                            <button v-if="index > 0" type="button" title="设为封面"
                                @click="setPhotoCover(index)">封</button>
                            <button type="button" title="前移" :disabled="index === 0"
                                @click="movePhoto(index, -1)">←</button>
                            <button type="button" title="后移" :disabled="index === photos.length - 1"
                                @click="movePhoto(index, 1)">→</button>
                        </div>
                    </div>

                    <div v-for="pending in pendingPhotos" :key="pending.id" class="diary-photo-pending">
                        <span class="diary-photo-pending-name">{{ pending.name }}</span>
                        <strong>{{ pending.progress }}%</strong>
                        <span class="diary-photo-pending-bar">
                            <i :style="{ width: `${pending.progress}%` }" />
                        </span>
                    </div>
                </div>

                <div v-else class="diary-photo-empty">
                    <IconPlusOutline />
                    <strong>还没有配图</strong>
                    <span>上传本地图片、从素材库选择，或让 AI 生成一张。</span>
                </div>

                <div class="diary-photo-tools">
                    <button type="button" class="diary-photo-upload" :disabled="!canAddPhoto"
                        @click="openFilePicker">
                        <IconPlusOutline />
                        上传本地图片
                    </button>
                    <ImageSourceActions v-if="canAddPhoto" library-label="素材库" ai-label="AI 生成配图"
                        :title="diaryForm.title || ''" :content="diaryForm.content || ''"
                        @pick="openMediaPicker" @adopt="handleAiPhoto" />
                    <span v-else class="diary-photo-limit">已达配图上限，删除一张后可继续添加。</span>
                </div>

                <p v-if="photoUploadError" class="diary-photo-error">{{ photoUploadError }}</p>

                <input ref="fileInputRef" class="diary-photo-file-input" type="file" accept="image/*" multiple
                    @change="handleFilePick" />
            </section>
        </div>


        <div class="diary-editor-foot">
            <yk-space size="s">
                <yk-button type="secondary" @click="cancelEdit" v-if="editingId">取消</yk-button>
                <yk-button type="secondary" @click="resetForm" v-else>取消</yk-button>
                <yk-button :loading="submitting" @click="submitDiary">{{ editingId ? '保存修改' : '新建笔记' }}</yk-button>
            </yk-space>
        </div>
    </div>

    <MediaPickerDialog v-model:open="mediaPickerOpen" multiple :max-count="remainingPhotoSlots"
        @select="handleMediaSelect" />
</template>

<script lang="ts" setup>
import { computed, ref, onMounted, getCurrentInstance } from 'vue'
import { weathers } from '../../utils/weather'
import { createDiary, updateDiary, getRequestErrorMessage } from '../../api/diary'
import {
    describeAiImages,
    rewriteArticleText,
    getRequestErrorMessage as getAiRequestErrorMessage,
    type AiGalleryDescriptionResult,
    type AiWritingAction,
    type AiWritingSuggestion,
} from '../../api/ai'
import { buildImageUploadUrl } from '../../utils/uploadUrl.ts'
import type { DiaryData } from '../../utils/interface'
import MediaPickerDialog from '../common/MediaPickerDialog.vue'
import ImageSourceActions from '../common/ImageSourceActions.vue'
import { useSessionStore } from '../../store/session.ts'
import { getAiFeatures, markAiFeature, resetAiFeatures } from '../../utils/aiMarker.ts'

type DiaryForm = {
    title?: string
    weatherId: number
    content?: string
    picture?: string[]
}

type WeatherItem = {
    id: number
    name: string
    iconUrl: string
}

type UploadResponse = {
    code?: number
    error?: string
    message?: string
    data?: { url?: string }
    url?: string
}

type PendingPhoto = {
    id: number
    name: string
    progress: number
}

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type MessageProxy = {
    $message?: (options: MessageOptions) => void
}

const emits = defineEmits<{
    (e: 'created'): void
    (e: 'updated'): void
}>()

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined

const diaryForm = ref<DiaryForm>({
    weatherId: 0,
    picture: [],
})

// AI 写作辅助入口按 ai.use 权限收敛，服务端同样按该权限校验
const session = useSessionStore()
const canUseAi = computed(() => session.can('ai.use'))
const aiBusy = ref(false)
const aiError = ref('')
const aiWriting = ref<AiWritingSuggestion | null>(null)
const aiImageBusy = ref(false)
const aiImageError = ref('')
const aiGalleryDescription = ref<AiGalleryDescriptionResult | null>(null)

// 当前天气
const seWeather = ref<string>('')
const swWeatherId = ref<number>(0)
const selectedWeatherName = ref<string>('')

// 选择天气
const selectWeather = (item: WeatherItem): void => {
    seWeather.value = item.iconUrl
    swWeatherId.value = item.id
    selectedWeatherName.value = item.name
    diaryForm.value.weatherId = item.id
}

// 图片上传（photos 为唯一数据源，自定义面板统一管理缩略图、进度和排序）
const photos = ref<string[]>([])
const mediaPickerOpen = ref(false)
const pendingPhotos = ref<PendingPhoto[]>([])
const photoUploadError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const maxPhotoCount = 6
let photoUploadSeq = 0
// 重置/切换随笔时递增，旧请求完成后不再往新表单里追加图片
let photoUploadEpoch = 0

const remainingPhotoSlots = computed(() =>
    Math.max(0, maxPhotoCount - photos.value.length - pendingPhotos.value.length))
const canAddPhoto = computed(() => remainingPhotoSlots.value > 0)

const syncPhotos = (): void => {
    diaryForm.value.picture = [...photos.value]
}

// 编辑中的日记 ID：为空表示新建模式
const editingId = ref<number | null>(null)

// 删除已有图片（新建/编辑模式通用）
const removePhoto = (url: string): void => {
    photos.value = photos.value.filter(item => item !== url)
    photoUploadError.value = ''
    syncPhotos()
}

const movePhoto = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= photos.value.length) return
    const next = [...photos.value]
    ;[next[index], next[target]] = [next[target], next[index]]
    photos.value = next
    syncPhotos()
}

const setPhotoCover = (index: number): void => {
    if (index <= 0 || index >= photos.value.length) return
    const next = [...photos.value]
    const [picked] = next.splice(index, 1)
    next.unshift(picked)
    photos.value = next
    syncPhotos()
}

// 上传地址改用短期票据：上传组件只能把凭证拼在 URL 上，
// 用一次性票据代替长期 JWT，避免凭证进入访问日志与浏览器历史
const uploadUrl = ref('')
let uploadTicketPromise: Promise<string> | null = null

const refreshUploadUrl = async (): Promise<string> => {
    if (uploadTicketPromise) return uploadTicketPromise
    uploadTicketPromise = (async () => {
        try {
            const url = await buildImageUploadUrl()
            uploadUrl.value = url
            return url
        } catch (error) {
            photoUploadError.value = getRequestErrorMessage(error, '上传凭证获取失败，请重新登录后再试')
            return ''
        } finally {
            uploadTicketPromise = null
        }
    })()
    return uploadTicketPromise
}

const openFilePicker = (): void => {
    if (!canAddPhoto.value) {
        proxy?.$message?.({ type: 'error', message: `图片最多${maxPhotoCount}张，请先删除部分图片` })
        return
    }
    photoUploadError.value = ''
    fileInputRef.value?.click()
}

const openMediaPicker = (): void => {
    if (!canAddPhoto.value) {
        proxy?.$message?.({ type: 'error', message: `图片最多${maxPhotoCount}张，请先删除部分图片` })
        return
    }
    mediaPickerOpen.value = true
}

const uploadErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) return error.message
    return getRequestErrorMessage(error, '图片上传失败，请确认后端服务已启动并重新登录后再试')
}

const uploadSinglePhoto = (file: File): Promise<void> => {
    const pending: PendingPhoto = {
        id: ++photoUploadSeq,
        name: file.name,
        progress: 0,
    }
    pendingPhotos.value = [...pendingPhotos.value, pending]
    const epoch = photoUploadEpoch

    return new Promise(resolve => {
        const finish = (): void => {
            pendingPhotos.value = pendingPhotos.value.filter(item => item.id !== pending.id)
            resolve()
        }

        void (async () => {
            try {
                const url = uploadUrl.value || await refreshUploadUrl()
                if (!url) throw new Error('上传凭证获取失败，请重新登录后再试')

                const response = await new Promise<UploadResponse>((resolveUpload, rejectUpload) => {
                    const xhr = new XMLHttpRequest()
                    xhr.open('POST', url, true)
                    xhr.timeout = 60_000
                    xhr.upload.onprogress = (event) => {
                        if (!event.lengthComputable) return
                        const progress = Math.max(1, Math.round((event.loaded / event.total) * 100))
                        pendingPhotos.value = pendingPhotos.value.map(item =>
                            item.id === pending.id ? { ...item, progress } : item)
                    }
                    xhr.onload = () => {
                        let payload: UploadResponse = {}
                        try {
                            payload = JSON.parse(xhr.responseText || '{}') as UploadResponse
                        } catch {
                            rejectUpload(new Error('上传返回格式异常，请稍后重试'))
                            return
                        }
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolveUpload(payload)
                            return
                        }
                        rejectUpload(new Error(payload.message || payload.error || `图片上传失败（${xhr.status}）`))
                    }
                    xhr.onerror = () => rejectUpload(new Error('网络异常，图片上传失败'))
                    xhr.ontimeout = () => rejectUpload(new Error('上传超时，请压缩图片后重试'))
                    const formData = new FormData()
                    formData.append('file', file)
                    xhr.send(formData)
                })

                const uploadedUrl = response.data?.url || response.url
                if (!uploadedUrl) throw new Error('上传成功但未返回图片地址')
                if (epoch !== photoUploadEpoch) return
                if (!photos.value.includes(uploadedUrl)) {
                    photos.value = [...photos.value, uploadedUrl]
                    syncPhotos()
                }
                pending.progress = 100
                // 票据会被消费，下一张必须等新票据就绪后再上传
                uploadUrl.value = ''
                await refreshUploadUrl()
            } catch (error) {
                const message = uploadErrorMessage(error)
                if (epoch === photoUploadEpoch) {
                    photoUploadError.value = message
                    proxy?.$message?.({ type: 'error', message })
                }
                uploadUrl.value = ''
                await refreshUploadUrl()
            } finally {
                finish()
            }
        })()
    })
}

const handleFilePick = (event: Event): void => {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])
    input.value = ''
    if (files.length === 0) return

    const slots = remainingPhotoSlots.value
    if (slots <= 0) {
        proxy?.$message?.({ type: 'error', message: `图片最多${maxPhotoCount}张，请先删除部分图片` })
        return
    }

    let picked = files
    if (files.length > slots) {
        picked = files.slice(0, slots)
        proxy?.$message?.({ type: 'error', message: `最多还能添加 ${slots} 张，已自动截取前 ${slots} 张` })
    }

    void (async () => {
        for (const file of picked) {
            if (!file.type.startsWith('image/')) {
                photoUploadError.value = `${file.name} 不是图片文件，已跳过`
                continue
            }
            if (file.size > 8 * 1024 * 1024) {
                photoUploadError.value = `${file.name} 超过 8MB，已跳过`
                continue
            }
            await uploadSinglePhoto(file)
        }
    })()
}

// 从素材库选择图片：随笔图片上限与上传一致，超出的部分直接忽略
const handleMediaSelect = (urls: string[]): void => {
    const picked = urls
        .filter(url => !photos.value.includes(url))
        .slice(0, remainingPhotoSlots.value)
    if (picked.length === 0) return

    photos.value = [...photos.value, ...picked]
    syncPhotos()
    proxy?.$message?.({ type: 'primary', message: `已从素材库添加 ${picked.length} 张图片` })
}

// AI 生成配图：作者确认后由服务端落库并回传地址，这里只追加到配图列表
const handleAiPhoto = (url: string): void => {
    if (!url) return
    if (!canAddPhoto.value) {
        proxy?.$message?.({ type: 'error', message: `图片最多${maxPhotoCount}张，请先删除部分图片` })
        return
    }

    // 记录 AI 辅助标记：随笔配图来自 AI 生成
    markAiFeature('cover')
    photos.value = [...photos.value, url]
    syncPhotos()
    proxy?.$message?.({ type: 'primary', message: 'AI 配图已添加' })
}

const getWritingActionLabel = (action: AiWritingAction): string => ({
    polish: '润色',
    shorten: '精简',
    expand: '扩写',
    continue: '续写',
}[action])

// 随笔是纯文本框，润色/精简/扩写作用于全文，续写基于全文尾部
const requestAiWriting = async (action: AiWritingAction): Promise<void> => {
    if (aiBusy.value) return

    const content = diaryForm.value.content?.trim() || ''
    if (!content) {
        aiError.value = action === 'continue'
            ? '请先写一点正文，再使用 AI 续写'
            : '请先填写正文内容，再使用 AI 润色、精简或扩写'
        return
    }

    aiBusy.value = true
    aiError.value = ''
    try {
        const result = await rewriteArticleText({
            action,
            text: action === 'continue' ? content.slice(-2000) : content.slice(0, 2000),
            title: diaryForm.value.title?.trim() || '',
        })
        if (result.code === 200 && result.data) {
            aiWriting.value = result.data
        } else {
            aiError.value = result.message || 'AI 写作辅助生成失败，请稍后重试'
        }
    } catch (error) {
        aiError.value = getAiRequestErrorMessage(error, 'AI 写作辅助生成失败，请稍后重试')
    } finally {
        aiBusy.value = false
    }
}

const applyAiWriting = (): void => {
    const suggestion = aiWriting.value
    if (!suggestion) return

    // 记录 AI 辅助标记：作者点了「采用」才写入编辑器
    markAiFeature('writing')
    diaryForm.value.content = suggestion.action === 'continue'
        ? `${diaryForm.value.content || ''}${suggestion.text}`
        : suggestion.text
    aiWriting.value = null
}

const dismissAiWriting = (): void => {
    aiWriting.value = null
}

const requestAiGalleryDescription = async (): Promise<void> => {
    if (aiImageBusy.value) return

    const imageUrls = photos.value.slice(0, 4)
    if (imageUrls.length === 0) {
        aiImageError.value = '请先上传、选择或生成随笔配图'
        return
    }

    aiImageBusy.value = true
    aiImageError.value = ''
    try {
        const result = await describeAiImages({
            mode: 'gallery',
            imageUrls,
            title: diaryForm.value.title?.trim() || '',
            context: diaryForm.value.content?.trim() || '',
        })
        if (result.code === 200 && result.data?.mode === 'gallery') {
            aiGalleryDescription.value = result.data
        } else {
            aiImageError.value = result.message || 'AI 配图描述生成失败，请稍后重试'
        }
    } catch (error) {
        aiImageError.value = getAiRequestErrorMessage(error, 'AI 配图描述生成失败，请稍后重试')
    } finally {
        aiImageBusy.value = false
    }
}

const applyAiGalleryDescription = (): void => {
    const suggestion = aiGalleryDescription.value
    if (!suggestion?.text) return
    diaryForm.value.content = [diaryForm.value.content?.trim(), suggestion.text]
        .filter(Boolean)
        .join('\n')
    markAiFeature('image-alt')
    aiGalleryDescription.value = null
}

const dismissAiGalleryDescription = (): void => {
    aiGalleryDescription.value = null
}

// 新建/保存日记
const submitting = ref(false)

const submitDiary = async (): Promise<void> => {
    const title = diaryForm.value.title?.trim() || ''
    const content = diaryForm.value.content?.trim() || ''

    if (!title) {
        proxy?.$message?.({ type: 'error', message: '请输入日记标题' })
        return
    }
    if (!content) {
        proxy?.$message?.({ type: 'error', message: '请输入日记内容' })
        return
    }
    if (photos.value.length > maxPhotoCount) {
        proxy?.$message?.({ type: 'error', message: `图片最多${maxPhotoCount}张，请删除部分后重试` })
        return
    }

    submitting.value = true
    try {
        // 作者采用过 AI 结果时带上标记，落库后随笔会带上「AI 辅助」标记
        const aiFeatures = getAiFeatures()
        if (editingId.value) {
            const result = await updateDiary(editingId.value, {
                title,
                content,
                picture: photos.value,
                weatherName: selectedWeatherName.value || undefined,
                ...(aiFeatures.length > 0 ? { aiFeatures } : {}),
            })
            if (result.code !== 200) throw new Error(result.message || '日记保存失败')

            proxy?.$message?.({ type: 'primary', message: '日记已保存' })
            resetForm()
            emits('updated')
        } else {
            const result = await createDiary({
                title,
                content,
                picture: photos.value,
                weatherName: selectedWeatherName.value || undefined,
                ...(aiFeatures.length > 0 ? { aiFeatures } : {}),
            })
            if (result.code !== 200) throw new Error(result.message || '日记创建失败')

            proxy?.$message?.({ type: 'primary', message: '日记创建成功' })
            resetForm()
            emits('created')
        }
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '日记创建失败，请稍后重试') })
    } finally {
        submitting.value = false
    }
}

// 取消编辑，回到新建模式
const cancelEdit = (): void => {
    resetForm()
}

// 重置表单并退出编辑模式
const resetForm = (): void => {
    editingId.value = null
    diaryForm.value = { weatherId: swWeatherId.value, picture: [] }
    photos.value = []
    pendingPhotos.value = []
    photoUploadError.value = ''
    photoUploadEpoch += 1
    // 表单清空后重新统计 AI 环节，避免上一条随笔的标记串到下一条
    resetAiFeatures()
    aiWriting.value = null
    aiError.value = ''
    aiGalleryDescription.value = null
    aiImageError.value = ''
    const defaultWeather = weathers.find(item => item.id === 0)
    if (defaultWeather) {
        selectWeather(defaultWeather)
    }
    void refreshUploadUrl()
}

onMounted(() => {
    const defaultWeather = weathers.find(item => item.id === 0)

    if (defaultWeather) {
        selectWeather(defaultWeather)
    }
    void refreshUploadUrl()
})

// 编辑日记：回显标题/内容/天气/图片
const startEdit = (diary: DiaryData): void => {
    editingId.value = diary.id
    pendingPhotos.value = []
    photoUploadError.value = ''
    photoUploadEpoch += 1
    // 编辑已有随笔时重新统计：本次采用 AI 才会再次记标记
    resetAiFeatures()
    aiWriting.value = null
    aiError.value = ''
    aiGalleryDescription.value = null
    aiImageError.value = ''
    diaryForm.value = {
        title: diary.title,
        content: diary.content,
        weatherId: diary.weatherId,
        picture: [...(diary.picture || [])],
    }
    photos.value = [...(diary.picture || [])]
    syncPhotos()

    // 按天气名称匹配前端字典；未知名称回退晴天
    const matched = weathers.find(item => item.name === diary.weatherName) || weathers.find(item => item.id === 0)
    if (matched) {
        selectWeather(matched)
    }
}

defineExpose({ startEdit, resetForm })
</script>

<style lang="less" scoped>
    .diary-editor {
        width: 100%;
        height: calc(100vh * 0.76);
        background: @bg-color-l;
        border-radius: @radius-m;
        overflow: hidden;
        display: flex;
        flex-direction: column;

        &-top {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: @space-xl;

            &-form {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            &-title {
                font-size: @size-xl;
                font-weight: bold;
                color: @font-color-l;
                padding-bottom: @space-m;
            }

            &-content {
                height: calc(100vh * 0.45);

                @media (max-height: 850px) {
                    height: calc(100vh * 0.45);
                    /* 屏幕高度 ≤ 850px 时使用这个高度 */
                }

                @media (min-height: 955px) {
                    height: calc(100vh * 0.55);
                    /* 屏幕高度 > 850px 时使用另一个固定高度，例如 500px */
                }
            }

            &-picture {
                padding-top: @space-l;

                .diary-photo-head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 12px 14px;
                    border: 1px solid var(--admin-line, @line-color-s);
                    border-radius: 12px 12px 0 0;
                    background:
                        linear-gradient(180deg,
                            color-mix(in srgb, var(--admin-accent, @pcolor) 4%, transparent),
                            transparent),
                        var(--admin-surface, @bg-color-l);

                    div {
                        display: flex;
                        min-width: 0;
                        flex-direction: column;
                        gap: 2px;
                    }

                    strong {
                        color: @font-color-l;
                        font-size: @size-m;
                    }

                    span {
                        color: @font-color-s;
                        font-size: @size-s;
                        line-height: 1.55;
                    }
                }

                .diary-photo-count {
                    flex: none;
                    padding: 3px 8px;
                    border-radius: 999px;
                    background: color-mix(in srgb, var(--admin-accent, @pcolor) 9%, transparent);
                    color: var(--admin-accent, @pcolor) !important;
                    font-size: @size-ss !important;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    line-height: 1.6 !important;
                }

                .diary-photo-head + .diary-editor-top-existing,
                .diary-photo-head + .diary-photo-empty {
                    border: 1px solid var(--admin-line, @line-color-s);
                    border-top: 0;
                    border-radius: 0 0 12px 12px;
                    background: var(--admin-surface, @bg-color-l);
                }

                .diary-photo-head + .diary-editor-top-existing {
                    padding: 12px 14px;
                }

                .diary-photo-empty {
                    display: flex;
                    min-height: 126px;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    padding: 20px;
                    border-style: dashed !important;
                    color: @font-color-s;
                    text-align: center;

                    svg {
                        margin-bottom: 2px;
                        color: color-mix(in srgb, var(--admin-accent, @pcolor) 72%, transparent);
                        font-size: 22px;
                    }

                    strong {
                        color: @font-color-m;
                        font-size: @size-s;
                    }

                    span {
                        font-size: @size-s;
                        line-height: 1.55;
                    }
                }

                .diary-photo-pending {
                    position: relative;
                    display: flex;
                    width: 104px;
                    height: 104px;
                    flex-direction: column;
                    justify-content: flex-end;
                    gap: 3px;
                    padding: 10px;
                    overflow: hidden;
                    border: 1px dashed color-mix(in srgb, var(--admin-accent, @pcolor) 34%, transparent);
                    border-radius: 12px;
                    background:
                        linear-gradient(135deg,
                            color-mix(in srgb, var(--admin-accent, @pcolor) 8%, transparent),
                            transparent),
                        var(--admin-surface, @bg-color-l);

                    strong {
                        color: var(--admin-accent, @pcolor);
                        font-size: @size-s;
                        font-variant-numeric: tabular-nums;
                    }
                }

                .diary-photo-pending-name {
                    overflow: hidden;
                    color: @font-color-s;
                    font-size: 10px;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .diary-photo-pending-bar {
                    position: absolute;
                    right: 0;
                    bottom: 0;
                    left: 0;
                    height: 4px;
                    background: color-mix(in srgb, var(--admin-accent, @pcolor) 12%, transparent);

                    i {
                        display: block;
                        height: 100%;
                        background: var(--admin-accent, @pcolor);
                        transition: width 0.2s ease;
                    }
                }

                .diary-photo-tools {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 8px;
                    padding-top: 10px;
                }

                .diary-photo-upload {
                    display: inline-flex;
                    height: 32px;
                    align-items: center;
                    gap: 5px;
                    padding: 0 12px;
                    border: 1px solid var(--admin-line, @line-color-s);
                    border-radius: 8px;
                    background: var(--admin-surface, @bg-color-l);
                    color: @font-color-m;
                    font-size: @size-s;
                    cursor: pointer;
                    transition: border-color @animatb, color @animatb, background @animatb;

                    svg {
                        font-size: 13px;
                    }

                    &:hover:not(:disabled) {
                        border-color: var(--admin-accent, @pcolor);
                        background: color-mix(in srgb, var(--admin-accent, @pcolor) 5%, transparent);
                        color: var(--admin-accent, @pcolor);
                    }

                    &:disabled {
                        cursor: not-allowed;
                        opacity: 0.55;
                    }
                }

                .diary-photo-limit {
                    color: @font-color-s;
                    font-size: @size-s;
                }

                .diary-photo-error {
                    margin: 8px 0 0;
                    color: @ecolor;
                    font-size: @size-s;
                    line-height: 1.55;
                }

                .diary-photo-file-input {
                    display: none;
                }
            }

            &-existing {
                display: grid;
                grid-template-columns: repeat(auto-fill, 104px);
                gap: 10px;
                padding: 10px 0 12px;
            }

            &-photo {
                position: relative;
                width: 104px;
                height: 104px;
                border: 1px solid var(--admin-line, @line-color-s);
                border-radius: 12px;
                overflow: hidden;
                background: var(--admin-bg, @bg-color-m);
                transition: border-color @animatb, box-shadow @animatb, transform @animatb;

                &:hover {
                    border-color: color-mix(in srgb, var(--admin-accent, @pcolor) 38%, transparent);
                    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
                    transform: translateY(-1px);
                }

                img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                    margin: 0;
                }

                &-index {
                    position: absolute;
                    top: 6px;
                    left: 6px;
                    display: grid;
                    width: 20px;
                    height: 20px;
                    place-items: center;
                    border-radius: 6px;
                    background: rgba(20, 24, 28, 0.62);
                    color: #fff;
                    font-size: 10px;
                    font-weight: 700;
                    backdrop-filter: blur(4px);
                }

                &-delete {
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    display: grid;
                    width: 22px;
                    height: 22px;
                    padding: 4px;
                    place-items: center;
                    border: 0;
                    border-radius: 50%;
                    background: rgba(20, 24, 28, 0.62);
                    color: #fff;
                    cursor: pointer;
                    opacity: 0;
                    transition: opacity @animatb, background @animatb;

                    &:hover {
                        background: @ecolor;
                    }
                }

                &-actions {
                    position: absolute;
                    right: 6px;
                    bottom: 6px;
                    left: 6px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 4px;
                    opacity: 0;
                    transform: translateY(4px);
                    transition: opacity @animatb, transform @animatb;

                    button {
                        display: grid;
                        min-width: 22px;
                        height: 22px;
                        padding: 0 5px;
                        place-items: center;
                        border: 0;
                        border-radius: 6px;
                        background: rgba(20, 24, 28, 0.66);
                        color: #fff;
                        font-size: 11px;
                        line-height: 1;
                        cursor: pointer;
                        backdrop-filter: blur(4px);

                        &:hover:not(:disabled) {
                            background: var(--admin-accent, @pcolor);
                        }

                        &:disabled {
                            cursor: not-allowed;
                            opacity: 0.35;
                        }
                    }
                }

                &:hover,
                &:focus-within {
                    .diary-editor-top-photo-delete,
                    .diary-editor-top-photo-actions {
                        opacity: 1;
                        transform: none;
                    }
                }
            }

            .selected {
                &::before {
                    position: absolute;
                    bottom: -4px;
                    left: 50%;
                    content: '';
                    display: block;
                    width: 6px;
                    height: 6px;
                    border-radius: 3px;
                    background: @pcolor;
                }
            }


            // 天气小图标（表单触发图 + 弹层选择网格）；不要波及图片缩略图与上传组件
            &-form img {
                width: 20px;
                margin-left: @space-s;
            }
        }

        &-ai-bar {
            display: flex;
            flex-wrap: wrap;
            gap: @space-s;
            padding-top: @space-m;
        }

        &-ai-result {
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

            &-text {
                margin: 0 0 @space-m;
                color: @font-color-m;
                font-size: @size-m;
                line-height: 1.7;
                white-space: pre-wrap;
                word-break: break-word;
            }

            &-actions {
                display: flex;
                gap: @space-s;
            }

            // 降级提示：首选模型故障时改用备用模型，明确告诉作者
            &-degraded {
                margin: 0 0 @space-s;
                padding: 4px 8px;
                border-radius: 6px;
                background: color-mix(in srgb, #d98716 12%, transparent);
                color: #a86a10;
                font-size: @size-s;
                line-height: 1.5;
            }
        }

        &-ai-error {
            margin-top: @space-s;
            color: #d84a3a;
            font-size: @size-s;
            line-height: 1.5;
        }

        &-foot {
            display: flex;
            justify-content: end;
            padding: @space-m;
            border-top: 1px solid @line-color-m;
            flex: none;
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
</style>
<style lang="less">
    .diary-editor {
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
    }
</style>
