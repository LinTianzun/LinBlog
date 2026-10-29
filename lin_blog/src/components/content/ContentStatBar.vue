<!--
    内容统计条：前台与后台的文章 / 图库 / 随笔详情共用。
    只负责「看」，不负责「操作」——点赞按钮也由外部传入，
    因为前台点赞走 public 接口、后台是只读展示，交互语义不同。
-->
<template>
    <div class="content-stat-bar">
        <div class="content-stat-main">
            <span v-if="metaChips.length" class="content-stat-chips">
                <span v-for="chip in metaChips" :key="chip.text" class="content-stat-chip"
                    :class="`is-${chip.tone || 'plain'}`">
                    <img v-if="chip.icon" :src="chip.icon" :alt="chip.text" class="content-stat-chip-icon" />
                    {{ chip.text }}
                </span>
            </span>

            <span v-if="metaText" class="content-stat-text">{{ metaText }}</span>
        </div>

        <div class="content-stat-metrics">
            <span class="content-stat-item">
                <IconEyeOutline />{{ views }}
            </span>
            <span class="content-stat-item">
                <IconCommentOutline />{{ comments }}
            </span>
            <span v-if="photoCount !== undefined" class="content-stat-item">
                <IconCameraOutline />{{ photoCount }} 张
            </span>
            <!-- 点赞按钮由外部传入：前台可点，后台只读 -->
            <slot name="like" />
            <!-- 分享等附加操作仅由需要的内容详情传入 -->
            <slot name="actions" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import {
    IconCameraOutline,
    IconCommentOutline,
    IconEyeOutline,
} from '@yike-design/ui/es/components/svg-icon'

export interface StatChip {
    text: string
    tone?: 'plain' | 'accent' | 'success' | 'warning'
    // 可选图标（如天气图标），与文字并排
    icon?: string
}

withDefaults(defineProps<{
    views?: number
    comments?: number
    photoCount?: number
    metaText?: string
    metaChips?: StatChip[]
}>(), {
    views: 0,
    comments: 0,
    photoCount: undefined,
    metaText: '',
    metaChips: () => []
})
</script>

<style lang="less" scoped>
.content-stat-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 18px;
    // 注意：这些 token 不能在本组件里声明默认值。
    // scoped 样式会给选择器加属性选择器，特异性高于 portal.less 的 .content-stat-bar，
    // 一旦在这里写默认值，门户侧的覆盖就永远不生效。故一律走 var(自定义, 后台默认)。
    color: var(--content-stat-ink, var(--admin-muted, var(--gray6)));
}

.content-stat-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    min-width: 0;
    color: var(--content-stat-ink, var(--admin-muted, var(--gray6)));
    font-size: 13px;
}

.content-stat-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
}

.content-stat-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--content-stat-accent-soft, var(--admin-accent-soft, var(--pcolor2)));
    color: var(--content-stat-accent, var(--admin-accent, var(--pcolor)));
    font-size: 12px;

    &.is-success {
        background: color-mix(in srgb, var(--content-stat-success, var(--scolor, #1fb4a2)) 16%, transparent);
        color: var(--content-stat-success, var(--scolor, #1fb4a2));
    }

    &.is-warning {
        background: color-mix(in srgb, var(--content-stat-warning, var(--wcolor, #e8a33d)) 18%, transparent);
        color: var(--content-stat-warning, var(--wcolor, #e8a33d));
    }
}

.content-stat-chip-icon {
    width: 15px;
    height: 15px;
    object-fit: contain;
}

.content-stat-metrics {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    color: var(--content-stat-ink, var(--admin-muted, var(--gray6)));
    font-size: 13px;
}

.content-stat-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;

    :deep(svg) {
        width: 15px;
        height: 15px;
    }
}
</style>
