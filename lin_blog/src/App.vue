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

  const route = useRoute()

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
