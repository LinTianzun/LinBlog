<template>
    <yk-space dir="vertical" size="l" class="admin-page ai-prompt-page">
        <top-title name="提示词模板" description="按功能挑选要用的提示词，也可以新建自己的版本" :is-search="false">
            <template #custom>
                <yk-button type="primary" @click="openCreate">+ 新建提示词</yk-button>
            </template>
        </top-title>

        <yk-text v-if="loading" type="secondary">正在加载提示词模板...</yk-text>

        <template v-else>
            <div v-if="errorMessage" class="ai-banner is-error">{{ errorMessage }}</div>
            <div v-else-if="noticeMessage" class="ai-banner is-success">{{ noticeMessage }}</div>

            <yk-empty v-if="groups.length === 0" description="暂无可配置的提示词模板" />

            <div v-else class="ai-prompt-workspace">
                <section class="ai-prompt-list" aria-label="提示词模板列表">
                    <!-- 按功能分组：每组一行一个模板，默认收起正文，编辑走弹窗 -->
                    <section v-for="group in groups" :key="group.key" class="ai-prompt-group">
                        <header class="ai-prompt-group-head">
                            <div class="ai-prompt-group-heading">
                                <yk-title :level="5" style="margin: 0;">{{ group.name }}</yk-title>
                                <yk-text type="secondary">{{ group.description }}</yk-text>
                            </div>
                            <yk-space align="center" size="s">
                                <yk-text type="secondary" class="ai-prompt-active-label">当前使用</yk-text>
                                <strong class="ai-prompt-active-name">{{ activeName(group) }}</strong>
                            </yk-space>
                        </header>

                        <div class="ai-prompt-rows">
                            <div v-for="item in group.templates" :key="item.key" class="ai-prompt-row"
                                :class="{ 'is-active': isActive(group, item) }">
                                <div class="ai-prompt-row-main">
                                    <strong>{{ item.name }}</strong>
                                    <yk-tag v-if="item.isDefault" size="s">内置</yk-tag>
                                    <yk-tag v-else size="s" type="primary">自定义</yk-tag>
                                    <yk-tag v-if="item.customized" size="s" type="warning">已修改</yk-tag>
                                    <yk-tag v-if="!item.enabled" size="s" type="danger">已停用</yk-tag>
                                    <yk-tag v-if="isActive(group, item)" size="s" type="success">使用中</yk-tag>
                                </div>

                                <p class="ai-prompt-row-meta">
                                    <span>{{ item.description || '暂无说明' }}</span>
                                    <span v-if="item.updatedAt" class="ai-prompt-row-time">更新于 {{ formatTime(item.updatedAt) }}</span>
                                </p>

                                <div class="ai-prompt-row-actions">
                                    <yk-button size="s" type="primary" :disabled="isActive(group, item)" @click="handleSelect(item)">
                                        选用
                                    </yk-button>
                                    <yk-button size="s" type="secondary" @click="openEdit(item)">编辑</yk-button>
                                    <yk-button size="s" type="secondary" @click="openDuplicate(item)">复制</yk-button>
                                    <yk-button size="s" type="secondary" @click="openPreview(item)">试跑</yk-button>
                                    <yk-button v-if="item.isDefault" size="s" type="secondary" @click="handleReset(item)">
                                        恢复默认
                                    </yk-button>
                                    <yk-button v-else size="s" type="danger" @click="handleDelete(item)">删除</yk-button>
                                </div>
                            </div>
                        </div>
                    </section>
                </section>

                <aside class="ai-prompt-preview" aria-label="提示词试跑验证区">
                    <header class="ai-prompt-preview-head">
                        <div>
                            <yk-title :level="5" style="margin: 0;">试跑验证区</yk-title>
                            <yk-text type="secondary">先用示例变量验证效果，满意后再选用</yk-text>
                        </div>
                        <yk-tag size="s" type="primary">{{ draftSourceLabel }}</yk-tag>
                    </header>

                    <div class="ai-prompt-preview-layout">
                        <!-- 左侧输入：所属功能、提示词内容与示例变量 -->
                        <div class="ai-prompt-preview-form">
                            <div class="ai-prompt-preview-field">
                                <span class="ai-prompt-label">所属功能<i>*</i></span>
                                <select-field v-model="draft.featureKey" :options="featureOptions" :disabled="previewing" />
                            </div>

                            <div class="ai-prompt-preview-field">
                                <span class="ai-prompt-label">输出类型</span>
                                <div class="ai-prompt-mode" role="radiogroup" aria-label="试跑输出类型">
                                    <button v-for="item in previewModes" :key="item.value" type="button"
                                        class="ai-prompt-mode-item" :class="{ 'is-active': draft.mode === item.value }"
                                        role="radio" :aria-checked="draft.mode === item.value"
                                        :disabled="previewing" @click="draft.mode = item.value">
                                        {{ item.label }}
                                    </button>
                                </div>
                                <span class="ai-prompt-tip">{{ previewModeTip }}</span>
                            </div>

                            <label class="ai-prompt-preview-field">
                                <span class="ai-prompt-label">提示词内容<i>*</i></span>
                                <textarea v-model="draft.content" class="ai-prompt-editor" rows="8" spellcheck="false" />
                            </label>

                            <div class="ai-prompt-preview-field">
                                <span class="ai-prompt-label">
                                    AI 辅助
                                    <em class="ai-prompt-label-tip">先生成候选，确认后才会应用</em>
                                </span>
                                <div class="ai-prompt-assist-row">
                                    <input v-model.trim="assistRequirement" type="text"
                                        class="ai-prompt-assist-input" :disabled="previewing || assisting"
                                        placeholder="例如：更简洁、强调 JSON 输出；新建时可填写主题"
                                        @keydown.enter.prevent="assistTemplate(draft.content.trim() ? 'optimize' : 'create')" />
                                    <yk-button type="secondary" :loading="assisting && assistAction === 'optimize'"
                                        :disabled="previewing || !draft.content.trim()" @click="assistTemplate('optimize')">
                                        AI 优化
                                    </yk-button>
                                    <yk-button type="primary" :loading="assisting && assistAction === 'create'"
                                        :disabled="previewing" @click="assistTemplate('create')">
                                        AI 帮我写
                                    </yk-button>
                                </div>
                                <span class="ai-prompt-tip">{{ assistTip }}</span>
                            </div>

                            <div class="ai-prompt-preview-field">
                                <span class="ai-prompt-label">
                                    示例变量
                                    <em class="ai-prompt-label-tip">可用变量：{{ draftVariables }}</em>
                                </span>
                                <textarea v-model="draftVariablesText" class="ai-prompt-editor is-small" rows="6"
                                    spellcheck="false" placeholder="变量名=示例内容，每行一个" />
                            </div>

                            <!-- 操作按钮固定在输入区底部，始终可见 -->
                            <div class="ai-prompt-preview-actions">
                                <yk-button type="primary" :loading="previewing" @click="startPreview">
                                    {{ previewing ? '试跑中...' : '开始试跑' }}
                                </yk-button>
                                <yk-button type="secondary" :disabled="previewing" @click="resetDraft">重置示例</yk-button>
                                <yk-button v-if="draft.key && draftTemplate" type="primary"
                                    :disabled="previewing || isActiveKey(draft.key)"
                                    @click="handleSelect(draftTemplate)">
                                    选用此套提示词
                                </yk-button>
                            </div>
                        </div>

                        <!-- 右侧结果：整块留给模型输出，试跑前后位置与高度都不变 -->
                        <section class="ai-prompt-result-panel" aria-label="试跑结果" :aria-busy="previewing">
                            <header class="ai-prompt-result-head">
                                <span class="ai-prompt-label">试跑结果</span>
                                <div v-if="previewResult" class="ai-prompt-result-meta">
                                    <span>{{ previewResult.modelName || '当前模型' }}</span>
                                    <span v-if="previewResult.degraded">已自动降级</span>
                                    <span>{{ previewResult.kind === 'image' ? '图片结果' : '文本结果' }}</span>
                                </div>
                            </header>

                            <div v-if="previewError" class="ai-banner is-error">{{ previewError }}</div>
                            <div v-else-if="previewNotice" class="ai-banner is-success">{{ previewNotice }}</div>

                            <div v-if="previewing" class="ai-prompt-result is-loading" aria-live="polite">
                                <div class="ai-prompt-progress">
                                    <span class="ai-prompt-progress-bar" />
                                </div>
                                <strong>{{ draft.mode === 'image' ? '正在生成图片' : '正在生成文字' }}</strong>
                                <p>{{ draft.mode === 'image' ? '通常需要 10–60 秒，可以先继续编辑，完成后结果会显示在这里。' : '正在调用模型，完成后结果会显示在这里。' }}</p>
                                <span class="ai-prompt-progress-time">已等待 {{ previewElapsed }} 秒</span>
                            </div>

                            <div v-if="assisting" class="ai-prompt-result is-loading" aria-live="polite">
                                <div class="ai-prompt-progress">
                                    <span class="ai-prompt-progress-bar" />
                                </div>
                                <strong>正在生成候选提示词</strong>
                                <p>AI 会基于所选功能和当前内容生成候选，已等待 {{ assistElapsed }} 秒。</p>
                            </div>

                            <div v-else-if="assistCandidate" class="ai-prompt-result is-candidate">
                                <header class="ai-prompt-candidate-head">
                                    <div class="ai-prompt-candidate-title">
                                        <strong>候选提示词</strong>
                                        <span>{{ assistCandidate.summary || '请检查变量和输出约束' }}</span>
                                    </div>
                                    <div class="ai-prompt-candidate-actions">
                                        <yk-button size="s" type="primary" :disabled="previewing" @click="applyAssistantCandidate">
                                            应用到输入框
                                        </yk-button>
                                        <yk-button size="s" type="secondary" @click="clearAssistantCandidate">
                                            忽略
                                        </yk-button>
                                    </div>
                                </header>
                                <pre class="ai-prompt-candidate-content">{{ assistCandidate.content }}</pre>
                                <p class="ai-prompt-candidate-meta">
                                    {{ assistCandidate.modelName || '当前模型' }}
                                    <span v-if="assistCandidate.degraded"> · 已自动降级</span>
                                </p>
                            </div>

                            <div v-if="!previewing && !assisting && !assistCandidate && previewResult?.kind === 'image'" class="ai-prompt-result">
                                <img :src="previewResult.dataUri" alt="提示词生成的示例图片" />
                                <div class="ai-prompt-result-toolbar">
                                    <yk-button type="secondary" :disabled="savingPreview || !previewResult.token"
                                        :loading="savingPreview" @click="savePreviewImage">
                                        存入本地文件
                                    </yk-button>
                                </div>
                            </div>
                            <pre v-else-if="!previewing && !assisting && !assistCandidate && previewResult?.kind === 'text'" class="ai-prompt-result is-text">{{ previewResult.text }}</pre>
                            <div v-else-if="!previewing && !assisting && !assistCandidate" class="ai-prompt-result is-empty">还没有试跑结果。填好示例变量后点「开始试跑」，这里会显示模型的真实输出。</div>
                        </section>
                    </div>
                </aside>
            </div>
        </template>

        <!-- 新建 / 编辑弹窗 -->
        <yk-modal :model-value="modalVisible" :title="editingKey ? '编辑提示词' : '新建提示词'" size="s"
            :closeable="!saving" @update:model-value="closeModal">
            <form class="ai-prompt-form" @submit.prevent="submitForm">
                <label class="ai-prompt-field">
                    <span class="ai-prompt-label">所属功能<i>*</i></span>
                    <select-field v-model="form.featureKey" :options="featureOptions" :disabled="Boolean(editingKey)" />
                    <span class="ai-prompt-tip">提示词只会用于所选功能，切换功能不影响其它入口</span>
                </label>

                <label class="ai-prompt-field">
                    <span class="ai-prompt-label">名称<i>*</i></span>
                    <input v-model.trim="form.name" type="text" placeholder="例如：我的写作风格" required />
                </label>

                <label class="ai-prompt-field">
                    <span class="ai-prompt-label">说明</span>
                    <input v-model.trim="form.description" type="text" placeholder="一句话描述这套提示词的用途" />
                </label>

                <label class="ai-prompt-field">
                    <span class="ai-prompt-label">提示词内容<i>*</i></span>
                    <textarea v-model="form.content" class="ai-prompt-editor" rows="12" spellcheck="false" required />
                    <span class="ai-prompt-tip">可用变量：{{ currentVariables }}</span>
                </label>

                <label v-if="editingKey" class="ai-prompt-switch">
                    <yk-switch v-model="form.enabled" :checked-value="true" :unchecked-value="false"
                        checked-color="#1fb4a2" unchecked-color="#fa5247" />
                    <span>启用该提示词</span>
                </label>
            </form>

            <template #footer>
                <yk-space size="s">
                    <yk-button :disabled="saving" @click="closeModal">取消</yk-button>
                    <yk-button type="primary" :loading="saving" @click="submitForm">
                        {{ saving ? '保存中...' : '确认保存' }}
                    </yk-button>
                </yk-space>
            </template>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
    import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref } from 'vue'
    import TopTitle from '../components/bar/TopTitle.vue'
    import SelectField from '../components/common/SelectField.vue'
    import {
        createAiPromptTemplate,
        deleteAiPromptTemplate,
        getAiPromptTemplates,
        getRequestErrorMessage,
        resetAiPromptTemplate,
        selectAiPromptTemplate,
        updateAiPromptTemplate,
        previewAiPromptTemplate,
        assistAiPromptTemplate,
        saveAiPreviewImage,
        type AiPromptPreviewResult,
        type AiPromptTemplate,
    } from '../api/ai'

    interface PromptGroup {
        key: string
        name: string
        description: string
        templates: AiPromptTemplate[]
    }

    type MessageOptions = {
        type: 'primary' | 'error'
        message: string
    }

    type ProxyWithMessage = {
        $message?: (options: MessageOptions) => void
    }

    const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined

    // 成功与失败都给可见反馈
    const notify = (type: 'primary' | 'error', message: string): void => {
        proxy?.$message?.({ type, message })
    }

    const loading = ref(false)
    const saving = ref(false)
    const errorMessage = ref('')
    const noticeMessage = ref('')
    const templates = ref<AiPromptTemplate[]>([])
    const bindings = ref<Record<string, string>>({})
    const previewing = ref(false)
    const previewElapsed = ref(0)
    const savingPreview = ref(false)
    const previewError = ref('')
    const previewNotice = ref('')
    const previewResult = ref<AiPromptPreviewResult | null>(null)
    const assisting = ref(false)
    const assistAction = ref<'optimize' | 'create' | ''>('')
    const assistElapsed = ref(0)
    const assistRequirement = ref('')
    const assistCandidate = ref<AiPromptAssistantResult | null>(null)
    let previewTimer: ReturnType<typeof setInterval> | null = null
    let assistTimer: ReturnType<typeof setInterval> | null = null

    const stopPreviewTimer = (): void => {
        if (previewTimer) {
            clearInterval(previewTimer)
            previewTimer = null
        }
    }

    const stopAssistTimer = (): void => {
        if (assistTimer) {
            clearInterval(assistTimer)
            assistTimer = null
        }
    }

    const modalVisible = ref(false)
    const editingKey = ref('')
    const form = reactive({
        featureKey: '',
        name: '',
        description: '',
        content: '',
        enabled: true,
    })

    const draft = reactive({
        key: '',
        featureKey: 'freeform',
        name: '',
        content: '',
        variablesText: 'input=写一段关于秋天傍晚的短文',
        mode: 'text' as 'text' | 'image',
    })

    // 内置功能清单：按内置模板顺序展示中文名，避免把 featureKey 暴露给作者
    const features = computed<PromptGroup[]>(() => {
        const map = new Map<string, PromptGroup>()
        for (const item of templates.value) {
            if (!item.isDefault) continue
            if (!map.has(item.featureKey)) {
                map.set(item.featureKey, {
                    key: item.featureKey,
                    name: item.name || item.featureKey,
                    description: '',
                    templates: [],
                })
            }
            map.get(item.featureKey)!.templates.push(item)
        }
        return Array.from(map.values())
    })

    // 按功能分组：内置模板作为组标题，自定义模板挂在对应功能下
    const groups = computed<PromptGroup[]>(() => {
        const builtin = new Map<string, AiPromptTemplate>()
        for (const item of templates.value) {
            if (item.isDefault) builtin.set(item.featureKey, item)
        }
        const result: PromptGroup[] = []
        for (const [key, item] of builtin) {
            result.push({
                key,
                name: item.name,
                description: item.description,
                templates: templates.value.filter(template => template.featureKey === key),
            })
        }
        return result
    })

    const currentVariables = computed(() => {
        const match = templates.value.find(item => item.featureKey === form.featureKey)
        return match?.variables || '暂无变量'
    })

    // 下拉选项：中文功能名 + 功能标识
    const featureOptions = computed(() => features.value.map(item => ({
        label: item.name,
        value: item.key,
    })))

    // 试跑输出类型：文字走对话模型，图片走图片模型
    const previewModes = [
        { label: '生成文字', value: 'text' as const },
        { label: '生成图片', value: 'image' as const },
    ]

    const previewModeTip = computed(() => draft.mode === 'image'
        ? '用图片模型生成一张示例图，适合验证配图类提示词'
        : '用对话模型生成一段文字，适合验证写作类提示词')

    const assistTip = computed(() =>
        'AI 优化会保留所属功能可用变量；AI 帮我写会按需求新建候选，均不会自动覆盖当前内容')

    const draftTemplate = computed(() => templates.value.find(item => item.key === draft.key) || null)

    const draftVariables = computed(() => draftTemplate.value?.variables
        || templates.value.find(item => item.isDefault && item.featureKey === draft.featureKey)?.variables
        || '暂无变量')

    const draftSourceLabel = computed(() => draft.key
        ? (draftTemplate.value?.name || '已选模板')
        : `${features.value.find(item => item.key === draft.featureKey)?.name || '自由创作'} · 草稿`)

    const draftVariablesText = computed({
        get: () => draft.variablesText,
        set: (value: string) => { draft.variablesText = value },
    })

    const activeKeyOf = (group: PromptGroup): string => {
        const bound = bindings.value[group.key]
        if (bound && group.templates.some(item => item.key === bound && item.enabled)) return bound
        return group.templates.find(item => item.isDefault)?.key || group.templates[0]?.key || ''
    }

    const isActive = (group: PromptGroup, item: AiPromptTemplate): boolean => activeKeyOf(group) === item.key

    const isActiveGroup = (item: AiPromptTemplate): boolean => {
        const group = groups.value.find(candidate => candidate.key === item.featureKey)
        return Boolean(group && isActive(group, item))
    }

    const activeName = (group: PromptGroup): string => {
        const key = activeKeyOf(group)
        return group.templates.find(item => item.key === key)?.name || '未选择'
    }

    const formatTime = (value: string): string => {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return String(value)
        const pad = (input: number) => String(input).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    const applyData = (data: { list?: AiPromptTemplate[]; bindings?: Record<string, string> } | undefined): void => {
        templates.value = data?.list || []
        bindings.value = data?.bindings || {}
        // 模板列表到位后再补默认草稿内容，避免试跑区出现空提示词
        if (!draft.content.trim()) {
            const freeform = templates.value.find(item => item.isDefault && item.featureKey === 'freeform')
            draft.content = freeform?.content || ''
        }
    }

    const load = async (): Promise<void> => {
        loading.value = true
        errorMessage.value = ''
        try {
            const result = await getAiPromptTemplates()
            if (result.code !== 200) {
                throw new Error(result.message || '提示词模板加载失败')
            }
            applyData(result.data)
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '提示词模板加载失败，请稍后重试')
        } finally {
            loading.value = false
        }
    }

    const openCreate = (): void => {
        editingKey.value = ''
        form.featureKey = groups.value[0]?.key || 'suggest'
        form.name = ''
        form.description = ''
        form.content = ''
        form.enabled = true
        modalVisible.value = true
    }

    const parseVariablesText = (value: string): Record<string, string> => {
        const variables: Record<string, string> = {}
        for (const line of value.split(/\r?\n/)) {
            const index = line.indexOf('=')
            if (index <= 0) continue
            const name = line.slice(0, index).trim()
            const content = line.slice(index + 1).trim()
            if (/^\w+$/.test(name) && content) variables[name] = content
        }
        return variables
    }

    const buildVariablesText = (content: string): string => {
        const names = Array.from(new Set(Array.from(String(content || '').matchAll(/\{\{\s*(\w+)\s*\}\}/g), match => match[1])))
        return names.map(name => `${name}=`).join('\n')
    }

    const startPreview = async (): Promise<void> => {
        if (previewing.value) return
        if (!draft.content.trim()) {
            previewError.value = '请先填写要验证的提示词内容'
            return
        }

        previewing.value = true
        previewError.value = ''
        previewNotice.value = ''
        previewResult.value = null
        previewElapsed.value = 0
        stopPreviewTimer()
        previewTimer = setInterval(() => {
            previewElapsed.value += 1
        }, 1000)
        try {
            const result = await previewAiPromptTemplate({
                featureKey: draft.featureKey,
                content: draft.content,
                variables: parseVariablesText(draft.variablesText),
                mode: draft.mode,
            })
            if (result.code !== 200) throw new Error(result.message || '提示词试跑失败')
            previewResult.value = result.data || null
            previewNotice.value = '试跑完成，效果满意后可以选用该套提示词'
        } catch (error) {
            previewError.value = getRequestErrorMessage(error, '提示词试跑失败，请稍后重试')
        } finally {
            previewing.value = false
            stopPreviewTimer()
        }
    }

    const assistTemplate = async (task: 'optimize' | 'create'): Promise<void> => {
        if (assisting.value || previewing.value) return
        if (task === 'optimize' && !draft.content.trim()) {
            previewError.value = '请先填写要优化的提示词内容'
            return
        }

        assisting.value = true
        assistAction.value = task
        previewError.value = ''
        previewNotice.value = ''
        assistCandidate.value = null
        assistElapsed.value = 0
        stopAssistTimer()
        assistTimer = setInterval(() => {
            assistElapsed.value += 1
        }, 1000)

        try {
            const result = await assistAiPromptTemplate({
                task,
                featureKey: draft.featureKey,
                content: draft.content,
                requirement: assistRequirement.value,
                variables: parseVariablesText(draft.variablesText),
            })
            if (result.code !== 200) throw new Error(result.message || '提示词候选生成失败')
            assistCandidate.value = result.data || null
            if (!result.data) throw new Error('模型没有返回候选提示词')
        } catch (error) {
            previewError.value = getRequestErrorMessage(error, '提示词候选生成失败，请稍后重试')
        } finally {
            assisting.value = false
            assistAction.value = ''
            stopAssistTimer()
        }
    }

    const applyAssistantCandidate = (): void => {
        if (!assistCandidate.value?.content) return
        draft.content = assistCandidate.value.content
        draft.variablesText = buildVariablesText(assistCandidate.value.content)
        previewResult.value = null
        previewNotice.value = '候选提示词已应用，建议先试跑确认效果'
    }

    const clearAssistantCandidate = (): void => {
        assistCandidate.value = null
        previewNotice.value = ''
    }

    const savePreviewImage = async (): Promise<void> => {
        if (savingPreview.value || previewResult.value?.kind !== 'image' || !previewResult.value.token) return
        savingPreview.value = true
        previewError.value = ''
        try {
            const result = await saveAiPreviewImage(previewResult.value.token)
            if (result.code !== 200) throw new Error(result.message || '试跑图片保存失败')
            previewNotice.value = `已保存到本地文件：${result.data?.url || ''}`
            notify('primary', '试跑图片已保存到本地文件')
            previewResult.value = { ...previewResult.value, token: '' }
        } catch (error) {
            previewError.value = getRequestErrorMessage(error, '试跑图片保存失败，请稍后重试')
            notify('error', previewError.value)
        } finally {
            savingPreview.value = false
        }
    }

    const openPreview = (item: AiPromptTemplate): void => {
        draft.key = item.key
        draft.featureKey = item.featureKey
        draft.name = item.name
        draft.content = item.content
        draft.variablesText = buildVariablesText(item.content)
        // 配图类模板默认出图，其余默认出文字，作者仍可手动切换
        draft.mode = item.featureKey === 'cover' ? 'image' : 'text'
        previewError.value = ''
        previewNotice.value = ''
        previewResult.value = null
        assistCandidate.value = null
        assistRequirement.value = ''
    }

    const resetDraft = (): void => {
        draft.key = ''
        draft.featureKey = 'freeform'
        draft.name = ''
        draft.content = templates.value.find(item => item.isDefault && item.key === 'freeform')?.content || ''
        draft.variablesText = 'input=写一段关于秋天傍晚的短文'
        draft.mode = 'text'
        previewError.value = ''
        previewNotice.value = ''
        previewResult.value = null
        assistCandidate.value = null
    }

    const openEdit = (item: AiPromptTemplate): void => {
        editingKey.value = item.key
        form.featureKey = item.featureKey
        form.name = item.name
        form.description = item.description
        form.content = item.content
        form.enabled = item.enabled
        modalVisible.value = true
    }

    // 复制：拿现有模板当草稿改，改完就是一条自定义提示词
    const openDuplicate = (item: AiPromptTemplate): void => {
        editingKey.value = ''
        form.featureKey = item.featureKey
        form.name = `${item.name} 副本`
        form.description = item.description
        form.content = item.content
        form.enabled = true
        modalVisible.value = true
    }

    const closeModal = (): void => {
        if (saving.value) return
        modalVisible.value = false
    }

    const submitForm = async (): Promise<void> => {
        if (saving.value) return
        if (!form.name.trim()) {
            errorMessage.value = '请填写提示词名称'
            return
        }
        if (!form.content.trim()) {
            errorMessage.value = '提示词内容不能为空'
            return
        }

        saving.value = true
        errorMessage.value = ''
        noticeMessage.value = ''
        try {
            const result = editingKey.value
                ? await updateAiPromptTemplate(editingKey.value, {
                    content: form.content,
                    name: form.name,
                    description: form.description,
                    enabled: form.enabled,
                })
                : await createAiPromptTemplate({
                    featureKey: form.featureKey,
                    name: form.name,
                    description: form.description,
                    content: form.content,
                })

            if (result.code !== 200) {
                throw new Error(result.message || '保存提示词失败')
            }
            applyData(result.data)
            noticeMessage.value = editingKey.value ? '提示词已保存' : '自定义提示词已创建'
            notify('primary', noticeMessage.value)
            modalVisible.value = false
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '保存提示词失败')
            notify('error', errorMessage.value)
        } finally {
            saving.value = false
        }
    }

    const handleSelect = async (item: AiPromptTemplate): Promise<void> => {
        errorMessage.value = ''
        noticeMessage.value = ''
        try {
            const result = await selectAiPromptTemplate(item.key)
            if (result.code !== 200) {
                throw new Error(result.message || '切换提示词失败')
            }
            applyData(result.data)
            noticeMessage.value = `已改用「${item.name}」`
            notify('primary', noticeMessage.value)
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '切换提示词失败')
            notify('error', errorMessage.value)
        }
    }

    const handleReset = async (item: AiPromptTemplate): Promise<void> => {
        errorMessage.value = ''
        noticeMessage.value = ''
        try {
            const result = await resetAiPromptTemplate(item.key)
            if (result.code !== 200) {
                throw new Error(result.message || '恢复默认提示词失败')
            }
            applyData(result.data)
            noticeMessage.value = `「${item.name}」已恢复默认提示词`
            notify('primary', noticeMessage.value)
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '恢复默认提示词失败')
            notify('error', errorMessage.value)
        }
    }

    const handleDelete = async (item: AiPromptTemplate): Promise<void> => {
        errorMessage.value = ''
        noticeMessage.value = ''
        try {
            const result = await deleteAiPromptTemplate(item.key)
            if (result.code !== 200) {
                throw new Error(result.message || '删除提示词失败')
            }
            applyData(result.data)
            noticeMessage.value = `「${item.name}」已删除`
            notify('primary', noticeMessage.value)
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '删除提示词失败')
            notify('error', errorMessage.value)
        }
    }

    const isActiveKey = (key: string): boolean => Boolean(templates.value.find(item => item.key === key && isActiveGroup(item)))

    onMounted(load)

    onMounted(() => {
        resetDraft()
    })

    onUnmounted(() => {
        stopPreviewTimer()
        stopAssistTimer()
    })
