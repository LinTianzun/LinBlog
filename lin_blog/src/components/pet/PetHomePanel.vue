<template>
    <section class="pet-home-card">
        <header class="pet-home-head">
            <div>
                <span class="pet-home-kicker">PET HOME</span>
                <h2>{{ displayPetName }} 的小院</h2>
                <p>它会在小屋休息，也会去农场帮忙。</p>
            </div>
            <span class="pet-home-status">
                <span aria-hidden="true" />{{ petHomeStatus }}
            </span>
        </header>

        <div class="pet-home-tabs" role="tablist" aria-label="宠物小屋和农场区域">
            <button v-for="(tab, index) in tabs" :key="tab.id"
                :id="`pet-home-tab-${tab.id}`" type="button" role="tab"
                :aria-selected="petHomeTab === tab.id" aria-controls="pet-home-panel"
                :tabindex="petHomeTab === tab.id ? 0 : -1"
                :class="{ 'is-active': petHomeTab === tab.id }"
                @click="emit('select-tab', tab.id)"
                @keydown="handleTabKeydown($event, index)">
                <span aria-hidden="true">{{ tab.icon }}</span>{{ tab.label }}
            </button>
        </div>

        <PetHomeRoom :tab="petHomeTab" :room-class="petHomeRoomClass"
            :plots="homesteadPlots" :plot-columns="homesteadPlotColumns"
            :chicken="chicken" :chicken-label="chickenLabel"
            :cow="cow" :cow-label="cowLabel"
            :pond-ready="pondReady" :pond-label="pondLabel"
            :owned-decorations="ownedDecorations"
            :streak-days="petVitals.streakDays" :note="petHomeNote"
            @plot-click="emit('plot-click', $event)"
            @collect-chicken="emit('collect-chicken')"
            @collect-cow="emit('collect-cow')" @pond-click="emit('pond-click')" />

        <PetHomestead v-if="petHomeTab !== 'home'" :tab="petHomeTab"
            :coins="homestead.coins"
            :completed-orders="completedOrderCount"
            :order-total="homestead.orders.length"
            :claimable-orders="claimableOrderCount"
            :claimable-achievements="claimableHomesteadAchievementCount"
            :crops="HOMESTEAD_CROPS"
            :seed-stock="homestead.seedStock"
            :selected-seed-id="selectedSeedId"
            :tend-count="homesteadTendCount"
            :inventory-chips="inventoryChips"
            :auto-help-enabled="homestead.autoHelp.enabled"
            :auto-help-status="autoHelpStatus"
            @open-business="emit('open-business', $event)"
            @select-seed="emit('select-seed', $event)"
            @tend="emit('tend')"
            @request-auto-help="emit('request-auto-help')"
            @update:auto-help-enabled="emit('update:auto-help-enabled', $event)" />

        <div class="pet-home-actions">
            <button type="button" :disabled="feedCooldownLeft > 0"
                :title="feedCooldownLeft > 0 ? '刚喂过，稍后再试' : '喂一口'"
                @click="emit('feed', selectedFood.id)">
                <span>{{ selectedFood.icon }}</span>喂一口
            </button>
            <button type="button" :disabled="!settings.desktopPetEnabled"
                @click="emit('send-command', 'home')">
                <span>🏠</span>回到小院
            </button>
            <button type="button" :disabled="!settings.desktopPetEnabled"
                @click="emit('send-command', 'speak')">
                <span>💬</span>说句话
            </button>
            <button type="button" :disabled="!settings.desktopPetEnabled"
                @click="emit('send-command', 'sleep')">
                <span>🌙</span>睡一觉
            </button>
            <button type="button" :disabled="!settings.desktopPetEnabled"
                @click="emit('send-command', 'wake')">
                <span>☀️</span>叫醒它
            </button>
        </div>

        <div class="pet-home-footer">
            <button type="button" :disabled="!canEditPet" @click="emit('reset-settings')">
                恢复默认展示
            </button>
            <button type="button" @click="emit('open-preferences')">
                本机偏好设置 →
            </button>
        </div>
    </section>
