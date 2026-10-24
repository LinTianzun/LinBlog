<template>
    <div class="gallery-item">
        <yk-space size="s" dir="vertical">
            <div class="gallery-item-image">
                <div class="gallery-item-cover">
                    <yk-image :src="cover" fit="cover" :preview="false" width="238" height="160"
                        :is-lazy="true" />
                    <p class="gallery-item-state" :class="`is-${props.data.state}`">
                        {{ stateLabel }}
                    </p>
                </div>
                <yk-space :size="2">
                    <div v-for="n in 3" :key="n" class="image-div"
                        :class="`gallery-item-image-${n === 1 ? 'left' : n === 3 ? 'right' : 'center'}`">
                        <yk-image :src="photos[n - 1]" fit="cover" :preview="false" width="78" height="78"
                            :is-lazy="true" v-if="photos[n - 1]" />
                    </div>
                </yk-space>

                <yk-space class="gallery-item-image-icons" :size="4">
                    <IconFillOutline @click="openEditor" />
                    <yk-popconfirm placement="topRight" trigger="click" title="确认删除" content="删除将不可恢复"
                        @confirm="deleteGallery()">
                        <IconDeleteOutline />
                    </yk-popconfirm>
                </yk-space>
            </div>

            <div style="width: 100%;">
                <p class="gallery-item-title">
                    {{ props.data.title }}
                </p>

                <div class="gallery-item-datas">
                    <yk-space size="xl">
                        <yk-space>
                            <yk-text type="third">
                                查看
                                {{ props.data.views }}
                            </yk-text>
                            <yk-text type="third">
                                喜欢
                                {{ props.data.likes }}
                            </yk-text>
                        </yk-space>
                    </yk-space>
                    <yk-text type="third">{{ articleDate }}</yk-text>
                </div>
            </div>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
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

const openEditor = (): void => {
    router.push(`/editgallery/${props.data.id}`)
}

// 删除
const deleteGallery = (): void => {
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
            border-radius: 0 0 @radius-m  0;
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

    &-state {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        line-height: 26px;
        text-align: center;
        color: @white;
        font-size: @size-s;
        font-weight: 600;
        background: rgba(43, 90, 237, 0.82);
        margin: 0;

        &.is-published {
            background: rgba(31, 157, 99, 0.84);
        }

        &.is-rejected {
            background: rgba(218, 80, 66, 0.86);
        }
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
