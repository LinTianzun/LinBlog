<template>
    <yk-modal :model-value="open" title="安排定时发布" size="s" :show-footer="false"
        :closeable="!loading" @update:model-value="emit('update:open', $event)">
        <div class="schedule-dialog">
            <div v-if="scheduledAt" class="schedule-dialog-plan">
                <div class="schedule-dialog-plan-info">
                    <yk-tag shape="round" size="s" color="#1f9d63">已计划</yk-tag>
                    <span class="schedule-dialog-plan-time">
                        {{ currentPreview || formatWorkflowTime(scheduledAt) }}
                    </span>
                    <span class="schedule-dialog-plan-distance">
                        {{ scheduleDistanceLabel(scheduledAt) }}
                    </span>
                </div>
                <button type="button" class="schedule-dialog-plan-cancel"
                    :disabled="loading" @click="emit('cancel-schedule')">
                    取消定时发布
                </button>
            </div>

            <p class="schedule-dialog-hint">
                到点后自动应用当前工作稿并发布。建议先预览，再安排时间。
            </p>

            <div class="schedule-dialog-presets" role="group" aria-label="快捷时间">
                <button v-for="preset in presets" :key="preset.key" type="button"
                    class="schedule-dialog-preset" :class="{ 'is-active': preset.key === activePresetKey }"
                    @click="selectPreset(preset.value)">
                    {{ preset.label }}
                </button>
            </div>

            <label class="schedule-dialog-label">
                <span>发布时间</span>
                <input v-model="inputValue" type="datetime-local" class="schedule-dialog-input" />
            </label>

            <p v-if="validation.ok && preview" class="schedule-dialog-preview">
                将于 <strong>{{ preview }}</strong> 自动发布<template v-if="contentTitle">
                    「{{ contentTitle }}」</template>的当前工作稿
            </p>
            <p v-else-if="!validation.ok" class="schedule-dialog-warning">
                {{ validation.message }}
            </p>

            <div class="schedule-dialog-actions">
                <yk-button type="secondary" :disabled="loading" @click="emit('update:open', false)">
                    取消
                </yk-button>
                <yk-button :loading="loading" :disabled="!validation.ok" @click="emit('confirm')">
                    确认安排
                </yk-button>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { formatWorkflowTime } from '../../utils/articleWorkflow'
import {
    buildSchedulePresets,
    scheduleDistanceLabel,
    scheduleValuePreview,
    validateScheduleValue,
} from '../../utils/scheduledPublish'

const props = defineProps<{
    open: boolean
    value: string
    scheduledAt?: string | null
    loading?: boolean
    contentTitle?: string
}>()

const emit = defineEmits<{
    (event: 'update:open', value: boolean): void
    (event: 'update:value', value: string): void
    (event: 'confirm'): void
    (event: 'cancel-schedule'): void
}>()

const presets = computed(() => buildSchedulePresets())
const activePresetKey = computed(() =>
    presets.value.find(preset => preset.value === props.value)?.key ?? ''
)

const inputValue = computed({
    get: () => props.value,
    set: (value: string) => emit('update:value', value),
})

const validation = computed(() => validateScheduleValue(props.value))
const preview = computed(() => scheduleValuePreview(props.value))
const currentPreview = computed(() => scheduleValuePreview(props.scheduledAt))

const selectPreset = (value: string): void => {
    emit('update:value', value)
}
</script>

<style lang="less" scoped>
.schedule-dialog {
    display: flex;
    flex-direction: column;
    gap: @space-l;
}

.schedule-dialog-plan {
    display: flex;
    align-items: center;
    gap: @space-s;
    flex-wrap: wrap;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--scolor, #1f9d63) 28%, transparent);
    border-radius: @radius-s;
    background: color-mix(in srgb, var(--scolor, #1f9d63) 10%, transparent);

    &-info {
        display: flex;
        align-items: center;
        gap: @space-s;
        min-width: 0;
        flex-wrap: wrap;
    }

    &-time {
        color: @font-color-l;
        font-size: @size-s;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }

    &-distance {
        color: @font-color-s;
        font-size: @size-s;
        font-variant-numeric: tabular-nums;
    }

    &-cancel {
        margin-left: auto;
        border: none;
        background: transparent;
        color: @pcolor;
        cursor: pointer;
        font-size: @size-s;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }
}

.schedule-dialog-hint {
    margin: 0;
    color: @font-color-s;
    font-size: @size-s;
    line-height: 1.7;
}

.schedule-dialog-presets {
    display: flex;
    gap: @space-s;
    flex-wrap: wrap;
}

.schedule-dialog-preset {
    padding: 4px 12px;
    border: 1px solid @line-color-m;
    border-radius: 999px;
    background: @bg-color-l;
    color: @font-color-m;
    font-size: @size-s;
    cursor: pointer;
    transition: border-color @animatb, color @animatb, background @animatb;

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.is-active {
        border-color: @pcolor;
        background: var(--pcolor2, transparent);
        color: @pcolor;
    }
}

.schedule-dialog-label {
    display: flex;
    flex-direction: column;
    gap: @space-s;
    color: @font-color-m;
    font-size: @size-s;
}

.schedule-dialog-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid @line-color-m;
    border-radius: @radius-s;
    background: @bg-color-l;
    color: @font-color-l;
    outline: none;

    &:focus {
        border-color: @pcolor;
    }
}

.schedule-dialog-preview {
    margin: 0;
    color: @font-color-m;
    font-size: @size-s;
    line-height: 1.7;

    strong {
        color: @font-color-l;
        font-variant-numeric: tabular-nums;
    }
}

.schedule-dialog-warning {
    margin: 0;
    color: var(--ecolor, #d84a3a);
    font-size: @size-s;
    line-height: 1.7;
}

.schedule-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: @space-m;
}
</style>