</template>

<script lang="ts" setup>
import type { DesktopPetSettings, DesktopPetCommand } from '../../utils/desktopPet'
import {
    HOMESTEAD_CROPS,
    type HomesteadCropId,
    type HomesteadState,
} from '../../utils/desktopPetHomestead'
import type { PetFood } from '../../utils/desktopPetFood'
import type { PetVitals } from '../../utils/desktopPetVitals'
import PetHomeRoom from './PetHomeRoom.vue'
import PetHomestead from './PetHomestead.vue'
import type {
    PetHomeChickenView,
    PetHomeCowView,
    PetHomeDecorationView,
    PetHomePlotView,
    PetHomeTab,
    PetHomeTabDefinition,
    PetHomesteadInventoryChip,
} from './petManageTypes'

const props = defineProps<{
    tabs: readonly PetHomeTabDefinition[]
    petHomeTab: PetHomeTab
    petHomeStatus: string
    petHomeRoomClass: string[]
    petHomeNote: string
    displayPetName: string
    petVitals: PetVitals
    settings: DesktopPetSettings
    selectedFood: PetFood
    feedCooldownLeft: number
    canEditPet: boolean
    homestead: HomesteadState
    homesteadPlots: PetHomePlotView[]
    homesteadPlotColumns: number
    homesteadTendCount: number
    selectedSeedId: HomesteadCropId
    inventoryChips: PetHomesteadInventoryChip[]
    chicken: PetHomeChickenView
    chickenLabel: string
    cow: PetHomeCowView
    cowLabel: string
    pondReady: boolean
    pondLabel: string
    ownedDecorations: PetHomeDecorationView[]
    completedOrderCount: number
    claimableOrderCount: number
    claimableHomesteadAchievementCount: number
    autoHelpStatus: string
}>()

const emit = defineEmits<{
    (e: 'select-tab', tab: PetHomeTab): void
    (e: 'plot-click', index: number): void
    (e: 'collect-chicken'): void
    (e: 'collect-cow'): void
    (e: 'pond-click'): void
    (e: 'open-business', panel: 'orders' | 'shop' | 'achievements'): void
    (e: 'select-seed', cropId: HomesteadCropId): void
    (e: 'tend'): void
    (e: 'request-auto-help'): void
    (e: 'update:auto-help-enabled', value: boolean): void
    (e: 'feed', foodId: PetFood['id']): void
    (e: 'send-command', command: DesktopPetCommand): void
    (e: 'reset-settings'): void
    (e: 'open-preferences'): void
}>()

const handleTabKeydown = (event: KeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let nextIndex = index
    if (event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + props.tabs.length) % props.tabs.length
    } else if (event.key === 'ArrowRight') {
        nextIndex = (index + 1) % props.tabs.length
    } else if (event.key === 'Home') {
        nextIndex = 0
    } else if (event.key === 'End') {
        nextIndex = props.tabs.length - 1
    }
    emit('select-tab', props.tabs[nextIndex].id)
    const tablist = (event.currentTarget as HTMLElement | null)?.parentElement
    const buttons = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
}
</script>

