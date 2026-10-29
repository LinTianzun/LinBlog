<template>
    <div class="article-item">
        <yk-space size="xl" align="start">
            <div class="article-item-cover" @click="openDetail">
                <yk-image v-if="props.data.cover" :src="optimizedImageUrl(props.data.cover, 480)" fit="cover"
                    :preview="false" width="160" height="120" :is-lazy="true" />
                <div v-else class="article-item-cover-placeholder">
                    {{ coverText }}
                </div>
                <p class="article-item-state" :class="`is-${props.data.state}`">
                    {{ stateLabel }}
                </p>
            </div>

            <div class="article-item-main">
                <!-- 分类与日期：卡片顶部的信息行，与前台文章卡片的时间/分类语言对齐 -->
                <div class="article-item-kicker">
                    <span class="article-item-subset">{{ subsetName }}</span>
                    <span class="article-item-date">{{ articleDate }}</span>
                </div>

                <p class="article-item-title" @click="openDetail">
                    {{ props.data.title }}
                </p>
                <p class="article-item-introduce">
                    {{ props.data.introduce || '暂无简介' }}
                </p>

                <div class="article-item-datas">
                    <yk-space size="xl" wrap>
                        <yk-text type="secondary" v-if="labels.length > 0">
                            <span v-for="(item, index) in labels" :key="index" class="article-item-label">
                                {{ item }}
                            </span>
                        </yk-text>

                        <yk-space class="article-item-stats">
                            <yk-text type="third" class="article-item-stat">
                                <IconEyeOutline />
                                {{ props.data.views }}
                            </yk-text>
                            <yk-text type="third" class="article-item-stat">
                                <IconHeartOutline />
                                {{ props.data.likes }}
                            </yk-text>
                            <yk-text type="third" class="article-item-stat">
                                <IconCommentOutline />
                                {{ rootComments }}
                            </yk-text>
                            <yk-text type="third" class="article-item-stat">
                                <IconRotateLeftOutline />
                                {{ replyComments }}
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
import {
    IconHeartOutline,
    IconRotateLeftOutline,
} from '@yike-design/ui/es/components/svg-icon'
import type { ArticleItem, ArticleState } from '../../api/article'
import {
    formatArticleDate,
    getArticleStateLabel,
    parseArticleLabels,
} from '../../api/article'
import { useSubsetStore } from '../../store/subset'
import { optimizedImageUrl } from '../../utils/imageOptimization'

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

// 评论与回复分开统计：后端按 parent_id 聚合，没回传时按总数兜底
const rootComments = computed(() => props.data.rootComments ?? props.data.comments ?? 0)
const replyComments = computed(() => props.data.replyComments ?? 0)

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
    box-sizing: border-box;
    position: relative;
    isolation: isolate;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    padding: clamp(18px, 1.8vw, 24px);
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;

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
        transform: translateY(-1px);
        border-color: var(--pcolor3);
        box-shadow: var(--admin-shadow-md, @shadow-m);
    }

    &-cover {
        position: relative;
        width: 176px;
        height: 128px;
        flex: none;
        border-radius: 13px;
        overflow: hidden;
        cursor: pointer;
        background: var(--bgColor3);

        &-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
                linear-gradient(135deg, var(--pcolor2) 0%, transparent 70%),
                var(--bgColor3);
            color: var(--pcolor);
            font-size: 42px;
            font-weight: 700;
        }
    }

    &-state {
        position: absolute;
        top: 9px;
        left: 9px;
        width: auto;
        min-width: 48px;
        padding: 3px 9px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        line-height: 20px;
        text-align: center;
        color: @white;
        font-size: 11px;
        font-weight: 650;
        background: color-mix(in srgb, var(--pcolor) 86%, transparent);
        backdrop-filter: blur(8px);

        &.is-published {
            background: color-mix(in srgb, var(--scolor) 84%, transparent);
        }

        &.is-rejected {
            background: color-mix(in srgb, var(--ecolor) 84%, transparent);
        }
    }

    &-main {
        min-width: 0;
        width: 100%;
    }

    // 分类 + 日期：卡片顶部的信息行，与前台文章的 post-date / post-chip 对齐
    &-kicker {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: @space-s;
        padding-bottom: @space-s;
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

    &-date {
        flex: none;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    &-title {
        font-size: 20px;
        font-weight: 600;
        line-height: 1.35;
        padding-bottom: @space-s;
        cursor: pointer;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;

        &:hover {
            color: var(--pcolor);
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
        color: var(--gray8);
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
            padding: 6px 8px;
            border-radius: 10px;
            background: var(--gray1);

            .yk-icon {
                width: 18px;
                height: 18px;
                color: var(--gray6);
                cursor: pointer;

                &:hover {
                    color: var(--pcolor);
                }
            }
        }
    }

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

    &-datas {
        display: flex;
        gap: @space-l;
        justify-content: space-between;
        align-items: center;

        &-icons {
            flex: none;
            padding: 6px 8px;
            border-radius: 10px;
            background: var(--gray1);

            .yk-icon {
                width: 18px;
                height: 18px;
                color: var(--gray6);
                cursor: pointer;

                &:hover {
                    color: var(--pcolor);
                }
            }
        }
    }

    @media (max-width: 640px) {
        :deep(.yk-space) {
            flex-wrap: wrap;
        }

        &-cover {
            width: 100%;
            height: 190px;
        }

        &-introduce {
            max-width: 100%;
        }

        &-datas {
            align-items: flex-start;
            flex-direction: column;
        }
    }
}
</style>
