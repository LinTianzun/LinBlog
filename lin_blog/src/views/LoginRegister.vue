<template>
    <div class="loginRegister">
        <router-link to="/portal" class="portal-link">先逛逛博客门户</router-link>
        <LoginRegister />
    </div>
</template>

<script lang="ts" setup>
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

    .portal-link {
        position: fixed;
        top: 20px;
        right: 24px;
        z-index: 101;
        padding: 6px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.7);
        color: #2b5aed;
        font-size: 14px;
        text-decoration: none;
        transition: all 0.2s ease;

        &:hover {
            background: #fff;
            box-shadow: 0 4px 14px rgba(43, 90, 237, 0.2);
        }
    }
</style>
