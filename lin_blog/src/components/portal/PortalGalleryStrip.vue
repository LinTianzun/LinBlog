<template>
    <section class="portal-gallery">
        <div class="section-head">
            <h2><IconCameraOutline />摄影图库</h2>
            <span>{{ total }} 组</span>
        </div>
        <div v-if="loading" class="strip-state"><yk-spinner size="m" /></div>
        <template v-else-if="galleryList.length">
            <div class="gallery-grid">
                <article v-for="(item, i) in galleryList" :key="item.id" class="gallery-card"
                    :style="{ '--stagger-delay': Math.min(i, 7) * 50 + 'ms' }" @click="$emit('select', item)">
                    <div class="gallery-media">
                        <img v-if="firstImage(item)" :src="firstImage(item)" :alt="item.title" loading="lazy"
                            @error="markBroken(item)" />
                        <span v-else class="media-empty"><IconImageOutline /></span>
                        <span class="gallery-count"><IconCameraOutline />{{ imageCount(item) }}</span>
                    </div>
                    <div class="gallery-info">
                        <h3>{{ item.title }}</h3>
                        <p v-if="item.subsetName" class="gallery-subset">{{ item.subsetName }}</p>
                    </div>
                </article>
            </div>
            <div v-if="total > galleryList.length" class="more-row">
                <yk-button type="text" size="s" :loading="loadingMore" @click="$emit('more')">
                    展开更多（还有 {{ total - galleryList.length }} 组）
                </yk-button>
            </div>
        </template>
        <div v-else class="strip-state empty">
            <yk-empty description="还没有发布摄影图库" />
        </div>
    </section>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { parseGalleryContent, type ArticleItem } from '../../api/article'

const props = defineProps<{
    loading: boolean
    loadingMore?: boolean
    total: number
    galleryList: ArticleItem[]
}>()

defineEmits<{
    (e: 'select', item: ArticleItem): void
    (e: 'more'): void
}>()

// 图库图片以 JSON 数组形式存于 content 字段；外链失效时回退封面，仍失败则显示占位图标
const brokenIds = ref(new Set<number>())
watch(() => props.galleryList.map(i => i.id).join(), () => { brokenIds.value = new Set() })

const firstImage = (item: ArticleItem) => {
    const candidates = [parseGalleryContent(item.content)[0], item.cover]
    const pool = brokenIds.value.has(item.id) ? candidates.slice(1) : candidates
    return pool.find(Boolean) || ''
}

const markBroken = (item: ArticleItem) => {
    brokenIds.value = new Set(brokenIds.value).add(item.id)
}
const imageCount = (item: ArticleItem) => parseGalleryContent(item.content).length || 1
</script>

<style lang="less" scoped>
.portal-gallery {
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: strip-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: 120ms;

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

    .gallery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
    }

    .gallery-card {
        position: relative;
        border: 1px solid @line-color-s;
        border-radius: @radius-l;
        background: @bg-color-l;
        overflow: hidden;
        cursor: pointer;
        animation: strip-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
        animation-delay: var(--stagger-delay, 0ms);
        transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;

        &:hover {
            transform: translateY(-3px);
            border-color: var(--pcolor3);
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);

            img {
                transform: scale(1.06);
            }
        }
    }

    .gallery-media {
        position: relative;
        height: 150px;
        background: @bg-color-m;

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        .media-empty {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: @font-color-ss;

            :deep(svg) {
                width: 34px;
                height: 34px;
            }
        }

        .gallery-count {
            position: absolute;
            top: 8px;
            right: 8px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 9px;
            border-radius: @radius-r;
            background: rgba(15, 23, 42, 0.66);
            backdrop-filter: blur(4px);
            color: #fff;
            font-size: @size-ss;
        }
    }

    .gallery-info {
        padding: 12px 14px 14px;

        h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: @font-color-l;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .gallery-subset {
            margin: 5px 0 0;
            font-size: @size-ss;
            color: @font-color-s;
        }
    }

    .strip-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 180px;
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