</script>

<style scoped lang="less">
    .ai-prompt-page {
        width: 100%;
        // 整页不触发浏览器滚动：高度按视口扣掉顶栏与页面留白，
        // 标题栏之下剩余空间全部分给工作区，左右两栏各自内部滚动
        height: calc(100vh - 64px - 26px - 48px - 8px);
        min-height: 480px;
        overflow: hidden;
        // yk-space 默认 align-start 会让子项不占满宽度，这里改为纵向拉伸
        align-items: stretch;
    }

    .ai-prompt-workspace {
        display: grid;
        // 左侧固定一档宽度，右侧吃掉全部剩余空间，专门放试跑验证
        grid-template-columns: minmax(360px, 520px) minmax(0, 1fr);
        align-items: stretch;
        gap: 20px;
        width: 100%;
        // 吃掉标题栏之外的全部高度，自己不再撑大页面
        flex: 1 1 auto;
        min-height: 0;
    }

    .ai-prompt-list {
        display: flex;
        flex-direction: column;
        // 功能分组之间留出呼吸感，不再挤成一坨
        gap: 18px;
        min-width: 0;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        padding-right: 6px;
        padding-bottom: 4px;
        scrollbar-gutter: stable;
    }

    .ai-prompt-preview {
        min-width: 0;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 16px;
        background: var(--admin-surface-soft, var(--bgColor2));
        box-shadow: var(--admin-shadow-sm);
        overflow: hidden;
    }

    .ai-prompt-preview > .ai-prompt-preview-layout {
        flex: 1 1 auto;
    }

    .ai-prompt-preview-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--admin-line, var(--gray1));

        :deep(.yk-text) {
            margin-top: 3px;
            font-size: 12px;
        }
    }

    // 右栏分两段：左侧输入、右侧结果，结果区占主要位置
    .ai-prompt-preview-layout {
        min-height: 0;
        overflow: hidden;
        padding: 16px 18px 18px;
        display: flex;
        flex-direction: row;
        gap: 18px;
    }

    .ai-prompt-preview-form {
        display: flex;
        flex-direction: column;
        gap: 14px;
        // 输入区固定一档宽度，空间不够时只滚动这块
        flex: 0 0 min(46%, 420px);
        min-height: 0;
        overflow-y: auto;
    }

    // 结果区吃掉右栏全部剩余空间：试跑前后位置与高度都不变
    .ai-prompt-result-panel {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 12px;
        background: var(--admin-surface, var(--bgColor1));
        overflow: hidden;
    }

    .ai-prompt-result-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex: none;
    }

    .ai-prompt-result-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
    }

    .ai-prompt-preview-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    // 输出类型：分段切换
    .ai-prompt-mode {
        display: inline-flex;
        align-self: flex-start;
        padding: 3px;
        gap: 3px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 10px;
        background: var(--admin-surface-soft, var(--bgColor2));
    }

    .ai-prompt-mode-item {
        padding: 6px 16px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--gray7);
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        outline: none;
        transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;

        &:hover:not(:disabled):not(.is-active) {
            color: var(--gray);
        }

        &:focus-visible {
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--pcolor) 30%, transparent);
        }

        &.is-active {
            background: var(--admin-surface, var(--bgColor1));
            color: var(--pcolor);
            font-weight: 600;
            box-shadow: var(--admin-shadow-sm);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }

    .ai-banner {
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 13px;
    }

    .ai-banner.is-error {
        background: color-mix(in srgb, #fa5247 12%, transparent);
        color: var(--gray9);
    }

    .ai-banner.is-success {
        background: color-mix(in srgb, #1fb4a2 12%, transparent);
        color: var(--gray9);
    }

    // 功能分组：标题 + 紧凑的一行式模板列表
    .ai-prompt-group {
        // 不参与弹性压缩：否则分组会被压扁，内部模板行被裁掉看不见
        flex: none;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 14px;
        background: var(--admin-surface-soft, var(--bgColor2));
        overflow: hidden;
    }

    .ai-prompt-group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--admin-line, var(--gray1));
    }

    .ai-prompt-group-heading {
        display: flex;
        flex-direction: column;
        gap: 2px;

        :deep(.yk-text) {
            font-size: 12px;
        }
    }

    .ai-prompt-active-label {
        font-size: 12px;
    }

    .ai-prompt-active-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--gray);
    }

    .ai-prompt-rows {
        display: flex;
        flex-direction: column;
    }

    // 单个模板一行：左侧信息、右侧操作，不再为每个模板开一个文本框
    .ai-prompt-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px 16px;
        padding: 15px 20px;
        border-bottom: 1px solid var(--admin-line, var(--gray1));

        &:last-child {
            border-bottom: none;
        }

        &.is-active {
            background: color-mix(in srgb, var(--pcolor) 6%, transparent);
        }
    }

    .ai-prompt-row-main {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;

        strong {
            color: var(--gray);
            font-size: 13px;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .ai-prompt-row-meta {
        grid-column: 1;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--gray7);

        span:first-child {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .ai-prompt-row-time {
        flex: none;
        font-variant-numeric: tabular-nums;
    }

    .ai-prompt-row-actions {
        grid-column: 2;
        grid-row: 1 / span 2;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ai-prompt-preview-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        // 操作行不被压缩，始终可见
        flex: none;
    }

    .ai-prompt-assist-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
    }

    .ai-prompt-assist-input {
        height: 40px;
        min-width: 0;
        box-sizing: border-box;
        padding: 0 12px;
        border: 1px solid var(--admin-line-strong, var(--gray1));
        border-radius: 8px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray);
        font-size: 13px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.16s ease, box-shadow 0.16s ease;

        &::placeholder {
            color: var(--admin-muted, var(--gray6));
        }

        &:focus {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 14%, transparent);
        }

        &:disabled {
            opacity: 0.6;
        }
    }

    .ai-prompt-label-tip {
        margin-left: 8px;
        font-style: normal;
        font-weight: 400;
        color: var(--admin-muted, var(--gray6));
    }

    .ai-prompt-result {
        margin: 0;
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 12px 14px;
        border-radius: 10px;
        background: var(--admin-surface-soft, var(--bgColor2));
        color: var(--gray);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.7;

        &.is-text {
            font-family: inherit;
        }

        &.is-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: var(--admin-muted, var(--gray6));
            font-size: 13px;
            line-height: 1.8;
            border: 1px dashed var(--admin-line-strong, var(--gray1));
        }

        img {
            display: block;
            width: 100%;
            height: auto;
            border-radius: 8px;
        }
    }

    .ai-prompt-result.is-loading {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 10px;
        text-align: center;
        border: 1px dashed color-mix(in srgb, var(--pcolor) 32%, transparent);
        background: color-mix(in srgb, var(--pcolor) 5%, var(--admin-surface-soft, var(--bgColor2)));

        strong {
            color: var(--gray);
            font-size: 15px;
        }

        p,
        .ai-prompt-progress-time {
            margin: 0;
            color: var(--admin-muted, var(--gray6));
            font-size: 12px;
        }
    }

    .ai-prompt-result.is-candidate {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px dashed color-mix(in srgb, var(--pcolor) 30%, transparent);
    }

    .ai-prompt-candidate-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .ai-prompt-candidate-title {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;

        strong {
            color: var(--gray);
            font-size: 14px;
        }

        span {
            color: var(--admin-muted, var(--gray6));
            font-size: 12px;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
    }

    .ai-prompt-candidate-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
    }

    .ai-prompt-candidate-content {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: 12px;
        overflow: auto;
        border-radius: 8px;
        background: var(--admin-surface-soft, var(--bgColor2));
        color: var(--gray);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.7;
    }

    .ai-prompt-candidate-meta {
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
    }

    .ai-prompt-progress {
        align-self: center;
        width: min(360px, 78%);
        height: 6px;
        border-radius: 999px;
        overflow: hidden;
        background: color-mix(in srgb, var(--pcolor) 12%, transparent);
    }

    .ai-prompt-progress-bar {
        display: block;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: var(--pcolor);
        animation: ai-prompt-progress-slide 1.4s ease-in-out infinite;
    }

    .ai-prompt-progress-time {
        font-variant-numeric: tabular-nums;
    }

    @keyframes ai-prompt-progress-slide {
        from {
            transform: translateX(-110%);
        }

        to {
            transform: translateX(260%);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .ai-prompt-progress-bar {
            animation: none;
            width: 100%;
            opacity: 0.45;
        }
    }

    .ai-prompt-result-toolbar {
        display: flex;
        justify-content: flex-end;
        margin-top: 10px;
    }

    // 弹窗表单
    .ai-prompt-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .ai-prompt-field {
        display: flex;
        flex-direction: column;
        gap: 6px;

        input {
            width: 100%;
            box-sizing: border-box;
            padding: 9px 12px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 8px;
            background: var(--bgColor1);
            color: var(--gray);
            font-size: 13px;
        }
    }

    .ai-prompt-label {
        font-size: 13px;
        color: var(--gray);

        i {
            color: #fa5247;
            font-style: normal;
            margin-left: 2px;
        }
    }

    .ai-prompt-tip {
        font-size: 12px;
        color: var(--gray7);
    }

    .ai-prompt-editor {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 8px;
        background: var(--bgColor1);
        color: var(--gray);
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 12px;
        line-height: 1.7;
        resize: vertical;

        &:focus {
            outline: none;
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
        }
    }

    .ai-prompt-switch {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--gray);
    }

    @media (max-width: 900px) {
        // 窄屏放不下双栏：恢复整页自然滚动，交给手机自己滚
        .ai-prompt-page {
            height: auto;
            min-height: 0;
            overflow: visible;
        }

        .ai-prompt-workspace {
            grid-template-columns: minmax(0, 1fr);
            min-height: auto;
            height: auto;
        }

        .ai-prompt-list {
            height: auto;
            overflow: visible;
        }

        .ai-prompt-preview {
            height: auto;
        }

        .ai-prompt-result-panel {
            min-height: 180px;
        }

        .ai-prompt-row {
            grid-template-columns: minmax(0, 1fr);
        }

        .ai-prompt-row-actions {
            grid-column: 1;
            grid-row: auto;
        }
    }
</style>
