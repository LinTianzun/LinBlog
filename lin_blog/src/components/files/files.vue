<template>
    <div class="files">
        <div class="files-tool" v-show="selectedFilesId.length>0">
            <yk-space>
                <yk-checkbox :checked="checkedAll" :indeterminate="indeterminate" @change="handleChangeAll">
                    全选
                </yk-checkbox>
                <yk-text>
                    已选择 {{selectedFilesId.length}} 项内容
                </yk-text>
                <yk-text type="primary" @click="cancelCheck" style="cursor: pointer;">
                    取消选中
                </yk-text>
            </yk-space>
            <yk-space>
                <IconDeleteOutline @click="deleteMultipleFile" class="files-tool-delete" />
                <yk-popconfirm title="选择分组" trigger="click" placement="bottomRight" @cancel="cancel" @confirm="confirm">
                    <IconSwitchOutline class="files-tool-switch" />
                    <template #content>
                        <yk-scrollbar ref="scrollbar" height="148px" class="subset">
                            <div class="subset-item" v-for="(item, index) in subsetStore.data" :key="index"
                                @click="changeOption(item.id)" :class="{'subset-seledted':subsetSelectedId==item.id}">
                                {{item.name}}{{item.value}}
                            </div>
                        </yk-scrollbar>
                    </template>
                </yk-popconfirm>
            </yk-space>
        </div>
        <div class="files-main">
            <fileItem v-for="(item, index) in files" :data="item" @changeSubsetId="changeSubset" :key="index"
                @delete="deleteFile" @selected="selectFile" />
        </div>
        <div class="files-pagination">
            <yk-pagination @change="changePage" :total="count" size="m" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, getCurrentInstance } from 'vue'
import { mkfiles } from '../../mock/data.ts'
import fileItem from './filesItem.vue'
import { useSubsetStore } from '../../store/subset.ts'
import type { FileData } from '../../utils/interface.ts'
import './files.less'

type FileProps = {
    pageSize: number
    subsetId: number | string
}

type FileChangeSubset = {
    id: number
    subsetId: number | undefined
}

const props = withDefaults(defineProps<FileProps>(), {
    pageSize: 8,
    subsetId: -1,
})

const subsetStore = useSubsetStore()

const indeterminate = ref(false)
const checkedAll = ref(false)

const count = ref(123)
const files = ref<FileData[]>([])
const selectedFilesId = ref<(number | string)[]>([])
const subsetSelectedId = ref<number | string>()

type Request = {
    token?: string
    pageSize: number
    nowPage: number
}

const request: Request = {
    pageSize: props.pageSize,
    nowPage: 1,
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

const drwData = (updateCount: boolean) => {
    const data = mkfiles

    if (updateCount) {
        count.value = data.count
    }

    files.value = data.list.slice(
        (request.nowPage - 1) * request.pageSize,
        request.nowPage * request.pageSize
    ).map((file: FileData): FileData => ({
        ...file,
        selected: false,
    }))

    selectedFilesId.value = []
    checkedAll.value = false
    indeterminate.value = false
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

    const selectedCount = selectedFilesId.value.length
    const totalCount = files.value.length

    checkedAll.value = selectedCount === totalCount && totalCount > 0
    indeterminate.value = selectedCount > 0 && selectedCount < totalCount
}

const cancelCheck = () => {
    files.value.forEach(file => {
        file.selected = false
    })

    selectedFilesId.value = []
    checkedAll.value = false
    indeterminate.value = false
}

const deleteFile = (id: number | string) => {
    files.value = files.value.filter(item => item.id !== id)
    selectedFilesId.value = selectedFilesId.value.filter(selectedId => selectedId !== id)
}

const deleteMultipleFile = () => {
    files.value = files.value.filter(
        file => !selectedFilesId.value.includes(file.id)
    )

    selectedFilesId.value = []
    checkedAll.value = false
    indeterminate.value = false
}

const changeSubset = (event: FileChangeSubset) => {
    const file = files.value.find(item => item.id === event.id)

    if (file) {
        file.subsetId = event.subsetId
    }
}

const changePage = (page: number) => {
    request.nowPage = page
    drwData(false)
}

const changeOption = (id: number | string) => {
    subsetSelectedId.value = id
}

type MessageOptions = {
    type: 'warning' | 'primary'
    message: string
}

type ProxyWithMessage = {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined

function cancel() {
    proxy?.$message?.({
        type: 'warning',
        message: '你点击了取消按钮',
    })
}

function confirm() {
    proxy?.$message?.({
        type: 'primary',
        message: '你点击了确认按钮',
    })
}

onMounted(() => {
    drwData(true)
})
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
            grid-template-columns: repeat(auto-fill, 200px);
            row-gap: 32px;
            column-gap: 24px;
            justify-content: center;
            padding: 24px 0 32px;
        }

        &-pagination {
            display: flex;
            width: 100%;
            padding: @space-l 0 0;
            align-items: center;
            justify-content: flex-end;
        }
    }
</style>