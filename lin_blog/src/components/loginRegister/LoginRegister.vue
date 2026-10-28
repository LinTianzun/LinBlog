<template>
    <div class="container" :class="{ active: isRegister }">
        <!-- 登录表单 -->
        <transition name="form">
            <div class="form-box login" v-show="!isRegister">
                <form @submit.prevent="login">
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
                        <button type="button" @click="openForgotPassword">忘记密码?</button>
                    </div>
                    <!-- <button type="submit" @click="" class="btn">登录</button> -->
                    <yk-button type="submit" class="btn" long>登录</yk-button>
                    <p style="letter-spacing: 1px">或者通过其它方式登录</p>
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
                <form @submit.prevent="register">
                    <h1>注册</h1>
                    <div class="input-box">
                        <input type="text" v-model.trim="registerUser.username" placeholder="用户名" required />
                        <i class="bx bxs-user"></i>
                    </div>
                    <div class="input-box">
                        <input type="email" v-model.trim="registerUser.mail" placeholder="邮箱" required />
                        <i class="bx bxs-envelope"></i>
                    </div>
                    <div class="input-box">
                        <input type="password" v-model="registerUser.password" placeholder="密码（至少 6 位）" minlength="6"
                            required />
                        <i class="bx bxs-lock-alt"></i>
                    </div>
                    <yk-button type="submit" class="btn" long>注册</yk-button>
                    <p style="letter-spacing: 1px">或者通过其它方式注册</p>
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

        <div v-if="forgotVisible" class="forgot-modal" @click.self="forgotVisible = false">
            <form class="forgot-card" @submit.prevent="sendResetMail">
                <button type="button" class="forgot-close" aria-label="关闭" @click="forgotVisible = false">×</button>
                <p class="forgot-kicker">PASSWORD RECOVERY</p>
                <h2>找回密码</h2>
                <p class="forgot-copy">
                    输入注册邮箱。如果账号存在，我们会发送一封 30 分钟内有效的重置邮件。
                </p>
                <label for="forgot-mail">注册邮箱</label>
                <input id="forgot-mail" v-model.trim="forgotMail" type="email" autocomplete="email"
                    placeholder="name@example.com" required />
                <p v-if="forgotMessage" class="forgot-message">{{ forgotMessage }}</p>
                <button class="forgot-submit" type="submit" :disabled="forgotSubmitting">
                    {{ forgotSubmitting ? '正在发送...' : '发送重置邮件' }}
                </button>
            </form>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, getCurrentInstance } from "vue";
import { useRouter } from "vue-router";
import { requestPasswordReset } from "../../api/user";

const router = useRouter();

const proxy = getCurrentInstance()?.proxy;

const isRegister = ref(false); // 控制显示注册还是登录表单

const toggleForm = () => {
    isRegister.value = !isRegister.value; // 切换表单状态
};

//  用户
const user = ref({
    name: "",
    pwd: "",
});

const registerUser = ref({
    username: "",
    mail: "",
    password: "",
});

const forgotVisible = ref(false);
const forgotMail = ref("");
const forgotSubmitting = ref(false);
const forgotMessage = ref("");

const openForgotPassword = () => {
    forgotMail.value = user.value.name.includes("@") ? user.value.name.trim() : "";
    forgotMessage.value = "";
    forgotVisible.value = true;
};

const sendResetMail = async () => {
    forgotMessage.value = "";
    if (!forgotMail.value) {
        forgotMessage.value = "请输入注册邮箱";
        return;
    }

    forgotSubmitting.value = true;
    try {
        const result = await requestPasswordReset(forgotMail.value);
        forgotMessage.value = result.message || "如果该邮箱已注册，重置邮件将很快送达";
    } catch (error: any) {
        forgotMessage.value = error.response?.data?.message || "发送失败，请稍后重试";
    } finally {
        forgotSubmitting.value = false;
    }
};

