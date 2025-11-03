<template>
    <div class="label">
        <div class="label-title">
            <yk-title :level="4" style="margin: 0;">标签</yk-title>
            <yk-space style="flex:none">
                <yk-popconfirm title="请输入标签名称" trigger="click" placement="bottom" @cancel="cancel" @confirm="confirm">
                    <yk-text type="primary">
                        <IconCirclePlusOutline style="margin-right: 4px;" /> 新建
                    </yk-text>
                    <template #content>
                        <div style="margin: 8px 4px 16px;">
                            <yk-input placeholder="请输入" show-counter :limit="6" style="width: 208px;"
                                v-model="inputValue"></yk-input>
                        </div>
                    </template>
                </yk-popconfirm>
                <yk-text type="primary" @click="showModal">
                    <IconSettingsOutline style="margin-right: 4px;" /> 管理标签
                </yk-text>

            </yk-space>
        </div>
        <yk-space wrap size="s">
            <yk-tag v-for="(item, index) in label" :key="index" @click="changeSeleted(item.id,'label')"
                :class="{'label-menu-seledted':selected==item.id+'label'}">
                {{item.name}}
            </yk-tag>
        </yk-space>
    </div>

    <!-- 管理标签对话框 -->
    <yk-modal v-model="visible" title="管理标签">
        <labelManage :label="label" />
        <template #footer>
            <yk-button @click="showModal">确定</yk-button>
        </template>
    </yk-modal>

</template>

<script lang="ts" setup>
    import { ref, onMounted, getCurrentInstance } from 'vue'
    import { mklabel } from '../../mock/data.ts'
    import { LabelData } from '../../utils/interface.ts'
    import labelManage from './labelManage.vue'

    // const emits = defineEmits(['nowSubset'])

    //  新建标签内容
    const inputValue = ref()

    //  当前选择
    const selected = ref('-1all')

    //  选择切换
    const changeSeleted = (id, type) => {
        if (id + type != selected.value) {
            selected.value = id + type
            emits('nowSubset', { id, type })
        }
    }

    //  获取标签
    const label = ref < LabelData > ([])
    const rawLabel = () => {
        label.value = [...mklabel.data.list]
        // console.log('rawlabel' + label.value)
    }

    //  新建标签
    const proxy = getCurrentInstance()?.proxy
    //  取消
    function cancel() {
        inputValue.value = ''
    }
    //  插入
    function confirm() {
        if (inputValue.value) {
            let obj = {
                id: 4,
                name: inputValue.value,
                value: 0
            }
            label.value.push(obj)
            proxy.$message({ type: 'primary', message: '插入完成' })
            inputValue.value = ''
        } else {
            proxy.$message({ type: 'warning', message: '内容不能为空' })
        }
    }

    //  显示管理标签
    const visible = ref < boolean > (false)
    const showModal = () => {
        visible.value = !visible.value
    }

    onMounted(() => {
        rawLabel()
    })
</script>

<style lang="less" scoped>
    .label {
        width: 280px;
        flex: none;
        padding: @space-l @space-xl;
        border-radius: @radius-m;
        background-color: @bg-color-l;

        &-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: @space-l;
        }

        .yk-text {
            cursor: pointer;
        }

    }
</style>