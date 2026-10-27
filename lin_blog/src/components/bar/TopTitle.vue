<template>
    <header class="top-title">
        <div class="top-title-heading">
            <span class="top-title-mark" aria-hidden="true" />
            <div class="top-title-copy">
                <h1 class="top-title-name">{{ props.name }}</h1>
                <p class="top-title-meta">{{ props.description || '林知雨博客 · 内容与运营工作台' }}</p>
            </div>
        </div>

        <div class="top-title-actions">
            <slot name="custom" />
            <yk-space size="s" v-if="isSearch">
                <yk-button type="secondary" v-show="SearchData" @click="cancelSearch">取消搜索</yk-button>
                <yk-input-search :key="searchInputKey" placeholder="搜索标题、用户或关键词"
                    @search="search">
                    <template #suffix>
                        <yk-button type="secondary" aria-label="搜索">
                            <IconSearchOutline />
                        </yk-button>
                    </template>
                </yk-input-search>
            </yk-space>
        </div>
    </header>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'

    const SearchData = ref('')
    const searchInputKey = ref(0)



    const props = withDefaults(defineProps < {
        name: string,
        isSearch: boolean,
        description?: string,
    } > (), {
        name: '系统总览',
        isSearch: true,
        description: '',
    })
    // console.log(props)

    const emit = defineEmits(['search'])

    //  搜索事件
    const search = (value?: unknown) => {
        const keyword = String(value ?? '').trim()
        SearchData.value = keyword
        emit('search', keyword)
    }

    //  取消搜索
    const cancelSearch = () => {
        emit('search', '')
        SearchData.value = ''
        searchInputKey.value += 1
    }

</script>

<style lang="less" scoped>
    .top-title {
        display: flex;
        width: 100%;
        justify-content: space-between;
        align-items: center;
        box-sizing: border-box;
    }
</style>
