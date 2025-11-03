<template>
    <yk-drawer placement="right" :show="active" @close="closes" :title="'私信 '+count">

        <yk-space dir="vertical">
            <reply v-for="(item, index) in comments" :key="item.id" :isComment="false" :content="item"
                @delete="deleteComment" />
        </yk-space>

        <template #footer>
            <yk-pagination :total="count" @change="changePage" simple />
        </template>
    </yk-drawer>
</template>

<script lang="ts" setup>
    import { toRefs, ref, onMounted, getCurrentInstance } from 'vue'
    import { InformationProps } from './reply.ts'
    import { comment } from '../../mock/data.ts'

    const props = withDefaults(defineProps < InformationProps > (), {
        pageSize: 8,
        active: true
    })

    const emits = defineEmits(["close"])

    const { active } = toRefs(props)
    const closes = () => {
        emits("close", false)
    }

    const proxy = getCurrentInstance()?.proxy


    //  评论总数
    const count = ref(123)
    //  数据内容
    const comments = ref()

    //  请求
    type Request = {
        token?: string;
        pageSize: number;//单页条数；
        nowPage: number;//当前页
        // count?: boolean;
    }

    const request: Request = {
        pageSize: props.pageSize,
        nowPage: 1,
        // count: false,
    }

    //  获取数据
    const drwCommentData = () => {
        let data = comment.data
        count.value = data.count
        comments.value = data.list.slice(
            (request.nowPage - 1) * request.pageSize,
            request.nowPage * request.pageSize
        )
        // console.log(comments.value)
    }

    //  分页
    const changePage = (e) => {
        request.nowPage = e
        drwCommentData()
    }

    //  删除评论
    const deleteComment = (e) => {
        // console.log(e)
        comments.value = comments.value.filter((obj) => {
            return obj.id !== e
        })
        proxy.$message({ type: 'primary', message: '删除成功' })
    }

    onMounted(() => {
        drwCommentData()

    })

</script>

<style lang="less" scoped>

</style>