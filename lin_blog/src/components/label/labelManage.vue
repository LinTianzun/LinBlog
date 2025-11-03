<template>
    <yk-table :data="dataList">
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
    import { ref, onMounted, getCurrentInstance, watch } from 'vue'
    import { LabelData } from '../../utils/interface.ts'

    type labelProps = {
        label: LabelData[]
    }

    const props = withDefaults(defineProps < labelProps > (), {})

    const proxy = getCurrentInstance()?.proxy

    //  当前标签
    const labelData = ref < LabelData > ([])


    //  删除标签
    const deleteSubset = (id) => {
        labelData.value = labelData.value.filter(
            (obj: { id: number | string }) => {
                return obj.id !== id
            }
        )
        proxy.$message({ type: 'primary', message: '删除成功' })
    }

    watch(() => props.label, (e) => {
        labelData.value = e
    },
        { immediate: true })

</script>

<style lang="less" scoped>

</style>