<template>
    <div class="subset">
        <yk-space wrap>
            <div class="subset-menu" :class="{'subset-menu-seledted':selected=='-1all'}"
                @click="changeSeleted(-1,'all')">
                全部 {{ subsetStore.count }}
            </div>
            <div class="subset-menu" v-for="(item, index) in state.data" :key="index"
                :class="{'subset-menu-seledted':selected==item.id+'state'}" @click="changeSeleted(item.id,'state')">
                {{ item.name }}{{ item.value }}
            </div>
            <div class="subset-menu" :class="{'subset-menu-seledted':selected==subsetStore.exclude.id+'exclude'}"
                @click="changeSeleted(subsetStore.exclude.id,'exclude')">
                {{ subsetStore.exclude.name }} {{ subsetStore.exclude.value }}
            </div>
            <div class="subset-menu" v-for="(item, index) in subsetStore.data" :key="index"
                @click="changeSeleted(item.id,'subset')" :class="{'subset-menu-seledted':selected==item.id+'subset'}">
                {{item.name}}{{item.value}}
            </div>
        </yk-space>
        <yk-space style="flex:none">
            <yk-popconfirm title="请输入分组名称" trigger="click" placement="bottom" @cancel="cancel" @confirm="confirm">
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
                <IconSettingsOutline style="margin-right: 4px;" /> 管理分组
            </yk-text>
            <!-- 管理分组对话框 -->
            <yk-modal v-model="visible" title="管理分组">
                <subsetManage />
                <template #footer>
                    <yk-button @click="showModal">确定</yk-button>
                </template>
            </yk-modal>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted, getCurrentInstance } from 'vue'
    import { subset, state } from '../../mock/data.ts'
    import { SubsetData } from '../../utils/interface.ts'
    import { useSubsetStore } from '../../store/subset.ts'
    import subsetManage from './subsetManage.vue'

    const emits = defineEmits(['nowSubset'])

    //  新建分组内容
    const inputValue = ref()

    //  store
    const subsetStore = useSubsetStore()

    //  当前选择
    const selected = ref('-1all')

    //  选择切换
    const changeSeleted = (id, type) => {
        if (id + type != selected.value) {
            selected.value = id + type
            emits('nowSubset', { id, type })
        }
    }

    //  获取分组
    const rawSubset = () => {
        subsetStore.count = subset.data.count
        subsetStore.data = subset.data.list
        // console.log(subsetStore.data)
    }

    //  新建分组
    const proxy = getCurrentInstance()?.proxy
    //  取消
    function cancel() {
        inputValue.value = ''
    }
    //  插入
    function confirm() {
        if (inputValue.value) {
            let obj = {
                id: -2,
                name: inputValue.value,
                value: 0
            }
            subsetStore.data.push(obj)
            proxy.$message({ type: 'primary', message: '插入完成' })
            inputValue.value = ''
        } else {
            proxy.$message({ type: 'warning', message: '内容不能为空' })
        }
    }

    //  显示管理分组
    const visible = ref < boolean > (false)
    const showModal = () => {
        visible.value = !visible.value
    }

    onMounted(() => {
        rawSubset()
    })
</script>

<style lang="less" scoped>
    .subset {
        display: flex;
        width: 100%;
        justify-content: space-between;
        align-items: center;
        padding: @space-l @space-xl;
        border-radius: @radius-m;
        background-color: @bg-color-l;

        .yk-text {
            cursor: pointer;
        }

        &-menu {
            padding: 0 @space-l;
            background: @bg-color-s;
            border-radius: @radius-r;
            line-height: 32px;
            user-select: none;
            cursor: pointer;
            /* font-size: 14px; */

            &-seledted {
                background: @pcolor-1;
                color: @pcolor;
                font-weight: 500;
            }
        }
    }
</style>