<template>
    <div class="card comment">
        <div class="card-title">
            <p class="card-title-name">评论 {{count}}</p>
        </div>
        <yk-scrollbar ref="scrollbar"  style="padding: 0 24px; height: calc(100vh * 0.55); border-bottom: 1px solid rgba(30,32,37,0.08);">
            <yk-space dir="vertical">
                <reply v-for="item in comments" :key="item.id" :content="item" is-comment @delete="deleteComment" />
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
    import type { CommentProps } from './reply.ts'

    const proxy = getCurrentInstance()?.proxy

    const props = withDefaults(defineProps < CommentProps > (), {
        pageSize: 8,
        height: "calc(100vh * 0.67)",
    })

    //  评论总数
    const count = ref(123)
    //  数据内容
    type CommentItem = (typeof comment.data.list)[number]
    const comments = ref<CommentItem[]>([])

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

    // 分页
const changePage = (page: number) => {
    request.nowPage = page
    drwCommentData()
}

   // 删除评论
const deleteComment = (id: string | number) => {
    comments.value = comments.value.filter((item) => item.id !== id)
    proxy?.$message({ type: 'primary', message: '删除成功' })
}

    onMounted(() => {
        drwCommentData()

    })

</script>

<style lang="less" scoped>
    .comment {
        position: relative;
        padding: @space-xl 0 64px;
        height: calc(100vh * 0.67);
            /* 固定高度为屏幕高度 */
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
            // border-top: 1px solid @line-color-s;
        }
    }
</style>