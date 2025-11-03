<template>
    <yk-space dir="vertical" size="l">
        <top-title name="随笔随记" :is-search="true" style="margin-bottom: 8px;"></top-title>
        <yk-space style="width: 100%;" size="l">
            <diary />
            <diaryEditor style="flex:none;width: 37%;" />
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
    import TopTitle from '../components/bar/TopTitle.vue'
    import diary from '../components/diary/diary.vue'
    import diaryEditor from '../components/diary/diaryEditor.vue'
</script>

<style lang="less" scoped>

</style>