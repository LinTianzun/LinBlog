<template>
    <yk-space dir="vertical" size="l">
        <top-title name="随笔随记" :is-search="true" style="margin-bottom: 8px;" @search="handleSearch"></top-title>
        <yk-space style="width: 100%;" size="l">
            <diary ref="diaryListRef" :serch-term="keyword" />
            <diaryEditor style="flex:none;width: 37%;" @created="refreshDiary" />
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import TopTitle from '../components/bar/TopTitle.vue'
    import diary from '../components/diary/diary.vue'
    import diaryEditor from '../components/diary/diaryEditor.vue'

    const keyword = ref('')
    const diaryListRef = ref<InstanceType<typeof diary> | null>(null)

    const handleSearch = (value: unknown): void => {
        keyword.value = String(value ?? '').trim()
    }

    const refreshDiary = (): void => {
        diaryListRef.value?.refresh()
    }
</script>

<style lang="less" scoped>

</style>
