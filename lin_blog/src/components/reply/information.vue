<template>
    <yk-drawer placement="right" :show="active" @close="closes" :title="'私信 ' + count">

        <div v-if="loading" class="information-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载私信...</yk-text>
        </div>

        <yk-empty v-else-if="messages.length === 0" description="暂无私信" />

        <yk-space v-else dir="vertical">
            <reply v-for="item in messages" :key="item.id" :isComment="false" :content="formatMessage(item)"
                @delete="removeMessage" />
        </yk-space>

        <template #footer>
            <yk-pagination :current="page" :page-size="pageSize" :total="count" @change="changePage" simple />
        </template>
    </yk-drawer>
</template>

<script lang="ts" setup>
import { toRefs, ref, onMounted, watch, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import type { InformationProps } from './reply.ts'
import type { ReplyDat } from '../../utils/interface'
import reply from './reply.vue'
import {
    deleteMessage as deleteMessageApi,
    getInboxMessages,
    getRequestErrorMessage,
    type MessageItem,
} from '../../api/message.ts'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type InformationInstance = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const props = withDefaults(defineProps<InformationProps>(), {
    pageSize: 8,
    active: true
})

const emits = defineEmits<{
    (e: 'close', value: boolean): void
}>()

const { active } = toRefs(props)

const closes = () => {
    emits('close', false)
}

const proxy = getCurrentInstance()?.proxy as InformationInstance | null | undefined

// 私信总数
const count = ref(0)
const page = ref(1)
const loading = ref(false)
const messages = ref<MessageItem[]>([])

// 获取收件箱（私信）
const fetchMessages = async (): Promise<void> => {
    loading.value = true

    try {
        const result = await getInboxMessages({
            page: page.value,
            pageSize: props.pageSize,
            type: 'private',
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '私信加载失败')
        }

        messages.value = result.data.list
        count.value = result.data.total

        if (messages.value.length === 0 && page.value > 1) {
            page.value = 1
            await fetchMessages()
        }
    } catch (error) {
        messages.value = []
        count.value = 0
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '私信加载失败，请稍后重试') })
    } finally {
        loading.value = false
    }
}

// 适配 reply.vue 的展示结构
const formatMessage = (item: MessageItem): ReplyDat => ({
    id: item.id,
    user: {
        id: item.senderId !== null ? String(item.senderId) : '',
        name: item.senderName || '未知用户',
        imgurl: item.senderAvatar || '',
    },
    comment: item.content,
    moment: formatMoment(item.createdAt),
    complaint: 0,
})

const formatMoment = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 分页
const changePage = (nextPage: number) => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchMessages()
}

// 删除私信
const removeMessage = async (id: string | number) => {
    try {
        const result = await deleteMessageApi(Number(id))
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        proxy?.$message?.({ type: 'primary', message: '删除成功' })

        if (messages.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await fetchMessages()
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '删除失败，请稍后重试') })
    }
}

// 每次打开抽屉时刷新
watch(active, value => {
    if (value) {
        page.value = 1
        void fetchMessages()
    }
})

onMounted(() => {
    if (active.value) {
        void fetchMessages()
    }
})
</script>

<style lang="less" scoped>
.information-state {
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: @space-m;
}
</style>
