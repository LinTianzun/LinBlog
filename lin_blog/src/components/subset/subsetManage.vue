<template>
    <yk-table :data="dataList">
        <yk-table-column property="email" label="名称"></yk-table-column>
        <yk-table-column property="bir" label="关联文章数"></yk-table-column>
        <yk-table-column property="desc" label="创建时间"></yk-table-column>
        <yk-table-column property="manage" label="操作" align="right"></yk-table-column>
        <template #tbody>
            <tr v-for="(item, index) in subsetStore.data" :key="index" class="yk-table__row">
                <td class="yk-table__cell">
                    <yk-input v-model="item.name" @focus="focusSubset(item.id)" @blur="blurSubset(item.id)" />
                </td>
                <td class="yk-table__cell">
                    {{ item.value }}
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
    import { ref, onMounted, getCurrentInstance } from 'vue'
    import { useSubsetStore } from '../../store/subset.ts'

    const proxy = getCurrentInstance()?.proxy

    //  store
    const subsetStore = useSubsetStore()

    //  当前分组名称
    let nowName = ''

    //  聚焦名称
    const focusSubset = (id) => {
        let result = subsetStore.data.find((item) => item.id === id)
        if (result) {
            nowName = result.name
        }
    }

    //  失焦
    const blurSubset = (id) => {
        let result = subsetStore.data.find((item) => item.id === id)
        if (result && nowName != result.name) {
            //  提交后端处理
            proxy.$message({ type: 'primary', message: '修改成功' })
        }
    }

    //  删除
    const deleteSubset = (id) => {
        subsetStore.data = subsetStore.data.filter(
            (obj: { value: any; id: number | string }) => {
                if (obj.id === id) {
                    subsetStore.exclude.value += obj.value
                }
                return obj.id !== id
            }
        )
        proxy.$message({ type: 'primary', message: '删除成功' })
    }

</script>

<style lang="less" scoped>

</style>