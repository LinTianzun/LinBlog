<template>
  <Transition name="pwa-update-banner">
    <div
      v-if="visible"
      class="pwa-update-banner"
      role="status"
      aria-live="polite"
    >
      <yk-text>站点已更新到新版本</yk-text>
      <yk-button type="primary" size="s" @click="refresh">立即刷新</yk-button>
      <button
        type="button"
        class="pwa-update-banner__close"
        aria-label="关闭更新提示"
        @click="visible = false"
      >
        ×
      </button>
    </div>
  </Transition>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { setupPwaUpdateListener } from '../../utils/pwa'

const visible = ref(false)
let teardown: (() => void) | null = null

onMounted(() => {
  teardown = setupPwaUpdateListener(() => {
    visible.value = true
  })
})

onBeforeUnmount(() => {
  teardown?.()
  teardown = null
})

const refresh = () => {
  window.location.reload()
}
</script>

<style lang="less" scoped>
.pwa-update-banner {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  max-width: calc(100vw - 40px);
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--bgColor1);
  color: var(--gray);
  border: 1px solid var(--pcolor3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}

.pwa-update-banner__close {
  border: 0;
  background: transparent;
  color: var(--gray6);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
}

.pwa-update-banner-enter-active,
.pwa-update-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.pwa-update-banner-enter-from,
.pwa-update-banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
