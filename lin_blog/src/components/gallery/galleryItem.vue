<template>
    <div class="gallery-item">
        <yk-space size="s" dir="vertical">

            <div class="gallery-item-image">
                <div class="gallery-item-cover">
                    <yk-image :src="props.data.cover" fit="cover" :preview="false" width="238" height="160"
                        :is-lazy="true" />
                </div>
                <yk-space :size="2">
                    <div class="gallery-item-image-left image-div">
                        <yk-image :src="props.data.content[0]" fit="cover" :preview="false" width="78" height="78"
                            :is-lazy="true" v-if="props.data.content[0]" />
                    </div>
                    <div class="gallery-item-image-center image-div">
                        <yk-image :src="props.data.content[1]" fit="cover" :preview="false" width="78" height="78"
                            :is-lazy="true" v-if="props.data.content[1]" />
                    </div>
                    <div class="gallery-item-image-right image-div">
                        <yk-image :src="props.data.content[2]" fit="cover" :preview="false" width="78" height="78"
                            :is-lazy="true" v-if="props.data.content[2]" />
                    </div>
                </yk-space>

                <yk-space class="gallery-item-image-icons" :size="4">
                    <IconFillOutline />
                    <yk-popconfirm placement="topRight" trigger="click" title="确认删除" content="删除将不可恢复"
                        @confirm="deleteGallery()">
                        <IconDeleteOutline />
                    </yk-popconfirm>
                </yk-space>
            </div>

            <div style="width: 100%;">
                <p class="gallery-item-title">
                    {{props.data.title}}
                </p>

                <div class="gallery-item-datas">
                    <yk-space size="xl">
                        <yk-space>
                            <yk-text type="third">
                                查看
                                {{props.data.views}}
                            </yk-text>
                            <yk-text type="third">
                                喜欢
                                {{props.data.praise}}
                            </yk-text>
                        </yk-space>
                    </yk-space>
                    <yk-text type="third">{{momentm(props.data?.moment)}}</yk-text>
                </div>

            </div>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { ArticleData } from '../../utils/interface.ts'
    import { momentm } from '../../utils/moment.ts'


    type GalleryItemProps = {
        data?: ArticleData
    }

    const props = withDefaults(defineProps < GalleryItemProps > (), {})

    const emits = defineEmits(['delete'])

    //  删除
    const deleteGallery = () => {
        emits('delete', props.data.id)
    }


</script>

<style lang="less" scoped>
    .gallery-item {
        width: 238px;
        border-radius: @radius-m;
        background: @bg-color-l;

        &-image {
            &-left {
                border-radius: 0 0 0 @radius-m;
                overflow: hidden;
            }

            &-right {
                border-radius: 0 0 @radius-m 0;
                overflow: hidden;
            }

            .image-div {
                width: 78px;
                height: 78px;
                background: @gray-2;
            }

            &-icons {
                position: absolute;
                right: @space-l;
                top: @space-l;
                background-color: rgba(255, 255, 255, 0.56);
                border-radius: @radius-m;
                padding: @space-ss;
                opacity: 0;

                &:hover {
                    background-color: rgba(255, 255, 255, 0.64);
                    background-filter: blur(2px);
                    opacity: 1;
                }

                .yk-icon {
                    width: 24px;
                    height: 24px;
                    padding: 5px;
                    color: @gray;
                    cursor: pointer;

                    &:hover {
                        color: @pcolor;
                    }
                }
            }


        }

        &-cover {
            position: relative;
            flex: none;
            border-radius: @radius-m @radius-m 0 0;
            overflow: hidden;
            padding-bottom: 2px;
        }

        &-title {
            .font-l();
            padding-top: @space-m;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            text-overflow: ellipsis;
            font-weight: 600;
        }

        &-datas {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            /* background-color: aqua; */
        }

        &:hover {
            .gallery-item-image-icons {
                opacity: 1;
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