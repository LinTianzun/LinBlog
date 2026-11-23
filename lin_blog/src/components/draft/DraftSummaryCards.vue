<template>
    <section class="draft-stats" aria-label="草稿统计">
        <div class="draft-stat">
            <span class="draft-stat-label">草稿总数</span>
            <strong class="draft-stat-count">{{ counts.total }}</strong>
            <small class="draft-stat-hint">未发布的内容</small>
        </div>
        <div class="draft-stat tone-article">
            <span class="draft-stat-label">博客文章</span>
            <strong class="draft-stat-count">{{ counts.article }}</strong>
            <small class="draft-stat-hint">文章草稿</small>
        </div>
        <div class="draft-stat tone-gallery">
            <span class="draft-stat-label">摄影图库</span>
            <strong class="draft-stat-count">{{ counts.gallery }}</strong>
            <small class="draft-stat-hint">图集草稿</small>
        </div>
    </section>
</template>

<script lang="ts" setup>
import type { DraftCounts } from '../../utils/draftBox'

defineProps<{ counts: DraftCounts }>()
</script>

<style lang="less" scoped>
.draft-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
}

.draft-stat {
    display: flex;
    min-height: 96px;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 14px 16px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm);
}

.draft-stat-label,
.draft-stat-hint {
    color: var(--gray6);
    font-size: 11px;
}

.draft-stat-count {
    color: var(--pcolor);
    font-size: 28px;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
}

.tone-article .draft-stat-count {
    color: @wcolor;
}

.tone-gallery .draft-stat-count {
    color: @scolor;
}

@media (max-width: 900px) {
    .draft-stats {
        grid-template-columns: 1fr;
    }
}
</style>