<style lang="less">
.pet-home-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 15px;
    overflow: hidden;
    padding: 18px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 26px;
    background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--pcolor) 12%, transparent), transparent 34%),
        linear-gradient(160deg, var(--admin-surface, var(--bgColor1)), var(--bgColor2));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.pet-home-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;

    h2 {
        margin: 2px 0 0;
        color: var(--admin-text, var(--gray));
        font-size: 18px;
        font-weight: 730;
    }

    p {
        margin: 5px 0 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-home-kicker {
    color: var(--pcolor);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.18em;
}

.pet-home-status {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid color-mix(in srgb, var(--scolor, #1fb4a2) 24%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--scolor, #1fb4a2) 8%, transparent);
    color: var(--scolor, #1fb4a2);
    font-size: 11px;
    font-weight: 650;

    > span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
    }
}

.pet-home-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: color-mix(in srgb, var(--admin-surface, var(--bgColor1)) 82%, transparent);

    button {
        display: inline-flex;
        min-height: 34px;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
        transition:
            background 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease;

        span {
            font-size: 14px;
            line-height: 1;
        }

        &:hover {
            background: color-mix(in srgb, var(--pcolor) 8%, transparent);
            color: var(--admin-text, var(--gray));
        }

        &.is-active {
            background: var(--pcolor);
            color: #fff;
            box-shadow: 0 4px 10px color-mix(in srgb, var(--pcolor) 28%, transparent);
        }

        &:focus-visible {
            outline: 2px solid color-mix(in srgb, var(--pcolor) 72%, white);
            outline-offset: 2px;
        }
    }
}

.pet-home-room {
    position: relative;
    isolation: isolate;
    min-height: clamp(450px, 46vh, 580px);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, #8f6a4e 16%, var(--admin-line, var(--gray1)));
    border-radius: 20px;
    background: #dff0c9;
    box-shadow:
        inset 0 0 0 5px rgba(255, 255, 255, 0.34),
        inset 0 -18px 34px rgba(65, 91, 48, 0.12);
}

.pet-home-interior {
    position: absolute;
    z-index: 3;
    top: 0;
    bottom: 0;
    left: 0;
    width: 46%;
    overflow: hidden;
    background:
        linear-gradient(180deg,
            #fdf8f1 0%,
            #fbf3e8 56%,
            transparent 56%),
        linear-gradient(180deg,
            transparent 56%,
            #e6c4a2 56%,
            #d3a97e 100%);
    box-shadow:
        6px 0 0 #f7e9d8,
        12px 0 26px rgba(77, 61, 44, 0.16);

    &::before {
        position: absolute;
        inset: 0 0 44%;
        content: '';
        opacity: 0.4;
        background-image:
            radial-gradient(circle,
                color-mix(in srgb, var(--pcolor) 24%, transparent) 1px,
                transparent 1.4px);
        background-size: 22px 22px;
        pointer-events: none;
    }

    &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 44%;
        content: '';
        opacity: 0.32;
        background:
            repeating-linear-gradient(90deg,
                transparent 0 47px,
                rgba(104, 64, 36, 0.2) 47px 48px);
        pointer-events: none;
    }
}

.pet-home-yard {
    position: absolute;
    z-index: 1;
    inset: 0 0 0 46%;
    overflow: hidden;
    background:
        radial-gradient(circle at 82% 12%, rgba(255, 244, 188, 0.78), transparent 22%),
        linear-gradient(180deg,
            #dff0ff 0%,
            #eef8ff 38%,
            #f6fbef 46%,
            #cfe8a8 46%,
            #b9dc8c 100%);
}

.pet-home-yard :where(button) {
    border: 0;
    padding: 0;
    color: inherit;
    background: none;
    font: inherit;
    cursor: pointer;
    appearance: none;
}

.pet-home-yard :where(button):focus-visible {
    z-index: 6;
    outline: 3px solid color-mix(in srgb, var(--pcolor) 72%, white);
    outline-offset: 3px;
}

.pet-home-sun {
    position: absolute;
    top: 8%;
    right: 12%;
    width: 13%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 34%, #fffbe0, #ffe27a 64%, #ffd45f 100%);
    box-shadow:
        0 0 0 8px rgba(255, 226, 122, 0.16),
        0 0 30px rgba(255, 226, 122, 0.52);
    animation: pet-yard-sun 7s ease-in-out infinite;
}

.pet-home-cloud {
    position: absolute;
    height: 4.5%;
    min-height: 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.86);
    animation: pet-yard-cloud 26s ease-in-out infinite alternate;

    &::before,
    &::after {
        position: absolute;
        bottom: 38%;
        content: '';
        border-radius: 50%;
        background: inherit;
    }

    &::before {
        left: 16%;
        width: 38%;
        aspect-ratio: 1;
    }

    &::after {
        right: 14%;
        width: 52%;
        aspect-ratio: 1;
    }
}

.pet-home-cloud-a {
    top: 15%;
    left: 7%;
    width: 34%;
}

.pet-home-cloud-b {
    top: 27%;
    right: 10%;
    width: 24%;
    opacity: 0.68;
    animation-duration: 32s;
}

.pet-home-hill {
    position: absolute;
    bottom: 48%;
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
}

.pet-home-hill-a {
    left: -14%;
    width: 80%;
    height: 17%;
    background: #c6e1ab;
}

.pet-home-hill-b {
    right: -18%;
    width: 74%;
    height: 13%;
    background: #b5d795;
}

.pet-home-fence {
    position: absolute;
    top: 47%;
    right: 0;
    left: 0;
    height: 7%;
    opacity: 0.92;
    background:
        repeating-linear-gradient(90deg,
            #fffaf0 0 6px,
            transparent 6px 18px);

    &::before,
    &::after {
        position: absolute;
        right: 0;
        left: 0;
        height: 2px;
        content: '';
        background: rgba(255, 250, 240, 0.86);
    }

    &::before {
        top: 30%;
    }

    &::after {
        top: 68%;
    }
}

.pet-home-path {
    position: absolute;
    bottom: 3%;
    left: 3%;
    width: 34%;
    height: 31%;
    opacity: 0.9;
    background:
        radial-gradient(ellipse 19% 7% at 18% 92%, #f1e5cf 98%, transparent 100%),
        radial-gradient(ellipse 16% 6% at 40% 74%, #f6ecda 98%, transparent 100%),
        radial-gradient(ellipse 17% 6% at 56% 56%, #eee1ca 98%, transparent 100%),
        radial-gradient(ellipse 14% 5% at 72% 38%, #f6ecda 98%, transparent 100%);
}

.pet-home-tree {
    position: absolute;
    top: 26%;
    right: 2%;
    width: 24%;
    height: 23%;
}

.pet-home-tree-trunk {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 12%;
    height: 45%;
    transform: translateX(-50%);
    border-radius: 4px 4px 0 0;
    background: linear-gradient(90deg, #9a6b48, #7d5235);
}

.pet-home-tree-canopy {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 76%;
    border-radius: 50% 50% 44% 44%;
    background:
        radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.3), transparent 38%),
        linear-gradient(145deg, #b9e08c, #7fbe62 68%, #69a84f);
    box-shadow: inset -8px -8px 0 rgba(62, 107, 44, 0.16);
    transform-origin: 50% 100%;
    animation: pet-yard-sway 8s ease-in-out infinite;
}

.pet-home-coop {
    position: absolute;
    z-index: 2;
    top: 46%;
    right: 4%;
    width: 29%;
    height: 12%;
    transition: filter 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-1px);
    }

    &.is-ready {
        filter: drop-shadow(0 0 8px rgba(255, 205, 90, 0.78));
    }
}

.pet-home-coop-wall {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 72%;
    border-radius: 5px 5px 3px 3px;
    background: linear-gradient(180deg, #f8ddc8, #e8b894);
    box-shadow: inset 0 -6px 0 rgba(150, 91, 54, 0.12);
}

.pet-home-coop-roof {
    position: absolute;
    z-index: 1;
    top: 0;
    left: 2%;
    width: 96%;
    height: 42%;
    background: linear-gradient(180deg, #e39b78, #cc7c5c);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    filter: drop-shadow(0 3px 3px rgba(109, 60, 40, 0.16));
}

.pet-home-coop-door {
    position: absolute;
    z-index: 2;
    bottom: 0;
    left: 38%;
    width: 24%;
    height: 52%;
    border-radius: 50% 50% 0 0;
    background: #8a5a3b;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.14);
}

.pet-home-chicken {
    position: absolute;
    z-index: 3;
    right: -12%;
    bottom: -12%;
    font-size: 24px;
    font-weight: 400;
    filter: drop-shadow(0 4px 5px rgba(70, 49, 30, 0.16));
}

.pet-home-yard-badge {
    position: absolute;
    z-index: 4;
    display: grid;
    min-width: 22px;
    height: 22px;
    padding: 0 4px;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    font-size: 13px;
    font-weight: 400;
    line-height: 1;
    box-shadow: 0 4px 10px rgba(59, 42, 28, 0.2);
    animation: pet-yard-bob 2.4s ease-in-out infinite;
    pointer-events: none;
}

.pet-home-coop .is-egg {
    top: -18%;
    right: -8%;
}

.pet-home-coop .is-manure {
    top: 30%;
    right: -18%;
    font-size: 12px;
    animation-delay: 0.4s;
}

.pet-home-pasture .is-milk {
    top: -22%;
    right: -10%;
}

.pet-home-pasture .is-manure {
    top: 34%;
    right: -16%;
    font-size: 12px;
    animation-delay: 0.4s;
}

.pet-home-pond .is-fish {
    top: -10%;
    right: 6%;
}

.pet-home-pasture {
    position: absolute;
    z-index: 1;
    top: 64%;
    right: 50%;
    display: grid;
    width: 18%;
    height: 8%;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 14px;
    background:
        linear-gradient(180deg,
            rgba(202, 232, 166, 0.72),
            rgba(169, 209, 128, 0.58));
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.14),
        inset 0 0 12px rgba(96, 143, 65, 0.14);
    transition: filter 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-1px);
    }

    &.is-ready {
        filter: drop-shadow(0 0 8px rgba(255, 205, 90, 0.78));
    }

    &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 28%;
        content: '';
        border-radius: 0 0 12px 12px;
        background:
            repeating-linear-gradient(90deg,
                rgba(255, 255, 255, 0.72) 0 3px,
                transparent 3px 10px);
    }

    > b:not(.pet-home-yard-badge) {
        position: relative;
        z-index: 1;
        font-size: 22px;
        font-weight: 400;
        filter: drop-shadow(0 3px 4px rgba(70, 49, 30, 0.18));
    }
}

.pet-home-plots {
    position: absolute;
    right: 4%;
    top: 60%;
    display: grid;
    width: 46%;
    height: 20%;
    grid-template-columns: repeat(var(--plot-columns, 2), minmax(0, 1fr));
    gap: 6%;
}

.pet-home-plot {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: space-evenly;
    overflow: hidden;
    padding: 8% 6% 7%;
    border-radius: 12px;
    background:
        repeating-linear-gradient(180deg,
            #8a5c3b 0 6px,
            #7c5033 6px 12px);
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.12),
        0 5px 10px rgba(70, 49, 30, 0.16);
    transition: transform 0.18s ease, box-shadow 0.18s ease;

    &:hover {
        transform: translateY(-2px);
    }

    &.is-empty {
        background:
            repeating-linear-gradient(180deg,
                #946542 0 6px,
                #855638 6px 12px);
    }

    &.is-ready {
        animation: pet-plot-ready 1.8s ease-in-out infinite;
    }

    &::before {
        position: absolute;
        inset: 0;
        content: '';
        border-radius: inherit;
        background: radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.18), transparent 62%);
    }

    b:not(.pet-home-plot-crop) {
        position: relative;
        width: 15%;
        height: 34%;
        border-radius: 999px 999px 4px 4px;
        background: linear-gradient(180deg, #7ec25e, #4e9a42);
        box-shadow: inset -2px 0 0 rgba(255, 255, 255, 0.16);
        transform-origin: bottom center;

        &::before,
        &::after {
            position: absolute;
            top: 18%;
            width: 74%;
            height: 42%;
            content: '';
            border-radius: 50%;
            background: #8ed06a;
        }

        &::before {
            left: -46%;
            transform: rotate(-26deg);
        }

        &::after {
            right: -46%;
            transform: rotate(26deg);
        }
    }

    b:nth-child(2) {
        height: 47%;
    }

    b:nth-child(3) {
        height: 29%;
    }
}

.pet-home-plot-crop {
    position: absolute;
    top: 3%;
    right: 4%;
    z-index: 2;
    font-size: 18px;
    font-weight: 400;
    line-height: 1;
    filter: drop-shadow(0 3px 4px rgba(70, 49, 30, 0.2));
    animation: pet-yard-bob 2.4s ease-in-out infinite;
    pointer-events: none;
}

.pet-home-plot-water {
    position: absolute;
    top: 4%;
    left: 4%;
    z-index: 2;
    font-size: 10px;
    font-style: normal;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgba(52, 106, 135, 0.22));
    pointer-events: none;
}

.pet-home-plot-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.56);
    font-size: 20px;
    font-weight: 300;
    line-height: 1;
    pointer-events: none;
}

