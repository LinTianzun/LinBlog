<template>
    <div class="pet-farm-shop">
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
    homesteadBarnSpeedMultiplier,
    homesteadPondCooldownMs,
    nextHomesteadBarnUpgrade,
    nextHomesteadPlotExpansion,
    nextHomesteadPondUpgrade,
    type HomesteadCropId,
    type HomesteadDecorationId,
    type HomesteadState,
} from '../../utils/desktopPetHomestead'

const props = defineProps<{
    homestead: HomesteadState
}>()

const emit = defineEmits<{
    (event: 'buy-seed', cropId: HomesteadCropId): void
    (event: 'buy-fertilizer'): void
    (event: 'buy-plot'): void
    (event: 'upgrade-barn'): void
    (event: 'upgrade-pond'): void
    (event: 'buy-decoration', decorationId: HomesteadDecorationId): void
}>()

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
    .pet-farm-shop-grid {
        grid-template-columns: 1fr;
    }
}
</style>
