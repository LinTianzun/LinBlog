<template>
    <div class="top-title">
        <yk-title :level="3" style="margin: 0;line-height: 36px;"> {{props.name}} </yk-title>

        <slot name="custom" />
        <yk-space size="s" v-if="isSearch">
            <yk-button type="secondary" v-show="SearchData" @click="cancelSearch">取消搜索</yk-button>
            <yk-input-search :key="searchInputKey" placeholder="请输入关键词" style="width: 320px"
                @search="search">
                <template #suffix>
                    <yk-button type="secondary" aria-label="搜索">
                        <IconSearchOutline />
                    </yk-button>
                </template>
            </yk-input-search>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'

    const SearchData = ref('')
    const searchInputKey = ref(0)



    const props = withDefaults(defineProps < {
        name: string,
        isSearch: boolean,
    } > (), {
        name: '系统总览',
        isSearch: true,
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
    }
</style>
