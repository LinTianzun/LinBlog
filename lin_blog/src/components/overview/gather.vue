<template>
    <yk-space class="gather">
        <div v-for="(item, index) in gathers" :key="index" class="gather_list" :style="item.bgColor">
            <yk-space dir="vertical" size="s">
                <yk-text type="secondary">{{item.name}}</yk-text>
                <yk-title :level="2" style="margin: 0;">{{item.total}}</yk-title>
            </yk-space>
            <yk-button v-if="index>0" size="xl" type="secondary" shape="square" @click="editPage(item.path)">
                <IconPlusOutline />
            </yk-button>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { overLink } from '../../utils/menu.ts'
    import { getOverviewSummary, type OverviewSummary } from '../../api/overview'
    import { useRouter } from 'vue-router'

    const router = useRouter()
    //  复用 overLink 作为卡片布局/颜色/跳转配置，total 初始为占位
    const gathers = ref(overLink)

    //  字节数转可读体积；无文件或字段缺失时显示 0
    const formatFileSize = (bytes: number): string => {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    //  将聚合统计回填到卡片（顺序与 overLink 一致：本地文件/博客文章/摄影图库/随笔随记）
    const applySummary = (data: OverviewSummary): void => {
        //  本地文件卡片展示总大小，其余卡片展示数量
        gathers.value[0].total = formatFileSize(data.file)
        gathers.value[1].total = data.article
        gathers.value[2].total = data.gallery
        gathers.value[3].total = data.diary
    }

    //  跳转指定页面
    const editPage = (path: string) => {
        router.push(path)
    }

    onMounted(async () => {
        try {
            const res = await getOverviewSummary()
            if (res.code === 200 && res.data) {
                applySummary(res.data)
            }
        } catch {
            //  加载失败时保留占位 0，不阻塞页面
        }
    })
</script>

<style lang="less" scoped>
    .gather {
        width: 100%;

        &_list {
            display: flex;
            width: 25%;
            /* background: linear-gradient(180deg, #2b5aedcc 0%, #2B5AED 100%); */
            justify-content: space-between;
            align-items: center;
            padding: @space-xl;
            border-radius: @radius-m;

            &:first-child {

                .yk-title,
                .yk-text {
                    color: @white;
                }
            }
        }
    }
</style>
