<template>
    <PortalLayout active-path="/portal/gallery">
        <PortalPageHeader index="02" kicker="PHOTOGRAPHS" title="摄影"
            :description="`共 ${total} 组照片。点开任意一组，可以在当前页放大查看每一张。`"
            aside-label="VISUAL FIELD NOTES" :aside-value="`${total} 组`" aside-note="光线、街角与旅途中的停顿，组成一本持续生长的影像志。">
            <div class="sort-bar">
                <span class="filter-caption">SORT</span>
                <button type="button" class="sort-btn" :class="{ active: sort === 'latest' }"
                    @click="setSort('latest')">
                    最新
                </button>
                <button type="button" class="sort-btn" :class="{ active: sort === 'hot' }"
                    @click="setSort('hot')">
                    最热
                </button>
            </div>
        </PortalPageHeader>

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

            <div class="gallery-pagination">
                <AdminPager v-model:page="page" :page-size="pageSize" :total="total" :disabled="loading"
                    @change="handlePagerChange" />
            </div>
        </section>

        <PortalGalleryDetail :open="detailVisible" :item="activeGallery" @close="closeGallery"
            @view-counted="handleViewCounted" @interaction-change="handleInteractionChange" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPageHeader from '../components/portal/PortalPageHeader.vue'
import PortalGalleryDetail from '../components/portal/PortalGalleryDetail.vue'
import { getPublicArticles } from '../api/portal'
import type { PortalSort } from '../api/portal'
import { parseGalleryContent, type ArticleItem } from '../api/article'
import AdminPager from '../components/common/AdminPager.vue'

const route = useRoute()

const galleryList = ref<ArticleItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 12
const loading = ref(false)
const brokenIds = ref(new Set<number>())
const sort = ref<PortalSort>('latest')

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
            classify: 'image',
            sort: sort.value
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

// 页码已由 v-model 同步，这里重新加载并回到页顶
const handlePagerChange = (): void => {
    void loadGallery()
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 排序切换：最新按发布时间，最热按浏览量
const setSort = (next: PortalSort) => {
    if (sort.value === next) return
    sort.value = next
    page.value = 1
    void loadGallery()
}

const openGallery = (item: ArticleItem) => {
    activeGallery.value = item
    detailVisible.value = true
}

const closeGallery = () => {
    detailVisible.value = false
    activeGallery.value = null
}

// 详情回读的真实浏览量写回卡片计数
const handleViewCounted = (payload: { id: number; views: number }) => {
    const target = galleryList.value.find(item => item.id === payload.id)
    if (target) target.views = payload.views
}

// 点赞/评论后把真实计数写回卡片，避免关闭弹窗后列表数字滞后
const handleInteractionChange = (payload: { id: number; likes: number; comments: number }) => {
    const target = galleryList.value.find(item => item.id === payload.id)
    if (target) {
        target.likes = payload.likes
        target.comments = payload.comments
    }
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
.sort-bar {
    display: flex;
    align-items: center;
    gap: 6px;
}

.filter-caption {
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
}

.sort-btn {
    padding: 5px 14px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.active {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }
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
    .masonry {
        column-count: 1;
    }
}
</style>
