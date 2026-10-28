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

            <div v-else-if="galleryList.length" class="gallery-index">
                <figure v-for="(item, i) in galleryList" :key="item.id"
                    class="gallery-entry" :class="galleryLayout(i)"
                    :style="{ '--stagger': `${Math.min(i, 9) * 45}ms` }">
                    <button type="button" class="gallery-trigger" :aria-label="`查看摄影集：${item.title}`"
                        @click="openGallery(item)">
                        <span class="gallery-frame">
                            <span v-if="!isCoverReady(item)" class="gallery-blank" :class="`tone-${toneOf(item)}`">
                                <span>{{ glyphOf(item) }}</span>
                            </span>
                            <img v-if="coverOf(item)" :src="coverOf(item)" :alt="item.title" loading="lazy"
                                :class="{ 'is-loaded': isCoverReady(item) }" @load="markLoaded(item.id)"
                                @error="markBroken(item.id)" />
                            <span class="gallery-sequence">{{ frameNumber(i) }}</span>
                            <span class="gallery-count">
                                <IconCameraOutline />
                                {{ imageCount(item) }} 张
                            </span>
                        </span>

                        <span class="gallery-copy">
                            <span class="gallery-kicker">{{ item.subsetName || '未分类' }}</span>
                            <span v-if="i === 0 && contactImages(item).length" class="lead-contact"
                                aria-hidden="true">
                                <img v-for="(pic, pi) in contactImages(item)" :key="pi" :src="pic" alt=""
                                    loading="lazy" />
                            </span>
                            <span class="gallery-name">{{ item.title }}</span>
                            <span class="gallery-stats">
                                <span><IconEyeOutline />{{ item.views }}</span>
                                <span><IconHeartOutline />{{ item.likes }}</span>
                                <span><IconCommentOutline />{{ item.comments }}</span>
                            </span>
                        </span>
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
const loadedIds = ref(new Set<number>())
const sort = ref<PortalSort>('latest')

const detailVisible = ref(false)
const activeGallery = ref<ArticleItem | null>(null)

// 首组作品作为大画幅开场，其余按 12 栏组成不规则联系印样。
const galleryPattern = ['span-5', 'span-7', 'span-4', 'span-4', 'span-4', 'span-7', 'span-5', 'span-4', 'span-8']
const galleryLayout = (index: number): string => {
    if (index === 0) return 'is-lead'
    return galleryPattern[(index - 1) % galleryPattern.length]
}

const frameNumber = (index: number): string => {
    return String((page.value - 1) * pageSize + index + 1).padStart(2, '0')
}

const imagesOf = (item: ArticleItem): string[] => parseGalleryContent(item.content)

const coverOf = (item: ArticleItem): string => {
    if (brokenIds.value.has(item.id)) return ''
    return item.cover || imagesOf(item)[0] || ''
}

const imageCount = (item: ArticleItem): number => imagesOf(item).length

const glyphOf = (item: ArticleItem): string => (item.title || '影').trim().charAt(0)

const toneOf = (item: ArticleItem): number => Math.abs(item.id) % 4

const isCoverReady = (item: ArticleItem): boolean => {
    return Boolean(coverOf(item)) && loadedIds.value.has(item.id)
}

const contactImages = (item: ArticleItem): string[] => imagesOf(item).filter(Boolean).slice(0, 3)

const markLoaded = (id: number) => {
    loadedIds.value = new Set(loadedIds.value).add(id)
}

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
            loadedIds.value = new Set()
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

// 摄影索引：首图大字开场，其余条目像暗房联系印样一样错落排布
.gallery-index {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 18px;
    align-items: start;
}

.gallery-entry {
    min-width: 0;
    margin: 0;
    grid-column: span 4;
    animation: plate-in 0.62s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: var(--stagger, 0ms);

    &.span-4 {
        grid-column: span 4;
    }

    &.span-5 {
        grid-column: span 5;
    }

    &.span-7 {
        grid-column: span 7;
    }

    &.span-8 {
        grid-column: span 8;
    }

    &.is-lead {
        grid-column: 1 / -1;
        margin-bottom: 10px;

        .gallery-trigger {
            grid-template-columns: minmax(0, 1.62fr) minmax(240px, 0.78fr);
            align-items: stretch;
        }

        .gallery-frame {
            aspect-ratio: 16 / 8.6;
        }

        .gallery-copy {
            display: flex;
            min-height: 100%;
            flex-direction: column;
            justify-content: flex-start;
            gap: 12px;
            padding: clamp(22px, 3vw, 38px);
            border-top: 1px solid var(--portal-line-soft);
            border-bottom: 1px solid var(--portal-line-soft);
            background:
                radial-gradient(circle at 100% 0%, var(--portal-accent-soft), transparent 50%),
                var(--portal-surface);
        }

        .gallery-name {
            max-width: 9ch;
            font-size: clamp(31px, 3.6vw, 52px);
            line-height: 1.16;
            white-space: normal;
        }

        .gallery-kicker {
            margin-bottom: 0;
        }

        .gallery-stats {
            margin-top: auto;
            padding-top: 16px;
            border-top: 1px solid var(--portal-line-soft);
        }
    }

    &.span-4,
    &.span-5 {
        .gallery-frame {
            aspect-ratio: 4 / 5;
        }
    }

    &.span-7,
    &.span-8 {
        .gallery-frame {
            aspect-ratio: 4 / 3;
        }
    }
}

