<template>
    <div class="reset-page">
        <router-link to="/loginRegister" class="portal-link">返回登录</router-link>

        <section class="reset-card" aria-live="polite">
            <div class="reset-mark" aria-hidden="true">L</div>
            <p class="reset-eyebrow">LINBLOG ACCOUNT</p>
            <h1>{{ heading }}</h1>

            <div v-if="loading" class="reset-state">
                <span class="reset-spinner" aria-hidden="true"></span>
                正在校验重置链接...
            </div>

            <div v-else-if="state === 'invalid'" class="reset-state reset-state-error">
                <p>{{ errorMessage }}</p>
                <router-link class="reset-primary" to="/loginRegister">重新申请</router-link>
            </div>

            <div v-else-if="state === 'success'" class="reset-state">
                <p>{{ successMessage }}</p>
                <router-link class="reset-primary" to="/loginRegister">去登录</router-link>
            </div>

            <form v-else class="reset-form" @submit.prevent="submit">
                <p class="reset-welcome">
                    {{ username ? `${username}，你好。` : '你好。' }}
                    请设置一个至少 8 位的新密码。
                </p>

                <label for="reset-password">新密码</label>
                <div class="reset-input-wrap">
                    <input id="reset-password" v-model="newPassword" :type="showPassword ? 'text' : 'password'"
                        autocomplete="new-password" maxlength="72" placeholder="至少 8 位" required />
                    <button type="button" class="reset-eye" :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                        @click="showPassword = !showPassword">
                        {{ showPassword ? '隐藏' : '显示' }}
                    </button>
                </div>

                <label for="reset-confirm">确认新密码</label>
                <input id="reset-confirm" v-model="confirmPassword" :type="showPassword ? 'text' : 'password'"
                    autocomplete="new-password" maxlength="72" placeholder="再次输入新密码" required />

                <p v-if="errorMessage" class="reset-error">{{ errorMessage }}</p>

                <button class="reset-primary" type="submit" :disabled="submitting">
                    {{ submitting ? '正在重置...' : '重置密码' }}
                </button>
                <p class="reset-hint">重置成功后，其他设备上的登录状态会自动失效。</p>
            </form>
        </section>
    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resetPassword, validatePasswordResetToken } from '../api/user'

const route = useRoute()
const router = useRouter()

const token = typeof route.query.token === 'string' ? route.query.token : ''
const loading = ref(true)
const submitting = ref(false)
const state = ref<'form' | 'invalid' | 'success'>('form')
const username = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const heading = computed(() => {
    if (state.value === 'success') return '密码已重置'
    if (state.value === 'invalid') return '重置链接不可用'
    return '设置新密码'
})

function resetErrorMessage(error: any): string {
    const serverMessage = error.response?.data?.message
    if (serverMessage) return serverMessage
    if (error.response?.status === 404) return '重置链接无效或已过期，请重新申请。'
    if (error.response?.status === 429) return '操作过于频繁，请稍后再试。'
    if (!error.response) return '无法连接服务器，请稍后重试。'
    return '重置链接无效或已过期，请重新申请。'
}

onMounted(async () => {
    if (!token) {
        loading.value = false
        state.value = 'invalid'
        errorMessage.value = '重置链接不完整，请重新申请。'
        return
    }

    try {
        const result = await validatePasswordResetToken(token)
        if (result.code !== 200) {
            throw new Error(result.message || '重置链接无效')
        }
        username.value = result.data?.username || ''
    } catch (error: any) {
        state.value = 'invalid'
        errorMessage.value = resetErrorMessage(error)
    } finally {
        loading.value = false
    }
})

const submit = async () => {
    errorMessage.value = ''

    if (newPassword.value.length < 8) {
        errorMessage.value = '新密码至少需要 8 位'
        return
    }
    if (newPassword.value.length > 72) {
        errorMessage.value = '新密码不能超过 72 位'
        return
    }
    if (newPassword.value !== confirmPassword.value) {
        errorMessage.value = '两次输入的密码不一致'
        return
    }

    submitting.value = true
    try {
        const result = await resetPassword(token, newPassword.value)
        if (result.code !== 200) {
            throw new Error(result.message || '密码重置失败')
        }
        successMessage.value = result.message || '密码已重置，请使用新密码登录'
        state.value = 'success'
        localStorage.removeItem('token')
        localStorage.removeItem('userInfo')
        window.setTimeout(() => router.push('/loginRegister'), 1600)
    } catch (error: any) {
        errorMessage.value = resetErrorMessage(error)
    } finally {
        submitting.value = false
    }
}
</script>

