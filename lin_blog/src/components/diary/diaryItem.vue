<template>
    <div class="diary-item">
        <yk-space dir="vertical">
            <!-- 头部：标题 + 天气/日期标签，与前台随笔卡片的日期书脊信息对齐 -->
            <div class="diary-item-top">
                <yk-space dir="vertical" :size="4">
                    <p class="diary-item-top-title">{{ props.data.title }}</p>
                    <yk-space class="diary-item-badges" :size="8" align="center" wrap>
                        <span v-if="props.data.weatherName" class="diary-item-badge">
                            <img :src="weatherIcon" :alt="props.data.weatherName" />
                            {{ props.data.weatherName }}
                        </span>
                        <span class="diary-item-time">{{ momentm(props.data.moment) }}</span>
                    </yk-space>
                </yk-space>

                <yk-space v-if="props.canEdit || props.canDelete" size="s">
                    <IconModifyOutline v-if="props.canEdit" class="diary-item-top-delete" title="编辑"
                        @click="editDiary()" />
                    <!-- 卡片有 hover 的 transform 层叠上下文，确认面板必须 Teleport 到 body -->
                    <ConfirmPopover v-if="props.canDelete" title="确认删除" content="删除将不可恢复" placement="leftTop"
                        @confirm="deleteDiary()">
                        <IconDeleteOutline class="diary-item-top-delete" />
                    </ConfirmPopover>
                </yk-space>
            </div>

            <!-- 正文与图片整体可点：打开后台详情弹窗看图与评论 -->
            <div class="diary-item-body" @click="openDetail">
                <yk-text> {{props.data.content}} </yk-text>

                <div class="diary-item-images">
                    <!-- 配图与图库卡片一致：点击直接放大，不再依赖预览组的默认交互 -->
                    <button v-for="(url, index) in previewList" :key="`${url}-${index}`" type="button"
                        class="diary-item-thumb" :aria-label="`查看第 ${index + 1} 张`" @click="openPreview(index)">
                        <img :src="optimizedImageUrl(url, 240)" :alt="`第 ${index + 1} 张`" loading="lazy"
                            decoding="async" />
                    </button>
                </div>
            </div>

            <!-- 统计条：与前台随笔列表共用图标 + 数字的统计语言 -->
            <div class="diary-item-datas">
                <yk-space class="diary-item-stats" :size="14" align="center" wrap>
                    <yk-text type="third" class="diary-item-stat">
                        <IconEyeOutline />{{ views }}
                    </yk-text>
                    <yk-text type="third" class="diary-item-stat">
                        <IconHeartOutline />{{ likes }}
                    </yk-text>
                    <yk-text type="third" class="diary-item-stat">
                        <IconCommentOutline />{{ rootComments }}
                    </yk-text>
                    <yk-text type="third" class="diary-item-stat">
                        <IconRotateLeftOutline />{{ replyComments }}
                    </yk-text>
                </yk-space>
            </div>


        </yk-space>
    </div>

    <!-- 预览：与前后台详情共用同一个灯箱组件 -->
    <ContentLightbox :open="previewIndex !== null" :photos="previewList" :index="previewIndex ?? 0"
        :title="props.data.title" @close="closePreview" @update:index="previewIndex = $event" />
</template>


<script lang="ts" setup>
import { computed, ref } from 'vue'
import {
    IconRotateLeftOutline,
    IconCommentOutline,
    IconEyeOutline,
    IconHeartOutline,
} from '@yike-design/ui/es/components/svg-icon'
import type { DiaryData } from '../../utils/interface'
import { weathers } from '../../utils/weather'
import { momentm } from '../../utils/moment'
import ConfirmPopover from '../common/ConfirmPopover.vue'
import ContentLightbox from '../content/ContentLightbox.vue'
import { optimizedImageUrl } from '../../utils/imageOptimization'

