<template>
    <section class="pet-hero">
        <span class="pet-hero-orbit pet-hero-orbit-a" aria-hidden="true" />
        <span class="pet-hero-orbit pet-hero-orbit-b" aria-hidden="true" />

        <div class="pet-hero-main">
            <div class="pet-hero-avatar" aria-hidden="true">
                <IconHeartFill />
            </div>
            <div class="pet-hero-copy">
                <span class="pet-hero-kicker">MY COMPANION</span>
                <h1>{{ displayPetName }}</h1>
                <p>
                    {{ petTitle }} · 已连续陪伴 {{ petVitals.streakDays }} 天 ·
                    累计互动 {{ petVitals.totalInteractions }} 次
                </p>
                <div class="pet-hero-tags">
                    <span>称号 {{ petTitle }}</span>
                    <span>心情 {{ vitalsMoodLabel(petVitals) }}</span>
                    <span>亲密度 Lv.{{ vitalsIntimacyLevel(petVitals) }}</span>
                </div>
            </div>
        </div>

        <div class="pet-hero-actions">
            <yk-button type="primary" :disabled="feedCooldownLeft > 0"
                @click="emit('feed', selectedFood.id)">
                {{ selectedFood.icon }} 喂一口
            </yk-button>
            <span v-if="feedCooldownLeft > 0" class="pet-feed-cooldown">
                冷却中 {{ feedCooldownSeconds }}s
            </span>
            <span v-else-if="!canEditPet">站点展示与行为仅管理员可修改</span>
        </div>
    </section>

    <section class="pet-card">
        <header class="pet-card-head">
            <div>
                <h2>我的宠物</h2>
                <p>名字与养成状态会跟随账号跨设备同步</p>
                <p v-if="petSyncState === 'pending'" class="pet-sync-note">
                    {{ petSyncHint }}
                </p>
            </div>
            <div class="pet-card-badges">
                <span class="pet-sync-chip" :class="`is-${petSyncState}`"
                    role="status" aria-live="polite" :title="petSyncHint">
                    <span class="pet-sync-dot" aria-hidden="true" />
                    {{ petSyncLabel }}
                </span>
                <button v-if="petSyncState === 'pending'" type="button"
                    class="pet-sync-retry" @click="emit('retry-sync')">
                    重试
                </button>
                <span class="pet-level-pill">Lv.{{ vitalsIntimacyLevel(petVitals) }}</span>
            </div>
        </header>

        <div class="pet-name-row">
            <div class="pet-name-copy">
                <strong>桌宠名字</strong>
                <span>会出现在问候和状态气泡里，留空则默认叫「小 Lin」。</span>
            </div>
            <label class="pet-name-field">
                <input :value="petNameDraft" maxlength="16" placeholder="小 Lin"
                    aria-label="桌宠名字" @input="onNameInput"
                    @change="emit('save-name')" @keyup.enter="emit('save-name')" />
            </label>
        </div>

        <div class="pet-stat-grid">
            <div class="pet-stat">
                <div class="pet-stat-head">
                    <span>心情</span>
                    <strong>{{ petVitals.mood }}</strong>
                </div>
                <span class="pet-stat-track is-mood">
                    <span :style="{ width: `${petVitals.mood}%` }" />
                </span>
            </div>
            <div class="pet-stat">
                <div class="pet-stat-head">
                    <span>饱腹</span>
                    <strong>{{ petVitals.satiety }}</strong>
                </div>
                <span class="pet-stat-track is-satiety">
                    <span :style="{ width: `${petVitals.satiety}%` }" />
                </span>
            </div>
            <div class="pet-stat">
                <div class="pet-stat-head">
                    <span>亲密度</span>
                    <strong>{{ petVitals.intimacy }}</strong>
                </div>
                <span class="pet-stat-track is-intimacy">
                    <span :style="{ width: `${petVitals.intimacy}%` }" />
                </span>
            </div>
        </div>

        <div class="pet-snack-shelf">
            <div class="pet-snack-head">
                <div>
                    <strong>零食柜</strong>
                    <span>不同零食的饱腹、心情和亲密度加成不同，每 60 秒可以喂一次。</span>
                </div>
                <span class="pet-snack-current">
                    已选 {{ selectedFood.icon }} {{ selectedFood.name }}
                </span>
            </div>
            <div class="pet-snack-grid">
                <button v-for="food in PET_FOODS" :key="food.id" type="button"
                    class="pet-snack-card"
                    :class="{ 'is-selected': food.id === selectedFoodId }"
                    :disabled="feedCooldownLeft > 0" @click="emit('feed', food.id)">
                    <span class="pet-snack-icon" aria-hidden="true">{{ food.icon }}</span>
                    <span class="pet-snack-copy">
                        <span class="pet-snack-title">
                            <strong>{{ food.name }}</strong>
                            <small>{{ food.tag }}</small>
                        </span>
                        <span class="pet-snack-desc">{{ food.description }}</span>
                        <span class="pet-snack-stats">
                            饱腹 +{{ food.satiety }} · 心情 +{{ food.mood }} · 亲密 +{{
                                food.intimacy }}
                        </span>
                    </span>
                </button>
            </div>
        </div>

        <div class="pet-next-row">
            <div class="pet-next-copy">
                <span>下一个目标</span>
                <strong v-if="petMilestone">
                    {{ petMilestone.label }} {{ petMilestone.target
                    }}{{ petMilestone.kind === 'streak' ? ' 天' : ' 次' }}
                </strong>
                <strong v-else>所有陪伴目标都完成啦</strong>
                <small v-if="petMilestone">
                    还差 {{ petMilestone.remaining }}{{ petMilestone.kind === 'streak' ? ' 天' : ' 次' }}
                </small>
                <small v-else>它已经很习惯有你在身边了。</small>
            </div>
            <div v-if="petMilestone" class="pet-next-progress" aria-hidden="true">
                <span
                    :style="{ width: `${petMilestonePercent(petMilestone.current, petMilestone.target)}%` }" />
            </div>
        </div>

        <div class="pet-reset-row">
            <div class="pet-reset-copy">
                <strong>重新养一只</strong>
                <span>清空名字、成长进度、成就和今日任务；其他设备会同步这次重置。</span>
            </div>
            <yk-button type="secondary" status="danger" @click="emit('reset-growth')">
                重新养一只
            </yk-button>
        </div>
    </section>

    <section class="pet-card pet-tasks-card">
        <header class="pet-card-head">
            <div>
                <h2>今日小任务</h2>
                <p>每天 0 点刷新，完成奖励只发放一次。</p>
            </div>
            <span class="pet-task-count">
                {{ completedDailyTaskCount }}/{{ petDailyTasks.length }}
            </span>
        </header>

        <div class="pet-task-list">
            <article v-for="task in petDailyTasks" :key="task.key" class="pet-task"
                :class="{ 'is-done': task.done }">
                <div class="pet-task-top">
                    <span class="pet-task-icon" aria-hidden="true">{{ task.icon }}</span>
                    <span class="pet-task-state" :class="{ 'is-done': task.done }">
                        {{ task.done ? '已完成' : '进行中' }}
                    </span>
                </div>
                <strong>{{ task.label }}</strong>
                <p>{{ task.description }}</p>
                <span class="pet-task-reward">
                    心情 +{{ task.reward.mood }} · 亲密度 +{{ task.reward.intimacy }}
                </span>
            </article>
        </div>
    </section>

    <section class="pet-card">
        <header class="pet-card-head">
            <div>
                <h2>成长足迹</h2>
                <p>
                    已解锁 {{ unlockedAchievementCount }} 个成就，达成后即使进度回落也会保留
                    <template v-if="newAchievementCount"> · {{ newAchievementCount }} 个新成就</template>
                </p>
            </div>
        </header>

        <div class="pet-achievement-groups">
            <div v-for="group in petMilestones" :key="group.label" class="pet-achievement-group">
                <div class="pet-achievement-head">
                    <span>{{ group.label }}</span>
                    <small>
                        {{ group.items.filter(item => item.achieved).length }}/{{ group.items.length }}
                    </small>
                </div>
                <div class="pet-milestone-list">
                    <div v-for="item in group.items" :key="`${item.kind}-${item.target}`"
                        class="pet-milestone" :class="{ 'is-achieved': item.achieved }">
                        <span class="pet-milestone-target">
                            {{ item.target }}{{ item.kind === 'streak' ? '天' : '次' }}
                        </span>
                        <span class="pet-milestone-track">
                            <span
                                :style="{ width: `${petMilestonePercent(item.current, item.target)}%` }" />
                        </span>
                        <span class="pet-milestone-state">
                            <span v-if="item.isNew" class="pet-milestone-new">新</span>
                            {{ item.achieved ? '已解锁' : `${item.current}/${item.target}` }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { IconHeartFill } from '@yike-design/ui/es/components/svg-icon'
import { PET_FOODS, type PetFood, type PetFoodId } from '../../utils/desktopPetFood'
import {
    vitalsIntimacyLevel,
    vitalsMoodLabel,
    type PetMilestone,
    type PetMilestoneGroup,
    type PetVitals,
} from '../../utils/desktopPetVitals'
import type { PetSyncState } from '../../utils/desktopPetSync'

interface DailyTaskView {
    key: string
    icon: string
    label: string
    description: string
    done: boolean
    reward: {
        mood: number
        intimacy: number
    }
}

defineProps<{
    displayPetName: string
    petTitle: string
    petVitals: PetVitals
    selectedFood: PetFood
    selectedFoodId: PetFoodId
    feedCooldownLeft: number
    feedCooldownSeconds: number
    canEditPet: boolean
    petSyncState: PetSyncState
    petSyncHint: string
    petSyncLabel: string
    petNameDraft: string
    petMilestone: PetMilestone | null
    petMilestones: PetMilestoneGroup[]
    petDailyTasks: DailyTaskView[]
    completedDailyTaskCount: number
    unlockedAchievementCount: number
    newAchievementCount: number
}>()

const emit = defineEmits<{
    (e: 'feed', foodId: PetFoodId): void
    (e: 'retry-sync'): void
    (e: 'pet-name-input', value: string): void
    (e: 'save-name'): void
    (e: 'reset-growth'): void
}>()

const onNameInput = (event: Event) => {
    emit('pet-name-input', (event.target as HTMLInputElement).value)
}

const petMilestonePercent = (current: number, target: number) =>
    Math.min(100, Math.round((current / target) * 100))
</script>

<style lang="less">
.pet-hero {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    overflow: hidden;
    padding: 28px 30px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 24px;
    background:
        radial-gradient(circle at 6% 12%, color-mix(in srgb, var(--pcolor) 22%, transparent), transparent 32%),
        radial-gradient(circle at 88% 8%, color-mix(in srgb, var(--scolor, #1fb4a2) 16%, transparent), transparent 28%),
        linear-gradient(120deg,
            color-mix(in srgb, var(--pcolor) 9%, var(--admin-surface, var(--bgColor1))),
            var(--admin-surface, var(--bgColor1)) 58%,
            color-mix(in srgb, var(--scolor, #1fb4a2) 8%, var(--admin-surface, var(--bgColor1))));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.pet-hero-orbit {
    position: absolute;
    border: 1px solid color-mix(in srgb, var(--pcolor) 18%, transparent);
    border-radius: 50%;
    pointer-events: none;
}

.pet-hero-orbit-a {
    top: -88px;
    right: 18%;
    width: 210px;
    height: 210px;
}

.pet-hero-orbit-b {
    right: -54px;
    bottom: -100px;
    width: 260px;
    height: 260px;
    border-color: color-mix(in srgb, var(--scolor, #1fb4a2) 16%, transparent);
}

.pet-hero-main {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 18px;
}

.pet-hero-avatar {
    display: grid;
    width: 78px;
    height: 78px;
    flex: none;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 24px;
    color: #fff;
    background: linear-gradient(135deg, var(--pcolor), var(--pcolor8) 60%, var(--scolor, #1fb4a2));
    box-shadow:
        0 14px 32px color-mix(in srgb, var(--pcolor) 30%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.34);

    .yk-icon {
        width: 32px;
        height: 32px;
    }
}

.pet-hero-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;

    h1 {
        margin: 0;
        overflow: hidden;
        color: var(--admin-text, var(--gray));
        font-size: 27px;
        font-weight: 760;
        letter-spacing: -0.02em;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    p {
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 13px;
    }
}

.pet-hero-kicker {
    color: var(--pcolor);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.16em;
}

.pet-hero-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 3px;

    span {
        padding: 4px 10px;
        border: 1px solid color-mix(in srgb, var(--pcolor) 18%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--pcolor) 6%, transparent);
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
    }
}

.pet-hero-actions {
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;

    > span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
    }
}

.pet-manage-grid {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 0.9fr) minmax(560px, 1.1fr);
    align-items: start;
    gap: 20px;
}

.pet-manage-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.pet-manage-side {
    min-width: 0;
    position: sticky;
    top: 88px;
    align-self: start;
}

.pet-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 22px 24px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 20px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.pet-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 16px;

    h2 {
        margin: 0;
        color: var(--admin-text, var(--gray));
        font-size: 16px;
        font-weight: 700;
    }

    p {
        margin: 4px 0 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-card-badges {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
}

.pet-sync-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;

    .pet-sync-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
    }

    &.is-synced {
        border-color: color-mix(in srgb, #1f8f63 26%, var(--admin-line, var(--gray1)));
        background: color-mix(in srgb, #1f8f63 8%, var(--bgColor2));
        color: #1f8f63;
    }

    &.is-syncing {
        border-color: color-mix(in srgb, var(--pcolor) 24%, var(--admin-line, var(--gray1)));
        background: var(--pcolor1);
        color: var(--pcolor);

        .pet-sync-dot {
            animation: pet-sync-pulse 1s ease-in-out infinite;
        }
    }

    &.is-pending {
        border-color: color-mix(in srgb, #b3701a 28%, var(--admin-line, var(--gray1)));
        background: color-mix(in srgb, #b3701a 9%, var(--bgColor2));
        color: #b3701a;
    }
}

.pet-sync-retry {
    padding: 0;
    border: 0;
    background: none;
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
    text-decoration: underline;
    cursor: pointer;
}

.pet-card-head .pet-sync-note {
    color: #b3701a;
}

@keyframes pet-sync-pulse {
    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.35;
    }
}

.pet-level-pill,
.pet-readonly-note {
    flex: none;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
}

.pet-readonly-note {
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
}

.pet-name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 15px 16px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--bgColor2);
}

.pet-name-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-name-field {
    flex: none;

    input {
        width: 210px;
        height: 38px;
        box-sizing: border-box;
        padding: 0 12px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 10px;
        outline: none;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--admin-text, var(--gray));
        font: inherit;
        font-size: 13px;
        transition: border-color 0.18s ease, box-shadow 0.18s ease;

        &:focus {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px var(--pcolor2);
        }
    }
}

.pet-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 16px;
}

.pet-stat {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 13px 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 13px;
    background: var(--bgColor2);
}

.pet-stat-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 16px;
        font-variant-numeric: tabular-nums;
    }
}

.pet-stat-track {
    display: block;
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gray6) 14%, transparent);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
        transition: width 0.24s ease;
    }

    &.is-mood span {
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
    }

    &.is-satiety span {
        background: linear-gradient(90deg, var(--scolor, #1fb4a2), #65d3a0);
    }

    &.is-intimacy span {
        background: linear-gradient(90deg, #f06fa9, #ff9a7a);
    }
}

.pet-snack-shelf {
    margin-top: 16px;
    padding: 14px 15px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--bgColor2);
}

.pet-snack-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    > div {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        line-height: 1.5;
    }
}

.pet-snack-head .pet-snack-current {
    flex: none;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
}

.pet-snack-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
    margin-top: 10px;
}

