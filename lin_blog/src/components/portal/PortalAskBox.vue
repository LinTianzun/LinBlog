<template>
    <section class="portal-ask portal-glass portal-reveal">
        <div class="portal-ask-head">
            <div class="portal-ask-heading">
                <span class="block-kicker">ASK THE SITE</span>
                <h2 class="portal-section-title">问问我</h2>
                <p class="portal-ask-desc">
                    把你关心的问题交给我，我会从站内已发布的文章里找答案，并附上原文出处。
                </p>
            </div>
        </div>

        <form class="portal-ask-form" @submit.prevent="submitAsk">
            <input
                v-model="question"
                type="text"
                class="portal-ask-input"
                maxlength="200"
                placeholder="例如：你是怎么坚持写博客的？"
                aria-label="输入你的问题"
            />
            <button type="submit" class="portal-ask-submit" :disabled="busy || !question.trim()">
                {{ busy ? '思考中…' : '提问' }}
            </button>
        </form>

        <p v-if="errorMessage" class="portal-ask-error">{{ errorMessage }}</p>

        <div v-if="result" class="portal-ask-result">
            <p class="portal-ask-answer">{{ result.answer }}</p>
            <ul v-if="result.sources.length > 0" class="portal-ask-sources">
                <li v-for="source in result.sources" :key="source.id">
                    <RouterLink :to="`/portal/articles?open=${source.id}`">
                        <span class="portal-ask-source-index">[{{ source.index }}]</span>
                        <span class="portal-ask-source-title">{{ source.title }}</span>
                    </RouterLink>
                </li>
            </ul>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { askPortalQuestion } from '../../api/portal'
import { getRequestErrorMessage } from '../../api/ai'

const question = ref('')
const busy = ref(false)
const errorMessage = ref('')
const result = ref<{ answer: string; sources: { id: number; title: string; snippet: string; index: number }[]; found: boolean } | null>(null)

const submitAsk = async (): Promise<void> => {
    const text = question.value.trim()
    if (!text || busy.value) return

    busy.value = true
    errorMessage.value = ''
    try {
        const response = await askPortalQuestion(text)
        if (response.code !== 200 || !response.data) {
            throw new Error(response.message || '提问失败，请稍后再试')
        }
        result.value = response.data
    } catch (error) {
        errorMessage.value = getRequestErrorMessage(error, '提问失败，请稍后再试')
    } finally {
        busy.value = false
    }
}
</script>

<style lang="less" scoped>
.portal-ask {
    width: 100%;
    padding: 32px 28px;
}

.portal-ask-heading {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.portal-ask-desc {
    margin: 0;
    color: var(--gray7);
    font-size: 13px;
    line-height: 1.7;
}

.portal-ask-form {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.portal-ask-input {
    flex: 1;
    min-width: 0;
    padding: 11px 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor1);
    color: var(--gray);
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;

    &:focus {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 1px;
    }
}

.portal-ask-submit {
    flex: none;
    padding: 0 24px;
    border: none;
    border-radius: 12px;
    background: var(--pcolor);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.2s;

    &:hover:not(:disabled) {
        transform: translateY(-1px);
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }
}

.portal-ask-error {
    margin: 12px 0 0;
    color: #d84a3a;
    font-size: 13px;
}

.portal-ask-result {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px dashed var(--admin-line, var(--gray1));
}

.portal-ask-answer {
    margin: 0;
    color: var(--gray);
    font-size: 14px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;
}

.portal-ask-sources {
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;

    li a {
        display: inline-flex;
        align-items: baseline;
        gap: 8px;
        color: var(--gray7);
        font-size: 13px;
        text-decoration: none;
        transition: color 0.2s;

        &:hover {
            color: var(--pcolor);
        }
    }
}

.portal-ask-source-index {
    color: var(--pcolor);
    font-weight: 600;
}

.portal-ask-source-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 640px) {
    .portal-ask-form {
        flex-direction: column;
    }

    .portal-ask-submit {
        padding: 10px 24px;
    }
}
</style>
