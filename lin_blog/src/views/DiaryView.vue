<template>
    <yk-space dir="vertical" size="l">
        <top-title name="随笔随记" :is-search="true" style="margin-bottom: 8px;" @search="handleSearch"></top-title>
        <yk-space style="width: 100%;" size="l">
            <diary ref="diaryListRef" :serch-term="keyword" @edit="startEdit" />
            <diaryEditor ref="editorRef" style="flex:none;width: 37%;" @created="refreshDiary" @updated="refreshDiary" />
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import TopTitle from '../components/bar/TopTitle.vue'
    import diary from '../components/diary/diary.vue'
    import diaryEditor from '../components/diary/diaryEditor.vue'
    import type { DiaryData } from '../utils/interface'

    const keyword = ref('')
    const diaryListRef = ref<InstanceType<typeof diary> | null>(null)
    const editorRef = ref<InstanceType<typeof diaryEditor> | null>(null)

    const handleSearch = (value: unknown): void => {
        keyword.value = String(value ?? '').trim()
    }

    const refreshDiary = (): void => {
        diaryListRef.value?.refresh()
    }

    // 点击日记条目的编辑按钮：回显到右侧编辑器
    const startEdit = (diary: DiaryData): void => {
        editorRef.value?.startEdit(diary)
    }
</script>

<style lang="less" scoped>

</style>
