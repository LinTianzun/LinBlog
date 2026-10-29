<template>
    <yk-modal :model-value="open" title="举报评论" size="s" :show-footer="false" :closeable="!submitting"
        @update:model-value="handleOpenChange">
        <div class="report-dialog">
            <div class="report-intro">
                <span class="report-intro-icon"><IconWarningOutline /></span>
                <div>
                    <strong>选择举报原因</strong>
                    <p>请选择最符合的情况，帮助我们更快处理这条评论。</p>
                </div>
            </div>

            <blockquote v-if="commentContent" class="report-preview">
                {{ commentContent }}
            </blockquote>

            <div class="report-reasons" role="radiogroup" aria-label="举报原因">
                <button v-for="option in COMMENT_REPORT_REASONS" :key="option.value" type="button"
                    class="report-reason" :class="{ 'is-selected': reason === option.value }"
                    role="radio" :aria-checked="reason === option.value" :disabled="submitting"
                    @click="reason = option.value">
                    <span class="report-reason-marker" aria-hidden="true"><span /></span>
                    <span class="report-reason-copy">
                        <strong>{{ option.label }}</strong>
                        <small>{{ option.description }}</small>
                    </span>
                </button>
            </div>

            <label class="report-detail">
                <span>补充说明 <em>选填</em></span>
                <yk-text-area v-model="detail" :max-length="200" show-word-limit
                    :auto-size="{ minRows: 3, maxRows: 5 }" :disabled="submitting"
                    placeholder="可以补充具体情况，最多 200 个字符" />
            </label>

            <div class="report-actions">
                <yk-button size="s" :disabled="submitting" @click="close">取消</yk-button>
                <yk-button type="primary" size="s" :loading="submitting" :disabled="!canSubmit"
                    @click="submit">
                    提交举报
                </yk-button>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { IconWarningOutline } from '@yike-design/ui/es/components/svg-icon'
import type { CommentReportReason } from '../../api/comment.ts'

import { COMMENT_REPORT_REASONS } from '../../utils/commentReport.ts'

const props = withDefaults(defineProps<{
    open: boolean
    commentContent?: string
    submitting?: boolean
}>(), {
    commentContent: '',
    submitting: false,
})

const emit = defineEmits<{
    (event: 'update:open', value: boolean): void
    (event: 'submit', payload: { reason: CommentReportReason; detail: string }): void
}>()

const reason = ref<CommentReportReason | ''>('')
const detail = ref('')
const canSubmit = computed(() => Boolean(reason.value) && !props.submitting)

watch(() => props.open, open => {
    if (!open) return
    reason.value = ''
    detail.value = ''
})

const close = (): void => {
    if (props.submitting) return
    emit('update:open', false)
}

const handleOpenChange = (open: boolean): void => {
    if (!open) close()
}

const submit = (): void => {
    if (!reason.value || !canSubmit.value) return
    emit('submit', {
        reason: reason.value,
        detail: detail.value.trim(),
    })
}
</script>

<style lang="less" scoped>
.report-dialog {
    --report-accent: var(--pcolor);
    --report-accent-soft: var(--pcolor2);
    --report-ink: var(--admin-ink, var(--gray8));
    --report-body: var(--admin-body, var(--gray8));
    --report-muted: var(--admin-muted, var(--gray6));
    --report-line: var(--admin-line, var(--gray2));
    --report-soft: var(--admin-surface-soft, var(--bgColor2));
    display: flex;
    flex-direction: column;
    gap: 18px;
    color: var(--report-body);
}

.report-intro {
    display: flex;
    gap: 12px;
    align-items: flex-start;

    strong {
        display: block;
        margin-bottom: 4px;
        color: var(--report-ink);
        font-size: 15px;
    }

    p {
        margin: 0;
        color: var(--report-muted);
        font-size: 12.5px;
        line-height: 1.65;
    }
}

.report-intro-icon {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: none;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--report-accent-soft);
    color: var(--report-accent);

    .yk-icon {
        width: 18px;
        height: 18px;
    }
}

.report-preview {
    display: -webkit-box;
    overflow: hidden;
    margin: -4px 0 0;
    padding: 10px 12px;
    border-left: 2px solid var(--report-line);
    border-radius: 0 8px 8px 0;
    background: var(--report-soft);
    color: var(--report-muted);
    font-size: 12.5px;
    line-height: 1.65;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.report-reasons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
}

.report-reason {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    min-height: 62px;
    padding: 10px 11px;
    border: 1px solid var(--report-line);
    border-radius: 11px;
    background: transparent;
    color: var(--report-body);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

    &:hover:not(:disabled) {
        border-color: var(--report-accent);
    }

    &.is-selected {
        border-color: var(--report-accent);
        background: var(--report-accent-soft);
        box-shadow: inset 0 0 0 1px var(--report-accent);
    }

    &:disabled {
        cursor: wait;
        opacity: 0.65;
    }
}

.report-reason-marker {
    display: inline-flex;
    width: 16px;
    height: 16px;
    flex: none;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
    border: 1px solid var(--report-line);
    border-radius: 50%;

    span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: transparent;
        transform: scale(0.5);
        transition: transform 0.18s ease, background-color 0.18s ease;
    }

    .is-selected & {
        border-color: var(--report-accent);

        span {
            background: var(--report-accent);
            transform: scale(1);
        }
    }
}

.report-reason-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--report-ink);
        font-size: 13px;
        font-weight: 600;
    }

    small {
        color: var(--report-muted);
        font-size: 11.5px;
        line-height: 1.45;
    }
}

.report-detail {
    display: flex;
    flex-direction: column;
    gap: 8px;

    > span {
        color: var(--report-ink);
        font-size: 13px;
        font-weight: 600;
    }

    em {
        margin-left: 4px;
        color: var(--report-muted);
        font-size: 11.5px;
        font-style: normal;
        font-weight: 400;
    }
}

.report-actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
}

@media (max-width: 560px) {
    .report-reasons {
        grid-template-columns: 1fr;
    }
}
</style>
