<template>
    <div class="diary-item">
        <yk-space dir="vertical">
            <div class="diary-item-top">
                <yk-space dir="vertical" :size="4">
                    <p class="diary-item-top-title">
                        {{props.data.title}}
                        <img :src="weatherIcon" alt="">
                    </p>
                    <yk-space :size="14" align="center" wrap>
                        <yk-text type="third" class="diary-item-time">{{momentl(props.data.moment)}}</yk-text>
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
                    <yk-image-preview-group :src-list="props.data.picture" width="80" height="80"
                        fit="cover"></yk-image-preview-group>
                </div>
            </div>


        </yk-space>
    </div>
</template>


<script lang="ts" setup>
import {
    IconRotateLeftOutline,
    IconCommentOutline,
    IconEyeOutline,
    IconHeartOutline,
} from '@yike-design/ui/es/components/svg-icon'
import type { DiaryData } from '../../utils/interface'
import { weathers } from '../../utils/weather'
import { momentl } from '../../utils/moment'
import ConfirmPopover from '../common/ConfirmPopover.vue'

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

                img {
                    width: 20px;
                    margin-left: @space-s;
                }
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

            .yk-space {
                gap: @space-s;
            }

            .yk-image {
                border-radius: 8px;
            }
        }
    }

</style>
