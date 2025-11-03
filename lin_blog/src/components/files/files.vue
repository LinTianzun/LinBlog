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
    import './files.less'


    type FileProps = {
        pageSize: number
        subsetId: number | string
    }

    const props = withDefaults(defineProps < FileProps > (), {
        pageSize: 8,
        subsetId: -1,
    })

    //  store
    const subsetStore = useSubsetStore()

    //  头部操作
    const indeterminate = ref(false)
    const checkedAll = ref(false)

    const handleChangeAll = (value) => {
        indeterminate.value = false
        if (value) {
            checkedAll.value = true
            // 更新所有文件为选中状态并收集所有 ID
            selectedFilesId.value = files.value.map(file => {
                file.selected = true;
                return file.id;
            });
            // console.log(files.value)
            // console.log(selectedFilesId.value)
        } else {
            checkedAll.value = false
            cancelCheck()

        }
    }

    //  评论总数
    const count = ref(123)
    //  数据内容
    const files = ref()

    //  请求
    type Request = {
        token?: string;
        pageSize: number;//单页条数；
        nowPage: number;//当前页
        // count?: boolean;
    }

    const request: Request = {
        pageSize: props.pageSize,
        nowPage: 1,
        // count: false,
    }

    //  获取数据
    const drwData = (e: boolean) => {
        let data = mkfiles
        if (e) {
            count.value = data.count
        }
        files.value = data.list.slice(
            (request.nowPage - 1) * request.pageSize,
            request.nowPage * request.pageSize
        )
        //  加入选择项
        for (let i = 0; i < files.value.length; i++) {
            files.value[i].selected = false
        }

        // console.log(files.value)
    }

    //  已选择的数组
    const selectedFilesId = ref([])

    //  选择操作
    const selectFile = (e) => {
        selectedFilesId.value = files.value.reduce((acc, file) => {
            if (file.id === e) {
                file.selected = !file.selected;
            }
            if (file.selected) {
                acc.push(file.id);
            }

            return acc;
        }, []);
        // 计算全选和半选状态
        const selectedCount = selectedFilesId.value.length;
        const totalCount = files.value.length;

        checkedAll.value = selectedCount === totalCount && totalCount > 0;
        indeterminate.value = selectedCount > 0 && selectedCount < totalCount;

        // console.log(selectedFilesId.value)
    }

    //  取消选中
    const cancelCheck = (e) => {
        for (let i = 0; i < files.value.length; i++) {
            files.value[i].selected = false
        }
        selectedFilesId.value = []
    }

    //  删除单张图片
    const deleteFile = (e) => {
        // console.log('删除文件 ID:', e);
        files.value = files.value.filter((item) => {
            return item.id !== e
        })
    }
    //  删除多张图片
    const deleteMultipleFile = () => {
        // 根据 selectedFilesId 过滤 files.value
        files.value = files.value.filter(file => !selectedFilesId.value.includes(file.id));

        // 清空选中状态
        selectedFilesId.value = [];
        checkedAll.value = false;
        indeterminate.value = false;

    }


    //  切换分组
    const changeSubset = (e) => {
        console.log(e)
        for (let i = 0; i < files.value.length; i++) {
            if (files.value[i].id = e.id) {
                files.value[i].subsetId = e.subsetId
                return
            }
        }
        console.log(files.value)
    }

    //  分页
    const changePage = (e) => {
        request.nowPage = e
        drwData(false)
    }

    //  分类选择
    const subsetSelectedId = ref()
    //  切换分组
    const changeOption = (e) => {
        subsetSelectedId.value = e
    }

    const proxy = getCurrentInstance()?.proxy
    function cancel() {
        proxy.$message({ type: 'warning', message: '你点击了取消按钮' })
    }
    function confirm() {
        proxy.$message({ type: 'primary', message: '你点击了确认按钮' })
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