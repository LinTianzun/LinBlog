<template>
    <div class="article-item">
        <yk-space size="xl" align="start">
            <div class="article-item-cover" @click="openDetail">
                <yk-image v-if="props.data.cover" :src="props.data.cover" fit="cover" :preview="false" width="160"
                    height="120" :is-lazy="true" />
                <div v-else class="article-item-cover-placeholder">
                    {{ coverText }}
                </div>
                <p class="article-item-state" :class="`is-${props.data.state}`">
                    {{ stateLabel }}
                </p>
            </div>

            <div class="article-item-main">
                <p class="article-item-title" @click="openDetail">
                    {{ props.data.title }}
                </p>
                <p class="article-item-introduce">
                    {{ props.data.introduce || '暂无简介' }}
                </p>

                <div class="article-item-datas">
                    <yk-space size="xl" wrap>
                        <yk-text type="secondary">
                            {{ subsetName }}
                            <yk-text type="secondary" v-if="labels.length > 0">
                                /
                                <span v-for="(item, index) in labels" :key="index" class="article-item-label">
                                    {{ item }}
                                </span>
                            </yk-text>
                        </yk-text>

                        <yk-text type="third">{{ articleDate }}</yk-text>

                        <yk-space>
                            <yk-text type="third">
                                <IconEyeOutline />
                                {{ props.data.views }}
                            </yk-text>
                            <yk-text type="third">
                                <IconLikeOutline />
                                {{ props.data.likes }}
                            </yk-text>
                            <yk-text type="third">
                                <IconCommentOutline />
                                {{ props.data.comments }}
                            </yk-text>
                        </yk-space>
                    </yk-space>

                    <yk-space class="article-item-datas-icons" size="xl">
                        <yk-tooltip placement="top" title="发布"
                            v-if="props.canPublish && ['draft', 'rejected'].includes(props.data.state)">
                            <IconSendOutline @click="updateState('published')" />
                        </yk-tooltip>
                        <yk-tooltip placement="top" title="撤回为草稿"
                            v-if="props.canPublish && props.data.state === 'published'">
                            <IconRevokeOutline @click="updateState('draft')" />
                        </yk-tooltip>
                        <yk-tooltip placement="top" title="转为草稿"
                            v-if="!props.canPublish && props.canEdit && props.data.state === 'rejected'">
                            <IconRevokeOutline @click="updateState('draft')" />
                        </yk-tooltip>
                        <yk-tooltip placement="top" title="编辑" v-if="props.canEdit">
                            <IconFillOutline @click="openEditor" />
                        </yk-tooltip>
                        <yk-popconfirm placement="topRight" trigger="click" title="确认删除" content="删除将不可恢复"
                            @confirm="deleteArticle" v-if="props.canDelete">
                            <IconDeleteOutline />
                        </yk-popconfirm>
                    </yk-space>
                </div>
            </div>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { ArticleItem, ArticleState } from '../../api/article'
import {
    formatArticleDate,
    getArticleStateLabel,
    parseArticleLabels,
} from '../../api/article'
import { useSubsetStore } from '../../store/subset'

type ArticleItemProps = {
    data: ArticleItem
    canPublish?: boolean
    canEdit?: boolean
    canDelete?: boolean
}

const props = withDefaults(defineProps<ArticleItemProps>(), {
    canPublish: false,
    canEdit: false,
    canDelete: false,
})

const emits = defineEmits<{
    (event: 'delete', id: number): void
    (event: 'state', payload: { id: number; state: ArticleState }): void
    (event: 'view', id: number): void
}>()

const router = useRouter()
const subsetStore = useSubsetStore()

const stateLabel = computed(() => getArticleStateLabel(props.data.state))
const labels = computed(() => parseArticleLabels(props.data.label))
const articleDate = computed(() => formatArticleDate(props.data.createdAt))
const subsetName = computed(
    () => props.data.subsetName || subsetStore.subsetName(props.data.subsetId ?? undefined)
)
const coverText = computed(() => props.data.title.trim().slice(0, 1) || '文')

const openDetail = (): void => {
    emits('view', props.data.id)
}

const openEditor = (): void => {
    router.push(`/editarticle/${props.data.id}`)
}

const deleteArticle = (): void => {
    emits('delete', props.data.id)
}

const updateState = (state: ArticleState): void => {
    emits('state', {
        id: props.data.id,
        state,
    })
}
</script>

<style lang="less" scoped>
.article-item {
    width: 100%;
    border-radius: @radius-m;
    background: @bg-color-l;
    padding: @space-xl;

    &-cover {
        position: relative;
        width: 160px;
        height: 120px;
        flex: none;
        border-radius: @radius-m;
        overflow: hidden;
        cursor: pointer;

        &-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, @pcolor-1 0%, @bg-color-s 100%);
            color: @pcolor;
            font-size: 42px;
            font-weight: 700;
        }
    }

    &-state {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        line-height: 30px;
        text-align: center;
        color: @white;
        font-weight: 600;
        background: rgba(43, 90, 237, 0.82);

        &.is-published {
            background: rgba(31, 157, 99, 0.84);
        }

        &.is-rejected {
            background: rgba(218, 80, 66, 0.86);
        }
    }

    &-main {
        min-width: 0;
        width: 100%;
    }

    &-title {
        font-size: 20px;
        font-weight: 600;
        padding-bottom: @space-s;
        cursor: pointer;

        &:hover {
            color: @pcolor;
        }
    }

    &-introduce {
        .font-m();
        height: 48px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        text-overflow: ellipsis;
        color: @font-color-l;
        margin-bottom: @space-m;
        max-width: 85%;
    }

    &-label {
        padding-right: 4px;
        display: inline-block;
    }

    &-datas {
        display: flex;
        gap: @space-l;
        justify-content: space-between;
        align-items: center;

        &-icons {
            flex: none;

            .yk-icon {
                width: 20px;
                height: 20px;
                color: @font-color-s;
                cursor: pointer;

                &:hover {
                    color: @pcolor;
                }
            }
        }
    }
}
</style>
