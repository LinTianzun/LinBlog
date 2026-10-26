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

            <yk-text-area class="diary-editor-top-content" v-model="diaryForm.content" placeholder="请输入..."
                :max-length="1600" clearable :auto-size="{
                    minRows: 20,
                    maxRows: 20,
                  }">
            </yk-text-area>

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
</template>

<script lang="ts" setup>
import { ref, nextTick, onMounted, getCurrentInstance } from 'vue'
import { weathers } from '../../utils/weather'
import { createDiary, updateDiary, getRequestErrorMessage } from '../../api/diary'
import { buildImageUploadUrl } from '../../utils/uploadUrl.ts'
import type { DiaryData } from '../../utils/interface'

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
        if (editingId.value) {
            const result = await updateDiary(editingId.value, {
                title,
                content,
                picture: photos.value,
                weatherName: selectedWeatherName.value || undefined,
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
