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
                <yk-upload :limit="dynamicLimit" :file-list="fileList" :upload-url="uploadUrl"
                    accept="image/*" desc="支持 JPG / PNG / WebP / GIF，单张不超过 8MB"
                    @handle-success="handleUploadSuccess" @handle-error="handleUploadError"
                    @handle-delete="handleUploadDelete"></yk-upload>
            </div>
        </div>


        <div class="diary-editor-foot">
            <yk-space size="s">
                <yk-button type="secondary" @click="resetForm">取消</yk-button>
                <yk-button :loading="submitting" @click="submitDiary">新建笔记</yk-button>
            </yk-space>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import { weathers } from '../../utils/weather'
import { createDiary, getRequestErrorMessage } from '../../api/diary'

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

// 图片上传
const photos = ref<string[]>([])
const fileList = ref<{ name: string; url: string }[]>([])
const uploadUrl = computed(() => {
    const token = (localStorage.getItem('token') || '').trim()
    return `/api/upload/image?token=${encodeURIComponent(token)}`
})

const handleUploadSuccess = (response: UploadResponse, file?: { name?: string }): void => {
    const url = response.data?.url || response.url
    if (!url) {
        proxy?.$message?.({ type: 'error', message: '上传成功但未返回图片地址' })
        return
    }

    photos.value.push(url)
    if (file?.name) {
        fileList.value = [...fileList.value, { name: file.name, url }]
    }
    diaryForm.value.picture = [...photos.value]
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
    // yk-upload 删除时回传 [被删项, 剩余列表]
    const [, remainList] = Array.isArray(payload) ? payload : []
    const remainUrls = (remainList as { url?: string }[] | undefined)
        ?.map(item => item.url)
        .filter((url): url is string => Boolean(url)) ?? []

    photos.value = photos.value.filter(url => remainUrls.includes(url))
    fileList.value = fileList.value.filter(item => remainUrls.includes(item.url))
    diaryForm.value.picture = [...photos.value]
}

// 动态 limit
const dynamicLimit = ref<number>(4)

// 根据窗口高度更新上传数量限制
const updateLimit = (): void => {
    dynamicLimit.value = window.innerHeight <= 850 ? 4 : 9
}

// 新建日记
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

    submitting.value = true
    try {
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
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '日记创建失败，请稍后重试') })
    } finally {
        submitting.value = false
    }
}

// 重置表单
const resetForm = (): void => {
    diaryForm.value = { weatherId: swWeatherId.value, picture: [] }
    photos.value = []
    fileList.value = []
    const defaultWeather = weathers.find(item => item.id === 0)
    if (defaultWeather) {
        selectWeather(defaultWeather)
    }
}

onMounted(() => {
    const defaultWeather = weathers.find(item => item.id === 0)

    if (defaultWeather) {
        selectWeather(defaultWeather)
    }

    updateLimit()
    window.addEventListener('resize', updateLimit)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', updateLimit)
})
</script>

<style lang="less" scoped>
    .diary-editor {
        width: 100%;
        height: calc(100vh * 0.76);
        background: @bg-color-l;
        border-radius: @radius-m;
        overflow: hidden;

        &-top {
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


            img {
                width: 20px;
                margin-left: @space-s;
            }
        }

        &-foot {
            width: 100%;
            position: absolute;
            right: 12px;
            bottom: 8px;
            display: flex;
            justify-content: end;
            padding: @space-m;
            border-top: 1px solid @line-color-m;
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
