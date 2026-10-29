<template>
    <button type="button" class="portal-share" :title="shareLabel" @click="share">
        <IconShareOutline />
        {{ shareLabel }}
    </button>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance } from 'vue'
import { IconShareOutline } from '@yike-design/ui/es/components/svg-icon'

const props = withDefaults(defineProps<{
    url: string
    title?: string
    text?: string
}>(), {
    title: '',
    text: ''
})

interface NativeShareNavigator {
    share?: (data: ShareData) => Promise<void>
}

function nativeShareNavigator(): NativeShareNavigator | null {
    return typeof navigator === 'undefined'
        ? null
        : navigator as unknown as NativeShareNavigator
}

const proxy = getCurrentInstance()?.proxy
const shareLabel = computed(() => (nativeShareNavigator()?.share ? '分享' : '复制链接'))

const share = async (): Promise<void> => {
    if (!props.url) return

    try {
        const nativeNavigator = nativeShareNavigator()
        if (nativeNavigator?.share) {
            await nativeNavigator.share({
                title: props.title || document.title,
                text: props.text || undefined,
                url: props.url
            })
            return
        }

        await navigator.clipboard.writeText(props.url)
        proxy?.$message?.({ type: 'success', message: '链接已复制' })
    } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return

        try {
            window.prompt('复制链接', props.url)
        } catch {
            proxy?.$message?.({ type: 'error', message: '分享失败，请手动复制地址栏链接' })
        }
    }
}
</script>

<style lang="less" scoped>
.portal-share {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-tertiary);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    :deep(svg) {
        width: 15px;
        height: 15px;
    }

    &:hover,
    &:focus-visible {
        border-color: var(--portal-accent);
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        outline: none;
    }
}
</style>
