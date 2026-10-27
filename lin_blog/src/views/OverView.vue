<template>
    <yk-space dir="vertical" size="xl" class="admin-page overview-page">
        <top-title name="系统总览" :is-search="false" />
        <gather />

        <div class="overview-grid">
            <datas />
            <comment :page-size="8" />
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
    import TopTitle from '../components/bar/TopTitle.vue'
    import gather from '../components/overview/gather.vue'
    import datas from '../components/overview/datas.vue'
    import { comment } from '../components/reply/index.ts'

</script>

<style lang="less" scoped>
    .overview-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(340px, 0.92fr);
        gap: @space-xl;
        width: 100%;
        align-items: stretch;

        // 两栏都从网格行高取高度，评论卡内部再滚动，保证左右齐平
        > * {
            min-width: 0;
            height: 100%;
        }

        // 评论内容不能参与网格行高计算，否则 8 条评论会把整行撑高；
        // 让右侧卡片严格跟随左侧「访问量 + 数据监测」的实际高度。
        > .comment {
            min-height: 0;
            overflow: hidden;
            contain: size;
        }
    }

    @media (max-width: 1100px) {
        .overview-grid {
            grid-template-columns: 1fr;

            > .comment {
                height: auto;
                min-height: 420px;
                overflow: visible;
                contain: none;
            }
        }
    }
</style>
