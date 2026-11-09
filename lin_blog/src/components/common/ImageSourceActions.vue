<template>
    <div class="image-source-actions">
        <div class="image-source-actions-row">
            <button type="button" class="image-source-action" :title="libraryLabel" @click="emits('pick')">
                <IconFolderOpenOutline class="image-source-action-icon" />
                <span>{{ libraryLabel }}</span>
            </button>
            <button v-if="canUseAi" type="button" class="image-source-action image-source-action--ai" :title="aiLabel"
                :disabled="aiBusy" @click="requestAiImage">
                <IconPaintBrushFill class="image-source-action-icon" />
                <span>{{ aiLabel }}</span>
                <span v-if="aiBusy" class="image-source-action-loading">生成中</span>
            </button>
        </div>

        <div v-if="suggestion" class="image-source-preview">
            <img :src="suggestion.dataUri" :alt="`${aiLabel}预览`" class="image-source-preview-image" />
            <yk-space size="ss">
                <yk-button size="s" :loading="aiApplying" @click="applyAiImage">采用</yk-button>
                <yk-button type="secondary" size="s" :disabled="aiApplying" @click="dismissAiImage">忽略</yk-button>
            </yk-space>
        </div>

        <p v-if="aiError" class="image-source-error">{{ aiError }}</p>
    </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { computed } from 'vue'
import { useSessionStore } from '../../store/session.ts'
import {
    confirmAiImage,
    generateAiImage,
    getRequestErrorMessage,
} from '../../api/ai'

const session = useSessionStore()
// AI 入口按 ai.use 权限收敛，服务端同样按该权限校验
const canUseAi = computed(() => session.can('ai.use'))

type AiImageSuggestion = {
    token: string
    dataUri: string
}

const props = withDefaults(defineProps<{
    /** 素材库入口文案 */
    libraryLabel?: string
    /** AI 生成入口文案 */
    aiLabel?: string
    /** 生成提示词用的标题 */
    title?: string
    /** 生成提示词用的简介 */
    introduce?: string
    /** 生成提示词用的正文 */
    content?: string
}>(), {
    libraryLabel: '从素材库选择',
    aiLabel: 'AI 生成封面',
    title: '',
    introduce: '',
    content: '',
})

const emits = defineEmits<{
    pick: []
    adopt: [url: string]
}>()

const aiBusy = ref(false)
const aiApplying = ref(false)
const aiError = ref('')
const suggestion = ref<AiImageSuggestion | null>(null)

const requestAiImage = async (): Promise<void> => {
    if (aiBusy.value) return

    const title = props.title.trim()
    const introduce = props.introduce.trim()
    const content = props.content.trim()
    if (!title) {
        aiError.value = '请先填写标题，再生成 AI 图片'
        return
    }

    aiBusy.value = true
    aiError.value = ''
    try {
        const result = await generateAiImage({ title, introduce, content })
        if (result.code === 200 && result.data) {
            suggestion.value = result.data
        } else {
            aiError.value = result.message || 'AI 图片生成失败，请稍后重试'
        }
    } catch (error) {
        aiError.value = getRequestErrorMessage(error, 'AI 图片生成失败，请稍后重试')
    } finally {
        aiBusy.value = false
    }
}

const applyAiImage = async (): Promise<void> => {
    const current = suggestion.value
    if (!current || aiApplying.value) return

    aiApplying.value = true
    aiError.value = ''
    try {
        const result = await confirmAiImage(current.token)
        if (result.code === 200 && result.data?.url) {
            suggestion.value = null
            emits('adopt', result.data.url)
        } else {
            aiError.value = result.message || 'AI 图片保存失败，请稍后重试'
        }
    } catch (error) {
        aiError.value = getRequestErrorMessage(error, 'AI 图片保存失败，请稍后重试')
    } finally {
        aiApplying.value = false
    }
}

const dismissAiImage = (): void => {
    suggestion.value = null
}
</script>

<style lang="less" scoped>
    .image-source-actions {
        display: flex;
        flex-direction: column;
        gap: @space-s;
        min-width: 0;
    }

    .image-source-actions-row {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        max-width: 100%;
    }

    .image-source-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 12px;
        border: 1px solid var(--admin-line, @line-color-s);
        border-radius: 6px;
        background: var(--admin-surface, #fff);
        color: @font-color-m;
        font-size: @size-s;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
        transition: border-color 0.18s, color 0.18s, background-color 0.18s, box-shadow 0.18s;

        &:hover:not(:disabled) {
            border-color: var(--admin-accent, #2b5aed);
            color: var(--admin-accent, #2b5aed);
            background: var(--admin-accent-soft, rgba(43, 90, 237, 0.06));
        }

        &:focus-visible {
            outline: none;
            border-color: var(--admin-accent, #2b5aed);
            box-shadow: 0 0 0 3px var(--admin-accent-soft, rgba(43, 90, 237, 0.18));
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        &-icon {
            font-size: 14px;
            color: @font-color-s;
        }

        &-loading {
            color: @font-color-m;
            font-size: @size-ss;
        }
    }

    .image-source-action--ai {
        .image-source-action-icon {
            color: var(--admin-accent, #2b5aed);
        }
    }

    .image-source-preview {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: @space-s;

        &-image {
            display: block;
            width: 100%;
            max-width: 240px;
            border: 1px solid var(--admin-line, @line-color-s);
            border-radius: 8px;
        }
    }

    .image-source-error {
        color: #d84a3a;
        font-size: @size-s;
        line-height: 1.5;
        overflow-wrap: anywhere;
    }
</style>
