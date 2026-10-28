<template>
    <div class="label">
        <div class="label-title">
            <yk-title :level="4" style="margin: 0;">标签</yk-title>
            <yk-space v-if="canManageTaxonomy" style="flex:none">
                <yk-popconfirm title="请输入标签名称" trigger="click" placement="bottom" @cancel="cancel" @confirm="confirm">
                    <yk-text type="primary">
                        <IconCirclePlusOutline style="margin-right: 4px;" /> 新建
                    </yk-text>
                    <template #content>
                        <div style="margin: 8px 4px 16px;">
                            <yk-input placeholder="请输入" show-counter :limit="6" style="width: 208px;"
                                v-model="inputValue"></yk-input>
                        </div>
                    </template>
                </yk-popconfirm>
                <yk-text type="primary" @click="showModal">
                    <IconSettingsOutline style="margin-right: 4px;" /> 管理标签
                </yk-text>

            </yk-space>
        </div>
        <yk-space wrap size="s">
            <yk-tag v-for="(item, index) in labelStore.data" :key="index" @click="changeSeleted(item.id,'label')"
                :class="{'label-menu-seledted':selected==item.id+'label'}">
                {{item.name}}
            </yk-tag>
        </yk-space>
    </div>

    <!-- 管理标签对话框 -->
    <yk-modal v-if="canManageTaxonomy" v-model="visible" title="管理标签">
        <labelManage @changed="rawLabel" />
        <template #footer>
            <yk-button @click="showModal">确定</yk-button>
        </template>
    </yk-modal>

</template>

<script lang="ts" setup>
import { ref, computed, onMounted, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import { createLabel } from '../../api/label.ts'
import { useLabelStore } from '../../store/label.ts'
import type { LabelData } from '../../utils/interface.ts'
import labelManage from './labelManage.vue'
import { useSessionStore } from '../../store/session.ts'

type MessageOptions = {
    type: 'primary' | 'warning'
    message: string
}

type MessageInstance = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as MessageInstance | null | undefined
const labelStore = useLabelStore()
const session = useSessionStore()

// 标签管理走 label.manage 权限，与后端 requirePermission 保持一致
const canManageTaxonomy = computed((): boolean => session.can('label.manage'))

// 新建标签内容
const inputValue = ref('')

// 当前选择
const selected = ref('-1all')

// 定义组件事件
const emits = defineEmits<{
    (e: 'nowSubset', payload: { id: LabelData['id']; type: 'label' }): void
}>()

// 选择切换
const changeSeleted = (id: LabelData['id'], type: 'label'): void => {
    if (id + type !== selected.value) {
        selected.value = id + type
        emits('nowSubset', { id, type })
    }
}

// 获取标签
const rawLabel = async (): Promise<void> => {
    await labelStore.fetchLabels()
}

// 取消新建
const cancel = (): void => {
    inputValue.value = ''
}

// 新建标签
const confirm = async (): Promise<void> => {
    const name = inputValue.value.trim()

    if (name) {
        if (name.length > 30) {
            proxy?.$message?.({ type: 'warning', message: '标签名称不能超过30字' })
            return
        }

        try {
            const result = await createLabel({ name })
            if (result.code !== 200) {
                throw new Error(result.message || '创建失败')
            }
            await rawLabel()
            proxy?.$message?.({ type: 'primary', message: '标签创建成功' })
            inputValue.value = ''
        } catch (error) {
            const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
                || (error instanceof Error ? error.message : '创建失败，请稍后重试')
            proxy?.$message?.({ type: 'error', message })
        }
    } else {
        proxy?.$message?.({ type: 'warning', message: '内容不能为空' })
    }
}

// 显示管理标签
const visible = ref(false)

const showModal = (): void => {
    if (!canManageTaxonomy.value) return
    visible.value = !visible.value
}

onMounted(() => {
    void rawLabel()
})
</script>


<style lang="less" scoped>
    .label {
        width: 280px;
        flex: none;
        padding: @space-l @space-xl;
        border-radius: @radius-m;
        background-color: @bg-color-l;

        &-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: @space-l;
        }

        .yk-text {
            cursor: pointer;
        }

    }
</style>
