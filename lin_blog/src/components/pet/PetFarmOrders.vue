<template>
    <div class="pet-farm-orders">
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
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import {
    canCompleteOrder,
    getHomesteadItem,
    type HomesteadState,
} from '../../utils/desktopPetHomestead'

const props = defineProps<{
    homestead: HomesteadState
}>()

const emit = defineEmits<{
    (event: 'deliver-order', orderId: string): void
}>()

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
</script>

<style lang="less" scoped>
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

.pet-farm-business-hint {
    margin: 0;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 10px;
    line-height: 1.6;
}
</style>
