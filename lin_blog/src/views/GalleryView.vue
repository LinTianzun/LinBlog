<template>
    <yk-space dir="vertical" size="l">
        <top-title name="摄影图库" :is-search="true" style="margin-bottom: 8px;"></top-title>
        <subset />
        <gallery />
    </yk-space>
</template>

<script lang="ts" setup>
    import TopTitle from '../components/bar/TopTitle.vue'
    import subset from '../components/subset/subset.vue'
    import gallery from '../components/gallery/gallery.vue'
</script>

<style lang="less" scoped>

</style>