.gallery-trigger {
    display: grid;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
}

.gallery-frame {
    position: relative;
    display: block;
    isolation: isolate;
    overflow: hidden;
    border: 1px solid var(--portal-surface-border);
    border-radius: 3px;
    background:
        radial-gradient(circle at 78% 18%, var(--portal-accent-soft), transparent 38%),
        linear-gradient(145deg, var(--portal-surface), var(--portal-line-soft));
    box-shadow: var(--portal-shadow-soft);

    &::after {
        content: '';
        position: absolute;
        inset: 10px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        pointer-events: none;
    }

    img {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transition: transform 0.65s cubic-bezier(0.22, 0.61, 0.36, 1), filter 0.45s ease,
            opacity 0.35s ease;

        &.is-loaded {
            opacity: 1;
        }
    }
}

.gallery-trigger:hover {
    .gallery-frame img {
        transform: scale(1.035);
        filter: saturate(1.06);
    }

    .gallery-name {
        color: @pcolor;
    }

    .gallery-sequence {
        color: rgba(255, 255, 255, 0.94);
    }
}

.gallery-blank {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;

    &::before,
    &::after {
        content: '';
        position: absolute;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 50%;
    }

    &::before {
        width: 68%;
        aspect-ratio: 1;
        transform: translate(34%, -28%);
    }

    &::after {
        width: 42%;
        aspect-ratio: 1;
        transform: translate(-46%, 50%);
    }

    span {
        position: relative;
        z-index: 1;
        font-family: var(--portal-serif);
        font-size: clamp(46px, 7vw, 94px);
        font-weight: 700;
        line-height: 1;
        color: rgba(255, 255, 255, 0.9);
    }

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

.lead-contact {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: auto;

    img {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 2px;
        background: var(--portal-line-soft);
        object-fit: cover;
    }
}

.gallery-sequence {
    position: absolute;
    top: 17px;
    left: 19px;
    z-index: 2;
    color: rgba(255, 255, 255, 0.76);
    font-family: var(--portal-serif);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45);
}

.gallery-count {
    position: absolute;
    right: 14px;
    bottom: 14px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    background: rgba(8, 12, 20, 0.58);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    backdrop-filter: blur(8px);
}

.gallery-copy {
    display: grid;
    min-width: 0;
    gap: 5px;
    padding-top: 12px;
}

.gallery-kicker {
    color: var(--portal-text-tertiary);
    font-size: 11px;
    letter-spacing: 0.08em;
}

.gallery-name {
    overflow: hidden;
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--portal-transition-fast);
}

.gallery-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--portal-text-tertiary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

.gallery-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 28px;
}

@keyframes plate-in {
    from {
        opacity: 0;
        transform: translateY(18px) scale(0.992);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@media (max-width: 900px) {
    .gallery-entry {
        grid-column: span 6;

        &.span-4,
        &.span-5,
        &.span-7,
        &.span-8 {
            grid-column: span 6;
        }

        &.is-lead {
            grid-column: 1 / -1;
        }
    }
}

@media (max-width: 560px) {
    .gallery-index {
        gap: 24px;
    }

    .gallery-entry,
    .gallery-entry.span-4,
    .gallery-entry.span-5,
    .gallery-entry.span-7,
    .gallery-entry.span-8,
    .gallery-entry.is-lead {
        grid-column: 1 / -1;
        margin-bottom: 0;
    }

    .gallery-entry.is-lead .gallery-trigger {
        grid-template-columns: 1fr;
    }

    .gallery-entry.is-lead .gallery-frame {
        aspect-ratio: 4 / 3;
    }

    .gallery-entry.is-lead .gallery-copy {
        min-height: 0;
        padding: 20px 0 0;
        border: 0;
        background: transparent;
    }

    .gallery-entry.is-lead .gallery-name {
        max-width: none;
        font-size: 30px;
        white-space: normal;
    }

    .gallery-entry.is-lead .gallery-kicker {
        margin-bottom: 0;
    }

    .gallery-entry.is-lead .lead-contact {
        display: none;
    }

    .gallery-entry.is-lead .gallery-stats {
        margin-top: 0;
        padding-top: 10px;
    }

    .gallery-entry.span-4 .gallery-frame,
    .gallery-entry.span-5 .gallery-frame {
        aspect-ratio: 4 / 3;
    }
}

@media (prefers-reduced-motion: reduce) {
    .gallery-entry {
        animation: none;
    }

    .gallery-frame img {
        transition: none;
    }
}
</style>
