<template>
    <yk-space dir="vertical" size="l" class="admin-page gallery-page">
        <top-title name="摄影图库" description="作品分组、封面与发布状态" :is-search="true" @search="handleSearch">
        </top-title>
        <subset classify="image" @nowSubset="handleSubset" />
        <gallery :serch-term="keyword" :state="galleryState" :subset-id="subsetId"
            :uncategorized="uncategorized" />
    </yk-space>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import type { ArticleState } from '../api/article'
import TopTitle from '../components/bar/TopTitle.vue'
import subset from '../components/subset/subset.vue'
import gallery from '../components/gallery/gallery.vue'

type SubsetPayload = {
    id: string | number
    type: 'all' | 'state' | 'exclude' | 'subset'
}

const keyword = ref('')
const galleryState = ref<ArticleState | ''>('')
const subsetId = ref(-1)
const uncategorized = ref(false)

const handleSearch = (value: unknown): void => {
    keyword.value = String(value ?? '').trim()
}

const handleSubset = (payload: SubsetPayload): void => {
    if (payload.type === 'state') {
        galleryState.value = Number(payload.id) === 0 ? 'published' : 'draft'
        subsetId.value = -1
        uncategorized.value = false
        return
    }

    galleryState.value = ''
    uncategorized.value = payload.type === 'exclude'
    subsetId.value = payload.type === 'subset' ? Number(payload.id) : -1
}
</script>

<style lang="less" scoped>

</style>
