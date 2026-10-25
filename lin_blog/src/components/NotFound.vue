<template>
    <div class="not-found">
        <div class="not-found-card">
            <IconEmpty1Color class="not-found-icon" />
            <yk-title :level="1" class="not-found-code">404</yk-title>
            <yk-title :level="4" style="margin: 0 0 8px">
                页面走丢了
            </yk-title>
            <yk-text type="secondary">
                你访问的页面不存在，或者已经被移动到了别的地方。
            </yk-text>
            <yk-space size="l" class="not-found-actions">
                <yk-button type="primary" size="l" @click="goBack">
                    返回上一页
                </yk-button>
                <yk-button type="secondary" size="l" @click="goHome">
                    回到总览
                </yk-button>
            </yk-space>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goBack = () => {
    if (window.history.length > 1) {
        router.back()
        return
    }
    router.replace('/overView')
}

const goHome = () => {
    router.replace('/overView')
}
</script>

<style lang="less" scoped>
    .not-found {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - 96px);

        .not-found-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 64px 72px;
            border-radius: 16px;
            background: linear-gradient(160deg, #f2f7ff 0%, #ffffff 55%, #f4fffb 100%);
            box-shadow: 0 12px 40px rgba(31, 56, 88, 0.08);

            .not-found-icon {
                width: 160px;
                height: 160px;
                margin-bottom: 16px;
            }

            .not-found-code {
                margin: 0;
                font-size: 72px;
                line-height: 1;
                letter-spacing: 8px;
                background: linear-gradient(120deg, #2b6de8 0%, #19b89b 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
            }
        }

        .not-found-actions {
            margin-top: 32px;
        }
    }
</style>
