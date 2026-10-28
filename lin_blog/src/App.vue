<template>
  <!-- 头部 -->
  <HeadBar v-if="!$route.meta.hideHeader" />
  <!-- 内容 -->
  <router-view />
</template>

<script lang="ts" setup>
  import { watch } from 'vue'
  import { useRoute } from 'vue-router'
  import HeadBar from './components/bar/HeadBar.vue'
  import { useSessionStore } from './store/session'

  const route = useRoute()
  const session = useSessionStore()

  // 首屏与路由切换时兜底拉取一次权限：直接刷新页面不会经过登录流程，
  // 光靠登录时写入的快照可能与服务端最新矩阵不一致。
  watch(
    () => route.path,
    () => {
      if (localStorage.getItem('token') && !session.loaded) {
        void session.refresh()
      }
    },
    { immediate: true }
  )

  // 门户自带顶栏，需要抵消全局 #app 为后台固定顶栏预留的 64px，否则顶部出现死区。
  // 在路由切换时就切换类名，避免挂载后才修正导致的首屏跳动。
  const syncPortalFlag = (path: string) => {
    const appEl = document.getElementById('app')
    appEl?.classList.toggle('is-portal', path.startsWith('/portal'))
  }

  watch(
    () => route.path,
    (path) => syncPortalFlag(path),
    { immediate: true }
  )
</script>

<style lang="less" scoped>

</style>
