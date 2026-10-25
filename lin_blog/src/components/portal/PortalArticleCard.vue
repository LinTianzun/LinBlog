<template>
    <article class="portal-card" :style="{ '--stagger-delay': stagger }" @click="$emit('select', article.id)">
        <div class="card-media" :class="{ 'is-pending': !!coverSrc && !imgLoaded }">
            <img v-if="coverSrc" :src="coverSrc" :alt="article.title" loading="lazy" @load="imgLoaded = true"
                @error="coverBroken = true" />
            <!-- 无封面：用主题色排印占位，避免出现空灰块 -->
            <div v-else class="media-fallback" :class="'tone-' + tone">
                <span class="fallback-glyph">{{ glyph }}</span>
                <span class="fallback-lines" aria-hidden="true" />
            </div>
            <span class="read-hint">阅读全文<IconRightOutline /></span>
        </div>
        <div class="card-body">
            <div class="card-meta">
                <span v-if="article.subsetName" class="meta-chip">{{ article.subsetName }}</span>
                <time :datetime="article.publishedAt || article.createdAt">
                    <IconTimeOutline />{{ formatArticleDate(article.publishedAt || article.createdAt) }}
                </time>
            </div>
            <h3 class="card-title">{{ article.title }}</h3>
            <p class="card-introduce">{{ article.introduce || '点击进入阅读正文' }}</p>
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
import { computed, ref, watch } from 'vue'
import {
    parseArticleLabels,
    formatArticleDate,
    type ArticleItem
} from '../../api/article'

const props = withDefaults(defineProps<{ article: ArticleItem; index?: number }>(), {
    index: 0
})
defineEmits<{ (e: 'select', id: number): void }>()

const visibleLabels = computed(() => parseArticleLabels(props.article.label).slice(0, 3))

// 入场动画按序号错峰，但限制最大延迟，避免翻页时末尾等待过久
const stagger = computed(() => `${Math.min(props.index, 8) * 45}ms`)

const coverBroken = ref(false)
const imgLoaded = ref(false)
watch(() => props.article.cover, () => {
    coverBroken.value = false
    imgLoaded.value = false
})
const coverSrc = computed(() => (props.article.cover && !coverBroken.value ? props.article.cover : ''))

// 标题首字作为占位视觉符号
const glyph = computed(() => (props.article.title || '文').trim().charAt(0))
// 由文章 id 派生稳定色相，让相邻卡片的占位色不重复
const tone = computed(() => Math.abs(props.article.id || 0) % 4)
</script>

<style lang="less" scoped>
@portal-serif: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, 'Times New Roman', serif;

.portal-card {
    position: relative;
    display: flex;
    gap: 22px;
    padding: 18px;
    border: 1px solid @line-color-s;
    border-radius: @radius-xl;
    background: @bg-color-l;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    cursor: pointer;
    overflow: hidden;
    // backwards：只保留入场前的起始态，避免动画终态的 transform 覆盖悬停上浮
    animation: card-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: var(--stagger-delay, 0ms);
    transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;

    // 左侧主色指示条：默认收成 2px，悬停展开
    &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 18px;
        bottom: 18px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: @pcolor;
        transform: scaleX(0);
        transform-origin: left;
        transition: transform 0.28s ease;
    }

    &:hover {
        transform: translateY(-2px);
        border-color: var(--pcolor3);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);

        .card-title {
            color: @pcolor;
        }

        &::before {
            transform: scaleX(1);
        }

        .card-media img {
            transform: scale(1.06);
        }

        .read-hint {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .card-media {
        position: relative;
        flex-shrink: 0;
        width: 200px;
        height: 132px;
        border-radius: @radius-l;
        overflow: hidden;
        background: @bg-color-m;

        // 图片未就绪时显示微光骨架，避免整块死灰
        &.is-pending::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.45) 50%, transparent 80%);
            background-size: 220% 100%;
            animation: media-shimmer 1.5s ease-in-out infinite;
        }

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
    }

    .read-hint {
        position: absolute;
        left: 8px;
        bottom: 8px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 3px 9px;
        border-radius: @radius-r;
        background: rgba(15, 23, 42, 0.72);
        backdrop-filter: blur(4px);
        color: #fff;
        font-size: @size-ss;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.25s ease, transform 0.25s ease;
    }

    // 占位封面：主色渐变 + 首字排印 + 细线纹理
    .media-fallback {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;

        .fallback-glyph {
            position: relative;
            z-index: 1;
            font-family: @portal-serif;
            font-size: 54px;
            font-weight: 700;
            line-height: 1;
            color: rgba(255, 255, 255, 0.92);
            text-shadow: 0 2px 12px rgba(15, 23, 42, 0.18);
        }

        .fallback-lines {
            position: absolute;
            inset: -20%;
            background-image: repeating-linear-gradient(115deg,
                    rgba(255, 255, 255, 0.14) 0 1px,
                    transparent 1px 13px);
            opacity: 0.55;
        }

        &.tone-0 {
            background: linear-gradient(135deg, var(--pcolor), var(--pcolor10));
        }

        &.tone-1 {
            background: linear-gradient(135deg, var(--pcolor8), var(--pcolor));
        }

        &.tone-2 {
            background: linear-gradient(150deg, var(--pcolor), var(--pcolor9));
        }

        &.tone-3 {
            background: linear-gradient(120deg, var(--pcolor9), var(--pcolor6));
        }
    }

    .card-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
        padding: 2px 0;
    }

    .card-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: @size-s;
        color: @font-color-s;

        time {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

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
        font-size: 19px;
        font-weight: 650;
        line-height: 1.45;
        letter-spacing: 0.2px;
        color: @font-color-l;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        transition: color 0.2s ease;
    }

    .card-introduce {
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 13px;
        line-height: 1.75;
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
        gap: 7px;
        overflow: hidden;

        .label-chip {
            flex-shrink: 0;
            padding: 2px 9px;
            border: 1px solid @line-color-s;
            border-radius: @radius-r;
            background: transparent;
            color: @font-color-s;
            font-size: @size-ss;
            transition: border-color 0.2s ease, color 0.2s ease;
        }
    }

    &:hover .label-chip {
        border-color: var(--pcolor2);
        color: @font-color-m;
    }

    .card-stats {
        flex-shrink: 0;
        display: flex;
        gap: 12px;
        padding-left: 12px;
        border-left: 1px solid @line-color-s;
        color: @font-color-s;
        font-size: @size-ss;
        font-variant-numeric: tabular-nums;

        span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
    }
}

@keyframes media-shimmer {
    from {
        background-position: 180% 0;
    }

    to {
        background-position: -40% 0;
    }
}

@keyframes card-in {
    from {
        opacity: 0;
        transform: translateY(14px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 720px) {
    .portal-card {
        flex-direction: column;
        gap: 14px;

        &::before {
            display: none;
        }

        .card-media {
            width: 100%;
            height: 168px;
        }

        .card-stats {
            padding-left: 0;
            border-left: none;
        }

        .card-footer {
            flex-wrap: wrap;
            justify-content: flex-start;
        }
    }
}
</style>