.pet-snack-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--admin-surface, var(--bgColor1));
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        transform 0.18s ease;

    &:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--pcolor) 36%, var(--admin-line, var(--gray1)));
        transform: translateY(-1px);
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }

    &.is-selected {
        border-color: var(--pcolor);
        background: color-mix(in srgb, var(--pcolor) 6%, var(--admin-surface, var(--bgColor1)));
        box-shadow: 0 0 0 2px var(--pcolor2);
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }
}

.pet-snack-icon {
    font-size: 24px;
    line-height: 1;
}

.pet-snack-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.pet-snack-title {
    display: flex;
    align-items: baseline;
    gap: 6px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 12px;
    }

    small {
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: var(--pcolor);
        font-size: 9px;
    }
}

.pet-snack-desc {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    line-height: 1.45;
}

.pet-snack-stats {
    color: var(--pcolor);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}

.pet-feed-cooldown {
    color: #b3701a;
    font-size: 11px;
}

.pet-next-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    margin-top: 16px;
    padding: 15px 16px;
    border-radius: 14px;
    background:
        linear-gradient(120deg, var(--pcolor1), transparent 68%),
        var(--bgColor2);
}

.pet-next-copy {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 2px 9px;

    > span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        letter-spacing: 0.04em;
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 15px;
    }

    small {
        grid-column: 1 / -1;
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
    }
}

