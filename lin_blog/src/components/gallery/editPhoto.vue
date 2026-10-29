<template>
    <div class="edit_photo">
        <div class="edit_photo-uploader">
            <!-- 不绑定 :file-list：yk-upload 内部 watch 会用 generateListUid 整体重建列表并刷新 uid，
                 回传后删除单张会让组件用旧 uid 找不到项，导致全列表错乱 -->
            <yk-upload v-if="uploaderVisible" :key="uploaderKey" :upload-url="uploadUrl" :draggable="true" :multiple="true"
                desc="支持 JPG / PNG / WebP / GIF，单张不超过 8MB"
                @handle-success="handleUploadSuccess" @handle-error="handleUploadError"
                @handle-delete="handleUploadDelete">
            </yk-upload>
        </div>

        <yk-empty v-if="photos.length === 0" description="还没有上传图片" style="padding: 48px 0;" />

        <yk-scrollbar v-else class="waterfallSc">
            <div class="waterfall">
                <div class="waterfall-item" v-for="item in photos" :key="item">
                    <img :src="optimizedImageUrl(item, 480)" decoding="async">
                    <IconStarFill class="waterfall-item-cover" v-show="item === cover" />
                    <yk-space size="ss">
                        <p class="waterfall-item-tool" @click="changeCover(item)" v-show="item !== cover">设为封面
                        </p>
                        <IconDeleteOutline class="waterfall-item-delete" @click="deletePhoto(item)" />
                    </yk-space>
                </div>
            </div>
        </yk-scrollbar>

        <p v-if="uploadError" class="edit_photo-error">{{ uploadError }}</p>
    </div>
</template>