.pet-home-pond {
    position: absolute;
    right: 4%;
    bottom: 4%;
    width: 46%;
    height: 14%;
    overflow: hidden;
    border-radius: 50%;
    background:
        radial-gradient(ellipse at 50% 38%,
            #c9eef7 0 42%,
            #98dcec 43% 70%,
            #75c4de 71% 100%);
    box-shadow:
        inset 0 6px 12px rgba(255, 255, 255, 0.38),
        0 6px 14px rgba(58, 123, 140, 0.18);
    transition: filter 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-1px);
    }

    &.is-ready {
        filter: drop-shadow(0 0 8px rgba(255, 205, 90, 0.72));
    }
}

.pet-home-pond-ripple {
    position: absolute;
    border: 1.5px solid rgba(255, 255, 255, 0.56);
    border-radius: 50%;
    animation: pet-yard-ripple 4.8s ease-in-out infinite;
}

.pet-home-pond-ripple-a {
    top: 24%;
    left: 18%;
    width: 34%;
    height: 26%;
}

.pet-home-pond-ripple-b {
    right: 14%;
    bottom: 20%;
    width: 24%;
    height: 20%;
    animation-delay: 1.6s;
}

.pet-home-reeds {
    position: absolute;
    right: 4%;
    bottom: 6%;
    font-size: 22px;
    font-weight: 400;
    filter: drop-shadow(0 3px 4px rgba(58, 123, 140, 0.2));
}

