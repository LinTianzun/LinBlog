<template>
    <article class="draft-card">
        <div class="draft-card-main">
            <header class="draft-card-head">
                <h2 class="draft-card-title">{{ item.title }}</h2>
                <span class="draft-type-tag">{{ classifyLabel }}</span>
                <span v-if="item.scheduledPausedAt" class="draft-state-tag is-paused">排期已暂停</span>
                <span v-else-if="item.scheduledAt" class="draft-state-tag is-scheduled">已排期</span>
            </header>

            <p class="draft-intro">{{ item.introduce || '还没有填写简介，打开编辑器继续完善吧。' }}</p>

            <div class="draft-meta">
                <span class="draft-meta-item">
                    <span class="draft-meta-label">最近更新</span>
                    <strong class="draft-meta-value">{{ formatTime(item.updatedAt) }}</strong>
                </span>
                <span v-if="item.subsetName" class="draft-meta-item">
                    <span class="draft-meta-label">分类</span>
                    <strong class="draft-meta-value">{{ item.subsetName }}</strong>
                </span>
                <span v-if="item.label" class="draft-meta-item">
                    <span class="draft-meta-label">标签</span>
                    <strong class="draft-meta-value">{{ item.label }}</strong>
                </span>
                <span v-if="item.scheduledAt" class="draft-meta-item">
                    <span class="draft-meta-label">计划发布</span>
                    <strong class="draft-meta-value">{{ formatTime(item.scheduledAt) }}</strong>
                </span>
            </div>
        </div>

        <footer class="draft-card-actions">
            <yk-button size="s" type="primary" :disabled="acting" @click="emit('edit', item)">
                继续编辑
            </yk-button>
            <yk-button v-if="canPublish" size="s" type="secondary" :disabled="acting"
                @click="emit('publish', item)">
                立即发布
            </yk-button>
        </footer>
    </article>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { ArticleItem } from '../../api/article'
import { formatWorkflowTime } from '../../utils/articleWorkflow'
import { draftClassifyLabel } from '../../utils/draftBox'

const props = defineProps<{
    item: ArticleItem
    acting: boolean
    canPublish: boolean
}>()

const emit = defineEmits<{
    (event: 'edit', item: ArticleItem): void
    (event: 'publish', item: ArticleItem): void
}>()

const classifyLabel = computed(() => draftClassifyLabel(props.item.classify))

const formatTime = (value?: string | null): string =>
    value ? formatWorkflowTime(value) : '暂无时间'
</script>

<style lang="less" scoped>
.draft-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    padding: 16px 18px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-left: 3px solid @wcolor;
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm);
    transition: box-shadow 160ms ease, transform 160ms ease;

    &:hover {
        transform: translateY(-1px);
        box-shadow: var(--admin-shadow-md);
    }
}

.draft-card-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
}

.draft-card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.draft-card-title {
    margin: 0;
    color: var(--gray9);
    font-size: 16px;
    font-weight: 720;
    line-height: 1.35;
}

.draft-type-tag,
.draft-state-tag {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
}

.draft-type-tag {
    color: var(--pcolor);
    background: color-mix(in srgb, var(--pcolor) 11%, transparent);
}

.draft-state-tag.is-scheduled {
    color: @scolor;
    background: color-mix(in srgb, @scolor 12%, transparent);
}

.draft-state-tag.is-paused {
    color: var(--gray6);
    background: color-mix(in srgb, var(--gray5) 18%, transparent);
}

.draft-intro {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--gray6);
    font-size: 13px;
    line-height: 1.6;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.draft-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 7px 18px;
}

.draft-meta-item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
}

.draft-meta-label {
    color: var(--gray5);
    font-size: 11px;
}

.draft-meta-value {
    color: var(--gray7);
    font-size: 12px;
    font-weight: 600;
}

.draft-card-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

@media (max-width: 900px) {
    .draft-card {
        grid-template-columns: 1fr;
    }

    .draft-card-actions {
        justify-content: flex-start;
    }
}
</style>
