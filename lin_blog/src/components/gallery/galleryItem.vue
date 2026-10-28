<template>
    <div class="gallery-item">
        <yk-space size="s" dir="vertical">
            <div class="gallery-item-image">
                <div class="gallery-item-cover" @click="openPreview(0)">
                    <yk-image :src="cover" fit="cover" :preview="false" width="100%" height="100%"
                        :is-lazy="true" />
                    <p class="gallery-item-state" :class="`is-${props.data.state}`">
                        {{ stateLabel }}
                    </p>
                </div>
                <yk-space class="gallery-item-thumbs" :size="2">
                    <div v-for="n in 3" :key="n" class="image-div"
                        :class="`gallery-item-image-${n === 1 ? 'left' : n === 3 ? 'right' : 'center'}`">
                        <button v-if="photos[n - 1]" type="button" class="gallery-item-thumb-button"
                            :aria-label="`预览第 ${n} 张图片`" @click="openPreview(n)">
                            <yk-image :src="photos[n - 1]" fit="cover" :preview="false" width="100%" height="100%"
                                :is-lazy="true" />
                        </button>
                    </div>
                </yk-space>

                <yk-space class="gallery-item-image-icons" :size="4">
                    <IconFillOutline @click="openEditor" />
                    <!-- 卡片有 overflow:hidden + hover 的 transform 层叠上下文，
                         就地渲染的浮层会被裁掉，统一用 Teleport 到 body 的确认面板 -->
                    <ConfirmPopover title="确认删除" content="删除将不可恢复" placement="topRight"
                        @confirm="deleteGallery()">
                        <IconDeleteOutline class="gallery-item-delete" />
                    </ConfirmPopover>
                </yk-space>
            </div>

            <!-- 卡片下半部分整体可点：打开后台详情弹窗看图与评论 -->
            <div class="gallery-item-body" @click="openDetail">
                <p class="gallery-item-title">
                    {{ props.data.title }}
                </p>

                <div class="gallery-item-datas">
                    <yk-space class="gallery-item-stats" :size="14" align="center" wrap>
                        <yk-text type="third" class="gallery-item-stat">
                            <IconEyeOutline />{{ props.data.views }}
                        </yk-text>
                        <yk-text type="third" class="gallery-item-stat">
                            <IconHeartOutline />{{ props.data.likes }}
                        </yk-text>
                        <yk-text type="third" class="gallery-item-stat">
                            <IconCommentOutline />{{ rootComments }}
                        </yk-text>
                        <yk-text type="third" class="gallery-item-stat">
                            <IconRotateLeftOutline />{{ replyComments }}
                        </yk-text>
                    </yk-space>
                    <yk-text type="third" class="gallery-item-date">{{ articleDate }}</yk-text>
                </div>
            </div>
        </yk-space>
    </div>

    <!-- 图库预览：点击封面或缩略图打开大图，支持左右切换与缩略图导航 -->
    <Teleport to="body">
        <div v-if="previewIndex !== null" class="gallery-lightbox" role="dialog" aria-modal="true"
            aria-label="图库预览" @click.self="closePreview">
            <button type="button" class="gallery-lightbox-close" aria-label="关闭预览" @click="closePreview">
                <IconCloseOutline />
            </button>

            <button v-if="previewList.length > 1" type="button" class="gallery-lightbox-nav is-prev"
                aria-label="上一张" @click="stepPreview(-1)">
                <IconLeftOutline />
            </button>

            <figure class="gallery-lightbox-stage">
                <img :src="previewList[previewIndex]" :alt="props.data.title" />
                <figcaption>
                    {{ props.data.title }}
                    <span>{{ previewIndex + 1 }} / {{ previewList.length }}</span>
                </figcaption>
            </figure>

            <button v-if="previewList.length > 1" type="button" class="gallery-lightbox-nav is-next"
                aria-label="下一张" @click="stepPreview(1)">
                <IconRightOutline />
            </button>

            <div v-if="previewList.length > 1" class="gallery-lightbox-thumbs">
                <button v-for="(url, index) in previewList" :key="url" type="button"
                    class="gallery-lightbox-thumb" :class="{ active: index === previewIndex }"
                    :aria-label="`查看第 ${index + 1} 张`" @click="previewIndex = index">
                    <img :src="url" :alt="`缩略图 ${index + 1}`" />
                </button>
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
    IconCloseOutline,
    IconRotateLeftOutline,
    IconCommentOutline,
    IconEyeOutline,
    IconHeartOutline,
    IconLeftOutline,
    IconRightOutline,
} from '@yike-design/ui/es/components/svg-icon'
import ConfirmPopover from '../common/ConfirmPopover.vue'
import type { ArticleItem } from '../../api/article.ts'
import {
    formatArticleDate,
    getArticleStateLabel,
    parseGalleryContent,
} from '../../api/article.ts'

