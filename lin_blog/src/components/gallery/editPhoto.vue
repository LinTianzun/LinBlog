<template>
    <div class="edit_photo">
        <div style="z-index: 2;height: 240px;">
            <yk-upload :file-list="fileList" :upload-url="uploadUrl" :draggable="true" :multiple="true"
                accept="image/jpeg,image/png,image/webp,image/gif" :max-size="8 * 1024 * 1024"
                @handle-success="handleUploadSuccess" @handle-error="handleUploadError">
            </yk-upload>
        </div>

        <yk-empty v-if="photos.length === 0" description="还没有上传图片" style="padding: 48px 0;" />

        <yk-scrollbar v-else class="waterfallSc">
            <div class="waterfall">
                <div class="waterfall-item" v-for="item in photos" :key="item">
                    <img :src="item">
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
import { ref, computed, watch, getCurrentInstance, type ComponentPublicInstance } from 'vue'

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
const uploadUrl = computed(() => {
    const token = (localStorage.getItem('token') || '').trim()
    return `/api/upload/image?token=${encodeURIComponent(token)}`
})
const fileList = ref<{ name: string; url: string }[]>([])

const emitChange = (): void => {
    emits('change', {
        photos: [...photos.value],
        cover: cover.value,
    })
}

const handleUploadSuccess = (response: UploadResponse, file?: { name?: string }): void => {
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
    if (file?.name) {
        fileList.value = [...fileList.value, { name: file.name, url }]
    }
    emitChange()
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

    fileList.value = fileList.value.filter(item => item.url !== url)
    emitChange()
}

watch(
    () => props.initialPhotos,
    value => {
        photos.value = [...value]
        cover.value = props.initialCover || value[0] || ''
    }
)
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
