<template>
    <yk-space size="m" class="reply">
        <yk-avatar v-if="isComment" :img-url="content.user.imgurl"></yk-avatar>
        <yk-space dir="vertical" size="s" class="reply-main">
            <div class="reply-main-name">
                <yk-text strong>{{content.user.name}}</yk-text>
                <yk-text type="third" style="font-size: 12px;">{{content.moment}}</yk-text>
            </div>
            <yk-text type="secondary">
                {{content.comment}}
            </yk-text>
            <yk-space size="s" align="center" v-if="isComment">
                <yk-tag class="tag" type="primary">
                    {{content.article.title}}
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
    import { ref, onMounted } from 'vue'
    import { ReplyProps } from './reply.ts'
    import imgUrl from '../../assets/img/xw10.jpg'

    const props = withDefaults(defineProps < ReplyProps > (), {
        isComment: true
    })

    const emits = defineEmits(["delete"])

    //  删除
    const deleteReply = (e) => [
        emits("delete", e)
    ]

</script>

<style lang="less" scoped>
    .reply {
        width: 100%;

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