.pet-home-sign {
    position: absolute;
    bottom: 44%;
    left: 4%;
    padding: 4px 8px;
    border: 2px solid #a97852;
    border-radius: 4px;
    background: #f7e6cf;
    box-shadow: 0 4px 8px rgba(70, 49, 30, 0.14);
    color: #8a5a3b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    transform: rotate(-3deg);
}

@keyframes pet-yard-sun {
    0%,
    100% {
        transform: scale(1);
        filter: brightness(1);
    }

    50% {
        transform: scale(1.05);
        filter: brightness(1.06);
    }
}

@keyframes pet-yard-cloud {
    from {
        transform: translateX(-4%);
    }

    to {
        transform: translateX(5%);
    }
}

@keyframes pet-yard-sway {
    0%,
    100% {
        transform: rotate(-1.5deg);
    }

    50% {
        transform: rotate(1.5deg);
    }
}

@keyframes pet-yard-ripple {
    0%,
    100% {
        opacity: 0.4;
        transform: scale(0.92);
    }

    50% {
        opacity: 0.9;
        transform: scale(1.06);
    }
}

@keyframes pet-yard-bob {
    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-3px);
    }
}

@keyframes pet-plot-ready {
    0%,
    100% {
        box-shadow:
            inset 0 0 0 2px rgba(255, 255, 255, 0.2),
            0 0 0 1px rgba(255, 215, 120, 0.35),
            0 5px 12px rgba(70, 49, 30, 0.18);
    }

    50% {
        box-shadow:
            inset 0 0 0 2px rgba(255, 255, 255, 0.3),
            0 0 0 3px rgba(255, 215, 120, 0.5),
            0 0 18px rgba(255, 205, 90, 0.52);
    }
}

