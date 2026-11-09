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

                    <div class="ai-prompt-preview-body">
                        <div class="ai-prompt-preview-field">
                            <span class="ai-prompt-label">所属功能</span>
                            <select v-model="draft.featureKey" class="ai-prompt-select" :disabled="previewing">
                                <option v-for="item in features" :key="item.key" :value="item.key">{{ item.name }}</option>
                            </select>
                        </div>

                        <label class="ai-prompt-preview-field">
                            <span class="ai-prompt-label">提示词内容</span>
                            <textarea v-model="draft.content" class="ai-prompt-editor" rows="8" spellcheck="false" />
                        </label>

                        <div class="ai-prompt-preview-field">
                            <span class="ai-prompt-label">示例变量</span>
                            <textarea v-model="draftVariablesText" class="ai-prompt-editor is-small" rows="6"
                                spellcheck="false" placeholder="变量名=示例内容，每行一个" />
                            <span class="ai-prompt-tip">可用变量：{{ draftVariables }}</span>
                        </div>

                        <div class="ai-prompt-preview-actions">
                            <yk-button type="primary" :loading="previewing" @click="startPreview">开始试跑</yk-button>
                            <yk-button type="secondary" :disabled="previewing" @click="resetDraft">重置示例</yk-button>
                            <yk-button v-if="draft.key && draftTemplate" type="primary"
                                :disabled="previewing || isActiveKey(draft.key)"
                                @click="handleSelect(draftTemplate)">
                                选用此套提示词
                            </yk-button>
                        </div>

                        <div v-if="previewError" class="ai-banner is-error">{{ previewError }}</div>
                        <div v-else-if="previewNotice" class="ai-banner is-success">{{ previewNotice }}</div>

                        <div v-if="previewResult?.kind === 'image'" class="ai-prompt-result">
                            <img :src="previewResult.dataUri" alt="提示词生成的示例图片" />
                        </div>
                        <pre v-else-if="previewResult?.kind === 'text'" class="ai-prompt-result is-text">{{ previewResult.text }}</pre>
                        <div v-if="previewResult" class="ai-prompt-result-meta">
                            <span>{{ previewResult.modelName || '当前模型' }}</span>
                            <span v-if="previewResult.degraded">已自动降级</span>
                            <span>{{ previewResult.kind === 'image' ? '图片结果' : '文本结果' }}</span>
                        </div>
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
                    <select v-model="form.featureKey" class="ai-prompt-select" :disabled="Boolean(editingKey)">
                        <option v-for="item in features" :key="item.key" :value="item.key">{{ item.name }}</option>
                    </select>
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
    import { computed, getCurrentInstance, onMounted, reactive, ref } from 'vue'
    import TopTitle from '../components/bar/TopTitle.vue'
    import {
        createAiPromptTemplate,
        deleteAiPromptTemplate,
        getAiPromptTemplates,
        getRequestErrorMessage,
        resetAiPromptTemplate,
        selectAiPromptTemplate,
        updateAiPromptTemplate,
        previewAiPromptTemplate,
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
    const previewError = ref('')
    const previewNotice = ref('')
    const previewResult = ref<AiPromptPreviewResult | null>(null)

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
        try {
            const result = await previewAiPromptTemplate({
                featureKey: draft.featureKey,
                content: draft.content,
                variables: parseVariablesText(draft.variablesText),
            })
            if (result.code !== 200) throw new Error(result.message || '提示词试跑失败')
            previewResult.value = result.data || null
            previewNotice.value = '试跑完成，效果满意后可以选用该套提示词'
        } catch (error) {
            previewError.value = getRequestErrorMessage(error, '提示词试跑失败，请稍后重试')
        } finally {
            previewing.value = false
        }
    }

    const openPreview = (item: AiPromptTemplate): void => {
        draft.key = item.key
        draft.featureKey = item.featureKey
        draft.name = item.name
        draft.content = item.content
        draft.variablesText = buildVariablesText(item.content)
        previewError.value = ''
        previewNotice.value = ''
        previewResult.value = null
    }

    const resetDraft = (): void => {
        draft.key = ''
        draft.featureKey = 'freeform'
        draft.name = ''
        draft.content = templates.value.find(item => item.isDefault && item.key === 'freeform')?.content || ''
        draft.variablesText = 'input=写一段关于秋天傍晚的短文'
        previewError.value = ''
        previewNotice.value = ''
        previewResult.value = null
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
</script>

<style scoped lang="less">
    .ai-prompt-page {
        width: 100%;
    }

    .ai-prompt-workspace {
        display: grid;
        grid-template-columns: minmax(0, min(46%, 620px)) minmax(340px, 1fr);
        align-items: stretch;
        gap: 20px;
        min-height: min(760px, calc(100vh - 170px));
    }

    .ai-prompt-list {
        min-width: 0;
        max-height: 100%;
        overflow-y: auto;
        padding-right: 4px;
        scrollbar-gutter: stable;
    }

    .ai-prompt-preview {
        position: sticky;
        top: 0;
        min-width: 0;
        align-self: start;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 16px;
        background: var(--admin-surface-soft, var(--bgColor2));
        box-shadow: var(--admin-shadow-sm);
        overflow: hidden;
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

    .ai-prompt-preview-body {
        min-height: 0;
        overflow-y: auto;
        padding: 16px 18px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .ai-prompt-preview-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    .ai-prompt-select {
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--admin-line-strong, var(--gray1));
        border-radius: 10px;
        color: var(--gray);
        background: var(--admin-surface, var(--bgColor1));
        font-size: 14px;
        outline: none;

        &:focus {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
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
        padding: 14px 18px;
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
        gap: 6px 16px;
        padding: 11px 18px;
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
    }

    .ai-prompt-result {
        margin: 0;
        min-height: 140px;
        max-height: 320px;
        overflow: auto;
        padding: 14px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 12px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.7;

        &.is-text {
            font-family: inherit;
        }

        img {
            display: block;
            width: 100%;
            height: auto;
            border-radius: 8px;
        }
    }

    .ai-prompt-result-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
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
        .ai-prompt-workspace {
            grid-template-columns: minmax(0, 1fr);
            min-height: auto;
        }

        .ai-prompt-list {
            max-height: none;
            overflow: visible;
        }

        .ai-prompt-preview {
            position: static;
            max-height: none;
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
