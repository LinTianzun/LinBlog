<template>
    <div class="gallery">
        <div class="gallery-content">
            <div class="gallery-content-files">
                <galleryItem v-for="(item, index) in galleryList" :key="index" :data="item" @delete="deleteGallery">
                </galleryItem>
            </div>
        </div>
        <div class="gallery-pagination">
            <yk-pagination @change="changePage" :total="count" size="m" />
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted, getCurrentInstance } from 'vue'
    import galleryItem from './galleryItem.vue'
    import { ArticleData } from '../../utils/interface.ts'
    import { mkgallery } from '../../mock/data.ts'

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

    //  获取图库
    //  图库
    const galleryList = ref < ArticleData > ([])
    //  图库总数
    const count = ref(0)

    const getGalleryData = (e) => {
        if (e) count.value = mkgallery.count
        galleryList.value = mkgallery.list.slice(
            (request.nowPage - 1) * request.pageSize,
            request.nowPage * request.pageSize
        )
    }

    //  分页
    const changePage = (e) => {
        request.nowPage = e
        getGalleryData(false)
    }

    //  删除
    const deleteGallery = (e) => {
        galleryList.value = galleryList.value.filter(item => item.id !== e)
        proxy.$message({ type: 'primary', message: '删除完成' })

    }


    onMounted(() => {
        getGalleryData(true)
    })
</script>

<style lang="less" scoped>
    .gallery {
        width: 100%;
        background: @bg-color-l;
        padding: 32px 24px 24px;
        border-radius: @radius-m;


        &-content {
            display: inline;

            &-files {
                display: grid;
                grid-template-columns: repeat(auto-fill, 240px);
                row-gap: 32px;
                column-gap: 24px;
                justify-content: center;
            }
        }

        &-pagination {
            display: flex;
            width: 100%;
            padding: @space-s 0;
            align-items: center;
            justify-content: flex-end;
        }
    }
</style>