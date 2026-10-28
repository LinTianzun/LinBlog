<template>
    <yk-space dir="vertical" size="l" class="admin-page diary-page">
        <top-title name="随笔随记" description="记录、编辑与整理日常内容" :is-search="true" @search="handleSearch"></top-title>
        <yk-space class="diary-content" size="l">
            <diary ref="diaryListRef" :serch-term="keyword" @edit="startEdit" />
            <diaryEditor v-if="canEditDiaries" ref="editorRef" @created="refreshDiary" @updated="refreshDiary" />
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
    import { computed, ref } from 'vue'
    import TopTitle from '../components/bar/TopTitle.vue'
    import diary from '../components/diary/diary.vue'
    import diaryEditor from '../components/diary/diaryEditor.vue'
    import type { DiaryData } from '../utils/interface'
    import { useSessionStore } from '../store/session.ts'

    const keyword = ref('')
    const session = useSessionStore()
    const diaryListRef = ref<InstanceType<typeof diary> | null>(null)
    const editorRef = ref<InstanceType<typeof diaryEditor> | null>(null)
    // 没有新建或管理权限时不渲染编辑器，避免出现点了保存才 403 的死路
    const canEditDiaries = computed(
        () => session.can('diary.create') || session.can('diary.manageOwn') || session.can('diary.manageAll')
    )

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
    .diary-content {
        width: 100%;
        align-items: flex-start;

        :deep(.diary-editor) {
            width: 37%;
            flex: none;
        }
    }

    @media (max-width: 1040px) {
        .diary-content {
            flex-wrap: wrap;
        }

        .diary-content :deep(.diary-editor) {
            width: 100%;
        }
    }
</style>