const props = defineProps<{
    data: ArticleItem
}>()

const emits = defineEmits<{
    (e: 'delete', id: number): void
    (e: 'view', id: number): void
}>()

const router = useRouter()

const allPhotos = computed(() => parseGalleryContent(props.data.content))
const cover = computed(() => props.data.cover || allPhotos.value[0] || '')
// 小图跳过封面本身，避免与大图重复
const photos = computed(() => {
    const filtered = cover.value ? allPhotos.value.filter(url => url !== cover.value) : allPhotos.value
    return filtered.slice(0, 3)
})
const articleDate = computed(() => formatArticleDate(props.data.createdAt))
const stateLabel = computed(() => getArticleStateLabel(props.data.state))

// 评论与回复分开统计：后端按 parent_id 聚合，没回传时按总数兜底
const rootComments = computed(() => props.data.rootComments ?? props.data.comments ?? 0)
const replyComments = computed(() => props.data.replyComments ?? 0)

// 预览列表：封面在前，其余图片随后，点缩略图也能定位到正确的一张
const previewList = computed(() => {
    const rest = cover.value ? allPhotos.value.filter(url => url !== cover.value) : [...allPhotos.value]
    return cover.value ? [cover.value, ...rest] : rest
})
const previewIndex = ref<number | null>(null)

const openPreview = (index: number): void => {
    if (previewList.value.length === 0) return
    previewIndex.value = Math.min(Math.max(index, 0), previewList.value.length - 1)
}

const closePreview = (): void => {
    previewIndex.value = null
}

const stepPreview = (step: number): void => {
    if (previewIndex.value === null) return

    const total = previewList.value.length
    previewIndex.value = (previewIndex.value + step + total) % total
}

const onKeydown = (event: KeyboardEvent): void => {
    if (previewIndex.value === null) return

    if (event.key === 'Escape') closePreview()
    if (event.key === 'ArrowLeft') stepPreview(-1)
    if (event.key === 'ArrowRight') stepPreview(1)
}

// 打开预览时才监听键盘，关闭后立刻解绑
watch(previewIndex, value => {
    if (value === null) {
        window.removeEventListener('keydown', onKeydown)
        return
    }

    window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
})

const openEditor = (): void => {
    router.push(`/editgallery/${props.data.id}`)
}

// 点击卡片空白处打开后台详情弹窗（标题、图片与评论区）
const openDetail = (): void => {
    emits('view', props.data.id)
}

// 删除
const deleteGallery = (): void => {
    emits('delete', props.data.id)
}
</script>

