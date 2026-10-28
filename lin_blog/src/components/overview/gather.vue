<template>
    <yk-space class="gather">
        <stat-card v-for="(item, index) in gathers" :key="item.name" :name="item.name"
            :total="item.total" :bg-color="item.bgColor" :icon="iconOf(item.icon)"
            :to="canOpen(item) ? (item.path || item.viewTo) : ''"
            :class="{ 'gather-dark': index === 0 }" />
    </yk-space>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import StatCard from '../common/StatCard.vue'
import { overLink } from '../../utils/menu.ts'
import { getOverviewSummary, type OverviewSummary } from '../../api/overview'
import { resolveMenuIcon } from '../../utils/menuIcons.ts'
import { useSessionStore } from '../../store/session.ts'

// overLink 里存的是图标名字符串，这里转成真正的组件，否则卡片渲染不出图标
const iconOf = (name: string) => resolveMenuIcon(name)

const session = useSessionStore()

// 卡片跳转按目标模块的权限判定：本地文件看 file.view，
// 文章/图库卡片进入新建编辑器，需要对应对的 create 权限
const canOpen = (item: { path?: string }): boolean => {
    switch (item.path) {
        case '': return session.can('file.view')
        case 'editarticle': return session.can('article.create')
        case 'editgallery': return session.can('gallery.create')
        case 'diary': return session.can('diary.create')
        default: return true
    }
}

//  复用 overLink 作为卡片布局/颜色/跳转配置，total 初始为占位
const gathers = ref(overLink.map(item => ({ ...item })))

//  字节数转可读体积；无权限或字段缺失时给出明确提示
const formatFileSize = (bytes: number | null): string => {
    if (bytes === null) return '无权限'
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
