<template>
    <yk-space class="gather">
        <stat-card v-for="(item, index) in gathers" :key="item.name" :name="item.name"
            :total="item.total" :bg-color="item.bgColor" :icon="iconOf(item.icon)"
            :to="item.path || item.viewTo" :class="{ 'gather-dark': index === 0 }" />
    </yk-space>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import StatCard from '../common/StatCard.vue'
import { overLink } from '../../utils/menu.ts'
import { getOverviewSummary, type OverviewSummary } from '../../api/overview'
import { resolveMenuIcon } from '../../utils/menuIcons.ts'

// overLink 里存的是图标名字符串，这里转成真正的组件，否则卡片渲染不出图标
const iconOf = (name: string) => resolveMenuIcon(name)

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
        align-items: stretch;
        flex-wrap: wrap;

        :deep(.stat-card) {
            width: auto;
            flex: 1 1 220px;
            border: none;
        }
    }

    //  第一张卡是深色渐变底，文字与图标用白色
    .gather-dark {
        :deep(.stat-card-label),
        :deep(.stat-card-value),
        :deep(.stat-card-icon-wrap) {
            color: @white;
        }

        :deep(.stat-card-value) {
            text-shadow: 0 1px 12px rgba(0, 0, 0, 0.12);
        }

        :deep(.stat-card-label) {
            color: rgba(255, 255, 255, 0.72);
        }

        :deep(.stat-card-icon-wrap) {
            border-color: rgba(255, 255, 255, 0.18);
            background: rgba(255, 255, 255, 0.12);
        }
    }
</style>
