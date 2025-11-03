<template>
    <div class="container" :class="{ active: isRegister }">
        <!-- 登录表单 -->
        <transition name="form">
            <div class="form-box login" v-show="!isRegister">
                <form action="">
                    <h1>登录</h1>
                    <div class="input-box">
                        <input type="text" v-model="user.name" placeholder="用户名" required />
                        <i class="bx bxs-user"></i>
                    </div>
                    <div class="input-box">
                        <input type="password" v-model="user.pwd" placeholder="密码" required />
                        <i class="bx bxs-lock-alt"></i>
                    </div>
                    <div class="forgot-link">
                        <a>忘记密码?</a>
                    </div>
                    <!-- <button type="submit" @click="" class="btn">登录</button> -->
                    <yk-button @click="login" class="btn" long>登录</yk-button>
                    <p style="letter-spacing: 1px;">或者通过其它方式登录</p>
                    <div class="social-icons">
                        <a><i class="bx bxl-google"></i></a>
                        <a><i class="bx bxl-facebook"></i></a>
                        <a><i class="bx bxl-github"></i></a>
                        <a><i class="bx bxl-linkedin"></i></a>
                    </div>
                </form>
            </div>
        </transition>

        <!-- 注册表单 -->
        <transition name="form">
            <div class="form-box register" v-show="isRegister">
                <form action="">
                    <h1>注册</h1>
                    <div class="input-box">
                        <input type="text" placeholder="用户名" required />
                        <i class="bx bxs-user"></i>
                    </div>
                    <div class="input-box">
                        <input type="email" placeholder="邮箱" required />
                        <i class="bx bxs-envelope"></i>
                    </div>
                    <div class="input-box">
                        <input type="password" placeholder="密码" required />
                        <i class="bx bxs-lock-alt"></i>
                    </div>
                    <!-- <button type="submit" class="btn">注册</button> -->
                    <yk-button class="btn">注册</yk-button>
                    <p style="letter-spacing: 1px;">或者通过其它方式登录</p>
                    <div class="social-icons">
                        <a><i class="bx bxl-google"></i></a>
                        <a><i class="bx bxl-facebook"></i></a>
                        <a><i class="bx bxl-github"></i></a>
                        <a><i class="bx bxl-linkedin"></i></a>
                    </div>
                </form>
            </div>
        </transition>

        <!-- 切换面板 -->
        <div class="toggle-box">
            <transition name="toggle-left">
                <div class="toggle-panel toggle-left" v-show="!isRegister">
                    <h1>您好，欢迎光临!</h1>
                    <p>没有账户?</p>
                    <button class="btn register-btn" @click="toggleForm()">注册</button>
                </div>
            </transition>
            <transition name="toggle-right">
                <div class="toggle-panel toggle-right" v-show="isRegister">
                    <h1>欢迎回来!</h1>
                    <p>已有账户?</p>
                    <button class="btn login-btn" @click="toggleForm()">登录</button>
                </div>
            </transition>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { ref, getCurrentInstance } from 'vue'
    import { useRouter } from 'vue-router'

    const router = useRouter();

    const proxy = getCurrentInstance()?.proxy

    const isRegister = ref(false)// 控制显示注册还是登录表单

    const toggleForm = () => {
        isRegister.value = !isRegister.value // 切换表单状态
    }

    //  用户
    const user = ref({
        name: '',
        pwd: ''
    })

    const login = () => {
        if (user.value.name && user.value.pwd) {
            // console.log(user)
            router.push('/overView')
        } else {
            proxy.$message({ type: 'warning', message: '输入不完整' })

        }
    }

</script>


