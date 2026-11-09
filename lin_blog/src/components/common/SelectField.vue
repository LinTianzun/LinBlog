<template>
    <div class="select-field" :class="{ 'is-open': open, 'is-disabled': disabled }">
        <button type="button" class="select-field-trigger" :disabled="disabled"
            :aria-expanded="open" aria-haspopup="listbox" @click="toggle">
            <span class="select-field-value" :class="{ 'is-placeholder': !selectedLabel }">
                {{ selectedLabel || placeholder }}
            </span>
            <svg class="select-field-arrow" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        <Transition name="select-field-drop">
            <ul v-if="open" class="select-field-menu" role="listbox">
                <li v-for="option in options" :key="String(option.value)" class="select-field-option"
                    :class="{ 'is-selected': option.value === modelValue }" role="option"
                    :aria-selected="option.value === modelValue" @click="select(option.value)">
                    <span class="select-field-option-text">{{ option.label }}</span>
                    <svg v-if="option.value === modelValue" class="select-field-check" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M3 7.2 5.8 10 11 4.4" fill="none" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </li>
            </ul>
        </Transition>
    </div>
</template>

<script lang="ts" setup>
    import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

    interface SelectOption {
        label: string
        value: string | number
    }

    const props = withDefaults(defineProps<{
        modelValue: string | number
        options: SelectOption[]
        placeholder?: string
        disabled?: boolean
    }>(), {
        placeholder: '请选择',
        disabled: false,
    })

    const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

    const open = ref(false)
    const root = ref<HTMLElement | null>(null)

    const selectedLabel = computed(() =>
        props.options.find(option => option.value === props.modelValue)?.label || '')

    const toggle = (): void => {
        if (props.disabled) return
        open.value = !open.value
    }

    const select = (value: string | number): void => {
        emit('update:modelValue', value)
        open.value = false
    }

    // 点击外部或按 Esc 时收起菜单
    const handleDocumentClick = (event: MouseEvent): void => {
        if (!open.value) return
        if (root.value && !root.value.contains(event.target as Node)) open.value = false
    }

    const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && open.value) {
            open.value = false
            return
        }
        if (!open.value) return
        const index = props.options.findIndex(option => option.value === props.modelValue)
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            const next = Math.min(index + 1, props.options.length - 1)
            if (props.options[next]) select(props.options[next].value)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            const prev = Math.max(index - 1, 0)
            if (props.options[prev]) select(props.options[prev].value)
        }
    }

    onMounted(() => {
        document.addEventListener('click', handleDocumentClick)
        document.addEventListener('keydown', handleKeydown)
    })

    onBeforeUnmount(() => {
        document.removeEventListener('click', handleDocumentClick)
        document.removeEventListener('keydown', handleKeydown)
    })

    // 选项变化后若当前值已失效，收起菜单避免显示错位
    watch(() => props.options.length, () => {
        open.value = false
    })
</script>

<style scoped lang="less">
    .select-field {
        position: relative;
        width: 100%;
    }

    .select-field-trigger {
        width: 100%;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0 34px 0 13px;
        border: 1px solid var(--admin-line-strong, var(--gray1));
        border-radius: 10px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--gray);
        font-size: 14px;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        outline: none;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;

        &:hover:not(:disabled) {
            border-color: color-mix(in srgb, var(--pcolor) 45%, var(--admin-line-strong, var(--gray1)));
        }

        &:focus-visible {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }

    .select-field-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &.is-placeholder {
            color: var(--admin-muted, var(--gray6));
        }
    }

    .select-field-arrow {
        position: absolute;
        right: 12px;
        width: 12px;
        height: 12px;
        color: var(--admin-muted, var(--gray6));
        pointer-events: none;
        transition: transform 0.18s ease, color 0.18s ease;
    }

    .is-open {
        .select-field-trigger {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
        }

        .select-field-arrow {
            transform: rotate(180deg);
            color: var(--pcolor);
        }
    }

    .select-field-menu {
        position: absolute;
        z-index: 20;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        max-height: 260px;
        margin: 0;
        padding: 6px;
        list-style: none;
        overflow-y: auto;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 12px;
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-md);
    }

    .select-field-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 13px;
        color: var(--gray);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;

        &:hover {
            background: color-mix(in srgb, var(--pcolor) 10%, transparent);
        }

        &.is-selected {
            color: var(--pcolor);
            font-weight: 600;
        }
    }

    .select-field-option-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .select-field-check {
        flex: none;
        width: 14px;
        height: 14px;
        color: var(--pcolor);
    }

    .select-field-drop-enter-active,
    .select-field-drop-leave-active {
        transition: opacity 0.15s ease, transform 0.15s ease;
    }

    .select-field-drop-enter-from,
    .select-field-drop-leave-to {
        opacity: 0;
        transform: translateY(-4px);
    }
</style>
