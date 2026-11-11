<template>
    <div class="editor">
        <yk-affix :offset="64" @change="toolbarTop">
            <Toolbar class="editor-toolbar" :class="{istop:top }" :editor="editorRef" :defaultConfig="toolbarConfig"
                :mode="mode" />
        </yk-affix>
        <div class="editor-main">
            <slot></slot>
            <!-- <forms :classify="0" @formData="formData" /> -->
            <Editor v-model="valueHtml" :defaultConfig="editorConfig" :mode="mode" @onChange="onChange"
                @onCreated="handleCreated" />
            <div v-if="editorRef && canUseAi" class="editor-ai-bar">
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('polish')">
                    AI 润色
                </yk-button>
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('shorten')">
                    AI 精简
                </yk-button>
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('expand')">
                    AI 扩写
                </yk-button>
                <yk-button type="secondary" size="s" :loading="aiBusy" @click="requestAiWriting('continue')">
                    AI 续写
                </yk-button>
                <yk-button type="secondary" size="s" :loading="aiImageBusy" @click="requestAiImageDescriptions">
                    AI 补全图片描述
                </yk-button>
                <yk-text type="third">选中正文可润色；续写基于全文尾部；图片描述只处理未填写 alt 的图片</yk-text>
            </div>
            <div v-if="aiWriting" class="editor-ai-result">
                <p class="editor-ai-result-title">
                    AI 生成的{{ getWritingActionLabel(aiWriting.action) }}内容（采用后才会写入编辑器）：
                </p>
                <p v-if="aiWriting.degraded" class="editor-ai-result-degraded">
                    默认模型暂时不可用，本次由「{{ aiWriting.modelName }}」生成
                </p>
                <p class="editor-ai-result-text">{{ aiWriting.text }}</p>
                <yk-space size="s" class="editor-ai-result-actions">
                    <yk-button size="s" @click="applyAiWriting">采用</yk-button>
                    <yk-button type="secondary" size="s" @click="dismissAiWriting">忽略</yk-button>
                </yk-space>
            </div>
            <div v-if="aiImageDescriptions.length" class="editor-ai-result">
                <p class="editor-ai-result-title">
                    AI 生成的图片描述（逐张采用后才会写入正文的 alt）：
                </p>
                <p v-if="aiImageDescriptionDegraded" class="editor-ai-result-degraded">
                    默认模型暂时不可用，本次由「{{ aiImageDescriptionModelName }}」生成
                </p>
                <div class="editor-ai-image-list">
                    <div v-for="item in aiImageDescriptions" :key="item.url" class="editor-ai-image-item">
                        <img :src="item.url" alt="" loading="lazy">
                        <div class="editor-ai-image-content">
                            <p class="editor-ai-result-text">{{ item.alt }}</p>
                            <yk-button size="s" type="secondary" @click="applyAiImageDescription(item)">
                                采用描述
                            </yk-button>
                        </div>
                    </div>
                </div>
                <yk-space size="s" class="editor-ai-result-actions">
                    <yk-button type="secondary" size="s" @click="dismissAiImageDescriptions">忽略</yk-button>
                </yk-space>
            </div>
            <p v-if="aiError" class="editor-ai-error">{{ aiError }}</p>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { IToolbarConfig, IDomEditor } from '@wangeditor/editor'
import './style.less'
import { colors } from './colors.js'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { Node as SlateNode, Transforms, type BaseSelection } from 'slate'
import { CODE_HIGHLIGHT_LANGS } from './slimCodeHighlightCore'
import { useSessionStore } from '../../store/session.ts'
import {
    describeAiImages,
    rewriteArticleText,
    getRequestErrorMessage as getAiRequestErrorMessage,
    type AiImageAltResult,
    type AiWritingAction,
    type AiWritingSuggestion,
} from '../../api/ai'
import { markAiFeature } from '../../utils/aiMarker.ts'

const props = withDefaults(defineProps<{
    modelValue?: string
    aiTitle?: string
}>(), {
    modelValue: '',
    aiTitle: '',
})

const mode = 'default'

// 工具栏固定状态
const top = ref(false)

