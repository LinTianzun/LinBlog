<template>
    <div class="card comment">
        <div class="card-title">
            <p class="card-title-name">评论 {{count}}</p>
        </div>
        <yk-scrollbar ref="scrollbar" :height="height" style="padding: 0 24px;">
            <yk-space dir="vertical">
                <reply v-for="(item, index) in comments" :key="item.id" :content="item" @delete="deleteComment" />
            </yk-space>
        </yk-scrollbar>
        <div class="comment-pagination">
            <yk-pagination @change="changePage" :total="count" size="m" />
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted, getCurrentInstance } from 'vue'
    import reply from './reply.vue'
    import { comment } from '../../mock/data.ts'
    import { CommentProps } from './reply.ts'

    const proxy = getCurrentInstance()?.proxy

    const props = withDefaults(defineProps < CommentProps > (), {
        pageSize: 8,
        height: "490px",
    })

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
    .comment {
        position: relative;
        padding: @space-xl 0 64px;
        ;
        /* height: 100vh;
        overflow: hidden; */
        /* padding-bottom: 64px; */

        .card-title-name {
            padding: 0 @space-xl;
        }

        &-pagination {
            display: flex;
            position: absolute;
            width: 100%;
            left: 0;
            bottom: 0;
            padding: @space-l @space-xl;
            align-items: center;
            justify-content: flex-end;
            border-top: 1px solid @line-color-s;
        }
    }
</style>