<script lang="ts" setup>
import { ref, watch, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import { buildImageUploadUrl } from '../../utils/uploadUrl.ts'
import { optimizedImageUrl } from '../../utils/imageOptimization.ts'

type UploadResponse = {
    data?: {
        url?: string
    }
    url?: string
}

type MessageInstance = ComponentPublicInstance & {
    $message?: (options: { type: 'error' | 'primary'; message: string }) => void
}

const props = withDefaults(defineProps<{
    initialPhotos?: string[]
    initialCover?: string
}>(), {
    initialPhotos: () => [],
    initialCover: '',
})

const emits = defineEmits<{
    (e: 'change', payload: { photos: string[]; cover: string }): void
}>()

const proxy = getCurrentInstance()?.proxy as MessageInstance | null | undefined

// 图片列表与封面
const photos = ref<string[]>([...props.initialPhotos])
const cover = ref(props.initialCover || props.initialPhotos[0] || '')
const uploadError = ref('')

// 上传配置
// 上传地址改用短期票据：yk-upload 只能把凭证拼在 URL 上，
// 用按次消费的短期票据代替长期 JWT，避免凭证进入访问日志与浏览器历史
const uploadUrl = ref('')
const ticketBusy = ref(false)

const refreshUploadUrl = async (): Promise<void> => {
    if (ticketBusy.value) return
    ticketBusy.value = true
    try {
        uploadUrl.value = await buildImageUploadUrl()
    } catch {
        uploadError.value = '上传凭证获取失败，请重新登录后再试'
    } finally {
        ticketBusy.value = false
    }
}

// 重挂载上传组件以清空其内部列表（删除后保持与本地 photos 一致）
const uploaderVisible = ref(true)
const uploaderKey = ref(0)

const emitChange = (): void => {
    emits('change', {
        photos: [...photos.value],
        cover: cover.value,
    })
}

const handleUploadSuccess = (response: UploadResponse): void => {
    const url = response.data?.url || response.url
    if (!url) {
        uploadError.value = '上传成功但未返回图片地址'
        return
    }

    uploadError.value = ''
    photos.value.push(url)
    if (!cover.value) {
        cover.value = url
    }
    emitChange()
    // 票据按次消费，每次成功后换新票据
    void refreshUploadUrl()
    proxy?.$message?.({ type: 'primary', message: '图片上传成功' })
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

    uploadError.value = message
    proxy?.$message?.({ type: 'error', message })
}

const handleUploadDelete = (payload: unknown): void => {
    // yk-upload 删除时回传 [被删项, 剩余列表]，只同步本地瀑布流，不写回 :file-list
    const [, remainList] = Array.isArray(payload) ? payload : []
    const remainUrls = (remainList as { url?: string; raw?: File }[] | undefined)
        ?.map(item => item.url)
        .filter((url): url is string => Boolean(url)) ?? []

    photos.value = photos.value.filter(url => remainUrls.includes(url))
    if (cover.value && !photos.value.includes(cover.value)) {
        cover.value = photos.value[0] || ''
    }
    emitChange()
}

// 设为封面
const changeCover = (url: string): void => {
    cover.value = url
    emitChange()
}

// 删除图片
const deletePhoto = (url: string): void => {
    photos.value = photos.value.filter(item => item !== url)

    if (cover.value === url) {
        cover.value = photos.value[0] || ''
    }

    // 瀑布流删除后重挂载上传组件，清掉组件内已不存在的缩略图
    uploaderVisible.value = false
    void Promise.resolve().then(() => {
        uploaderKey.value += 1
        uploaderVisible.value = true
    })
    emitChange()
    void refreshUploadUrl()
}

watch(
    () => props.initialPhotos,
    value => {
        photos.value = [...value]
        cover.value = props.initialCover || value[0] || ''
        // 初值变化时同步重置上传组件内部列表
        uploaderVisible.value = false
        void Promise.resolve().then(() => {
            uploaderKey.value += 1
            uploaderVisible.value = true
        })
    }
)

void refreshUploadUrl()
</script>

<style lang="less" scoped>
.edit_photo {
    background: @bg-color-l;
    border-radius: @radius-m;
    padding: @space-xl;
    width: 100%;

    &-error {
        color: #d84a3a;
        font-size: @size-s;
        padding-top: @space-s;
    }

    &-uploader {
        :deep(.yk-upload-draggle) {
            margin-bottom: @space-l;
        }
    }
}

.waterfallSc {
    height: calc(100vh * 0.4);

    @media (max-height: 850px) {
        height: calc(100vh * 0.4);
    }

    @media (min-height: 951px) {
        height: calc(100vh * 0.6);
    }
}

.waterfall {
    column-count: 3;
    column-gap: @space-xl;
    z-index: 1;
    overflow: hidden;

    &-item {
        position: relative;
        margin-bottom: @space-xl;
        border-radius: @radius-m;
        overflow: hidden;
        line-height: 0;

        img {
            width: 100%;
        }

        .yk-space {
            position: absolute;
            top: @space-l;
            right: @space-l;
        }

        &-cover {
            position: absolute;
            top: @space-l;
            left: @space-l;
            width: 24px;
            height: 24px;
            color: @wcolor;
        }

        &-tool {
            line-height: 32px;
            border-radius: @radius-m;
            padding: 0 @space-m;
            background: rgba(255, 255, 255, 0.56);
            color: @pcolor;
            cursor: pointer;
            transition: all @animatb;
            opacity: 0;

            &:hover {
                background: rgba(255, 255, 255, 0.8);
            }
        }

        &-delete {
            width: 32px;
            height: 32px;
            border-radius: @radius-m;
            padding: 9px;
            background: rgba(255, 255, 255, 0.56);
            color: @gray;
            cursor: pointer;
            transition: all @animatb;
            opacity: 0;

            &:hover {
                color: @ecolor;
                background: rgba(255, 255, 255, 0.8);
            }
    }

        &:hover {
            .waterfall-item-tool {
                opacity: 1;
            }

            .waterfall-item-delete {
                opacity: 1;
            }
        }
    }
}
</style>
