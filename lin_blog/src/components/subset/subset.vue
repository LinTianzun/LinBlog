<template>
    <div class="subset">
        <yk-space wrap>
            <div class="subset-menu" :class="{'subset-menu-seledted':selected=='-1all'}"
                @click="changeSeleted(-1,'all')">
                全部 {{ subsetStore.stateSummary.all }}
            </div>
            <div class="subset-menu" v-for="(item, index) in subsetStore.stateTabs" :key="index"
                :class="{'subset-menu-seledted':selected==item.id+'state'}" @click="changeSeleted(item.id,'state')">
                {{ item.name }} {{ item.value }}
            </div>
            <div class="subset-menu" :class="{'subset-menu-seledted':selected==subsetStore.exclude.id+'exclude'}"
                @click="changeSeleted(subsetStore.exclude.id,'exclude')">
                {{ subsetStore.exclude.name }} {{ subsetStore.exclude.value }}
            </div>
            <div class="subset-menu" v-for="(item, index) in subsetStore.data" :key="index"
                @click="changeSeleted(item.id,'subset')" :class="{'subset-menu-seledted':selected==item.id+'subset'}">
                {{item.name}} {{item.value}}
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
            <yk-modal :model-value="visible" title="管理分组" @update:model-value="handleModalChange">
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
    import { createSubset } from '../../api/subset'
    import { useSubsetStore } from '../../store/subset.ts'
    import subsetManage from './subsetManage.vue'

    const emits = defineEmits(['nowSubset'])

    //  新建分组内容
    const inputValue = ref()

    //  store
    const subsetStore = useSubsetStore()

    const props = withDefaults(defineProps<{
        classify?: 'article' | 'image'
    }>(), {
        classify: 'article',
    })

    //  当前选择
    const selected = ref('-1all')

    //  选择切换
type SubsetType = 'all' | 'state' | 'exclude' | 'subset'

const changeSeleted = (id: string | number, type: SubsetType) => {
        if (id + type != selected.value) {
            selected.value = id + type
            emits('nowSubset', { id, type })
        }
    }

    //  获取分组
    const rawSubset = async () => {
        if (props.classify === 'article') {
            await Promise.all([subsetStore.fetchSubsets(), subsetStore.fetchStateSummary()])
            return
        }

        // 图库页签：加载图片分类与图片集统计
        await Promise.all([subsetStore.fetchSubsets(props.classify), subsetStore.fetchStateSummary(props.classify)])
    }

    //  新建分组
    const proxy = getCurrentInstance()?.proxy as {
        $message: (options: { type: 'primary' | 'warning' | 'error' | 'success'; message: string }) => void
    } | null | undefined
    //  取消
    function cancel() {
        inputValue.value = ''
    }
    //  插入
   async function confirm() {
    const name = String(inputValue.value ?? '').trim()

    if (name) {
        if (name.length > 50) {
            proxy?.$message({ type: 'warning', message: '分类名称不能超过50字' })
            return
        }

        try {
            const result = await createSubset({ name, classify: props.classify })
            if (result.code !== 200) {
                throw new Error(result.message || '创建失败')
            }
            await subsetStore.fetchSubsets()
            proxy?.$message({ type: 'primary', message: '分类创建成功' })
            inputValue.value = ''
        } catch (error) {
            const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
                || (error instanceof Error ? error.message : '创建失败，请稍后重试')
            proxy?.$message({ type: 'error', message })
        }
    } else {
        proxy?.$message({ type: 'warning', message: '内容不能为空' })
    }
}

    //  显示管理分组
    const visible = ref < boolean > (false)
    const showModal = () => {
        visible.value = !visible.value
    }

    // 管理弹窗关闭后刷新分类计数
    const handleModalChange = (value: boolean) => {
        visible.value = value
        if (!value) {
            void rawSubset()
        }
    }

    onMounted(() => {
        void rawSubset()
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
