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
    import { ArticleData } from '../../utils/interface.ts'
    import { mkarticle } from '../../mock/data.ts'

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
            default: "",
        },
        state: {
            type: Number,
            default: 0,
        },
    })

    const proxy = getCurrentInstance()?.proxy

    const request = {
        pageSize: props.pageSize,//单页条数；
        nowPage: 1,//当前页
        state: props.state,//状态
        subsetId: props.subsetId,//分组
        serchTerm: props.serchTerm,
        count: true,
    }

    //  获取文章
    //  文章
    const artcleList = ref < ArticleData > ([])
    //  文章总数
    const count = ref(0)

    const getArtcleData = (e) => {
        if (e) count.value = mkarticle.count
        artcleList.value = mkarticle.list.slice(
            (request.nowPage - 1) * request.pageSize,
            request.nowPage * request.pageSize
        )
    }

    //  分页
    const changePage = (e) => {
        request.nowPage = e
        getArtcleData(false)
    }

    //  删除
    const deleteArtcle = (e) => [
        artcleList.value = artcleList.value.filter(item => item.id !== e),
        proxy.$message({ type: 'primary', message: '删除完成' })

    ]

    //  修改状态
    const updateState = (e) => {
        for (let i = 0; i < artcleList.value.length; i++) {
            if (artcleList.value[i].id == e.id) {
                artcleList.value[i].state = e.state
                if (e.state === 1) {
                    proxy.$message({ type: 'primary', message: '发布成功' })
                } else {
                    proxy.$message({ type: 'primary', message: '已撤回' })
                }
                return
            }
        }

    }

    onMounted(() => {
        getArtcleData(true)
        // console.log(artcleList.value)
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