//  登录
const login = async () => {

    const account = user.value.name.trim();
    const password = user.value.pwd;

    if (!account || !password) {
        proxy?.$message({
            type: "warning",
            message: "请输入账号和密码",
        });
        return;
    }

    try {
        const response = await fetch("/api/user/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                account,
                password,
            }),
        });

        const result = await response.json();

        if (!response.ok || result.code !== 200) {
            proxy?.$message({
                type: "error",
                message: result.message || "登录失败，请稍后重试",
            });
            return;
        }

        // 保存登录令牌，供后续需要身份验证的接口使用
        localStorage.setItem("token", result.data.token);

        // 保存用户信息，不保存密码
        localStorage.setItem("userInfo", JSON.stringify(result.data.userInfo));

        proxy?.$message({
            type: "success",
            message: result.message || "登录成功",
        });

        await router.push("/overView");
    } catch (error) {
        console.error("登录请求失败：", error);

        proxy?.$message({
            type: "error",
            message: "无法连接服务器，请检查后端是否启动",
        });
    }
}

//  注册

const register = async () => {
    const username = registerUser.value.username.trim()
    const mail = registerUser.value.mail.trim()
    const password = registerUser.value.password

    if (!username || !mail || !password) {
        proxy?.$message({
            type: 'warning',
            message: '请填写完整的注册信息'
        })
        return
    }

    if (password.length < 6) {
        proxy?.$message({
            type: 'warning',
            message: '密码至少需要 6 位'
        })
        return
    }

    try {
        const response = await fetch('/api/user/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                mail,
                password
            })
        })

        const result = await response.json()

        if (!response.ok || result.code !== 200) {
            proxy?.$message({
                type: 'error',
                message: result.message || '注册失败，请稍后重试'
            })
            return
        }

        proxy?.$message({
            type: 'success',
            message: result.message || '注册成功，请登录'
        })

        registerUser.value = {
            username: '',
            mail: '',
            password: ''
        }

        // 注册成功后切换到登录界面
        isRegister.value = false

        // 方便用户使用刚注册的用户名登录
        user.value.name = mail
        user.value.pwd = ''
    } catch (error) {
        console.error('注册请求失败：', error)

        proxy?.$message({
            type: 'error',
            message: '无法连接服务器，请检查后端是否启动'
        })
    }
}


// const login = () => {
//     if (user.value.name && user.value.pwd) {
//         // console.log(user)
//         router.push('/overView')
//     } else {
//         proxy.$message({ type: 'warning', message: '输入不完整' })

//     }
// }
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
    text-align: right;
}

.forgot-link button {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 14.5px;
    color: #333;
    text-decoration: none;
}

.forgot-link button:hover {
    color: #2b5aed;
}

.forgot-modal {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(18, 29, 51, 0.48);
    backdrop-filter: blur(6px);
}

.forgot-card {
    position: relative;
    box-sizing: border-box;
    width: min(100%, 390px);
    padding: 30px;
    border-radius: 22px;
    background: #fff;
    box-shadow: 0 24px 70px rgba(15, 28, 54, 0.24);
    text-align: left;
}

.forgot-kicker {
    margin: 0 0 8px;
    color: #2b5aed;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
}

.forgot-card h2 {
    margin: 0 0 12px;
    color: #172033;
    font: 700 28px/1.2 Georgia, serif;
}

.forgot-copy {
    margin: 0 0 20px;
    color: #687386;
    font-size: 13px;
    line-height: 1.65;
}

.forgot-card label {
    display: block;
    margin-bottom: 8px;
    color: #172033;
    font-size: 13px;
    font-weight: 700;
}

.forgot-card input {
    box-sizing: border-box;
    width: 100%;
    height: 46px;
    padding: 0 13px;
    border: 1px solid #d8deeb;
    border-radius: 10px;
    outline: none;
    background: #f8faff;
    color: #172033;
    font-size: 15px;
}

.forgot-card input:focus {
    border-color: #2b5aed;
    box-shadow: 0 0 0 3px rgba(43, 90, 237, 0.12);
}

.forgot-submit {
    width: 100%;
    height: 46px;
    margin-top: 16px;
    border: 0;
    border-radius: 10px;
    background: #2b5aed;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
}

.forgot-submit:disabled {
    cursor: wait;
    opacity: 0.65;
}

.forgot-message {
    margin: 12px 0 0;
    color: #4f5d75;
    font-size: 12px;
    line-height: 1.6;
}

.forgot-close {
    position: absolute;
    top: 10px;
    right: 12px;
    border: 0;
    background: transparent;
    color: #687386;
    cursor: pointer;
    font-size: 25px;
    line-height: 1;
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
