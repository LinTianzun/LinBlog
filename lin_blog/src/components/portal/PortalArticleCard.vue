<template>
    <article class="portal-card" @click="$emit('select', article.id)">
        <div v-if="article.cover" class="card-cover">
            <img :src="article.cover" :alt="article.title" loading="lazy" />
        </div>
        <div class="card-body">
            <div class="card-meta">
                <span v-if="article.subsetName" class="meta-chip">{{ article.subsetName }}</span>
                <time :datetime="article.publishedAt || article.createdAt">
                    {{ formatArticleDate(article.publishedAt || article.createdAt) }}
                </time>
            </div>
            <h3 class="card-title">{{ article.title }}</h3>
            <p class="card-introduce">{{ article.introduce || '点击阅读全文' }}</p>
            <div class="card-footer">
                <div class="card-labels">
                    <span v-for="label in visibleLabels" :key="label" class="label-chip">
                        {{ label }}
                    </span>
                </div>
                <div class="card-stats">
                    <span><IconEyeOutline />{{ article.views }}</span>
                    <span><IconLikeOutline />{{ article.likes }}</span>
                    <span><IconCommentOutline />{{ article.comments }}</span>
                </div>
            </div>
        </div>
    </article>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import {
    parseArticleLabels,
    formatArticleDate,
    type ArticleItem
} from '../../api/article'

const props = defineProps<{ article: ArticleItem }>()
defineEmits<{ (e: 'select', id: number): void }>()

const visibleLabels = computed(() => parseArticleLabels(props.article.label).slice(0, 3))
</script>

<style lang="less" scoped>
.portal-card {
    display: flex;
    gap: 20px;
    padding: 20px;
    border-radius: 16px;
    background: @bg-color-l;
    box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
    cursor: pointer;
    transition: transform 0.25s ease, box-shadow 0.25s ease;

    &:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);

        .card-title {
            color: @pcolor;
        }
    }

    .card-cover {
        flex-shrink: 0;
        width: 168px;
        height: 118px;
        border-radius: 10px;
        overflow: hidden;
        background: @bg-color-m;

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
        }

        &:hover img {
            transform: scale(1.05);
        }
    }

    .card-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .card-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: @size-s;
        color: @font-color-s;

        .meta-chip {
            padding: 2px 10px;
            border-radius: 999px;
            background: var(--pcolor1);
            color: @pcolor;
            font-weight: 500;
        }
    }

    .card-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: @font-color-l;
        transition: color 0.2s ease;
    }

    .card-introduce {
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: @size-s;
        line-height: 1.7;
        color: @font-color-s;
    }

    .card-footer {
        margin-top: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .card-labels {
        min-width: 0;
        display: flex;
        gap: 6px;
        overflow: hidden;

        .label-chip {
            flex-shrink: 0;
            padding: 2px 8px;
            border-radius: 6px;
            background: @bg-color-m;
            color: @font-color-s;
            font-size: @size-ss;
        }
    }

    .card-stats {
        flex-shrink: 0;
        display: flex;
        gap: 12px;
        color: @font-color-s;
        font-size: @size-s;

        span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
    }
}

@media (max-width: 640px) {
    .portal-card {
        flex-direction: column;

        .card-cover {
            width: 100%;
            height: 170px;
        }
    }
}
</style>
