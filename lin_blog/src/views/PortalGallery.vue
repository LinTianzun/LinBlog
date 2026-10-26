<template>
    <PortalLayout active-path="/portal/gallery">
        <section class="page-head">
            <h1 class="page-title">摄影图库</h1>
            <p class="page-lead">
                共 {{ total }} 组照片。点开任意一组，可以在当前页放大查看每一张。
            </p>
        </section>

        <section class="gallery-area">
            <div v-if="loading" class="gallery-state">
                <yk-spinner size="m" />
            </div>

            <div v-else-if="galleryList.length" class="masonry">
                <figure v-for="(item, i) in galleryList" :key="item.id" class="masonry-cell"
                    :style="{ '--stagger': `${Math.min(i, 8) * 45}ms` }">
                    <button type="button" class="masonry-trigger" @click="openGallery(item)">
                        <span class="masonry-frame">
                            <img v-if="coverOf(item)" :src="coverOf(item)" :alt="item.title" loading="lazy"
                                @error="markBroken(item.id)" />
                            <span v-else class="masonry-blank" :class="`tone-${toneOf(item)}`">
                                {{ glyphOf(item) }}
                            </span>
                            <span class="masonry-count">{{ imageCount(item) }} 张</span>
                        </span>
                        <figcaption class="masonry-caption">
                            <span class="masonry-name">{{ item.title }}</span>
                            <span v-if="item.subsetName" class="masonry-subset">{{ item.subsetName }}</span>
                        </figcaption>
                    </button>
                </figure>
            </div>

            <div v-else class="gallery-state">
                <yk-empty description="还没有发布摄影图库" />
            </div>

            <div v-if="total > pageSize" class="gallery-pagination">
                <yk-pagination :current="page" :total="total" :page-size="pageSize" @change="changePage" />
            </div>
        </section>

        <PortalGalleryDetail :open="detailVisible" :item="activeGallery" @close="closeGallery" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalGalleryDetail from '../components/portal/PortalGalleryDetail.vue'
import { getPublicArticles } from '../api/portal'
import { parseGalleryContent, type ArticleItem } from '../api/article'

const route = useRoute()

const galleryList = ref<ArticleItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 12
const loading = ref(false)
const brokenIds = ref(new Set<number>())

const detailVisible = ref(false)
const activeGallery = ref<ArticleItem | null>(null)

const imagesOf = (item: ArticleItem): string[] => parseGalleryContent(item.content)

const coverOf = (item: ArticleItem): string => {
    if (brokenIds.value.has(item.id)) return ''
    return item.cover || imagesOf(item)[0] || ''
}

const imageCount = (item: ArticleItem): number => imagesOf(item).length

const glyphOf = (item: ArticleItem): string => (item.title || '影').trim().charAt(0)

const toneOf = (item: ArticleItem): number => Math.abs(item.id) % 4

const markBroken = (id: number) => {
    brokenIds.value = new Set(brokenIds.value).add(id)
}

const loadGallery = async () => {
    loading.value = true
    try {
        const result = await getPublicArticles({
            page: page.value,
            pageSize,
            classify: 'image'
        })
        if (result.code === 200) {
            galleryList.value = result.data?.list || []
            total.value = result.data?.total || 0
            brokenIds.value = new Set()
        }
    } catch {
        galleryList.value = []
        total.value = 0
    } finally {
        loading.value = false
    }
}

const changePage = (next: number) => {
    page.value = next
    void loadGallery()
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

const openGallery = (item: ArticleItem) => {
    activeGallery.value = item
    detailVisible.value = true
}

const closeGallery = () => {
    detailVisible.value = false
    activeGallery.value = null
}

onMounted(async () => {
    await loadGallery()

    // 支持从首页直接打开某组图库：?open=12
    if (typeof route.query.open === 'string') {
        const id = Number(route.query.open)
        const target = galleryList.value.find(item => item.id === id)
        if (target) openGallery(target)
    }
})
</script>

<style lang="less" scoped>
.page-head {
    padding: 64px 0 0;
}

.page-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(34px, 4vw, 52px);
    font-weight: 600;
    line-height: 1.2;
    color: @font-color-l;
}

.page-lead {
    max-width: 46ch;
    margin: 16px 0 0;
    font-size: 16px;
    line-height: 1.85;
    color: @font-color-s;
}

.gallery-area {
    margin-top: 48px;
}

.gallery-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 320px;
}

// 瀑布流：每列独立堆叠，图片高度由内容决定
.masonry {
    column-count: 3;
    column-gap: 22px;
}

.masonry-cell {
    break-inside: avoid;
    margin: 0 0 26px;
    animation: cell-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: var(--stagger, 0ms);
}

.masonry-trigger {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
}

.masonry-frame {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: 2px;
    background: @bg-color-l;

    img {
        display: block;
        width: 100%;
        height: auto;
        transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
}

.masonry-trigger:hover .masonry-frame img {
    transform: scale(1.03);
}

.masonry-blank {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 3 / 4;
    font-family: var(--portal-serif);
    font-size: 56px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);

    &.tone-0 {
        background: @pcolor;
    }

    &.tone-1 {
        background: @pcolor-8;
    }

    &.tone-2 {
        background: @pcolor-9;
    }

    &.tone-3 {
        background: @pcolor-6;
    }
}

.masonry-count {
    position: absolute;
    right: 10px;
    bottom: 10px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.masonry-caption {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding-top: 10px;
}

.masonry-name {
    font-family: var(--portal-serif);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.5;
    color: @font-color-l;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.masonry-subset {
    flex-shrink: 0;
    font-size: 12px;
    color: @font-color-s;
}

.gallery-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 28px;
}

@keyframes cell-in {
    from {
        opacity: 0;
        transform: translateY(14px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 900px) {
    .masonry {
        column-count: 2;
    }
}

@media (max-width: 560px) {
    .page-head {
        padding-top: 40px;
    }

    .masonry {
        column-count: 1;
    }
}
</style>
