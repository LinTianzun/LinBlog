<template>
    <div class="loginRegister">
        <LoginRegister />
    </div>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import LoginRegister from '../components/loginRegister/LoginRegister.vue';

</script>

<style lang="less" scoped>
    .loginRegister {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(90deg, #e2e2e2, #c9d6ff);
        z-index: 100;
    }
</style>