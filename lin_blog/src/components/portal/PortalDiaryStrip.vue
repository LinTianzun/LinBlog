<template>
    <section class="portal-diary">
        <div class="section-head">
            <h2><IconBookmarkOutline />随笔随记</h2>
            <span>{{ total }} 篇</span>
        </div>
        <div v-if="loading" class="strip-state"><yk-spinner size="m" /></div>
        <template v-else-if="diaryList.length">
            <div class="diary-grid">
                <article v-for="(item, i) in diaryList" :key="item.id" class="diary-card"
                    :style="{ '--stagger-delay': Math.min(i, 7) * 50 + 'ms' }" @click="$emit('select', item)">
                    <div class="diary-head">
                        <h3>{{ item.title }}</h3>
                        <img v-if="weatherIcon(item)" :src="weatherIcon(item)" :alt="item.weatherName || ''" />
                    </div>
                    <p class="diary-content">{{ item.content }}</p>
                    <div class="diary-foot">
                        <div v-if="item.picture.length" class="diary-thumbs">
                            <img v-for="(pic, pi) in item.picture.slice(0, 3)" :key="pi" :src="pic" alt=""
                                loading="lazy" />
                            <span v-if="item.picture.length > 3" class="thumb-more">+{{ item.picture.length - 3 }}</span>
                        </div>
                        <time>{{ formatDate(item.createdAt) }}</time>
                    </div>
                </article>
            </div>
            <div v-if="total > diaryList.length" class="more-row">
                <yk-button type="text" size="s" :loading="loadingMore" @click="$emit('more')">
                    展开更多（还有 {{ total - diaryList.length }} 篇）
                </yk-button>
            </div>
        </template>
        <div v-else class="strip-state empty">
            <yk-empty description="还没有随笔随记" />
        </div>
    </section>
</template>

<script lang="ts" setup>
import { weathers } from '../../utils/weather'
import type { PortalDiary } from '../../api/portal'

defineProps<{
    loading: boolean
    loadingMore?: boolean
    total: number
    diaryList: PortalDiary[]
}>()

defineEmits<{
    (e: 'select', item: PortalDiary): void
    (e: 'more'): void
}>()

// 天气按名称匹配前端图标，与后台日记模块口径一致
const weatherIcon = (item: PortalDiary) =>
    weathers.find(w => w.name === item.weatherName)?.iconUrl || ''

const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}
</script>

<style lang="less" scoped>
.portal-diary {
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: strip-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: 200ms;

    .section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 15px 20px;
        border: 1px solid @line-color-s;
        border-radius: @radius-xl;
        background: @bg-color-l;
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);

        h2 {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0;
            font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, serif;
            font-size: 19px;
            font-weight: 700;
            letter-spacing: 0.8px;
            color: @font-color-l;

            :deep(svg) {
                color: @pcolor;
            }
        }

        span {
            font-size: @size-s;
            font-variant-numeric: tabular-nums;
            color: @font-color-s;
        }
    }

    .diary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
    }

    .diary-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
        border: 1px solid @line-color-s;
        border-radius: @radius-l;
        background: @bg-color-l;
        cursor: pointer;
        animation: strip-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
        animation-delay: var(--stagger-delay, 0ms);
        transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;

        &:hover {
            transform: translateY(-3px);
            border-color: var(--pcolor3);
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
        }
    }

    .diary-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;

        h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: @font-color-l;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        img {
            flex-shrink: 0;
            width: 22px;
            height: 22px;
        }
    }

    .diary-content {
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: @size-s;
        line-height: 1.75;
        color: @font-color-s;
    }

    .diary-foot {
        margin-top: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;

        time {
            flex-shrink: 0;
            font-size: @size-ss;
            color: @font-color-s;
        }
    }

    .diary-thumbs {
        display: flex;
        align-items: center;
        gap: 5px;

        img {
            width: 34px;
            height: 34px;
            border-radius: @radius-s;
            object-fit: cover;
            border: 1px solid @line-color-s;
        }

        .thumb-more {
            font-size: @size-ss;
            color: @font-color-s;
        }
    }

    .strip-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 160px;
        border: 1px dashed @line-color-m;
        border-radius: @radius-xl;

        &.empty {
            border-style: solid;
            background: @bg-color-l;
            box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
        }
    }

    .more-row {
        display: flex;
        justify-content: center;
    }
}

@keyframes strip-in {
    from {
        opacity: 0;
        transform: translateY(14px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
