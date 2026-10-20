<template>
    <yk-space dir="vertical" class="artcle" size="xl">
        <artcle-item v-for="(item, index) in artcleList" :key="index" :data="item" @delete="deleteArtcle"
            @state="updateState">
        </artcle-item>
        <div class="artcle-pagination">
            <yk-pagination @change="changePage" :total="count" size="m" />
        </div>
    </yk-space>
</template>

<script lang="ts" setup>

import { ref, onMounted, getCurrentInstance } from 'vue'
import artcleItem from './artcleItem.vue'
import type { ArticleData } from '../../utils/interface'
import { mkarticle } from '../../mock/data'

const props = defineProps({
    pageSize: {
        type: Number,
        default: 6,
    },
    subsetId: {
        type: Number,
        default: -1,
    },
    serchTerm: {
        type: String,
        default: '',
    },
    state: {
        type: Number,
        default: 0,
    },
})

type StateUpdateEvent = {
    id: number
    state: number
}

type MessageOptions = {
    type: 'primary'
    message: string
}

type MessageProxy = {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined

const showMessage = (message: string) => {
    proxy?.$message?.({
        type: 'primary',
        message,
    })
}

const request = {
    pageSize: props.pageSize,
    nowPage: 1,
    state: props.state,
    subsetId: props.subsetId,
    serchTerm: props.serchTerm,
    count: true,
}

// 文章列表
const artcleList = ref<ArticleData[]>([])

// 文章总数
const count = ref(0)

// 获取文章
const getArtcleData = (updateCount: boolean): void => {
    if (updateCount) {
        count.value = mkarticle.count
    }

    artcleList.value = mkarticle.list.slice(
        (request.nowPage - 1) * request.pageSize,
        request.nowPage * request.pageSize
    )
}

// 分页
const changePage = (page: number): void => {
    request.nowPage = page
    getArtcleData(false)
}

// 删除
const deleteArtcle = (id: number): void => {
    artcleList.value = artcleList.value.filter(item => item.id !== id)
    count.value = Math.max(0, count.value - 1)
    showMessage('删除完成')
}

// 修改状态
const updateState = (event: StateUpdateEvent): void => {
    const article = artcleList.value.find(item => item.id === event.id)

    if (!article) return

    article.state = event.state

    if (event.state === 1) {
        showMessage('发布成功')
    } else {
        showMessage('已撤回')
    }
}

onMounted(() => {
    getArtcleData(true)
})

</script>

<style lang="less" scoped>
    .artcle {
        width: 100%;

        &-pagination {
            display: flex;
            width: 100%;
            padding: @space-s 0 @space-xl;
            align-items: center;
            justify-content: flex-end;
        }
    }
</style>