<template>
    <section class="pet-card">
        <header class="pet-card-head">
            <div>
                <h2>展示与外观</h2>
                <p>控制桌宠是否出现、显示在哪里，以及看起来有多大</p>
            </div>
            <span v-if="!canEditPet" class="pet-readonly-note">只读</span>
        </header>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>显示桌面宠物</strong>
                <p>关闭后门户与后台都不再显示；重新打开即恢复。</p>
            </div>
            <yk-switch v-model="settings.desktopPetEnabled" :checked-value="true"
                :unchecked-value="false" :disabled="!canEditPet" />
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>显示范围</strong>
                <p>选择桌宠出现在门户、后台，还是两边都出现。</p>
            </div>
            <div class="pet-choice-group" aria-label="桌宠显示范围">
                <button v-for="option in scopeOptions" :key="option.value" type="button"
                    class="pet-choice" :class="{ 'is-active': settings.petScope === option.value }"
                    :disabled="!canEditPet" @click="settings.petScope = option.value">
                    {{ option.label }}
                </button>
            </div>
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>大小</strong>
                <p>移动端会自动按比例缩小。</p>
            </div>
            <div class="pet-choice-group" aria-label="桌宠大小">
                <button v-for="option in sizeOptions" :key="option.value" type="button"
                    class="pet-choice" :class="{ 'is-active': settings.petSize === option.value }"
                    :disabled="!canEditPet" @click="settings.petSize = option.value">
                    {{ option.label }}
                </button>
            </div>
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>尺寸微调</strong>
                <p>在大小档位基础上继续缩放，最大可以拉到 200%。</p>
            </div>
            <div class="pet-range">
                <input v-model.number="settings.petScale" type="range" min="60" max="200"
                    step="5" :disabled="!canEditPet" aria-label="桌宠尺寸缩放百分比" />
                <span>{{ settings.petScale }}%</span>
            </div>
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>不透明度</strong>
                <p>不想太抢眼时可以调低，最低可设到 40%。</p>
            </div>
            <div class="pet-range">
                <input v-model.number="settings.petOpacity" type="range" min="40" max="100"
                    step="5" :disabled="!canEditPet" aria-label="桌宠不透明度百分比" />
                <span>{{ settings.petOpacity }}%</span>
            </div>
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>默认停靠角落</strong>
                <p>「回到原位」和首次出现时的位置，门户与后台共用。</p>
            </div>
            <div class="pet-choice-group" aria-label="桌宠默认停靠角落">
                <button v-for="option in cornerOptions" :key="option.value" type="button"
                    class="pet-choice" :class="{ 'is-active': settings.petHomeCorner === option.value }"
                    :disabled="!canEditPet" @click="settings.petHomeCorner = option.value">
                    {{ option.label }}
                </button>
            </div>
        </div>
    </section>

    <section class="pet-card">
        <header class="pet-card-head">
            <div>
                <h2>行为</h2>
                <p>调整它的活跃程度、气泡与自主行动</p>
            </div>
            <span v-if="!canEditPet" class="pet-readonly-note">只读</span>
        </header>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>活泼程度</strong>
                <p>影响随机动作与碎碎念频率：安静更少打扰，活泼更爱折腾。</p>
            </div>
            <div class="pet-choice-group" aria-label="桌宠活泼程度">
                <button v-for="option in activityOptions" :key="option.value" type="button"
                    class="pet-choice" :class="{ 'is-active': settings.petActivity === option.value }"
                    :disabled="!canEditPet" @click="settings.petActivity = option.value">
                    {{ option.label }}
                </button>
            </div>
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>气泡与碎碎念</strong>
                <p>关闭后不再弹对话气泡，也不会随机自言自语。</p>
            </div>
            <yk-switch v-model="settings.petBubbleEnabled" :checked-value="true"
                :unchecked-value="false" :disabled="!canEditPet" />
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>允许自主漫游</strong>
                <p>关闭后宠物不再四处走动，只做原地动作。</p>
            </div>
            <yk-switch v-model="settings.petRoamingEnabled" :checked-value="true"
                :unchecked-value="false" :disabled="!canEditPet" />
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>允许拖拽甩抛</strong>
                <p>关闭后点击仍会回应，但不能拖动或甩出宠物。</p>
            </div>
            <yk-switch v-model="settings.petDragEnabled" :checked-value="true"
                :unchecked-value="false" :disabled="!canEditPet" />
        </div>

        <div class="pet-row">
            <div class="pet-row-copy">
                <strong>无操作自动入睡</strong>
                <p>三分钟没有互动就自己睡一觉，点击或拖拽会把它叫醒。</p>
            </div>
            <yk-switch v-model="settings.petAutoSleepEnabled" :checked-value="true"
                :unchecked-value="false" :disabled="!canEditPet" />
        </div>
    </section>
</template>

<script lang="ts" setup>
import type { DesktopPetSettings } from '../../utils/desktopPet'

defineProps<{
    settings: DesktopPetSettings
    canEditPet: boolean
}>()

const sizeOptions = [
    { value: 'small' as const, label: '小' },
    { value: 'medium' as const, label: '中' },
    { value: 'large' as const, label: '大' },
]
const activityOptions = [
    { value: 'quiet' as const, label: '安静' },
    { value: 'normal' as const, label: '正常' },
    { value: 'lively' as const, label: '活泼' },
]
const scopeOptions = [
    { value: 'all' as const, label: '全站' },
    { value: 'portal' as const, label: '仅门户' },
    { value: 'admin' as const, label: '仅后台' },
]
const cornerOptions = [
    { value: 'right' as const, label: '右下' },
    { value: 'left' as const, label: '左下' },
]
</script>

<style lang="less">
.pet-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 15px 0;

    & + & {
        border-top: 1px solid var(--admin-line, var(--gray1));
    }
}

.pet-row-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    p {
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.55;
    }
}

.pet-choice-group {
    display: inline-flex;
    flex: none;
    flex-wrap: wrap;
    gap: 3px;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
}

.pet-choice {
    padding: 6px 13px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;

    &.is-active {
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        box-shadow: 0 4px 12px var(--pcolor3);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
}

.pet-range {
    display: flex;
    width: 260px;
    flex: none;
    align-items: center;
    gap: 12px;

    input[type='range'] {
        width: 200px;
        accent-color: var(--pcolor);
        cursor: pointer;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
    }

    span {
        min-width: 42px;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        text-align: right;
    }
}
</style>
