<template>
    <div class="index-view">
        <MenuBar />
        <main class="admin-workspace">
            <router-view></router-view>
        </main>
    </div>
</template>

<script lang="ts" setup>
    import MenuBar from '../components/bar/MenuBar.vue'
</script>

<style lang="less" scoped>
    .index-view {
        position: relative;
        box-sizing: border-box;
        min-height: calc(100vh - 64px);
    }
</style>
