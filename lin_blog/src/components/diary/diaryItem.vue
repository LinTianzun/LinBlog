<template>
    <div class="diary-item">
        <yk-space dir="vertical">
            <div class="diary-item-top">
                <yk-space dir="vertical" :size="4">
                    <p class="diary-item-top-title">
                        {{props.data.title}}
                        <img :src="weatherIcon" alt="">
                    </p>
                    <yk-text type="third">{{momentl(props.data.moment)}}</yk-text>
                </yk-space>

                <yk-space size="s">
                    <IconModifyOutline class="diary-item-top-delete" @click="editDiary()" />
                    <yk-popconfirm placement="leftTop" trigger="click" title="确认删除" content="删除将不可恢复"
                        @confirm="deleteDiary()">
                        <IconDeleteOutline class="diary-item-top-delete" />
                    </yk-popconfirm>
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
import type { DiaryData } from '../../utils/interface'
import { weathers } from '../../utils/weather'
import { momentl } from '../../utils/moment'

type DiaryItemProps = {
    data: DiaryData
}

const props = defineProps<DiaryItemProps>()

const emits = defineEmits<{
    (event: 'delete', id: number): void
    (event: 'edit', diary: DiaryData): void
    (event: 'view', diary: DiaryData): void
}>()

// 按天气名称匹配前端图标，避免与数据库自增 ID 错位
const weather = weathers.find(item => item.name === props.data.weatherName)
const weatherIcon = weather?.iconUrl ?? weathers[0].iconUrl

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
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 16px;
        padding: 20px;
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
        transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;

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
