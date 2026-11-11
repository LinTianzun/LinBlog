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

            <div class="diary-editor-top-picture">
                <!-- 已有图片瀑布流（编辑模式可单张删除） -->
                <div class="diary-editor-top-existing" v-if="photos.length > 0">
                    <div class="diary-editor-top-photo" v-for="url in photos" :key="url">
                        <img :src="url" alt="">
                        <IconDeleteOutline class="diary-editor-top-photo-delete" @click="removePhoto(url)" />
                    </div>
                </div>

                <yk-upload v-if="uploaderVisible && photos.length < maxPhotoCount" :limit="maxPhotoCount" :max-size="8 * 1024 * 1024" :upload-url="uploadUrl"
                    accept="image/*" multiple
                    @handle-success="handleUploadSuccess" @handle-error="handleUploadError"
                    @handle-delete="handleUploadDelete"></yk-upload>

                <ImageSourceActions v-if="photos.length < maxPhotoCount" ai-label="AI 生成配图"
                    :title="diaryForm.title || ''" :content="diaryForm.content || ''"
                    @pick="mediaPickerOpen = true" @adopt="handleAiPhoto" />
            </div>
        </div>


        <div class="diary-editor-foot">
            <yk-space size="s">
                <yk-button type="secondary" @click="cancelEdit" v-if="editingId">取消</yk-button>
                <yk-button type="secondary" @click="resetForm" v-else>取消</yk-button>
                <yk-button :loading="submitting" @click="submitDiary">{{ editingId ? '保存修改' : '新建笔记' }}</yk-button>
            </yk-space>
        </div>
    </div>

    <MediaPickerDialog v-model:open="mediaPickerOpen" multiple :max-count="maxPhotoCount"
        @select="handleMediaSelect" />
</template>

<script lang="ts" setup>
import { computed, ref, nextTick, onMounted, getCurrentInstance } from 'vue'
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

// 图片上传（photos 为唯一数据源，不把 fileList 回传给 yk-upload，
// 否则其内部会整体重建列表导致 uid 失配、删除一张时数据错乱）
const photos = ref<string[]>([])
const mediaPickerOpen = ref(false)

// 编辑中的日记 ID：为空表示新建模式
const editingId = ref<number | null>(null)

// 删除已有图片（新建/编辑模式通用）
const removePhoto = (url: string): void => {
    photos.value = photos.value.filter(item => item !== url)
    diaryForm.value.picture = [...photos.value]
    // 已有图片变化后重挂载上传组件，保持内部列表一致
    uploaderVisible.value = false
    void nextTick(() => {
        uploaderVisible.value = true
    })
    void refreshUploadUrl()
}
// 上传地址改用短期票据：yk-upload 只能把凭证拼在 URL 上，
// 用一次性票据代替长期 JWT，避免凭证进入访问日志与浏览器历史
const uploadUrl = ref('')
const ticketBusy = ref(false)

const refreshUploadUrl = async (): Promise<void> => {
    if (ticketBusy.value) return
    ticketBusy.value = true
    try {
        uploadUrl.value = await buildImageUploadUrl()
    } catch (error) {
        proxy?.$message?.({
            type: 'error',
            message: getRequestErrorMessage(error, '上传凭证获取失败，请重新登录后再试')
        })
    } finally {
        ticketBusy.value = false
    }
}

const handleUploadSuccess = (response: UploadResponse): void => {
    const url = response.data?.url || response.url
    if (!url) {
        proxy?.$message?.({ type: 'error', message: '上传成功但未返回图片地址' })
        return
    }

    photos.value.push(url)
    diaryForm.value.picture = [...photos.value]
    // 票据按次消费，每次成功后换新票据，保证后续上传仍可用
    void refreshUploadUrl()
}

const handleUploadError = (error: unknown): void => {
    let message = '图片上传失败，请确认后端服务已启动并重新登录后再试'

    if (typeof error === 'string' && error.trim()) {
        message = error
    } else if (typeof error === 'object' && error !== null) {
        const response = error as { error?: unknown; message?: unknown }
        const responseMessage = response.error || response.message
        if (typeof responseMessage === 'string' && responseMessage.trim()) {
            message = responseMessage
        }
    }

    proxy?.$message?.({ type: 'error', message })
}

const handleUploadDelete = (payload: unknown): void => {
    // yk-upload 删除时回传 [被删项, 剩余列表]，按「剩余数量」反推被删序号
    const [, remainList] = Array.isArray(payload) ? payload : []
    const remainCount = Array.isArray(remainList) ? remainList.length : 0
    const removedIndex = photos.value.length - remainCount - 1
    if (removedIndex >= 0) {
        photos.value.splice(removedIndex, 1)
    }
    diaryForm.value.picture = [...photos.value]
}

// 从素材库选择图片：随笔图片上限与上传一致，超出的部分直接忽略
const handleMediaSelect = (urls: string[]): void => {
    const picked = urls
        .filter(url => !photos.value.includes(url))
        .slice(0, maxPhotoCount - photos.value.length)
    if (picked.length === 0) return

    photos.value = [...photos.value, ...picked]
    diaryForm.value.picture = [...photos.value]
    proxy?.$message?.({ type: 'primary', message: `已从素材库添加 ${picked.length} 张图片` })
}

// AI 生成配图：作者确认后由服务端落库并回传地址，这里只追加到配图列表
const handleAiPhoto = (url: string): void => {
    if (!url) return
    if (photos.value.length >= maxPhotoCount) {
        proxy?.$message?.({ type: 'error', message: `图片最多${maxPhotoCount}张，请先删除部分图片` })
        return
    }

    // 记录 AI 辅助标记：随笔配图来自 AI 生成
    markAiFeature('cover')
    photos.value = [...photos.value, url]
    diaryForm.value.picture = [...photos.value]
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

// 图片数量上限（与后端校验一致）
const maxPhotoCount = 6

// 通过重挂载清空 yk-upload 内部的缩略图列表
const uploaderVisible = ref(true)

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
    // 表单清空后重新统计 AI 环节，避免上一条随笔的标记串到下一条
    resetAiFeatures()
    aiWriting.value = null
    aiError.value = ''
    aiGalleryDescription.value = null
    aiImageError.value = ''
    uploaderVisible.value = false
    void nextTick(() => {
        uploaderVisible.value = true
    })
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
                padding-top: @space-xl;
                /* width: 100%; */
                /* height: 20px; */
                /* background-color: green; */
            }

            &-existing {
                display: flex;
                flex-wrap: wrap;
                gap: @space-s;
                padding-bottom: @space-s;
            }

            &-photo {
                position: relative;
                width: 80px;
                height: 80px;
                border-radius: 8px;
                overflow: hidden;

                img {
                    width: 100%;
                    height: 100%;
                    border-radius: 8px;
                    object-fit: cover;
                    display: block;
                    margin: 0;
                }

                &-delete {
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    width: 24px;
                    height: 24px;
                    padding: 3px;
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.85);
                    color: @font-color-s;
                    cursor: pointer;
                    transition: color @animatb;

                    &:hover {
                        color: @ecolor;
                        background: rgba(255, 255, 255, 0.95);
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
