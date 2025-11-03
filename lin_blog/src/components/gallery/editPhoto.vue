<template>
    <div class="edit_photo">
        <div style="z-index: 2;height: 240px;">
            <yk-upload :file-list="fileUrl" :upload-url="uploadUrl" :draggable="true"></yk-upload>
        </div>

        <yk-scrollbar class="waterfallSc">
            <div class="waterfall">
                <div class="waterfall-item" v-for="(item, index) in photos" :key="index">
                    <img :src="item.url">
                    <IconStarFill class="waterfall-item-cover" v-show="item.id==coverIndex" />
                    <yk-space size="ss">
                        <p class="waterfall-item-tool" @click="changeCover(item.id)" v-show="item.id!=coverIndex">设为封面
                        </p>
                        <IconDeleteOutline class="waterfall-item-delete" @click="deletePhoto(item.id)" />
                    </yk-space>
                </div>
            </div>
        </yk-scrollbar>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted, computed } from 'vue'
    import { mkphotos } from '../../mock/data.ts'

    const uploadUrl = ''
    const fileUrl = ref([])

    //  获取图片
    const photos = ref()
    const getPhotos = () => {
        photos.value = mkphotos.data
    }

    // 将图片分成三列
    const photoColumns = computed(() => {
        if (!photos.value) return [[], [], []]
        const columns = [[], [], []]
        photos.value.forEach((photo, index) => {
            columns[index % 3].push(photo) // 按顺序分配到三列
        })
        return columns
    })

    //  封面
    const coverIndex = ref(0)

    //  设为封面
    const changeCover = (e) => {
        coverIndex.value = e
    }

    //  删除图片
    const deletePhoto = (e) => {
        photos.value = photos.value.filter(item => item.id !== e)
        if (coverIndex.value == e && photos.value.length > 0) {
            coverIndex.value = photos.value[0].id
        } else if (coverIndex.value == e && photos.value.length <= 0) {
            coverIndex.value = -1
        }
        // console.log(coverIndex.value)
    }

    onMounted(() => {
        getPhotos()
        // console.log(photos.value)
    })

</script>

<style lang="less" scoped>
    .edit_photo {
        background: @bg-color-l;
        border-radius: @radius-m;
        padding: @space-xl;
        width: 100%;
    }

    .waterfallSc {
        height: calc(100vh * 0.4);

        @media (max-height: 850px) {
            height: calc(100vh * 0.4);
        }

        @media (min-height: 951px) {
            height: calc(100vh * 0.6);
        }
    }

    .waterfall {
        column-count: 3;
        column-gap: @space-xl;
        /* padding-top: 32px; */
        z-index: 1;
        overflow: hidden;

        &-item {
            margin-bottom: @space-xl;
            border-radius: @radius-m;
            overflow: hidden;
            line-height: 0;

            img {
                width: 100%;
                /* user-select: none; */
            }

            .yk-space {
                position: absolute;
                top: @space-l;
                right: @space-l;
            }

            &-cover {
                position: absolute;
                top: @space-l;
                left: @space-l;
                width: 24px;
                height: 24px;
                color: @wcolor;
            }

            &-tool {
                line-height: 32px;
                border-radius: @radius-m;
                padding: 0 @space-m;
                background: rgba(255, 255, 255, 0.56);
                color: @pcolor;
                cursor: pointer;
                transition: all @animatb;
                opacity: 0;

                &:hover {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(2px);
                }
            }

            &-delete {
                width: 32px;
                height: 32px;
                border-radius: @radius-m;
                padding: 9px;
                background: rgba(255, 255, 255, 0.56);
                color: @gray;
                cursor: pointer;
                transition: all @animatb;
                opacity: 0;

                &:hover {
                    color: @ecolor;
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(2px);
                }
            }

            &:hover {
                .waterfall-item-tool {
                    opacity: 1;
                }

                .waterfall-item-delete {
                    opacity: 1;
                }
            }
        }
    }
</style>