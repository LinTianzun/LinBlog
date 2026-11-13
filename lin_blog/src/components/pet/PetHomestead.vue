<template>
    <div v-if="tab !== 'home'" class="pet-homestead-business">
        <span class="pet-homestead-coins" title="小院金币">
            <span aria-hidden="true">🪙</span><b>{{ coins }}</b>
        </span>
        <span class="pet-homestead-orders-progress">
            今日订单 {{ completedOrders }}/{{ orderTotal }}
        </span>
        <div class="pet-homestead-business-actions">
            <button type="button" class="pet-homestead-business-orders"
                @click="emit('open-business', 'orders')">
                <span aria-hidden="true">📋</span>订单
                <b v-if="claimableOrders">{{ claimableOrders }}</b>
            </button>
            <button type="button" class="pet-homestead-business-shop"
                @click="emit('open-business', 'shop')">
                <span aria-hidden="true">🛒</span>商店
            </button>
            <button type="button" class="pet-homestead-business-achievements"
                @click="emit('open-business', 'achievements')">
                <span aria-hidden="true">🏆</span>成就
                <b v-if="claimableAchievements">
                    {{ claimableAchievements }}
                </b>
            </button>
        </div>
    </div>

    <div v-if="tab !== 'home'" class="pet-homestead-tools">
        <div v-if="tab === 'grow'" class="pet-homestead-seeds"
            role="group" aria-label="选择种子">
            <button v-for="crop in crops" :key="crop.id" type="button"
                class="pet-homestead-seed"
                :class="{
                    'is-active': selectedSeedId === crop.id,
                    'is-sold-out': seedStock[crop.id] <= 0,
                }"
                :aria-pressed="selectedSeedId === crop.id"
                :title="`${crop.name}，库存 ${seedStock[crop.id]}，${formatHomesteadDuration(crop.growMs)}成熟`"
                @click="emit('select-seed', crop.id)">
                <span aria-hidden="true">{{ crop.icon }}</span>
                <small>{{ crop.name }} ×{{ seedStock[crop.id] }}</small>
            </button>
        </div>
        <span v-else class="pet-homestead-hint">
            {{ tab === 'raise'
                ? '动物产物会随时间刷新，记得来收'
                : '鱼塘有冷却，耐心等它上钩' }}
        </span>
        <button type="button" class="pet-homestead-tend" :disabled="tendCount === 0"
            :title="tendCount ? '浇水、收获、收取产物并钓鱼' : '小院暂时没有需要忙的'"
            @click="emit('tend')">
            <span aria-hidden="true">🧺</span>一键照料
            <b v-if="tendCount" class="pet-homestead-tend-count">
                {{ tendCount }}
            </b>
        </button>
    </div>

    <div v-if="tab !== 'home'" class="pet-homestead-store"
        role="status" aria-live="polite">
        <span class="pet-homestead-store-label">仓库</span>
        <template v-if="inventoryChips.length">
            <span v-for="item in inventoryChips" :key="item.id" class="pet-homestead-item">
                <span aria-hidden="true">{{ item.icon }}</span>{{ item.name }} ×{{ item.count }}
            </span>
        </template>
        <span v-else class="pet-homestead-store-empty">
            空空如也，去对应的区域忙一轮吧
        </span>
    </div>

    <div v-if="tab !== 'home'" class="pet-homestead-auto">
        <div class="pet-homestead-auto-copy">
            <strong>自动帮忙</strong>
            <span>{{ autoHelpStatus }}</span>
        </div>
        <div class="pet-homestead-auto-actions">
            <button type="button" class="pet-homestead-auto-now"
                :disabled="!autoHelpEnabled"
                title="让它现在就去小院忙一轮"
                @click="emit('request-auto-help')">
                <span aria-hidden="true">🐾</span>去帮忙
            </button>
            <yk-switch :model-value="autoHelpEnabled" :checked-value="true"
                :unchecked-value="false" aria-label="自动帮忙"
                @update:model-value="emit('update:autoHelpEnabled', $event)" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import {
    formatHomesteadDuration,
    type HomesteadCropDefinition,
    type HomesteadCropId,
} from '../../utils/desktopPetHomestead'

type PetHomesteadTab = 'home' | 'grow' | 'raise' | 'fish'

interface PetHomesteadInventoryChip {
    id: string
    name: string
    icon: string
    count: number
}

defineProps<{
    tab: PetHomesteadTab
    coins: number
    completedOrders: number
    orderTotal: number
    claimableOrders: number
    claimableAchievements: number
    crops: readonly HomesteadCropDefinition[]
    seedStock: Record<HomesteadCropId, number>
    selectedSeedId: HomesteadCropId
    tendCount: number
    inventoryChips: PetHomesteadInventoryChip[]
    autoHelpEnabled: boolean
    autoHelpStatus: string
}>()

const emit = defineEmits<{
    (e: 'open-business', panel: 'orders' | 'shop' | 'achievements'): void
    (e: 'select-seed', cropId: HomesteadCropId): void
    (e: 'tend'): void
    (e: 'request-auto-help'): void
    (e: 'update:autoHelpEnabled', value: boolean): void
}>()
</script>
