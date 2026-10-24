<template>
    <yk-space dir="vertical" size="l">
        <top-title name="博客文章" :is-search="true" style="margin-bottom: 8px;" @search="handleSearch">
        </top-title>
        <subset @nowSubset="handleSubset" />
        <yk-space style="width: 100%;">
            <artcle :serch-term="keyword" :state="articleState" :subset-id="subsetId"
                :uncategorized="uncategorized" :label-name="labelName" />
            <labelV @nowSubset="handleSubset"></labelV>
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import type { ArticleState } from '../api/article'
import { useLabelStore } from '../store/label'
import TopTitle from '../components/bar/TopTitle.vue'
import subset from '../components/subset/subset.vue'
import labelV from '../components/label/label.vue'
import artcle from '../components/article/artcle.vue'

type SubsetPayload = {
    id: string | number
    type: 'all' | 'state' | 'exclude' | 'subset' | 'label'
}

const keyword = ref('')
const articleState = ref<ArticleState | ''>('')
const subsetId = ref(-1)
const uncategorized = ref(false)
const labelName = ref('')
const labelStore = useLabelStore()

const handleSearch = (value: unknown): void => {
    keyword.value = String(value ?? '').trim()
}

const handleSubset = (payload: SubsetPayload): void => {
    if (payload.type === 'state') {
        // Mock 分组中 0 表示已发布、1 表示未发布。
        articleState.value = Number(payload.id) === 0 ? 'published' : 'draft'
        subsetId.value = -1
        uncategorized.value = false
        labelName.value = ''
        return
    }

    articleState.value = ''
    uncategorized.value = payload.type === 'exclude'
    subsetId.value = payload.type === 'subset' ? Number(payload.id) : -1
    labelName.value = payload.type === 'label'
        ? String(labelStore.labelName(payload.id) || '')
        : ''
}
</script>

<style lang="less" scoped>

</style>
