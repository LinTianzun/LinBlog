<template>
    <div ref="rootRef" class="files">
        <div class="files-tool" v-show="selectedFilesId.length > 0">
            <yk-space>
                <yk-checkbox :checked="checkedAll" :indeterminate="indeterminate" @change="handleChangeAll">
                    全选
                </yk-checkbox>
                <yk-text>
                    已选择 {{ selectedFilesId.length }} 项内容
                </yk-text>
                <yk-text type="primary" @click="cancelCheck" style="cursor: pointer;">
                    取消选中
                </yk-text>
            </yk-space>
            <yk-space>
                <yk-popconfirm title="确认删除所选文件？可在回收站恢复" trigger="click" placement="topRight"
                    @confirm="deleteMultipleFile">
                    <IconDeleteOutline class="files-tool-delete" />
                </yk-popconfirm>
                <yk-popconfirm title="选择分组" trigger="click" placement="bottomRight" @confirm="confirmMove">
                    <IconSwitchOutline class="files-tool-switch" />
                    <template #content>
                        <yk-scrollbar ref="scrollbar" height="148px" class="subset">
                            <div class="subset-item" @click="changeOption(undefined)"
                                :class="{ 'subset-seledted': subsetSelectedId === undefined }">
                                未分类
                            </div>
                            <div class="subset-item" v-for="item in subsetStore.data" :key="item.id"
                                @click="changeOption(Number(item.id))"
                                :class="{ 'subset-seledted': subsetSelectedId == item.id }">
                                {{ item.name }} {{ item.value }}
                            </div>
                        </yk-scrollbar>
                    </template>
                </yk-popconfirm>
            </yk-space>
        </div>

        <div v-if="loading" class="files-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载文件...</yk-text>
        </div>

        <yk-empty v-else-if="files.length === 0" description="暂无文件" />

        <div v-else class="files-main">
            <fileItem v-for="item in files" :key="item.id" :data="item" @changeSubsetId="changeSubset"
                @delete="deleteFile" @selected="selectFile" @download="downloadFile" />
        </div>

        <div class="files-pagination">
            <yk-pagination @change="changePage" :current="page" :total="count" :page-size="effectivePageSize"
                size="m" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch, getCurrentInstance } from 'vue'
import fileItem from './filesItem.vue'
import { useSubsetStore } from '../../store/subset.ts'
import { useResponsiveGridPageSize } from '../../utils/responsivePageSize.ts'
import type { FileData } from '../../utils/interface.ts'
import {
    getFiles,
    moveFiles,
    deleteFiles,
    getRequestErrorMessage,
    type FileItem,
} from '../../api/file'
import './files.less'

type FileProps = {
    pageSize?: number
    subsetId?: number | string
    uncategorized?: boolean
}

type FileChangeSubset = {
    id: number
    subsetId: number | undefined
}

const props = withDefaults(defineProps<FileProps>(), {
    subsetId: -1,
    uncategorized: false,
})

const subsetStore = useSubsetStore()
const rootRef = ref<HTMLElement | null>(null)
const responsivePageSize = useResponsiveGridPageSize(rootRef, {
    minCardWidth: 200,
    gap: 24,
    rows: 3,
    horizontalPadding: 48,
})
const effectivePageSize = computed(
    () => props.pageSize ?? responsivePageSize.value
)

const indeterminate = ref(false)
const checkedAll = ref(false)

const count = ref(0)
const page = ref(1)
const loading = ref(false)
const files = ref<FileData[]>([])
const selectedFilesId = ref<(number | string)[]>([])
const subsetSelectedId = ref<number | undefined>()

type MessageOptions = {
    type: 'warning' | 'primary' | 'error'
    message: string
}

type ProxyWithMessage = {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined

const showMessage = (type: MessageOptions['type'], message: string): void => {
    proxy?.$message?.({ type, message })
}

const normalizeSelected = (): void => {
    const selectedCount = selectedFilesId.value.length
    const totalCount = files.value.length
    checkedAll.value = selectedCount === totalCount && totalCount > 0
    indeterminate.value = selectedCount > 0 && selectedCount < totalCount
}

// 拉取文件列表
const fetchFiles = async (): Promise<void> => {
    loading.value = true

    try {
        const result = await getFiles({
            page: page.value,
            pageSize: effectivePageSize.value,
            subsetId: Number(props.subsetId) > 0 ? Number(props.subsetId) : undefined,
            uncategorized: props.uncategorized || undefined,
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '文件加载失败')
        }

        count.value = result.data.total
        files.value = result.data.list.map((item: FileItem): FileData => ({
            id: item.id,
            url: item.url,
            fileName: item.fileName,
            format: item.format,
            size: item.size ?? undefined,
            subsetId: item.subsetId ?? undefined,
            selected: false,
        }))

        if (result.data.list.length === 0 && page.value > 1) {
            page.value = 1
            await fetchFiles()
            return
        }
    } catch (error) {
        files.value = []
        count.value = 0
        showMessage('error', getRequestErrorMessage(error, '文件加载失败，请稍后重试'))
    } finally {
        loading.value = false
    }

    cancelCheck()
}

// 筛选条件变化时回到第一页
watch(() => [props.subsetId, props.uncategorized], () => {
    page.value = 1
    void fetchFiles()
})

// 大屏切换为更多列时自动增加每页条数，并回到第一页重新取数
watch(effectivePageSize, () => {
    page.value = 1
    void fetchFiles()
})

const changePage = (nextPage: number): void => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchFiles()
}

