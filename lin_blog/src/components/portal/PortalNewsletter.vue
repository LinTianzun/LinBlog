<template>
  <section class="portal-newsletter portal-glass">
    <div class="newsletter-copy">
      <span class="block-kicker">NEWSLETTER</span>
      <h2 class="newsletter-title">订阅这封长信</h2>
      <p class="newsletter-desc">
        不定期整理新文章、摄影与随笔，直接发到邮箱。没有广告，随时可以退订。
      </p>
    </div>

    <div v-if="state === 'confirmed'" class="newsletter-done" role="status">
      <strong>这个邮箱已在订阅列表里。</strong>
      <span>之后有新文章时，会收到一封整理好的摘要。</span>
    </div>

    <form v-else class="newsletter-form" @submit.prevent="submit">
      <label class="newsletter-label" for="portal-newsletter-email">邮箱</label>
      <div class="newsletter-row">
        <input
          id="portal-newsletter-email"
          v-model="email"
          class="newsletter-input"
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          maxlength="190"
          placeholder="you@example.com"
          :disabled="busy || state === 'pending'"
          required
          @input="errorMessage = ''"
        />
        <button class="newsletter-submit" type="submit" :disabled="busy || !email.trim()">
          {{ busy ? "发送中…" : "订阅" }}
        </button>
      </div>
      <p class="newsletter-hint" aria-live="polite">
        <template v-if="state === 'pending'">
          已发送确认邮件，请在 48 小时内打开确认链接。
        </template>
        <template v-else>
          提交后会收到一封确认邮件；未确认前不会发送任何内容。
        </template>
      </p>
      <p v-if="errorMessage" class="newsletter-error" role="alert">{{ errorMessage }}</p>
    </form>
  </section>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { subscribeNewsletter } from '../../api/portal'
import { getRequestErrorMessage } from '../../api/ai'

type State = 'idle' | 'pending' | 'confirmed'

const email = ref('')
const busy = ref(false)
const state = ref<State>('idle')
const errorMessage = ref('')

const submit = async (): Promise<void> => {
  const value = email.value.trim()
  if (!value || busy.value) return

  busy.value = true
  errorMessage.value = ''
  try {
    const result = await subscribeNewsletter(value)
    if (result.code !== 200) throw new Error(result.message || '订阅失败，请稍后再试')
    state.value = result.data?.status === 'confirmed' ? 'confirmed' : 'pending'
  } catch (error) {
    errorMessage.value = getRequestErrorMessage(error, '订阅失败，请稍后再试')
  } finally {
    busy.value = false
  }
}
</script>

<style lang="less" scoped>
.portal-newsletter {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
  gap: 28px 40px;
  align-items: center;
  width: var(--portal-page-width);
  margin: 0 auto;
  padding: 30px 32px;
}

.newsletter-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.newsletter-title {
  margin: 0;
  font-family: var(--portal-serif);
  font-size: 24px;
  font-weight: 600;
  color: var(--portal-text-primary);
}

.newsletter-desc {
  max-width: 46ch;
  margin: 0;
  color: var(--portal-text-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.newsletter-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.newsletter-done {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  border: 1px dashed var(--portal-accent-soft);
  border-radius: 16px;
  color: var(--portal-text-secondary);
  font-size: 13px;
  line-height: 1.7;

  strong {
    color: var(--portal-text-primary);
    font-size: 15px;
  }
}

.newsletter-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.newsletter-row {
  display: flex;
  gap: 10px;
}

.newsletter-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 16px;
  border: 1px solid var(--portal-surface-border);
  border-radius: var(--portal-radius-pill);
  background: var(--portal-surface);
  color: var(--portal-text-primary);
  font: inherit;
  font-size: 14px;
  outline: none;
  transition:
    border-color var(--portal-transition-fast),
    box-shadow var(--portal-transition-fast);

  &::placeholder {
    color: var(--portal-text-tertiary);
  }

  &:focus-visible {
    border-color: var(--portal-accent);
    box-shadow: 0 0 0 3px var(--portal-accent-soft);
  }
}

.newsletter-submit {
  flex-shrink: 0;
  height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: var(--portal-radius-pill);
  background: var(--portal-accent);
  color: var(--portal-text-on-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--portal-transition-fast), transform var(--portal-transition-fast);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--portal-accent);
    outline-offset: 3px;
  }
}

.newsletter-hint,
.newsletter-error {
  margin: 0;
  padding-left: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--portal-text-tertiary);
}

.newsletter-error {
  color: #e57373;
}

@media (max-width: 760px) {
  .portal-newsletter {
    grid-template-columns: 1fr;
    width: calc(100% - 32px);
    padding: 24px 20px;
  }
}

@media (max-width: 420px) {
  .newsletter-row {
    flex-direction: column;
  }

  .newsletter-submit {
    width: 100%;
  }
}
</style>
