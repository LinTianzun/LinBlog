<template>
    <div v-if="failed" class="error-boundary">
        <div class="error-boundary-card">
            <p class="error-boundary-badge">RENDER FAILED</p>
            <yk-title :level="4" class="error-boundary-title">
                这个页面没能正常渲染
            </yk-title>
            <yk-text type="secondary">
                页面内部出错了。可以先重试渲染；若反复出现，请记下下面的提示信息。
            </yk-text>

            <details v-if="detail" class="error-boundary-detail">
                <summary>查看错误详情</summary>
                <pre>{{ detail }}</pre>
            </details>

            <yk-space size="l" class="error-boundary-actions">
                <yk-button v-if="retryable" type="primary" size="l" @click="retry">
                    重试
                </yk-button>
                <yk-button type="secondary" size="l" @click="reload">
                    刷新页面
                </yk-button>
            </yk-space>
        </div>
    </div>
    <slot v-else />
</template>

<script lang="ts" setup>
import { onErrorCaptured, ref } from 'vue'
import { formatErrorDetail, isRetryableError } from '../../utils/errorBoundary'

// 捕获子组件树里的渲染/生命周期异常，用可恢复的卡片替换白屏。
// 只兜底渲染错误：接口失败等异步异常仍由各自的 try/catch 处理。
const failed = ref(false)
const detail = ref('')
const retryable = ref(true)

onErrorCaptured((err) => {
    failed.value = true
    detail.value = formatErrorDetail(err)
    retryable.value = isRetryableError(err)
    // 返回 false 阻止继续向上传播，避免同时触发多层错误提示
    return false
})

const retry = () => {
    failed.value = false
    detail.value = ''
}

const reload = () => {
    window.location.reload()
}
</script>

<style lang="less" scoped>
    .error-boundary {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - 96px);
        padding: @space-xl;

        .error-boundary-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            max-width: 560px;
            padding: 40px 44px;
            border-radius: 16px;
            background: linear-gradient(160deg, #fff6f4 0%, #ffffff 55%, #f2f7ff 100%);
            box-shadow: 0 12px 40px rgba(31, 56, 88, 0.08);
        }

        .error-boundary-badge {
            margin: 0 0 12px;
            font-size: 11px;
            letter-spacing: 3px;
            color: var(--gray5);
        }

        .error-boundary-title {
            margin: 0 0 8px;
        }

        .error-boundary-detail {
            width: 100%;
            margin-top: @space-l;
            text-align: left;

            summary {
                cursor: pointer;
                font-size: 13px;
                color: var(--gray6);
            }

            pre {
                max-height: 180px;
                overflow: auto;
                margin: 8px 0 0;
                padding: 12px;
                border-radius: @radius-m;
                background: var(--gray1);
                font-size: 12px;
                line-height: 1.5;
                white-space: pre-wrap;
                word-break: break-all;
            }
        }

        .error-boundary-actions {
            margin-top: @space-xl;
        }
    }

    :global([data-theme='dark']) & {
        .error-boundary-card {
            background: linear-gradient(160deg, #2c2530 0%, #1e2025 55%, #232c40 100%);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }
    }
</style>
