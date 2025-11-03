<template>
    <div class="top-title">
        <yk-title :level="3" style="margin: 0;line-height: 36px;"> {{props.name}} </yk-title>

        <slot name="custom" />
        <yk-space size="s" v-if="isSearch">
            <yk-button type="secondary" v-show="SearchData" @click="cancelSearch">取消搜索</yk-button>
            <yk-input-search placeholder="请输入" style="width: 320px" v-model="SearchData" @search="search">
                <template #suffix>
                    <yk-button type="secondary">
                        <IconSearchOutline />
                    </yk-button>
                </template>
            </yk-input-search>
        </yk-space>
    </div>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'

    const SearchData = ref()



    const props = withDefaults(defineProps < {
        name: string,
        isSearch: boolean,
    } > (), {
        name: '总览',
        isSearch: true,
    })
    // console.log(props)

    const emit = defineEmits(['search'])

    //  搜索事件
    const search = () => {
        // console.log('search', SearchData.value)
        emit('search', SearchData.value)
    }

    //  取消搜索
    const cancelSearch = () => {
        emit('search', '')
        SearchData.value = ''
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