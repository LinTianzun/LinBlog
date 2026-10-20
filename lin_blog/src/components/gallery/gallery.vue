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
import { ref, onMounted, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import galleryItem from './galleryItem.vue'
import type { ArticleData } from '../../utils/interface.ts'
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
        default: '',
    },
    state: {
        type: Number,
        default: 0,
    },
})

// 为当前实例补充 $message 的局部类型声明，避免修改全局类型配置。
type MessageOptions = {
    type: 'primary'
    message: string
}

type GalleryComponentInstance = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as GalleryComponentInstance | null | undefined

const request = {
    pageSize: props.pageSize,
    nowPage: 1,
    state: props.state,
    subsetId: props.subsetId,
    serchTerm: props.serchTerm,
    count: true,
}

// 图库列表：这里必须是 ArticleData 数组
const galleryList = ref<ArticleData[]>([])

// 图库总数
const count = ref(0)

// 获取图库
const getGalleryData = (isInitial: boolean): void => {
    if (isInitial) {
        count.value = mkgallery.count
    }

    galleryList.value = mkgallery.list.slice(
        (request.nowPage - 1) * request.pageSize,
        request.nowPage * request.pageSize,
    )
}

// 分页
const changePage = (page: number): void => {
    request.nowPage = page
    getGalleryData(false)
}

// 删除
const deleteGallery = (id: ArticleData['id']): void => {
    galleryList.value = galleryList.value.filter(item => item.id !== id)
    proxy?.$message?.({ type: 'primary', message: '删除完成' })
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