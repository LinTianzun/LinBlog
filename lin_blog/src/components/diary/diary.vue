<template>
    <div class="diary">
        <yk-scrollbar ref="scrollbar" style="padding: 0 20px;">
            <yk-space dir="vertical" size="xl">
                <diaryItem v-for="(item, index) in diaryList" :key="item.id" :data="item" @delete="deleteDiary">
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
    import { DiaryData } from '../../utils/interface.ts'
    import { mkdiary } from '../../mock/data.ts'


    const props = defineProps({
        pageSize: {
            type: Number,
            default: 6,
        },
        serchTerm: {
            type: String,
            default: "",
        },
    })

    const proxy = getCurrentInstance()?.proxy

    const request = {
        pageSize: props.pageSize,//单页条数；
        nowPage: 1,//当前页
        serchTerm: props.serchTerm,
        count: true,
    }

    //  获取日记
    //  日记
    const diaryList = ref < DiaryData > ([])
    //  日记总数
    const count = ref(0)

    const getDiaryData = () => {
        if (request.nowPage == 1) count.value = mkdiary.count
        diaryList.value = mkdiary.list.slice(
            (request.nowPage - 1) * request.pageSize,
            request.nowPage * request.pageSize
        )
        // console.log(diaryList.value)
    }

    //  分页
    const changePage = (e) => {
        request.nowPage = e
        getDiaryData()
    }

    //  删除
    const deleteDiary = (e) => [
        diaryList.value = diaryList.value.filter(item => item.id !== e),
        proxy.$message({ type: 'primary', message: '删除完成' })
    ]


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