const toolbarTop = (value: boolean): void => {
    top.value = value
}

const emits = defineEmits<{
    (event: 'update:modelValue', content: string): void
    (event: 'editors', content: string): void
}>()

// 获取编辑器内容
const onChange = (): void => {
    emits('update:modelValue', valueHtml.value)
    emits('editors', valueHtml.value)
}

// 编辑器实例
const editorRef = shallowRef<IDomEditor | null>(null)

// 内容 HTML
const valueHtml = ref(props.modelValue)

watch(
    () => props.modelValue,
    (content) => {
        if (content !== valueHtml.value) {
            valueHtml.value = content
        }
    }
)

// 工具栏配置
const toolbarConfig: Partial<IToolbarConfig> = {}

// 菜单配置
const editorConfig = {
    MENU_CONF: {
        color: {
            colors,
        },
        bgColor: {
            colors,
        },
        uploadImage: {
            // 后续在这里配置真实的图片上传接口
        },
        codeSelectLang: {
            // 与裁剪版 Prism 支持的语法保持同一份清单，避免菜单能选、实际不着色
            codeLangs: CODE_HIGHLIGHT_LANGS,
        },
    },
}

// 编辑器创建完成
const handleCreated = (editor: IDomEditor): void => {
    editorRef.value = editor
}

// AI 写作辅助：候选结果始终先展示，作者点「采用」后才修改编辑器
const session = useSessionStore()
// AI 写作辅助入口按 ai.use 权限收敛，服务端同样按该权限校验
const canUseAi = computed(() => session.can('ai.use'))
const aiBusy = ref(false)
const aiError = ref('')
const aiWriting = ref<AiWritingSuggestion | null>(null)
const originalSelection = ref<BaseSelection | null>(null)

const getWritingActionLabel = (action: AiWritingAction): string => ({
    polish: '润色',
    shorten: '精简',
    expand: '扩写',
    continue: '续写',
}[action])

