<template>
    <div class="index-view">
        <MenuBar />
        <!-- 菜单 -->
        <router-view></router-view>
    </div>
</template>

<script lang="ts" setup>
    import MenuBar from '../components/bar/MenuBar.vue'
</script>

<style lang="less" scoped>
    .index-view {
        /* height: 100vh; */
        padding: 32px 32px 32px 200px;
    }
</style>