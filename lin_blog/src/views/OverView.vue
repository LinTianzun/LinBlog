<template>
    <yk-space dir="vertical" size="xl">
        <top-title :is-search="false" />
        <gather />

        <yk-space style="width: 100%;" size="xl">
            <datas />
            <comment style="width: 50%;" height="483px" />
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
    import TopTitle from '../components/bar/TopTitle.vue'
    import gather from '../components/overview/gather.vue'
    import datas from '../components/overview/datas.vue'
    import { comment } from '../components/reply/index.ts'

</script>

<style lang="less" scoped>

</style>