.pet-home-window {
    position: absolute;
    top: 8%;
    left: 50%;
    width: 52%;
    aspect-ratio: 4 / 3;
    transform: translateX(-50%);
    overflow: hidden;
    border: 6px solid rgba(255, 255, 255, 0.9);
    border-radius: 48% 48% 10px 10px;
    background: linear-gradient(180deg, #182e62, #4366a5 62%, #8cb0d8);
    box-shadow:
        0 10px 24px rgba(48, 73, 121, 0.16),
        inset 0 0 0 1px rgba(26, 46, 96, 0.12);

    &::before,
    &::after {
        position: absolute;
        content: '';
        background: rgba(255, 255, 255, 0.62);
    }

    &::before {
        top: 0;
        bottom: 0;
        left: 50%;
        width: 3px;
        transform: translateX(-50%);
    }

    &::after {
        top: 50%;
        right: 0;
        left: 0;
        height: 3px;
        transform: translateY(-50%);
    }
}

.pet-home-moon {
    position: absolute;
    top: 17%;
    right: 15%;
    width: 15%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff2b0;
    box-shadow: 0 0 18px rgba(255, 242, 176, 0.72);
}

.pet-home-star {
    position: absolute;
    width: 5%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.7);
}

.pet-home-star-a {
    top: 26%;
    left: 18%;
}

