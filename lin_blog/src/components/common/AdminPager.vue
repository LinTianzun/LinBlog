<template>
    <div v-if="total > 0" class="admin-pager">
        <span v-if="showTotal" class="admin-pager-total">共 {{ total }} 条</span>
        <!-- current/defaultCurrent 必须成对绑定：组件内部 _current 只从 defaultCurrent 初始化，
             且只在 props.current 变化时同步，漏了 defaultCurrent 会导致挂载时高亮停在第 1 页 -->
        <yk-pagination :key="pagerKey" :current="safeCurrent" :default-current="safeCurrent" :total="total"
            :page-size="safePageSize" :default-page-size="safePageSize" :layouts="layouts" :size="size"
            :disabled="disabled" :hide-on-single-page="hideOnSinglePage" @change="handleChange" />
        <!-- 每页条数标题由 AdminPager 受控渲染，避免 yk-pagination 内部状态在重建后回到默认值 -->
        <yk-dropdown v-if="showPageSize" :title="`${safePageSize} 条/页`" type="secondary" :size="size"
            :disabled="disabled" trigger="click" @selected="handleSelectPageSize">
            <yk-dropdown-item v-for="option in pageSizeOptions" :key="option" :value="option">
                {{ option }} 条/页
            </yk-dropdown-item>
        </yk-dropdown>
    </div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue'

/**
 * 后台统一分页条。
 *
 * 直接用 yk-pagination 时有两个坑，这里统一屏蔽掉：
 * 1. 内部 _current 用 defaultCurrent 初始化，只传 :current 会在挂载时（比如页码不是 1，
 *    或分页条因 v-if 重新挂载）高亮停在第 1 页，数据和高亮对不上；
 * 2. layouts 里的 'total' 文案在渲染时就把 props.total 写死了，后续不会随数据更新。
 * 所以这里 current/defaultCurrent、pageSize/defaultPageSize 成对绑定，'total' 改为自己渲染。
 * 另外页码/每页条数变化时用 key 重建实例，让内部状态始终以最新 props 初始化，
 * 避免「内部已翻页但父组件没接受」时高亮和真实页码对不上。
 */
const props = withDefaults(defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizeOptions?: number[]
    showPageSize?: boolean
    showTotal?: boolean
    showJumper?: boolean
    size?: 's' | 'm' | 'l'
    disabled?: boolean
    hideOnSinglePage?: boolean
}>(), {
    pageSizeOptions: () => [10, 20, 30, 50],
    showPageSize: false,
    showTotal: false,
    showJumper: false,
    size: 'm',
    disabled: false,
    hideOnSinglePage: false,
})

const emits = defineEmits<{
    (event: 'update:page', page: number): void
    (event: 'update:pageSize', pageSize: number): void
    (event: 'change', payload: { page: number; pageSize: number }): void
}>()

// 页码/每页条数做边界收敛，避免 0 或 NaN 传进组件导致页数计算异常
const safeCurrent = computed(() => {
    const value = Number(props.page)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})

const safePageSize = computed(() => {
    const value = Number(props.pageSize)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10
})

const lastPage = computed(() =>
    Math.max(1, Math.ceil(Number(props.total || 0) / safePageSize.value))
)

// 页码/每页条数变化时重建分页实例，强制内部状态以最新 props 初始化
const pagerKey = computed(() => `${safeCurrent.value}-${safePageSize.value}`)

const layouts = computed(() => {
    const list: string[] = ['prev', 'pager', 'next']
    if (props.showJumper) list.push('jumper')
    return list
})

const handleChange = (page: number): void => {
    const next = Number(page)
    if (!Number.isFinite(next) || next < 1 || next === safeCurrent.value) return
    emits('update:page', next)
    emits('change', { page: next, pageSize: safePageSize.value })
}

const handlePageSizeChange = (pageSize: number): void => {
    const next = Number(pageSize)
    if (!Number.isFinite(next) || next < 1 || next === safePageSize.value) return
    // 每页条数变化后回到第一页，否则可能停在不存在的页上
    emits('update:pageSize', next)
    emits('update:page', 1)
    emits('change', { page: 1, pageSize: next })
}

const handleSelectPageSize = (value: string | number | object): void => {
    if (props.disabled) return
    handlePageSizeChange(Number(value))
}

// 数据总量变少时把越界页码拉回最后一页，避免停在空页上
watch(lastPage, max => {
    if (safeCurrent.value > max) {
        emits('update:page', max)
        emits('change', { page: max, pageSize: safePageSize.value })
    }
})
</script>

<style lang="less" scoped>
.admin-pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    min-width: 0;
    gap: @space-m;

    // 共 N 条：自己渲染，避开 layouts='total' 文案不随数据更新的问题
    &-total {
        flex: none;
        color: var(--gray6);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    // 分页条内容超宽时允许换行，避免小屏下溢出卡片
    :deep(.yk-pagination) {
        flex-wrap: wrap;
        gap: @space-s;
        justify-content: flex-end;
    }
}

@media (max-width: 640px) {
    .admin-pager {
        justify-content: center;

        :deep(.yk-pagination) {
            justify-content: center;
        }
    }
}
</style>
