<template>
    <!-- 不传 data：yk-table 会按列渲染一份默认空行，与 #tbody 自定义行叠加导致行数翻倍 -->
    <yk-table>
        <yk-table-column property="name" label="标签名称"></yk-table-column>
        <yk-table-column property="moment" label="创建时间"></yk-table-column>
        <yk-table-column property="manage" label="操作" align="right"></yk-table-column>
        <template #tbody>
            <tbody>
            <tr v-for="item in labelData" :key="item.id" class="yk-table__row">
                <td class="yk-table__cell">
                    {{ item.name }}
                </td>
                <td class="yk-table__cell">
                    {{ item.moment }}
                </td>
                <td class="yk-table__cell text-right">
                    <yk-text type="primary" @click="removeLabel(item.id)" style="cursor: pointer">删除</yk-text>
                </td>
            </tr>
            <tr v-if="labelData.length === 0" class="yk-table__row">
                <td class="yk-table__cell text-center" colspan="3">暂无标签</td>
            </tr>
            </tbody>
        </template>
    </yk-table>
</template>

<script lang="ts" setup>
import { ref, getCurrentInstance, watch, type ComponentPublicInstance } from 'vue'
import { deleteLabel } from '../../api/label.ts'
import { useLabelStore } from '../../store/label.ts'
import type { LabelData } from '../../utils/interface.ts'

type MessageInstance = ComponentPublicInstance & {
    $message?: (options: {
        type: 'primary' | 'error'
        message: string
    }) => void
}

const emits = defineEmits<{
    (e: 'changed'): void
}>()

const proxy = getCurrentInstance()?.proxy as MessageInstance | null | undefined
const labelStore = useLabelStore()

// 当前标签
const labelData = ref<LabelData[]>([])

// 删除标签
const removeLabel = async (id: LabelData['id']): Promise<void> => {
    try {
        const result = await deleteLabel(Number(id))
        if (result.code !== 200) {
            throw new Error(result.message || '删除失败')
        }

        proxy?.$message?.({ type: 'primary', message: '删除成功' })
        await labelStore.fetchLabels()
        emits('changed')
    } catch (error) {
        const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
            || (error instanceof Error ? error.message : '删除失败，请稍后重试')
        proxy?.$message?.({ type: 'error', message })
    }
}

watch(
    () => labelStore.data,
    value => {
        labelData.value = [...value]
    },
    { immediate: true, deep: true }
)
</script>

<style scoped>

</style>