.pet-home-star-b {
    top: 50%;
    left: 29%;
}

.pet-home-curtain {
    position: absolute;
    top: 6%;
    z-index: 1;
    width: 18%;
    height: 23%;
    border-radius: 14px 10px 26px 12px;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.9) 0 9px,
            color-mix(in srgb, var(--pcolor) 18%, #e3edff) 9px 16px);
    opacity: 0.86;
    box-shadow: 0 10px 20px rgba(71, 96, 143, 0.1);
}

.pet-home-curtain-left {
    left: 4%;
    transform: rotate(4deg);
    transform-origin: top right;
}

.pet-home-curtain-right {
    right: 4%;
    transform: rotate(-4deg) scaleX(-1);
    transform-origin: top left;
}

.pet-home-shelf {
    position: absolute;
    top: 29%;
    left: 7%;
    width: 27%;
    height: 8px;
    border-radius: 4px;
    background: #a97852;
    box-shadow: 0 5px 0 rgba(126, 82, 50, 0.16);

    i {
        position: absolute;
        bottom: 9px;
        width: 14%;
        border-radius: 3px 3px 0 0;
        background: var(--pcolor);
    }

    i:nth-child(1) {
        left: 12%;
        height: 26px;
        opacity: 0.68;
    }

    i:nth-child(2) {
        left: 31%;
        height: 20px;
        background: var(--scolor, #1fb4a2);
        opacity: 0.65;
    }

    i:nth-child(3) {
        left: 50%;
        height: 29px;
        background: #e9976e;
        opacity: 0.8;
    }
}

.pet-home-picture {
    position: absolute;
    top: 10%;
    right: 5%;
    display: grid;
    width: 16%;
    aspect-ratio: 1;
    place-items: center;
    border: 4px solid #fff8ef;
    border-radius: 12px;
    background: color-mix(in srgb, var(--pcolor) 16%, #fff);
    box-shadow: 0 7px 14px rgba(101, 70, 44, 0.12);
    color: var(--pcolor);
    font-size: 15px;
}

.pet-home-clock {
    position: absolute;
    top: 37%;
    left: 8%;
    width: 14%;
    aspect-ratio: 1;
    border: 3px solid #fff8ef;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #fffdf8, #f0e2ce);
    box-shadow: 0 6px 12px rgba(101, 70, 44, 0.12);

    &::before,
    &::after {
        position: absolute;
        bottom: 50%;
        left: 50%;
        content: '';
        border-radius: 2px;
        background: #8a6a4f;
        transform-origin: bottom center;
    }

    &::before {
        width: 2px;
        height: 28%;
        transform: translateX(-50%) rotate(42deg);
    }

    &::after {
        width: 2px;
        height: 20%;
        transform: translateX(-50%) rotate(-68deg);
    }
}

.pet-home-door {
    position: absolute;
    right: 1%;
    bottom: 44%;
    width: 24%;
    height: 26%;
    border-radius: 46% 46% 4px 4px / 24% 24% 4px 4px;
    background: linear-gradient(100deg, #b9855d, #9a6b48 60%, #845a3c);
    box-shadow:
        inset 0 0 0 3px #f6e6d2,
        inset 0 0 0 5px rgba(120, 76, 47, 0.22),
        0 8px 16px rgba(83, 54, 34, 0.18);

    &::before {
        position: absolute;
        inset: 12% 18% 10%;
        content: '';
        border: 2px solid rgba(255, 240, 220, 0.34);
        border-radius: 40% 40% 3px 3px / 18% 18% 3px 3px;
    }

    &::after {
        position: absolute;
        right: 18%;
        bottom: 30%;
        width: 9%;
        aspect-ratio: 1;
        content: '';
        border-radius: 50%;
        background: #f4d58c;
        box-shadow: 0 0 0 2px rgba(120, 76, 47, 0.24);
    }
}

.pet-home-plant {
    position: absolute;
    right: 5%;
    bottom: 10%;
    z-index: 1;
    font-size: 36px;
    filter: drop-shadow(0 8px 10px rgba(62, 84, 50, 0.16));
    transform: rotate(-4deg);
}

.pet-home-rug {
    position: absolute;
    bottom: 3.5%;
    left: 50%;
    width: 82%;
    height: 10%;
    min-height: 44px;
    transform: translateX(-50%);
    border-radius: 50%;
    background:
        radial-gradient(ellipse, transparent 42%, rgba(255, 255, 255, 0.52) 43% 48%, transparent 49%),
        repeating-linear-gradient(90deg, #eab8a4 0 18px, #e7aa93 18px 36px);
    box-shadow: 0 8px 18px rgba(99, 58, 33, 0.16);
    opacity: 0.9;
}

.pet-home-cushion {
    position: absolute;
    bottom: 8%;
    left: 9%;
    width: 24%;
    height: 6%;
    min-height: 26px;
    border-radius: 18px 18px 14px 14px;
    background: linear-gradient(145deg, #e8f0ff, #bfd1ee);
    box-shadow: 0 7px 12px rgba(69, 91, 130, 0.14);
    transform: rotate(-4deg);
}

.pet-home-bowl {
    position: absolute;
    right: 8%;
    bottom: 5%;
    z-index: 1;
    font-size: 28px;
    filter: drop-shadow(0 5px 7px rgba(82, 49, 27, 0.18));
}

.pet-home-table {
    position: absolute;
    right: 26%;
    bottom: 18%;
    z-index: 1;
    width: 15%;
    height: 11%;
}

.pet-home-table-top {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 30%;
    border: 3px solid #8a5a3b;
    border-radius: 4px;
    background: linear-gradient(180deg, #d8a06b, #bb7d4b);
    box-shadow:
        inset 0 3px 0 #e8b885,
        0 5px 9px rgba(83, 54, 34, 0.16);
}

.pet-home-table-leg {
    position: absolute;
    top: 28%;
    bottom: 0;
    width: 8%;
    background: #8a5a3b;
    box-shadow: inset -2px 0 0 #6e4630;

    &.is-left {
        left: 12%;
    }

    &.is-right {
        right: 12%;
    }
}

.pet-home-table-cup {
    position: absolute;
    z-index: 1;
    top: -26%;
    right: 22%;
    width: 20%;
    height: 28%;
    border: 2px solid #fff8ef;
    border-radius: 3px 3px 5px 5px;
    background: #8dc6d8;
    box-shadow:
        inset 0 3px 0 rgba(255, 255, 255, 0.42),
        0 3px 0 rgba(83, 54, 34, 0.12);
}
</style>