const requestAiWriting = async (action: AiWritingAction): Promise<void> => {
    if (aiBusy.value || !editorRef.value) return

    const editor = editorRef.value
    const selectionText = editor.getSelectionText().trim()
    const fullText = editor.getText().trim()
    originalSelection.value = editor.selection
    const text = action === 'continue'
        ? fullText.slice(-2000)
        : selectionText.slice(0, 2000)

    if (!text) {
        aiError.value = action === 'continue'
            ? '请先写一点正文，再使用 AI 续写'
            : '请先选中一段正文，再使用 AI 润色、精简或扩写'
        return
    }

    aiBusy.value = true
    aiError.value = ''
    try {
        const result = await rewriteArticleText({
            action,
            text,
            title: props.aiTitle.trim(),
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
    const editor = editorRef.value
    const suggestion = aiWriting.value
    if (!editor || !suggestion) return

    // 记录 AI 辅助标记：作者点了「采用」才写入编辑器
    markAiFeature('writing')

    if (suggestion.action === 'continue') {
        editor.focus(true)
        editor.insertText(suggestion.text)
    } else {
        editor.focus()
        if (originalSelection.value) {
            editor.select(originalSelection.value)
            Transforms.delete(editor, { at: originalSelection.value })
            editor.insertText(suggestion.text)
        } else {
            editor.insertText(suggestion.text)
        }
        aiWriting.value = null
        return
    }
    aiWriting.value = null
}

const dismissAiWriting = (): void => {
    aiWriting.value = null
}

type AiImageDescriptionItem = AiImageAltResult['items'][number]

const aiImageBusy = ref(false)
const aiImageDescriptions = ref<AiImageDescriptionItem[]>([])
const aiImageDescriptionDegraded = ref(false)
const aiImageDescriptionModelName = ref('')

const collectImagesWithoutAlt = (): string[] => {
    const editor = editorRef.value
    if (!editor) return []

    const urls: string[] = []
    const seen = new Set<string>()
    for (const element of editor.getElemsByType('image')) {
        const image = element as { src?: string; alt?: string }
        const src = String(image.src || '').trim()
        if (!src || String(image.alt || '').trim() || seen.has(src)) continue
        seen.add(src)
        urls.push(src)
        if (urls.length >= 4) break
    }
    return urls
}

const requestAiImageDescriptions = async (): Promise<void> => {
    if (aiImageBusy.value || !editorRef.value) return

    const imageUrls = collectImagesWithoutAlt()
    if (imageUrls.length === 0) {
        aiError.value = '正文里没有待补全描述的图片，或图片都已填写 alt'
        return
    }

    aiImageBusy.value = true
    aiError.value = ''
    try {
        const result = await describeAiImages({
            mode: 'alt',
            imageUrls,
            title: props.aiTitle.trim(),
            context: editorRef.value.getText().slice(0, 6000),
        })
        if (result.code === 200 && result.data?.mode === 'alt') {
            aiImageDescriptions.value = result.data.items
            aiImageDescriptionDegraded.value = Boolean(result.data.degraded)
            aiImageDescriptionModelName.value = result.data.modelName || ''
        } else {
            aiError.value = result.message || 'AI 图片描述生成失败，请稍后重试'
        }
    } catch (error) {
        aiError.value = getAiRequestErrorMessage(error, 'AI 图片描述生成失败，请稍后重试')
    } finally {
        aiImageBusy.value = false
    }
}

const applyAiImageDescription = (item: AiImageDescriptionItem): void => {
    const editor = editorRef.value
    if (!editor || !item.alt) return

    let applied = 0
    for (const [node, path] of SlateNode.nodes(editor)) {
        const image = node as { type?: string; src?: string }
        if (image.type !== 'image' || image.src !== item.url) continue
        Transforms.setNodes(editor, { alt: item.alt }, { at: path })
        applied += 1
    }

    if (applied === 0) {
        aiError.value = '这张图片已从正文移除，请重新生成描述'
    } else {
        markAiFeature('image-alt')
    }
    aiImageDescriptions.value = aiImageDescriptions.value.filter(candidate => candidate.url !== item.url)
}

const dismissAiImageDescriptions = (): void => {
    aiImageDescriptions.value = []
}

// 组件销毁时销毁编辑器
onBeforeUnmount(() => {
    const editor = editorRef.value
    if (!editor) return

    editor.destroy()
    editorRef.value = null
})
</script>


<style lang="less" scoped>
    .editor {
        width: 100%;

        &-toolbar {
            /* overflow: hidden; */
            /* border-radius: @radius-m; */
            /* width: 100%; */
        }

        &-main {
            width: 100%;
            height: 100%;
            margin-top: @space-l;
            height: calc(100vh * 0.4);
            background: @bg-color-l;
            border-radius: @radius-m;
            padding: @space-xl;
            display: flex;
            flex-direction: column;
            /* align-items: center; */
            overflow-y: hidden;

            @media (max-height: 850px) {
                height: calc(100vh * 0.65);
            }

            @media (min-height: 851px) {
                height: calc(100vh * 0.75);
            }
        }
    }

    .istop {
        width: 100%;
        box-shadow: @shadow-m ;
        /* border: 1px solid @line-color-m; */
    }

    .editor-ai-bar {
        display: flex;
        align-items: center;
        gap: @space-l;
        margin-top: @space-m;
    }

    .editor-ai-result {
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

    .editor-ai-image-list {
        display: flex;
        flex-direction: column;
        gap: @space-s;
    }

    .editor-ai-image-item {
        display: flex;
        align-items: flex-start;
        gap: @space-m;
        padding: @space-s;
        border: 1px solid var(--admin-line, @line-color-s);
        border-radius: 6px;

        img {
            width: 88px;
            height: 66px;
            flex: 0 0 auto;
            border-radius: 4px;
            object-fit: cover;
            background: @bg-color-m;
        }
    }

    .editor-ai-image-content {
        min-width: 0;
        flex: 1;

        .editor-ai-result-text {
            margin-bottom: @space-s;
        }
    }

    .editor-ai-error {
        margin-top: @space-s;
        color: #d84a3a;
        font-size: @size-s;
        line-height: 1.5;
    }
</style>
<style lang="less">
    .w-e-bar {
        width: 100%;
        justify-content: center;
        border-radius: @radius-s;
        /* overflow: hidden; */
    }
</style>