.pet-next-progress {
    width: 180px;
    height: 8px;
    flex: none;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pcolor) 12%, transparent);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
        transition: width 0.24s ease;
    }
}

.pet-reset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-top: 14px;
    padding: 13px 15px;
    border: 1px dashed color-mix(in srgb, #e05454 32%, var(--admin-line, var(--gray1)));
    border-radius: 13px;
    background: color-mix(in srgb, #e05454 4%, var(--bgColor2));

    .yk-button {
        flex: none;
    }
}

.pet-reset-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 12px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        line-height: 1.5;
    }
}

.pet-task-count {
    flex: none;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pcolor) 10%, transparent);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
}

.pet-task-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.pet-task {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 7px;
    padding: 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--bgColor2);
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;

    &.is-done {
        border-color: color-mix(in srgb, var(--pcolor) 30%, transparent);
        background:
            linear-gradient(140deg, color-mix(in srgb, var(--pcolor) 9%, transparent), transparent 70%),
            var(--bgColor2);
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    p {
        min-height: 36px;
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-task-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.pet-task-icon {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 10px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    font-size: 18px;
}

.pet-task-state {
    flex: none;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--bgColor1);
    color: var(--admin-muted, var(--gray6));
    font-size: 10px;
    font-weight: 600;

    &.is-done {
        background: color-mix(in srgb, var(--pcolor) 12%, transparent);
        color: var(--pcolor);
    }
}

.pet-task-reward {
    margin-top: auto;
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 600;
}

.pet-achievement-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
}

.pet-achievement-group {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.pet-achievement-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--admin-text, var(--gray));
    font-size: 12px;
    font-weight: 650;

    small {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        font-variant-numeric: tabular-nums;
    }
}

.pet-milestone-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.pet-milestone {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 10px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    font-variant-numeric: tabular-nums;

    &.is-achieved {
        border-color: color-mix(in srgb, var(--pcolor) 30%, transparent);
        background: color-mix(in srgb, var(--pcolor) 7%, var(--bgColor2));
        color: var(--pcolor);
    }
}

.pet-milestone-target {
    font-weight: 650;
}

.pet-milestone-track {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gray6) 16%, transparent);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
        transition: width 0.24s ease;
    }
}

.pet-milestone-state {
    text-align: right;
}

.pet-milestone-new {
    display: inline-block;
    margin-right: 4px;
    padding: 0 5px;
    border-radius: 999px;
    background: #ff4d6d;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 15px;
    vertical-align: 1px;
}
</style>
