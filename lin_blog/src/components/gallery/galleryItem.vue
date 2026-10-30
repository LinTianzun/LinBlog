<template>
    <div class="gallery-item">
        <yk-space size="s" dir="vertical">
            <div class="gallery-item-image">
                <div class="gallery-item-cover" @click="openPreview(0)">
                    <yk-image :src="optimizedImageUrl(cover, 480)" fit="cover" :preview="false" width="100%"
                        height="100%"
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
                            <yk-image :src="optimizedImageUrl(photos[n - 1], 240)" fit="cover" :preview="false"
                                width="100%" height="100%" :is-lazy="true" />
                        </button>
                    </div>
                </yk-space>

                <yk-space v-if="props.canEdit || props.canDelete" class="gallery-item-image-icons" :size="4">
                    <IconFillOutline v-if="props.canEdit" title="编辑" @click="openEditor" />
                    <!-- 卡片有 overflow:hidden + hover 的 transform 层叠上下文，
                         就地渲染的浮层会被裁掉，统一用 Teleport 到 body 的确认面板 -->
                    <ConfirmPopover v-if="props.canDelete" title="确认删除" content="删除将不可恢复" placement="topRight"
                        @confirm="deleteGallery()">
                        <IconDeleteOutline class="gallery-item-delete" />
                    </ConfirmPopover>
                </yk-space>
            </div>

            <!-- 卡片下半部分整体可点：打开后台详情弹窗看图与评论 -->
            <div class="gallery-item-body" @click="openDetail">
                <!-- 分类与图片数：与前台图库卡片的 kicker + count 信息对齐 -->
                <div class="gallery-item-kicker">
                    <span class="gallery-item-subset">{{ props.data.subsetName || '未分类' }}</span>
                    <span v-if="props.data.hasUnpublishedChanges" class="gallery-item-workflow is-draft">
                        有未发布修改
                    </span>
                    <span v-if="props.data.scheduledAt" class="gallery-item-workflow is-scheduled">
                        {{ formatArticleDate(props.data.scheduledAt) }} 定时发布
                    </span>
                    <span class="gallery-item-count">
                        <IconCameraOutline />{{ allPhotos.length }} 张
                    </span>
                </div>

                <p class="gallery-item-title">
                    {{ props.data.title }}
                </p>

                <p v-if="props.data.introduce" class="gallery-item-intro">
                    {{ props.data.introduce }}
                </p>

                <div class="gallery-item-datas">
                    <div class="gallery-item-stats">
                        <span class="gallery-item-stat">
                            <IconEyeOutline />{{ props.data.views }}
                        </span>
                        <span class="gallery-item-stat">
                            <IconHeartOutline />{{ props.data.likes }}
                        </span>
                        <span class="gallery-item-stat">
                            <IconCommentOutline />{{ commentCount }}
                        </span>
                    </div>
                    <span class="gallery-item-date">{{ articleDate }}</span>
                </div>
            </div>
        </yk-space>
    </div>

    <!-- 预览：与前后台详情共用同一个灯箱组件 -->
    <ContentLightbox :open="previewIndex !== null" :photos="previewList" :index="previewIndex ?? 0"
        :title="props.data.title" @close="closePreview" @update:index="previewIndex = $event" />
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
    IconCameraOutline,
    IconCommentOutline,
    IconEyeOutline,
    IconHeartOutline,
} from '@yike-design/ui/es/components/svg-icon'
import ConfirmPopover from '../common/ConfirmPopover.vue'
import ContentLightbox from '../content/ContentLightbox.vue'
import type { ArticleItem } from '../../api/article.ts'
import {
    formatArticleDate,
    getArticleStateLabel,
    parseGalleryContent,
} from '../../api/article.ts'
import { optimizedImageUrl } from '../../utils/imageOptimization.ts'

const props = withDefaults(defineProps<{
    data: ArticleItem
    // 编辑/删除按权限矩阵逐条判定：能管理全部、或本人名下才显示按钮
    canEdit?: boolean
    canDelete?: boolean
}>(), {
    canEdit: false,
    canDelete: false,
})

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
// 与详情统计条保持同一时间口径：优先展示发布时间，草稿才回落到创建时间
const articleDate = computed(() => formatArticleDate(props.data.publishedAt || props.data.createdAt))
const stateLabel = computed(() => getArticleStateLabel(props.data.state))

// 评论与回复分开统计：后端按 parent_id 聚合，没回传时按总数兜底
// 卡片与门户保持一致，只展示评论总数；详情里再拆分一级评论与回复
const commentCount = computed(() => {
    const hasSplitCounts = props.data.rootComments !== undefined || props.data.replyComments !== undefined
    if (hasSplitCounts) return (props.data.rootComments ?? 0) + (props.data.replyComments ?? 0)
    return props.data.comments ?? 0
})

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
    position: relative;
    isolation: isolate;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 16px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;

    // 渐变主题：边缘一圈主题色渐变描边（纯色主题宽度为 0，整层不可见）
    &::before {
        position: absolute;
        inset: 0;
        z-index: -1;
        content: '';
        border-radius: inherit;
        padding: var(--admin-edge-width, 0px);
        background: var(--admin-edge-gradient, transparent);
        -webkit-mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
        mask-composite: exclude;
        pointer-events: none;
    }

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

    // 分类 + 图片数：卡片顶部的信息行，与前台的 kicker/count 对齐
    &-kicker {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: @space-s;
        padding: 12px 14px 0;
        color: var(--admin-muted, @font-color-s);
        font-size: 12px;
    }

    &-subset {
        overflow: hidden;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--admin-accent-soft, var(--pcolor2));
        color: var(--admin-accent, @pcolor);
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &-count {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: none;
        margin-left: auto;
        font-variant-numeric: tabular-nums;

        :deep(.yk-icon) {
            width: 14px;
            height: 14px;
        }
    }

    &-workflow {
        flex: none;
        padding: 1px 8px;
        border-radius: 999px;
        font-weight: 500;
        white-space: nowrap;

        &.is-draft {
            background: color-mix(in srgb, #d98716 14%, transparent);
            color: #b8720d;
        }

        &.is-scheduled {
            background: color-mix(in srgb, var(--pcolor) 14%, transparent);
            color: var(--pcolor);
        }
    }

    &-title {
        .font-l();
        padding: 8px 14px 0;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        text-overflow: ellipsis;
        font-weight: 600;
    }

    // 简介：两行截断，让卡片内容更接近前台的图文卡而不是纯标题
    &-intro {
        margin: 6px 0 0;
        padding: 0 14px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        color: var(--admin-muted, @font-color-s);
        font-size: 12px;
        line-height: 1.6;
    }

    &-body {
        cursor: pointer;
    }

    &-datas {
        width: 100%;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 8px 14px 14px;
        color: var(--admin-muted, @font-color-s);
        font-size: 12px;
    }

    // 与门户图库卡片同口径：浏览、喜欢、评论总数；日期单独靠右
    &-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        width: 100%;
        overflow: hidden;
    }

    &-stat {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;

        :deep(.yk-icon) {
            width: 14px;
            height: 14px;
            flex: none;
        }
    }

    &-date {
        display: inline-flex;
        width: max-content;
        align-items: center;
        justify-content: flex-end;
        justify-self: end;
        color: var(--admin-muted, @font-color-s);
        text-align: right;
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
.gallery-item {
    .yk-image__img {
        border-radius: 0;
    }
}
</style>
