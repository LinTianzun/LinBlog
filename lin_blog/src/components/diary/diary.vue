<template>
    <div class="diary">
        <yk-scrollbar ref="scrollbar" style="padding: 0 20px;">
            <div v-if="loading" class="diary-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在加载日记...</yk-text>
            </div>

            <yk-empty v-else-if="diaryList.length === 0" description="暂无日记" />

            <yk-space v-else dir="vertical" size="xl">
                <diaryItem v-for="item in diaryList" :key="item.id" :data="item"
                    :can-edit="access.canEdit(item)" :can-delete="access.canDelete(item)" @delete="deleteDiary"
                    @edit="editDiary" @view="openDetail">
                </diaryItem>
            </yk-space>
        </yk-scrollbar>
        <div class="diary-pagination">
            <AdminPager v-model:page="page" :page-size="pageSize" :total="count" :show-total="true"
                :disabled="loading" @change="handlePagerChange" />
        </div>
    </div>

    <diaryDetailView v-model="detailVisible" :diary="detailDiary" @changed="refreshDiaries" />
</template>


<script lang="ts" setup>
import { ref, onMounted, getCurrentInstance, watch } from 'vue'
import diaryItem from './diaryItem.vue'
import type { DiaryData } from '../../utils/interface'
import AdminPager from '../common/AdminPager.vue'
import {
    getDiaries,
    deleteDiary as deleteDiaryApi,
    getRequestErrorMessage,
} from '../../api/diary'
import { useContentAccess } from '../../utils/contentAccess.ts'

// 随笔条目的编辑/删除按 diary.* 权限判定，不再看角色
const access = useContentAccess('diary')

const props = defineProps({
    pageSize: {
        type: Number,
        default: 6,
    },
    serchTerm: {
        type: String,
        default: '',
    },
})

const emits = defineEmits<{
    (event: 'edit', diary: DiaryData): void
}>()

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type MessageProxy = {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as unknown as
    MessageProxy | null | undefined

const showMessage = (type: MessageOptions['type'], message: string): void => {
    proxy?.$message?.({
        type,
        message,
    })
}

// 日记列表
const diaryList = ref<DiaryData[]>([])

// 日记总数
const count = ref(0)
const page = ref(1)
const loading = ref(false)

// 详情弹窗：点卡片正文打开，内含图片与评论区
const detailVisible = ref(false)
const detailDiary = ref<DiaryData | null>(null)

const openDetail = (diary: DiaryData): void => {
    detailDiary.value = diary
    detailVisible.value = true
}

// 评论删除后随笔冗余计数已变，刷新列表让卡片数字同步
const refreshDiaries = (): void => {
    void fetchDiaries()
}

// 获取日记
const fetchDiaries = async (): Promise<void> => {
    loading.value = true

    try {
        const result = await getDiaries({
            page: page.value,
            pageSize: props.pageSize,
            keyword: props.serchTerm.trim() || undefined,
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '日记加载失败')
        }

        diaryList.value = result.data.list.map(item => ({
            id: item.id,
            title: item.title,
            moment: item.createdAt,
            weatherId: item.weatherId ?? 0,
            weatherName: item.weatherName ?? undefined,
            content: item.content,
            picture: item.picture,
            views: item.views,
            likes: item.likes,
            comments: item.comments,
            rootComments: item.rootComments,
            replyComments: item.replyComments,
        }))
        count.value = result.data.total

        if (result.data.list.length === 0 && page.value > 1) {
            page.value = 1
            await fetchDiaries()
        }
    } catch (error) {
        diaryList.value = []
        count.value = 0
        showMessage('error', getRequestErrorMessage(error, '日记加载失败，请稍后重试'))
    } finally {
        loading.value = false
    }
}

// 分页：页码已由 v-model 同步，这里只按最新页码拉数据
const handlePagerChange = (): void => {
    void fetchDiaries()
}

// 删除日记
const deleteDiary = async (id: number): Promise<void> => {
    try {
        const result = await deleteDiaryApi(id)
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        showMessage('primary', '删除完成')

        if (diaryList.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await fetchDiaries()
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '删除失败，请稍后重试'))
    }
}

// 编辑日记：把整条数据交给编辑器回显，滚动到编辑器
const editDiary = (diary: DiaryData): void => {
    emits('edit', diary)
}

// 搜索词变化时回到第一页重新查询
watch(() => props.serchTerm, () => {
    page.value = 1
    void fetchDiaries()
})

defineExpose({ refresh: fetchDiaries })

onMounted(() => {
    void fetchDiaries()
})
</script>


<style lang="less" scoped>
    .diary {
        width: 100%;
        height: calc(100vh * 0.77);
        /* 固定高度为屏幕高度 */
        display: flex;
        flex-direction: column;
        /* 垂直布局，确保内容和分页分开 */

        &-pagination {
            display: flex;
            width: 100%;
            right: 20px;
            padding: @space-s 0;
            padding-top: 24px;
            align-items: center;
            justify-content: flex-end;
        }

        &-state {
            min-height: 200px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: @space-m;
        }
    }
</style>
