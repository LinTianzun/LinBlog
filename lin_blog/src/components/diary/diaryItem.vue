<template>
    <div class="diary-item">
        <yk-space dir="vertical">
            <div class="diary-item-top">
                <yk-space dir="vertical" :size="4">
                    <p class="diary-item-top-title">
                        {{props.data.title}}
                        <img :src="weathers[props.data.weatherId].iconUrl" alt="">
                    </p>
                    <yk-text type="third">{{momentl(props.data.moment)}}</yk-text>
                </yk-space>

                <yk-popconfirm placement="leftTop" trigger="click" title="确认删除" content="删除将不可恢复"
                    @confirm="deleteDiary()">
                    <IconDeleteOutline class="diary-item-top-delete" />
                </yk-popconfirm>
            </div>

            <yk-text> {{props.data.content}} </yk-text>

            <div class="diary-item-images">
                <yk-image-preview-group :src-list="props.data.picture" width="80" height="80"
                    fit="cover"></yk-image-preview-group>
            </div>

        </yk-space>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { DiaryData } from '../../utils/interface.ts'
    import { momentl } from '../../utils/moment.ts'
    import { weathers } from '../../utils/weather.ts'


    type DiaryItemProps = {
        data?: DiaryData
    }

    const props = withDefaults(defineProps < DiaryItemProps > (), {})

    const emits = defineEmits(['delete'])

    //  删除
    const deleteDiary = () => {
        emits('delete', props.data.id)
    }

    onMounted(() => {
        // console.log(props.data)
    })
</script>

<style lang="less" scoped>
    .diary-item {
        width: 100%;
        border-radius: @radius-m;
        padding: @space-xl;
        background: @bg-color-l;

        &-top {
            width: 100%;
            display: flex;
            justify-content: space-between;

            &-title {
                display: flex;
                font-size: 20px;
                font-weight: 600;
                align-items: center;

                img {
                    width: 20px;
                    margin-left: @space-s;
                }
            }

            &-delete {
                width: 20px;
                height: 20px;
                padding: 2px;
                color: @font-color-s;
                transition: color @animatb;
                display: none;

                &:hover {
                    color: @font-color-l;
                }
            }
        }

        &:hover {
            .diary-item-top-delete {
                display: block;
            }
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