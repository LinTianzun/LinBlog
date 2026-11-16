<template>
    <div class="pet-farm-achievements">
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
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import {
    homesteadAchievements,
    type HomesteadState,
} from '../../utils/desktopPetHomestead'

const props = defineProps<{
    homestead: HomesteadState
}>()

const emit = defineEmits<{
    (event: 'claim-achievement', achievementId: string): void
}>()

const achievementCards = computed(() => homesteadAchievements(props.homestead))
</script>

<style lang="less" scoped>
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
