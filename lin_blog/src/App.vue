<template>
  <!-- 头部 -->
  <HeadBar v-if="!$route.meta.hideHeader" />
  <!-- 内容 -->
  <router-view />
</template>

<script lang="ts" setup>
  import HeadBar from './components/bar/HeadBar.vue'

</script>

<style lang="less" scoped>

</style>