const handleChangeAll = (value: boolean) => {
    indeterminate.value = false

    if (value) {
        checkedAll.value = true
        selectedFilesId.value = files.value.map(file => {
            file.selected = true
            return file.id
        })
    } else {
        checkedAll.value = false
        cancelCheck()
    }
}

const selectFile = (id: number | string) => {
    selectedFilesId.value = files.value.reduce<(number | string)[]>((acc, file) => {
        if (file.id === id) {
            file.selected = !file.selected
        }
        if (file.selected) {
            acc.push(file.id)
        }
        return acc
    }, [])

    normalizeSelected()
}

const cancelCheck = () => {
    files.value.forEach(file => {
        file.selected = false
    })

    selectedFilesId.value = []
    checkedAll.value = false
    indeterminate.value = false
}

const pickedIds = (): number[] =>
    files.value.filter(file => file.selected).map(file => file.id)

// 单个删除
const deleteFile = async (id: number): Promise<void> => {
    try {
        const result = await deleteFiles([id])
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        showMessage('primary', '删除成功')

        if (files.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await Promise.all([fetchFiles(), subsetStore.fetchFileSubsets()])
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '删除失败，请稍后重试'))
    }
}

// 批量删除
const deleteMultipleFile = async (): Promise<void> => {
    const ids = pickedIds()
    if (ids.length === 0) return

    try {
        const result = await deleteFiles(ids)
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        showMessage('primary', `已删除 ${ids.length} 个文件`)
        await Promise.all([fetchFiles(), subsetStore.fetchFileSubsets()])
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '删除失败，请稍后重试'))
    }
}

// 单个文件改分组
const changeSubset = async (event: FileChangeSubset): Promise<void> => {
    try {
        const result = await moveFiles([event.id], event.subsetId)
        if (result.code !== 200) throw new Error(result.message || '移动失败')

        showMessage('primary', '分组已更新')
        await Promise.all([fetchFiles(), subsetStore.fetchFileSubsets()])
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '移动失败，请稍后重试'))
    }
}

const changeOption = (id: number | undefined) => {
    subsetSelectedId.value = id
}

// 批量移动分组
const confirmMove = async (): Promise<void> => {
    const ids = pickedIds()
    if (ids.length === 0) return

    try {
        const result = await moveFiles(ids, subsetSelectedId.value)
        if (result.code !== 200) throw new Error(result.message || '移动失败')

        showMessage('primary', `已移动 ${ids.length} 个文件`)
        await Promise.all([fetchFiles(), subsetStore.fetchFileSubsets()])
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '移动失败，请稍后重试'))
    }
}

// 下载文件：浏览器直接访问下载接口
const downloadFile = (id: number): void => {
    window.open(`/api/file/${id}/download`, '_blank')
}

onMounted(() => {
    void fetchFiles()
})

defineExpose({ refresh: fetchFiles })
</script>

<style lang="less" scoped>
    .files {
        padding: @space-l;
        border-radius: @radius-m;
        background: @bg-color-l;
        width: 100%;

        &-tool {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: @space-l;
            border-radius: @radius-m;
            background: @bg-color-m;

            &-delete,
            &-switch {
                width: 20px;
                height: 20px;
                color: @font-color-s;
                cursor: pointer;

                &:hover {
                    color: @font-color-l;
                }
            }

        }

        &-main {
            display: grid;
            // 流体列：卡片宽度随可用空间伸缩，屏幕拉宽时铺满而不是居中留白
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            row-gap: 32px;
            column-gap: 24px;
            padding: 24px 0 32px;
        }

        &-pagination {
            display: flex;
            width: 100%;
            padding: @space-l 0 0;
            align-items: center;
            justify-content: flex-end;
        }

        &-state {
            min-height: 220px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: @space-m;
        }
    }
</style>
