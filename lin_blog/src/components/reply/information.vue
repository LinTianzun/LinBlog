<template>
    <yk-drawer placement="right" :show="active" @close="closes" :title="'私信 '+count">

        <yk-space dir="vertical">
            <reply v-for="item in comments" :key="item.id" :isComment="false" :content="item"
                @delete="deleteComment" />
        </yk-space>

        <template #footer>
            <yk-pagination :total="count" @change="changePage" simple />
        </template>
    </yk-drawer>
</template>

<script lang="ts" setup>
import { toRefs, ref, onMounted, getCurrentInstance } from 'vue'
import type { InformationProps } from './reply.ts'
import { comment } from '../../mock/data.ts'

const props = withDefaults(defineProps<InformationProps>(), {
    pageSize: 8,
    active: true
})

const emits = defineEmits<{
    (e: 'close', value: boolean): void
}>()

const { active } = toRefs(props)

const closes = () => {
    emits('close', false)
}

const proxy = getCurrentInstance()?.proxy

// 评论总数
const count = ref(123)

// 数据内容
type CommentItem = (typeof comment.data.list)[number]
const comments = ref<CommentItem[]>([])

// 请求参数
type Request = {
    token?: string
    pageSize: number
    nowPage: number
}

const request: Request = {
    pageSize: props.pageSize,
    nowPage: 1
}

// 获取数据
const drwCommentData = () => {
    const data = comment.data
    count.value = data.count
    comments.value = data.list.slice(
        (request.nowPage - 1) * request.pageSize,
        request.nowPage * request.pageSize
    )
}

// 分页
const changePage = (page: number) => {
    request.nowPage = page
    drwCommentData()
}

// 删除私信
const deleteComment = (id: CommentItem['id']) => {
    comments.value = comments.value.filter((item) => item.id !== id)
    proxy?.$message({ type: 'primary', message: '删除成功' })
}

onMounted(() => {
    drwCommentData()
})
</script>

<style lang="less" scoped>

</style>