<style lang="less" scoped>
.gallery-item {
    // 宽度交给网格列控制，配合 minmax(238px, 1fr) 填满整行
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 16px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;

    &:hover {
        transform: translateY(-3px);
        border-color: var(--pcolor3);
        box-shadow: var(--admin-shadow-md, @shadow-m);
    }

    &-image {
        position: relative;
        width: 100%;

        &-left {
            border-radius: 0;
            overflow: hidden;
        }

        &-right {
            border-radius: 0;
            overflow: hidden;
        }

        .image-div {
            width: 100%;
            aspect-ratio: 1 / 1;
            background: var(--gray1);
        }

        // 三张缩略图平分卡片宽度：屏幕变宽时同步放大，不再固定 78px
        :deep(.gallery-item-thumbs) {
            width: 100%;

            > .yk-space-item {
                flex: 1 1 0;
                min-width: 0;
            }
        }

        .gallery-item-thumb-button {
            display: block;
            width: 100%;
            height: 100%;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: zoom-in;
        }

        &-icons {
            position: absolute;
            right: @space-l;
            top: @space-l;
            border: 1px solid rgba(255, 255, 255, 0.28);
            border-radius: 10px;
            padding: 4px;
            background: rgba(18, 22, 30, 0.5);
            backdrop-filter: blur(10px);
            opacity: 0;
            transform: translateY(-3px);
            transition: opacity 160ms ease, transform 160ms ease;

            &:hover {
                background: rgba(18, 22, 30, 0.72);
                opacity: 1;
            }

            .yk-icon {
                width: 24px;
                height: 24px;
                padding: 5px;
                color: #fff;
                cursor: pointer;

                &:hover {
                    color: color-mix(in srgb, var(--pcolor) 62%, #fff);
                }
            }

            // 删除图标现在是确认面板的触发器，沿用同一套图标尺寸/悬停色
            .gallery-item-delete {
                width: 24px;
                height: 24px;
                padding: 5px;
                color: #fff;
                cursor: pointer;

                &:hover {
                    color: color-mix(in srgb, var(--ecolor) 70%, #fff);
                }
            }
        }
    }

    &-cover {
        position: relative;
        flex: none;
        overflow: hidden;
        width: 100%;
        aspect-ratio: 238 / 160;
        padding-bottom: 4px;
        background: var(--bgColor2);
        cursor: zoom-in;
    }

    &-state {
        position: absolute;
        top: 10px;
        left: 10px;
        bottom: auto;
        width: auto;
        padding: 3px 9px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        line-height: 20px;
        text-align: center;
        color: @white;
        font-size: 11px;
        font-weight: 600;
        background: color-mix(in srgb, var(--pcolor) 86%, transparent);
        backdrop-filter: blur(8px);
        margin: 0;

        &.is-published {
            background: color-mix(in srgb, var(--scolor) 84%, transparent);
        }

        &.is-rejected {
            background: color-mix(in srgb, var(--ecolor) 84%, transparent);
        }
    }

    &-title {
        .font-l();
        padding: 14px 14px 0;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        text-overflow: ellipsis;
        font-weight: 600;
    }

    &-body {
        cursor: pointer;
    }

    &-datas {
        width: 100%;
        box-sizing: border-box;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: @space-m;
        padding: 8px 14px 14px;
    }

    // 统计项统一走「图标 + 数字」，不再用「查看/喜欢」文字，避免和右侧日期挤在一起
    &-stats {
        min-width: 0;
    }

    &-stat {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;

        :deep(.yk-icon) {
            width: 15px;
            height: 15px;
            flex: none;
        }
    }

    &-date {
        flex: none;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    &:hover {
        .gallery-item-image-icons {
            opacity: 1;
            transform: translateY(0);
        }
    }
}
</style>
<style lang="less">

.gallery-lightbox {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(12px, 3vw, 36px);
    padding: clamp(24px, 5vh, 64px);
    box-sizing: border-box;
    background: rgba(10, 12, 16, 0.82);
    backdrop-filter: blur(6px);
    animation: gallery-lightbox-in 180ms ease;

    &-stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        max-width: min(1100px, 84vw);
        max-height: 76vh;
        margin: 0;

        img {
            max-width: 100%;
            max-height: 64vh;
            object-fit: contain;
            border-radius: 14px;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
        }

        figcaption {
            display: flex;
            align-items: center;
            gap: 12px;
            color: rgba(255, 255, 255, 0.92);
            font-size: 14px;

            span {
                padding: 2px 10px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.16);
                font-size: 12px;
            }
        }
    }

    &-close,
    &-nav {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        flex: none;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        cursor: pointer;
        transition: background 160ms ease, transform 160ms ease;

        &:hover {
            background: rgba(255, 255, 255, 0.24);
            transform: scale(1.06);
        }
    }

    &-close {
        position: absolute;
        top: clamp(16px, 3vh, 32px);
        right: clamp(16px, 3vw, 36px);
    }

    &-thumbs {
        position: absolute;
        bottom: clamp(16px, 3vh, 32px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        max-width: min(720px, 88vw);
        padding: 8px;
        overflow-x: auto;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.1);
    }

    &-thumb {
        width: 58px;
        height: 58px;
        flex: none;
        padding: 0;
        overflow: hidden;
        border: 2px solid transparent;
        border-radius: 10px;
        background: transparent;
        cursor: pointer;
        opacity: 0.62;
        transition: opacity 160ms ease, border-color 160ms ease;

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        &:hover {
            opacity: 0.9;
        }

        &.active {
            border-color: #fff;
            opacity: 1;
        }
    }

    @keyframes gallery-lightbox-in {
        from {
            opacity: 0;
        }

        to {
            opacity: 1;
        }
    }
}

@media (max-width: 640px) {
    .gallery-lightbox {
        flex-direction: column;
        gap: 12px;

        &-nav {
            order: 2;
        }

        &-stage {
            order: 1;
            max-height: 62vh;

            img {
                max-height: 52vh;
            }
        }
    }
}
.gallery-item {
    .yk-image__img {
        border-radius: 0;
    }
}
</style>
