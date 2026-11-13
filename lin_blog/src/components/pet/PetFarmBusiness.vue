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
                    种子、农资与扩建 · 装饰 {{ ownedDecorationCount }}
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

            <div v-if="panelModel === 'orders'" class="pet-farm-orders">
                <article v-for="order in orderCards" :key="order.id"
                    class="pet-farm-order"
                    :class="{
                        'is-complete': order.completed,
                        'is-ready': order.canComplete,
                    }">
                    <header class="pet-farm-order-head">
                        <strong>订单 {{ order.index + 1 }}</strong>
                        <span class="pet-farm-order-reward">+{{ order.reward }} 🪙</span>
                    </header>
                    <div class="pet-farm-order-items">
                        <span v-for="item in order.items" :key="item.id"
                            class="pet-farm-order-item"
                            :class="{ 'is-missing': !item.enough && !order.completed }">
                            <span aria-hidden="true">{{ item.icon }}</span>{{ item.name }}
                            {{ item.have }}/{{ item.need }}
                        </span>
                    </div>
                    <footer class="pet-farm-order-foot">
                        <span>
                            {{ order.completed
                                ? '已交付'
                                : order.canComplete
                                  ? '材料齐了，可以交付'
                                  : '材料还不够' }}
                        </span>
                        <button v-if="!order.completed" type="button"
                            :disabled="!order.canComplete"
                            @click="emit('deliver-order', order.id)">
                            交付
                        </button>
                    </footer>
                </article>
                <p class="pet-farm-business-hint">
                    每天 0 点刷新 3 个订单，交付后获得金币。
                </p>
            </div>

            <div v-else-if="panelModel === 'achievements'"
                class="pet-farm-achievements">
                <article v-for="item in achievementCards" :key="item.id"
                    class="pet-farm-achievement"
                    :class="{ 'is-unlocked': item.unlocked }">
                    <span class="pet-farm-achievement-icon" aria-hidden="true">
                        {{ item.icon }}
                    </span>
                    <div class="pet-farm-achievement-copy">
                        <strong>{{ item.name }}</strong>
                        <small>{{ item.description }}</small>
                        <div class="pet-farm-achievement-progress" aria-hidden="true">
                            <i :style="{ width: `${item.percent}%` }" />
                        </div>
                    </div>
                    <div class="pet-farm-achievement-side">
                        <span>+{{ item.reward }} 🪙</span>
                        <button v-if="item.unlocked && !item.claimed" type="button"
                            @click="emit('claim-achievement', item.id)">
                            领取
                        </button>
                        <b v-else-if="item.claimed">已领取</b>
                        <b v-else>{{ item.current }}/{{ item.target }}</b>
                    </div>
                </article>
                <p class="pet-farm-business-hint">
                    成就解锁后可领取金币，领取记录会随小院存档跨设备同步。
                </p>
            </div>

            <div v-else class="pet-farm-shop">
                <section class="pet-farm-shop-section">
                    <h4>种子</h4>
                    <div class="pet-farm-shop-grid">
                        <article v-for="item in seedShopItems" :key="item.id"
                            class="pet-farm-shop-card">
                            <span class="pet-farm-shop-icon" aria-hidden="true">{{ item.icon }}</span>
                            <div class="pet-farm-shop-copy">
                                <strong>{{ item.name }}种子</strong>
                                <small>库存 {{ item.stock }}</small>
                            </div>
                            <div class="pet-farm-shop-buy">
                                <span>{{ item.price }} 🪙</span>
                                <button type="button"
                                    :disabled="homestead.coins < item.price"
                                    @click="emit('buy-seed', item.id)">
                                    +{{ item.pack }}
                                </button>
                            </div>
                        </article>
                    </div>
                </section>
                <section class="pet-farm-shop-section">
                    <h4>农资</h4>
                    <div class="pet-farm-shop-grid">
                        <article class="pet-farm-shop-card">
                            <span class="pet-farm-shop-icon" aria-hidden="true">🌱</span>
                            <div class="pet-farm-shop-copy">
                                <strong>肥料</strong>
                                <small>库存 {{ homestead.inventory.fertilizer }}</small>
                            </div>
                            <div class="pet-farm-shop-buy">
                                <span>{{ HOMESTEAD_FERTILIZER_PACK.price }} 🪙</span>
                                <button type="button"
                                    :disabled="homestead.coins < HOMESTEAD_FERTILIZER_PACK.price"
                                    @click="emit('buy-fertilizer')">
                                    +{{ HOMESTEAD_FERTILIZER_PACK.count }}
                                </button>
                            </div>
                        </article>
                    </div>
                </section>
                <section class="pet-farm-shop-section">
                    <h4>小院扩建</h4>
                    <div class="pet-farm-shop-grid pet-farm-shop-grid-upgrades">
                        <article class="pet-farm-shop-card">
                            <span class="pet-farm-shop-icon" aria-hidden="true">🌾</span>
                            <div class="pet-farm-shop-copy">
                                <strong>菜地 {{ homestead.plotCount }}/{{ HOMESTEAD_MAX_PLOT_COUNT }} 块</strong>
                                <small>
                                    {{ plotExpansionOffer
                                        ? '再开一块地，种更多作物'
                                        : '菜地已经全部开垦' }}
                                </small>
                            </div>
                            <div class="pet-farm-shop-buy">
                                <template v-if="plotExpansionOffer">
                                    <span>{{ plotExpansionOffer.price }} 🪙</span>
                                    <button type="button"
                                        :disabled="homestead.coins < plotExpansionOffer.price"
                                        @click="emit('buy-plot')">
                                        +1 块
                                    </button>
                                </template>
                                <b v-else>已满</b>
                            </div>
                        </article>
                        <article class="pet-farm-shop-card">
                            <span class="pet-farm-shop-icon" aria-hidden="true">🏠</span>
                            <div class="pet-farm-shop-copy">
                                <strong>
                                    畜棚 Lv.{{ homestead.barnLevel }}/{{ HOMESTEAD_BARN_MAX_LEVEL }}
                                </strong>
                                <small>
                                    产物与粪便速度 +{{ barnSpeedPercent }}%
                                </small>
                            </div>
                            <div class="pet-farm-shop-buy">
                                <template v-if="barnUpgradeOffer">
                                    <span>{{ barnUpgradeOffer.price }} 🪙</span>
                                    <button type="button"
                                        :disabled="homestead.coins < barnUpgradeOffer.price"
                                        @click="emit('upgrade-barn')">
                                        升级
                                    </button>
                                </template>
                                <b v-else>已满级</b>
                            </div>
                        </article>
                        <article class="pet-farm-shop-card">
                            <span class="pet-farm-shop-icon" aria-hidden="true">🎣</span>
                            <div class="pet-farm-shop-copy">
                                <strong>
                                    鱼塘 Lv.{{ homestead.pondLevel }}/{{ HOMESTEAD_POND_MAX_LEVEL }}
                                </strong>
                                <small>钓鱼冷却 {{ pondCooldownMinutes }} 分钟</small>
                            </div>
                            <div class="pet-farm-shop-buy">
                                <template v-if="pondUpgradeOffer">
                                    <span>{{ pondUpgradeOffer.price }} 🪙</span>
                                    <button type="button"
                                        :disabled="homestead.coins < pondUpgradeOffer.price"
                                        @click="emit('upgrade-pond')">
                                        升级
                                    </button>
                                </template>
                                <b v-else>已满级</b>
                            </div>
                        </article>
                    </div>
                </section>
                <section class="pet-farm-shop-section">
                    <h4>小院装饰 · 已拥有 {{ ownedDecorationCount }}</h4>
                    <div class="pet-farm-shop-grid">
                        <article v-for="item in decorationShopItems" :key="item.id"
                            class="pet-farm-shop-card">
                            <span class="pet-farm-shop-icon" aria-hidden="true">{{ item.icon }}</span>
                            <div class="pet-farm-shop-copy">
                                <strong>{{ item.name }}</strong>
                                <small>{{ item.owned ? '已摆在院子里' : item.description }}</small>
                            </div>
                            <div class="pet-farm-shop-buy">
                                <template v-if="!item.owned">
                                    <span>{{ item.price }} 🪙</span>
                                    <button type="button"
                                        :disabled="homestead.coins < item.price"
                                        @click="emit('buy-decoration', item.id)">
                                        购买
                                    </button>
                                </template>
                                <b v-else>已拥有</b>
                            </div>
                        </article>
                    </div>
                </section>
                <p class="pet-farm-business-hint">
                    种子按包出售；扩建会永久提升小院产能，装饰会显示在小院场景里。
                </p>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import {
    HOMESTEAD_BARN_MAX_LEVEL,
    HOMESTEAD_CROPS,
    HOMESTEAD_DECORATIONS,
    HOMESTEAD_FERTILIZER_PACK,
    HOMESTEAD_MAX_PLOT_COUNT,
    HOMESTEAD_POND_MAX_LEVEL,
    HOMESTEAD_SEED_PACKS,
    canCompleteOrder,
    getHomesteadItem,
    homesteadAchievements,
    homesteadBarnSpeedMultiplier,
    homesteadPondCooldownMs,
    nextHomesteadBarnUpgrade,
    nextHomesteadPlotExpansion,
    nextHomesteadPondUpgrade,
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
const orderCards = computed(() =>
    props.homestead.orders.map((order, index) => {
        const items = order.requirements.map((requirement) => {
            const item = getHomesteadItem(requirement.itemId)
            const have = props.homestead.inventory[requirement.itemId]
            return {
                ...item,
                need: requirement.count,
                have,
                enough: have >= requirement.count,
            }
        })
        return {
            ...order,
            index,
            items,
            completed: order.completedAt > 0,
            canComplete: canCompleteOrder(props.homestead, order),
        }
    })
)
const completedOrderCount = computed(
    () => orderCards.value.filter((order) => order.completed).length
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
const seedShopItems = computed(() =>
    HOMESTEAD_CROPS.map((crop) => ({
        ...crop,
        price: HOMESTEAD_SEED_PACKS[crop.id].price,
        pack: HOMESTEAD_SEED_PACKS[crop.id].count,
        stock: props.homestead.seedStock[crop.id],
    }))
)
const plotExpansionOffer = computed(() =>
    nextHomesteadPlotExpansion(props.homestead)
)
const barnUpgradeOffer = computed(() =>
    nextHomesteadBarnUpgrade(props.homestead)
)
const pondUpgradeOffer = computed(() =>
    nextHomesteadPondUpgrade(props.homestead)
)
const barnSpeedPercent = computed(() =>
    Math.round(
        (1 - homesteadBarnSpeedMultiplier(props.homestead.barnLevel)) * 100
    )
)
const pondCooldownMinutes = computed(() =>
    Math.round(homesteadPondCooldownMs(props.homestead) / 60_000)
)
const decorationShopItems = computed(() =>
    HOMESTEAD_DECORATIONS.map((decoration) => ({
        ...decoration,
        owned: props.homestead.decorations.includes(decoration.id),
    }))
)
const ownedDecorationCount = computed(
    () => props.homestead.decorations.length
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

.pet-farm-orders {
    display: flex;
    flex-direction: column;
    gap: 9px;
}

.pet-farm-order {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--admin-surface, var(--bgColor1));
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        opacity 0.18s ease;

    &.is-ready {
        border-color: color-mix(in srgb, #e8a93b 42%, var(--admin-line, var(--gray1)));
        box-shadow: 0 6px 18px rgba(208, 151, 44, 0.12);
    }

    &.is-complete {
        opacity: 0.62;
        background: var(--bgColor2);
    }
}

.pet-farm-order-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }
}

.pet-farm-order-reward {
    color: #9a6500;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.pet-farm-order-items {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.pet-farm-order-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--pcolor) 7%, var(--bgColor2));
    color: var(--admin-text, var(--gray));
    font-size: 11px;
    font-variant-numeric: tabular-nums;

    &.is-missing {
        background: color-mix(in srgb, #d9534f 8%, var(--bgColor2));
        color: #b64440;
    }
}

.pet-farm-order-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;

    button {
        min-height: 30px;
        padding: 0 14px;
        border: 0;
        border-radius: 9px;
        background: linear-gradient(135deg, #f0ad3d, #e49722);
        color: #fff;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 5px 12px rgba(210, 146, 29, 0.24);

        &:disabled {
            cursor: not-allowed;
            opacity: 0.42;
            box-shadow: none;
        }

        &:focus-visible {
            outline: 2px solid #e8a93b;
            outline-offset: 2px;
        }
    }
}

.pet-farm-achievements {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.pet-farm-achievement {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 11px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 13px;
    background: var(--admin-surface, var(--bgColor1));

    &.is-unlocked {
        border-color: color-mix(in srgb, #e8a93b 44%, var(--admin-line, var(--gray1)));
        background:
            linear-gradient(135deg,
                color-mix(in srgb, #f2b94c 12%, transparent),
                transparent 62%),
            var(--admin-surface, var(--bgColor1));
    }
}

.pet-farm-achievement-icon {
    display: grid;
    width: 38px;
    height: 38px;
    flex: none;
    place-items: center;
    border-radius: 11px;
    background: color-mix(in srgb, var(--pcolor) 8%, var(--bgColor2));
    font-size: 20px;
}

.pet-farm-achievement-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 12px;
    }

    small {
        overflow: hidden;
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        line-height: 1.45;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.pet-farm-achievement-progress {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--bgColor2);

    i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #e8a93b, #f4ca72);
        transition: width 0.24s ease;
    }
}

.pet-farm-achievement-side {
    display: flex;
    min-width: 62px;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;

    > span {
        color: #9a6500;
        font-size: 10px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    > b {
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        font-variant-numeric: tabular-nums;
    }

    button {
        min-width: 48px;
        min-height: 27px;
        padding: 0 10px;
        border: 0;
        border-radius: 8px;
        background: linear-gradient(135deg, #f0ad3d, #e49722);
        color: #fff;
        font: inherit;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(210, 146, 29, 0.2);

        &:focus-visible {
            outline: 2px solid #e8a93b;
            outline-offset: 2px;
        }
    }
}

.pet-farm-shop {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.pet-farm-shop-section {
    display: flex;
    flex-direction: column;
    gap: 8px;

    h4 {
        margin: 0;
        color: var(--admin-text, var(--gray));
        font-size: 12px;
        font-weight: 700;
    }
}

.pet-farm-shop-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.pet-farm-shop-grid-upgrades {
    grid-template-columns: 1fr;
}

.pet-farm-shop-card {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--admin-surface, var(--bgColor1));
}

.pet-farm-shop-icon {
    display: grid;
    width: 34px;
    height: 34px;
    flex: none;
    place-items: center;
    border-radius: 10px;
    background: color-mix(in srgb, var(--pcolor) 8%, var(--bgColor2));
    font-size: 19px;
}

.pet-farm-shop-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    strong {
        overflow: hidden;
        color: var(--admin-text, var(--gray));
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    small {
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        font-variant-numeric: tabular-nums;
    }
}

.pet-farm-shop-buy {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;

    span {
        color: #9a6500;
        font-size: 10px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    b {
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        font-weight: 600;
    }

    button {
        min-width: 42px;
        min-height: 26px;
        border: 0;
        border-radius: 8px;
        background: var(--pcolor);
        color: #fff;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.42;
        }

        &:focus-visible {
            outline: 2px solid var(--pcolor);
            outline-offset: 2px;
        }
    }
}

.pet-farm-business-hint {
    margin: 0;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 10px;
    line-height: 1.6;
}

@media (max-width: 720px) {
    .pet-farm-business {
        min-width: auto;
        max-height: 66vh;
    }

    .pet-farm-shop-grid {
        grid-template-columns: 1fr;
    }
}
</style>