<style scoped>
.reset-page {
    --reset-ink: #172033;
    --reset-muted: #687386;
    --reset-accent: #2b5aed;
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    overflow: auto;
    padding: 32px 20px;
    color: var(--reset-ink);
    background:
        radial-gradient(circle at 18% 18%, rgba(94, 167, 255, 0.32), transparent 30rem),
        radial-gradient(circle at 84% 76%, rgba(255, 181, 125, 0.28), transparent 28rem),
        linear-gradient(145deg, #f5f8ff 0%, #e9eef9 100%);
}

.portal-link {
    position: fixed;
    top: 20px;
    right: 24px;
    z-index: 2;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.78);
    color: var(--reset-accent);
    font-size: 14px;
    text-decoration: none;
}

.reset-card {
    position: relative;
    box-sizing: border-box;
    width: min(100%, 460px);
    padding: 38px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 28px 80px rgba(35, 55, 92, 0.16);
    backdrop-filter: blur(18px);
}

.reset-mark {
    display: grid;
    width: 48px;
    height: 48px;
    margin-bottom: 24px;
    place-items: center;
    border-radius: 15px;
    background: var(--reset-accent);
    color: #fff;
    font: 700 25px/1 Georgia, serif;
}

.reset-eyebrow {
    margin: 0 0 8px;
    color: var(--reset-accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
}

h1 {
    margin: 0 0 28px;
    font: 700 32px/1.2 Georgia, serif;
    letter-spacing: -0.03em;
}

.reset-form {
    display: grid;
    gap: 10px;
}

.reset-form label {
    margin-top: 8px;
    color: var(--reset-ink);
    font-size: 13px;
    font-weight: 700;
}

.reset-form input {
    box-sizing: border-box;
    width: 100%;
    height: 46px;
    padding: 0 14px;
    border: 1px solid #d8deeb;
    border-radius: 11px;
    outline: none;
    background: #f8faff;
    color: var(--reset-ink);
    font-size: 15px;
}

.reset-form input:focus {
    border-color: var(--reset-accent);
    box-shadow: 0 0 0 3px rgba(43, 90, 237, 0.12);
}

.reset-input-wrap {
    position: relative;
}

.reset-input-wrap input {
    padding-right: 66px;
}

.reset-eye {
    position: absolute;
    top: 50%;
    right: 8px;
    padding: 6px 8px;
    border: 0;
    background: transparent;
    color: var(--reset-accent);
    cursor: pointer;
    font-size: 12px;
    transform: translateY(-50%);
}

.reset-welcome {
    margin: 0 0 8px;
    color: var(--reset-muted);
    font-size: 14px;
    line-height: 1.7;
}

.reset-primary {
    display: inline-flex;
    min-height: 46px;
    margin-top: 16px;
    padding: 0 22px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 11px;
    background: var(--reset-accent);
    color: #fff;
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
}

.reset-primary:disabled {
    cursor: wait;
    opacity: 0.65;
}

.reset-error {
    margin: 8px 0 0;
    color: #b42318;
    font-size: 13px;
}

.reset-hint {
    margin: 8px 0 0;
    color: var(--reset-muted);
    font-size: 12px;
    line-height: 1.6;
}

.reset-state {
    display: grid;
    justify-items: start;
    gap: 6px;
    color: var(--reset-muted);
    font-size: 15px;
    line-height: 1.7;
}

.reset-state-error {
    color: #b42318;
}

.reset-spinner {
    width: 24px;
    height: 24px;
    margin-bottom: 8px;
    border: 2px solid #d8e2ff;
    border-top-color: var(--reset-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 520px) {
    .reset-page {
        padding: 20px 14px;
    }

    .reset-card {
        padding: 28px 22px;
        border-radius: 22px;
    }

    h1 {
        font-size: 28px;
    }
}
</style>