type DiaryItemProps = {
    data: DiaryData
    // 编辑/删除按 diary.* 权限逐条判定：能管理全部、或本人名下才显示按钮
    canEdit?: boolean
    canDelete?: boolean
}

const props = withDefaults(defineProps<DiaryItemProps>(), {
    canEdit: false,
    canDelete: false,
})

const emits = defineEmits<{
    (event: 'delete', id: number): void
    (event: 'edit', diary: DiaryData): void
    (event: 'view', diary: DiaryData): void
}>()

// 按天气名称匹配前端图标，避免与数据库自增 ID 错位
const weather = weathers.find(item => item.name === props.data.weatherName)
const weatherIcon = weather?.iconUrl ?? weathers[0].iconUrl

// 互动统计统一走「图标 + 数字」；一级评论与回复分开统计
const views = props.data.views ?? 0
const likes = props.data.likes ?? 0
const rootComments = props.data.rootComments ?? props.data.comments ?? 0
const replyComments = props.data.replyComments ?? 0

// 预览列表：随笔配图是可选字段，缺图时灯箱不打开
const previewList = computed(() => props.data.picture ?? [])
const previewIndex = ref<number | null>(null)

const openPreview = (index: number): void => {
    if (previewList.value.length === 0) return
    previewIndex.value = Math.min(Math.max(index, 0), previewList.value.length - 1)
}

const closePreview = (): void => {
    previewIndex.value = null
}

// 删除日记
const deleteDiary = (): void => {
    emits('delete', props.data.id)
}

// 编辑日记
const editDiary = (): void => {
    emits('edit', props.data)
}

// 点击卡片正文打开后台详情弹窗（图片 + 评论区）
const openDetail = (): void => {
    emits('view', props.data)
}
</script>


<style lang="less" scoped>
    .diary-item {
        width: 100%;
        box-sizing: border-box;
        position: relative;
        isolation: isolate;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 16px;
        padding: 20px;
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
        transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;

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

        &-top {
            width: 100%;
            display: flex;
            justify-content: space-between;

            &-title {
                display: flex;
                font-size: 20px;
                font-weight: 600;
                align-items: center;
                color: var(--gray);
            }

            &-delete {
                width: 20px;
                height: 20px;
                padding: 2px;
                color: var(--gray6);
                transition: color @animatb;
                display: none;

                &:hover {
                    color: var(--pcolor);
                }
            }
        }

        &:hover {
            transform: translateY(-1px);
            border-color: var(--pcolor3);
            box-shadow: var(--admin-shadow-md, @shadow-m);

            .diary-item-top-delete {
                display: block;
            }
        }

        &-body {
            width: 100%;
            cursor: pointer;
        }

        // 天气与日期：卡片顶部的信息行，与前台随笔的日期书脊信息对齐
        &-badges {
            min-width: 0;
        }

        &-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 1px 8px;
            border-radius: 999px;
            background: var(--admin-accent-soft, var(--pcolor2));
            color: var(--admin-accent, @pcolor);
            font-size: 12px;
            line-height: 20px;

            img {
                width: 14px;
                height: 14px;
                object-fit: contain;
            }
        }

        &-datas {
            width: 100%;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: @space-m;
            padding-top: 4px;
        }

        &-stats {
            min-width: 0;
        }

        &-time,
        &-stat {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }

        &-stat :deep(.yk-icon) {
            width: 15px;
            height: 15px;
            flex: none;
        }
    }
</style>
<style lang="less">
    .diary-item {

        &-images {
            display: flex;
            flex-wrap: wrap;
            gap: @space-s;
            margin-top: @space-s;
        }

        &-thumb {
            width: 80px;
            height: 80px;
            padding: 0;
            overflow: hidden;
            border: none;
            border-radius: 8px;
            background: var(--gray1);
            cursor: zoom-in;

            img {
                display: block;
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
            }

            &:hover img {
                transform: scale(1.06);
            }
        }
    }

</style>
