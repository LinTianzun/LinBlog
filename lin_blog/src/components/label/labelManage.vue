<template>
    <yk-table :data="labelData">
        <yk-table-column property="email" label="标签名称"></yk-table-column>
        <yk-table-column property="desc" label="创建时间"></yk-table-column>
        <yk-table-column property="manage" label="操作" align="right"></yk-table-column>
        <template #tbody>
            <tr v-for="(item, index) in labelData" :key="index" class="yk-table__row">
                <td class="yk-table__cell">
                    {{item.name}}
                </td>
                <td class="yk-table__cell">
                    {{ item.moment }}
                </td>
                <td class="yk-table__cell text-right">
                    <yk-text type="primary" @click="deleteSubset(item.id)" style="cursor: pointer">删除</yk-text>
                </td>
            </tr>
        </template>
    </yk-table>
</template>

<script lang="ts" setup>
import { ref, getCurrentInstance, watch, type ComponentPublicInstance } from 'vue'
import type { LabelData } from '../../utils/interface.ts'

type MessageInstance = ComponentPublicInstance & {
    $message?: (options: {
        type: 'primary'
        message: string
    }) => void
}

const props = defineProps<{
    label: LabelData[]
}>()

const proxy = getCurrentInstance()?.proxy as MessageInstance | null | undefined

// 当前标签
const labelData = ref<LabelData[]>([])

// 删除标签
const deleteSubset = (id: LabelData['id']): void => {
    labelData.value = labelData.value.filter(item => item.id !== id)
    proxy?.$message?.({ type: 'primary', message: '删除成功' })
}

watch(
    () => props.label,
    value => {
        labelData.value = [...value]
    },
    { immediate: true }
)
</script>


<style lang="less" scoped>

</style>