<style scoped>
    /* 基础样式 */
    /* * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    } */

    .container {
        position: relative;
        width: 850px;
        height: 550px;
        background: #fff;
        border-radius: 30px;
        box-shadow: 0 0 30px rgba(0, 0, 0, 0.2);
        overflow: hidden;
    }

    /* 表单样式 */
    .form-box {
        position: absolute;
        right: 0;
        width: 50%;
        height: 100%;
        background: #fff;
        display: flex;
        align-items: center;
        color: #333;
        text-align: center;
        padding: 40px;
        z-index: 1;
    }

    .container.active .form-box {
        right: 50%;
    }

    form {
        width: 100%;
    }

    h1 {
        font-size: 36px;
        margin: -10px 0;
    }

    .input-box {
        position: relative;
        margin: 30px 0;
    }

    .input-box input {
        width: 100%;
        padding: 13px 50px 13px 20px;
        background: #eee;
        border-radius: 8px;
        border: none;
        outline: none;
        font-size: 16px;
        color: #333;
        font-weight: 500;
    }

    .input-box input::placeholder {
        color: #888;
        font-weight: 400;
    }

    .input-box i {
        position: absolute;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 20px;
        color: #888;
    }

    .forgot-link {
        margin: -15px 0 15px;
    }

    .forgot-link a {
        font-size: 14.5px;
        color: #333;
        text-decoration: none;
    }

    .btn {
        width: 100%;
        height: 48px;
        background: #7494ec;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        border: none;
        cursor: pointer;
        font-size: 16px;
        color: #fff;
        font-weight: 600;
        letter-spacing: 3px;
    }

    p {
        font-size: 14.5px;
        margin: 15px 0;
    }

    .social-icons {
        display: flex;
        justify-content: center;
    }

    .social-icons a {
        display: inline-flex;
        padding: 10px;
        border: 2px solid #ccc;
        border-radius: 8px;
        font-size: 24px;
        color: #333;
        text-decoration: none;
        margin: 0 8px;
    }

    /* 切换面板样式 */
    .toggle-box {
        position: absolute;
        width: 100%;
        height: 100%;
    }

    .toggle-box::before {
        content: "";
        position: absolute;
        left: -250%;
        width: 300%;
        height: 100%;
        background: #7494ec;
        border-radius: 150px;
        z-index: 2;
        transition: 1.8s ease-in-out;
    }

    .container.active .toggle-box::before {
        left: 50%;
    }

    .toggle-panel {
        position: absolute;
        width: 50%;
        height: 100%;
        color: #fff;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2;
        transition: all 0.6s ease-in-out;
    }

    .toggle-panel.toggle-left {
        left: 0;
        transition-delay: 1.2s;
    }

    .container.active .toggle-panel.toggle-left {
        left: -50%;
        transition-delay: 0.6s;
    }

    .toggle-panel.toggle-right {
        right: -50%;
        transition-delay: 0.6s;
    }

    .container.active .toggle-panel.toggle-right {
        right: 0;
        transition-delay: 1.2s;
    }

    .toggle-panel p {
        margin-bottom: 20px;
    }

    .toggle-panel .btn {
        width: 160px;
        height: 46px;
        background: transparent;
        border: 2px solid #fff;
        box-shadow: none;
    }

    /* 动画效果 */
    .form-login-enter-active,
    .form-login-leave-active,
    .form-register-enter-active,
    .form-register-leave-active {
        transition: all 0.6s ease-in-out 1.2s;
    }

    .form-login-enter-from,
    .form-login-leave-to {
        right: 50%;
        visibility: hidden;
    }

    .form-register-enter-from,
    .form-register-leave-to {
        right: 0;
        visibility: hidden;
    }

    .toggle-left-enter-active {
        transition: all 0.6s ease-in-out 1.2s;
    }

    .toggle-left-leave-active {
        transition: all 0.6s ease-in-out 0.6s;
    }

    .toggle-left-enter-from,
    .toggle-left-leave-to {
        left: -50%;
    }

    .toggle-right-enter-active {
        transition: all 0.6s ease-in-out 0.6s;
    }

    .toggle-right-leave-active {
        transition: all 0.6s ease-in-out 1.2s;
    }

    .toggle-right-enter-from,
    .toggle-right-leave-to {
        right: -50%;
    }


    /* 响应式设计 */
    @media screen and (max-width: 650px) {
        .container {
            height: 100vh;
            margin: 40px 20px;
        }

        .form-box {
            bottom: 0;
            width: 100%;
            height: 70%;
        }

        .container.active .form-box {
            right: 0;
            bottom: 30%;
        }

        .toggle-box::before {
            left: 0;
            top: -270%;
            width: 100%;
            height: 300%;
            border-radius: 20vw;
        }

        .container.active .toggle-box::before {
            left: 0;
            top: 70%;
        }

        .toggle-panel {
            width: 100%;
            height: 30%;
        }

        .toggle-panel.toggle-left {
            top: 0;
        }

        .container.active .toggle-panel.toggle-left {
            left: 0;
            top: -30%;
        }

        .toggle-panel.toggle-right {
            right: 0;
            bottom: -30%;
        }

        .container.active .toggle-panel.toggle-right {
            bottom: 0;
        }
    }

    @media screen and (max-width: 400px) {
        .form-box {
            padding: 20px;
        }

        .toggle-panel {
            font-size: 30px;
        }
    }
</style>