<template>
    <div class="diary">
        <yk-scrollbar ref="scrollbar" style="padding: 0 20px;">
            <yk-space dir="vertical" size="xl">
                <diaryItem v-for="item in diaryList" :key="item.id" :data="item" @delete="deleteDiary">
                </diaryItem>
            </yk-space>
        </yk-scrollbar>
        <div class="diary-pagination">
            <yk-pagination @change="changePage" :total="count" size="m" />
        </div>
    </div>
</template>


<script lang="ts" setup>
import { ref, onMounted, getCurrentInstance } from 'vue'
import diaryItem from './diaryItem.vue'
import type { DiaryData } from '../../utils/interface'
import { mkdiary } from '../../mock/data'

const props = defineProps({
    pageSize: {
        type: Number,
        default: 6,
    },
    serchTerm: {
        type: String,
        default: '',
    },
})

type MessageOptions = {
    type: 'primary'
    message: string
}

type MessageProxy = {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as unknown as
    MessageProxy | null | undefined

const showMessage = (message: string): void => {
    proxy?.$message?.({
        type: 'primary',
        message,
    })
}

const request = {
    pageSize: props.pageSize,
    nowPage: 1,
    serchTerm: props.serchTerm,
    count: true,
}

// 日记列表
const diaryList = ref<DiaryData[]>([])

// 日记总数
const count = ref(0)

// 获取日记
const getDiaryData = (): void => {
    if (request.nowPage === 1) {
        count.value = mkdiary.count
    }

    diaryList.value = mkdiary.list.slice(
        (request.nowPage - 1) * request.pageSize,
        request.nowPage * request.pageSize
    )
}

// 分页
const changePage = (page: number): void => {
    request.nowPage = page
    getDiaryData()
}

// 删除日记
const deleteDiary = (id: number): void => {
    diaryList.value = diaryList.value.filter(item => item.id !== id)
    count.value = Math.max(0, count.value - 1)
    showMessage('删除完成')
}

onMounted(() => {
    getDiaryData()
})
</script>


<style lang="less" scoped>
    .diary {
        width: 100%;
        height: calc(100vh * 0.77);
        /* 固定高度为屏幕高度 */
        display: flex;
        flex-direction: column;
        /* 垂直布局，确保内容和分页分开 */

        &-pagination {
            display: flex;
            width: 100%;
            right: 20px;
            padding: @space-s 0;
            padding-top: 24px;
            align-items: center;
            justify-content: flex-end;
        }
    }
</style>