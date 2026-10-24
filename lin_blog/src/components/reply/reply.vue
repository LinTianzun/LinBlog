<template>
    <yk-space size="m" class="reply" :class="{ 'reply-unread': isUnread }" @click="handleClick">
        <yk-avatar v-if="isComment" :img-url="content.user.imgurl"></yk-avatar>
        <yk-space dir="vertical" size="s" class="reply-main">
            <div class="reply-main-name">
                <yk-text strong>{{content.user.name}}</yk-text>
                <yk-text type="third" style="font-size: 12px;">{{content.moment}}</yk-text>
                <!-- 未读红点：显示在条目右上角 -->
                <span v-if="isUnread" class="reply-main-dot"></span>
            </div>
            <yk-text type="secondary">
                {{content.comment}}
            </yk-text>
            <yk-space size="s" align="center" v-if="isComment">
                <yk-tag class="tag" type="primary">
                  {{ content.article?.title }}
                </yk-tag>
                <yk-text type="danger" v-show="content.complaint>0">
                    举报 {{content.complaint}}
                </yk-text>
            </yk-space>
            <IconDeleteOutline class="reply-main-delete" @click.stop="deleteReply(content.id)" />

        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
import type { ReplyProps } from './reply.ts'

const props = withDefaults(defineProps<ReplyProps>(), {
    isComment: true
})

const emits = defineEmits<{
    (e: 'delete', id: string | number): void
    (e: 'click', id: string | number): void
}>()

// 未读私信显示红点
const isUnread = props.content.isUnread === true

// 删除回复
const deleteReply = (id: string | number) => {
    emits('delete', id)
}

// 点击条目（用于点击私信后消除红点）
const handleClick = () => {
    emits('click', props.content.id)
}
</script>

<style lang="less" scoped>
    .reply {
        width: 100%;
        cursor: pointer;

        &-main {
            width: 100%;
            padding-bottom: @space-l;
            border-bottom: 1px solid @line-color-s;

            &-name {
                display: flex;
                position: relative;
                flex: 1;
                flex-direction: column;
            }

            &-dot {
                position: absolute;
                right: 24px;
                top: 4px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #e5484d;
            }

            &-delete {
                position: absolute;
                right: 0;
                top: 0;
                width: 16px;
                height: 16px;
                cursor: pointer;
                color: @font-color-s;
                display: none;
            }
        }

        &:hover {
            .reply-main-delete {
                display: block;
            }
        }
    }
</style>
