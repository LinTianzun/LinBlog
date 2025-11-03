<template>
    <yk-space dir="vertical" size="l">
        <top-title name="博客文章" :is-search="true" style="margin-bottom: 8px;"></top-title>
        <subset />
        <yk-space style="width: 100%;">
            <artcle />
            <labelV></labelV>
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
    import TopTitle from '../components/bar/TopTitle.vue'
    import subset from '../components/subset/subset.vue'
    import labelV from '../components/label/label.vue'
    import artcle from '../components/article/artcle.vue'
</script>

<style lang="less" scoped>

</style>