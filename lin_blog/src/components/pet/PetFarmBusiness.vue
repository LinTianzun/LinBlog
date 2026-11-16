<template>
    <yk-modal v-model="openModel" :title="modalTitle" size="m" :show-footer="false">
        <div class="pet-farm-business">
            <div class="pet-farm-business-summary">
                <span class="pet-farm-business-coins">
                    <span aria-hidden="true">🪙</span>{{ homestead.coins }} 金币
                </span>
                <span v-if="panelModel === 'orders'">
                    今日订单 {{ completedOrderCount }}/{{ homestead.orders.length }}
                </span>
                <span v-else-if="panelModel === 'achievements'">
                    已解锁 {{ unlockedAchievementCount }}/{{ achievementCards.length }}
                    <template v-if="claimableAchievementCount">
                        · 可领取 {{ claimableAchievementCount }}
                    </template>
                </span>
                <span v-else>
                    种子、农资与扩建 · 装饰 {{ homestead.decorations.length }}
                </span>
            </div>

            <div class="pet-farm-business-tabs" role="tablist" aria-label="农场经营">
                <button type="button" role="tab" :aria-selected="panelModel === 'orders'"
                    :class="{ 'is-active': panelModel === 'orders' }"
                    @click="panelModel = 'orders'">
                    📋 今日订单
                </button>
                <button type="button" role="tab" :aria-selected="panelModel === 'shop'"
                    :class="{ 'is-active': panelModel === 'shop' }"
                    @click="panelModel = 'shop'">
                    🛒 农场商店
                </button>
                <button type="button" role="tab"
                    :aria-selected="panelModel === 'achievements'"
                    :class="{ 'is-active': panelModel === 'achievements' }"
                    @click="panelModel = 'achievements'">
                    🏆 小院成就
                </button>
            </div>

            <PetFarmOrders v-if="panelModel === 'orders'"
                :homestead="homestead"
                @deliver-order="orderId => emit('deliver-order', orderId)" />

            <PetFarmAchievements v-else-if="panelModel === 'achievements'"
                :homestead="homestead"
                @claim-achievement="achievementId => emit('claim-achievement', achievementId)" />

            <PetFarmShop v-else :homestead="homestead"
                @buy-seed="cropId => emit('buy-seed', cropId)"
                @buy-fertilizer="emit('buy-fertilizer')"
                @buy-plot="emit('buy-plot')"
                @upgrade-barn="emit('upgrade-barn')"
                @upgrade-pond="emit('upgrade-pond')"
                @buy-decoration="decorationId => emit('buy-decoration', decorationId)" />
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import PetFarmAchievements from './PetFarmAchievements.vue'
import PetFarmOrders from './PetFarmOrders.vue'
import PetFarmShop from './PetFarmShop.vue'
import {
    homesteadAchievements,
    type HomesteadCropId,
    type HomesteadDecorationId,
    type HomesteadState,
} from '../../utils/desktopPetHomestead'

export type HomesteadBusinessPanel = 'orders' | 'shop' | 'achievements'

const openModel = defineModel<boolean>({ default: false })
const panelModel = defineModel<HomesteadBusinessPanel>('panel', {
    default: 'orders',
})

const props = defineProps<{
    homestead: HomesteadState
}>()

const emit = defineEmits<{
    (event: 'deliver-order', orderId: string): void
    (event: 'claim-achievement', achievementId: string): void
    (event: 'buy-seed', cropId: HomesteadCropId): void
    (event: 'buy-fertilizer'): void
    (event: 'buy-plot'): void
    (event: 'upgrade-barn'): void
    (event: 'upgrade-pond'): void
    (event: 'buy-decoration', decorationId: HomesteadDecorationId): void
}>()

const modalTitle = computed(() =>
    panelModel.value === 'orders'
        ? '今日订单'
        : panelModel.value === 'shop'
          ? '农场商店'
          : '小院成就'
)
const completedOrderCount = computed(
    () => props.homestead.orders.filter((order) => order.completedAt > 0).length
)
const achievementCards = computed(() =>
    homesteadAchievements(props.homestead)
)
const unlockedAchievementCount = computed(
    () => achievementCards.value.filter((item) => item.unlocked).length
)
const claimableAchievementCount = computed(
    () =>
        achievementCards.value.filter(
            (item) => item.unlocked && !item.claimed
        ).length
)
</script>

<style lang="less" scoped>
.pet-farm-business {
    display: flex;
    flex-direction: column;
    gap: 13px;
    min-width: min(520px, 78vw);
    max-height: min(68vh, 640px);
    overflow-y: auto;
    padding-right: 2px;
}

.pet-farm-business-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
}

.pet-farm-business-coins {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #9a6500;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;

    span {
        font-size: 17px;
        line-height: 1;
    }
}

.pet-farm-business-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor2);

    button {
        min-height: 34px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--admin-muted, var(--gray6));
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;

        &.is-active {
            background: var(--pcolor);
            color: #fff;
            box-shadow: 0 4px 10px color-mix(in srgb, var(--pcolor) 26%, transparent);
        }

        &:focus-visible {
            outline: 2px solid var(--pcolor);
            outline-offset: 2px;
        }
    }
}

@media (max-width: 720px) {
    .pet-farm-business {
        min-width: auto;
        max-height: 66vh;
    }
}
</style>
