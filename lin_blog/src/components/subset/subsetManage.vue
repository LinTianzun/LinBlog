<template>
    <!-- 不传 data：yk-table 会按列渲染一份默认空行，与 #tbody 自定义行叠加导致行数翻倍 -->
    <yk-table>
        <yk-table-column property="email" label="名称"></yk-table-column>
        <yk-table-column property="bir" label="关联文章数"></yk-table-column>
        <yk-table-column property="desc" label="创建时间"></yk-table-column>
        <yk-table-column property="manage" label="操作" align="right"></yk-table-column>
        <template #tbody>
            <tbody>
            <tr v-for="item in subsetStore.data" :key="item.id" class="yk-table__row">
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
                <yk-text type="primary" @click="removeSubset(item.id)" style="cursor: pointer">删除</yk-text>
                </td>
            </tr>
            <tr v-if="subsetStore.data.length === 0" class="yk-table__row">
                <td class="yk-table__cell text-center" colspan="4">暂无分组</td>
            </tr>
            </tbody>
        </template>
    </yk-table>
</template>

<script lang="ts" setup>
import { getCurrentInstance } from 'vue'
import { useSubsetStore } from '../../store/subset.ts'
import { deleteSubset, updateSubset } from '../../api/subset'

const proxy = getCurrentInstance()?.proxy

const messageProxy = proxy as {
    $message: (options: { type: 'primary' | 'warning' | 'error'; message: string }) => void
} | null | undefined

const subsetStore = useSubsetStore()

type SubsetItem = (typeof subsetStore.data)[number]

let nowName: SubsetItem['name'] = ''

// 聚焦名称
const focusSubset = (id: SubsetItem['id']) => {
    const result = subsetStore.data.find((item) => item.id === id)
    if (result) {
        nowName = result.name
    }
}

// 失焦
const blurSubset = async (id: SubsetItem['id']) => {
    const result = subsetStore.data.find((item) => item.id === id)

    if (result && nowName !== result.name) {
        const name = String(result.name).trim()
        if (!name) {
                messageProxy?.$message?.({ type: 'warning', message: '分类名称不能为空' })
            result.name = nowName
            return
        }

        try {
            const res = await updateSubset(Number(id), { name })
            if (res.code !== 200) {
                throw new Error(res.message || '修改失败')
            }
            await subsetStore.fetchSubsets()
            messageProxy?.$message?.({ type: 'primary', message: '修改成功' })
        } catch (error) {
            if (nowName !== undefined) {
                result.name = nowName
            }
            const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
                || (error instanceof Error ? error.message : '修改失败，请稍后重试')
            messageProxy?.$message?.({ type: 'error', message })
        }
    }
}

// 删除
const removeSubset = async (id: SubsetItem['id']) => {
    try {
        const res = await deleteSubset(Number(id))
        if (res.code !== 200) {
            throw new Error(res.message || '删除失败')
        }
        await subsetStore.fetchSubsets()
        messageProxy?.$message?.({ type: 'primary', message: '删除成功' })
    } catch (error) {
        const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
            || (error instanceof Error ? error.message : '删除失败，请稍后重试')
        messageProxy?.$message?.({ type: 'error', message })
    }
}
</script>

<style lang="less" scoped>

</style>
