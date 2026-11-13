<template>
    <yk-space dir="vertical" size="xl" class="admin-page pet-manage-page">
        <top-title name="宠物管理" description="照顾桌宠的成长，并调整全站展示与行为" :is-search="false" />

        <div class="pet-manage-grid">
            <main class="pet-manage-main">
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
                        <yk-button type="primary" @click="feedFromSettings">
                            🍚 喂一口
                        </yk-button>
                        <span v-if="!canEditPet">站点展示与行为仅管理员可修改</span>
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
                                class="pet-sync-retry" @click="retryPetSync">
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
                                aria-label="桌宠名字" @input="onPetNameInput"
                                @change="savePetName" @keyup.enter="savePetName" />
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
                        <yk-button type="secondary" status="danger" @click="resetPetGrowth">
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
                        <yk-switch v-model="petSettings.desktopPetEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>显示范围</strong>
                            <p>选择桌宠出现在门户、后台，还是两边都出现。</p>
                        </div>
                        <div class="pet-choice-group" aria-label="桌宠显示范围">
                            <button v-for="option in scopeOptions" :key="option.value" type="button"
                                class="pet-choice" :class="{ 'is-active': petSettings.petScope === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petScope = option.value">
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
                                class="pet-choice" :class="{ 'is-active': petSettings.petSize === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petSize = option.value">
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
                            <input v-model.number="petSettings.petScale" type="range" min="60" max="200"
                                step="5" :disabled="!canEditPet" aria-label="桌宠尺寸缩放百分比" />
                            <span>{{ petSettings.petScale }}%</span>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>不透明度</strong>
                            <p>不想太抢眼时可以调低，最低可设到 40%。</p>
                        </div>
                        <div class="pet-range">
                            <input v-model.number="petSettings.petOpacity" type="range" min="40" max="100"
                                step="5" :disabled="!canEditPet" aria-label="桌宠不透明度百分比" />
                            <span>{{ petSettings.petOpacity }}%</span>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>默认停靠角落</strong>
                            <p>「回到原位」和首次出现时的位置，门户与后台共用。</p>
                        </div>
                        <div class="pet-choice-group" aria-label="桌宠默认停靠角落">
                            <button v-for="option in cornerOptions" :key="option.value" type="button"
                                class="pet-choice" :class="{ 'is-active': petSettings.petHomeCorner === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petHomeCorner = option.value">
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
                                class="pet-choice" :class="{ 'is-active': petSettings.petActivity === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petActivity = option.value">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>气泡与碎碎念</strong>
                            <p>关闭后不再弹对话气泡，也不会随机自言自语。</p>
                        </div>
                        <yk-switch v-model="petSettings.petBubbleEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>允许自主漫游</strong>
                            <p>关闭后宠物不再四处走动，只做原地动作。</p>
                        </div>
                        <yk-switch v-model="petSettings.petRoamingEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>允许拖拽甩抛</strong>
                            <p>关闭后点击仍会回应，但不能拖动或甩出宠物。</p>
                        </div>
                        <yk-switch v-model="petSettings.petDragEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>无操作自动入睡</strong>
                            <p>三分钟没有互动就自己睡一觉，点击或拖拽会把它叫醒。</p>
                        </div>
                        <yk-switch v-model="petSettings.petAutoSleepEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>
                </section>
            </main>

            <aside class="pet-manage-side">
                <section class="pet-home-card">
                    <header class="pet-home-head">
                        <div>
                            <span class="pet-home-kicker">PET HOME</span>
                            <h2>{{ displayPetName }} 的小屋</h2>
                            <p>在这个页面，它只会待在房间范围内。</p>
                        </div>
                        <span class="pet-home-status">
                            <span aria-hidden="true" />在家
                        </span>
                    </header>

                    <div class="pet-home-room" data-pet-home-zone>
                        <span class="pet-home-window" aria-hidden="true">
                            <span class="pet-home-moon" />
                            <span class="pet-home-star pet-home-star-a" />
                            <span class="pet-home-star pet-home-star-b" />
                        </span>
                        <span class="pet-home-curtain pet-home-curtain-left" aria-hidden="true" />
                        <span class="pet-home-curtain pet-home-curtain-right" aria-hidden="true" />
                        <span class="pet-home-shelf" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                        </span>
                        <span class="pet-home-picture" aria-hidden="true">♥</span>
                        <span class="pet-home-plant" aria-hidden="true">🪴</span>
                        <span class="pet-home-rug" aria-hidden="true" />
                        <span class="pet-home-cushion" aria-hidden="true" />
                        <span class="pet-home-bowl" aria-hidden="true">🥣</span>
                        <span class="pet-home-room-note">活动范围 · 拖动也不会离开小屋</span>
                    </div>

                    <div class="pet-home-actions">
                        <button type="button" @click="feedFromSettings">
                            <span>🍚</span>喂一口
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('home')">
                            <span>🏠</span>回到小屋
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('speak')">
                            <span>💬</span>说句话
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('sleep')">
                            <span>🌙</span>睡一觉
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('wake')">
                            <span>☀️</span>叫醒它
                        </button>
                    </div>

                    <div class="pet-home-footer">
                        <button type="button" :disabled="!canEditPet" @click="resetPetSettings">
                            恢复默认展示
                        </button>
                        <button type="button" @click="go('/setting')">
                            本机偏好设置 →
                        </button>
                    </div>
                </section>
            </aside>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSiteSettings, updateSiteSettings } from '../api/site'
import {
    DEFAULT_DESKTOP_PET_SETTINGS,
    broadcastDesktopPetSettings,
    getDesktopPetSettings,
    normalizeDesktopPetSettings,
    sendDesktopPetCommand,
    setDesktopPetSettings,
    type DesktopPetSettings,
} from '../utils/desktopPet'
import { emitPetReaction, onPetReaction } from '../utils/desktopPetScene'
import {
    PET_DAILY_TASK_DEFINITIONS,
    applyFeeding,
    getPetVitals,
    recordDailyTask,
    resetPetVitals,
    setPetVitals,
    vitalsCompanionTitle,
    vitalsIntimacyLevel,
    vitalsMilestoneWall,
    vitalsMoodLabel,
    vitalsNextMilestone,
    type PetVitals,
} from '../utils/desktopPetVitals'
import {
    flushPetSyncQueue,
    getPetSyncStatus,
    mergeRemotePetVitals,
    onPetSyncStatusChange,
    refreshPetSyncStatus,
    syncPetVitalsToServer,
    type PetSyncState,
    type PetSyncStatus,
} from '../utils/desktopPetSync'
import { useSessionStore } from '../store/session.ts'
import { IconHeartFill } from '@yike-design/ui/es/components/svg-icon'

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

const canEditPet = computed(() => session.can('permission.edit'))
const petSettings = reactive<DesktopPetSettings>({ ...getDesktopPetSettings() })
const petVitals = ref<PetVitals>(getPetVitals())
const petSync = ref<PetSyncStatus>(getPetSyncStatus())
const PET_SYNC_LABELS: Record<PetSyncState, string> = {
    local: '仅本机',
    syncing: '同步中',
    synced: '已同步',
    pending: '待重试',
}
const petSyncState = computed(() => petSync.value.state)
const petSyncLabel = computed(() => PET_SYNC_LABELS[petSyncState.value])
const petSyncHint = computed(() => {
    const current = petSync.value
    if (current.state === 'local') return '未登录时养成进度只保存在当前设备'
    if (current.state === 'syncing') return '正在把最新养成进度保存到云端'
    if (current.state === 'pending') {
        return current.lastError || '这次同步没有成功，稍后会自动重试'
    }
    if (current.lastSyncedAt) {
        const time = new Date(current.lastSyncedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        })
        return `上次同步 ${time}`
    }
    return '养成进度已与云端一致'
})
const retryPetSync = () => {
    void flushPetSyncQueue()
}
const petTitle = computed(() => vitalsCompanionTitle(petVitals.value))
const petMilestone = computed(() => vitalsNextMilestone(petVitals.value))
const petMilestones = computed(() => vitalsMilestoneWall(petVitals.value))
const petDailyTasks = computed(() =>
    PET_DAILY_TASK_DEFINITIONS.map((task) => ({
        ...task,
        done: petVitals.value.dailyTasks.progress[task.key] >= 1,
    }))
)
const completedDailyTaskCount = computed(
    () => petDailyTasks.value.filter((task) => task.done).length
)
const unlockedAchievementCount = computed(() =>
    petMilestones.value.reduce(
        (total, group) =>
            total + group.items.filter((item) => item.unlocked).length,
        0
    )
)
const newAchievementCount = computed(() =>
    petMilestones.value.reduce(
        (total, group) =>
            total + group.items.filter((item) => item.isNew).length,
        0
    )
)
const displayPetName = computed(() => petVitals.value.name || '小 Lin')

const petMilestonePercent = (current: number, target: number) =>
    Math.min(100, Math.round((current / target) * 100))

const petNameDraft = ref(petVitals.value.name)
let petNameEditing = false
const onPetNameInput = (event: Event) => {
    petNameEditing = true
    petNameDraft.value = (event.target as HTMLInputElement).value
}

const savePetName = () => {
    petNameEditing = false
    const name = petNameDraft.value.trim().replace(/\s+/g, ' ').slice(0, 16)
    petNameDraft.value = name
    if (name === petVitals.value.name) return
    petVitals.value = { ...petVitals.value, name, updatedAt: Date.now() }
    setPetVitals(petVitals.value)
    emitPetReaction('vitals-updated')
    void syncPetVitalsToServer(petVitals.value)
    proxy?.$message?.({
        type: 'success',
        message: name ? `以后就叫它「${name}」啦` : '已改回默认名字',
    })
}

watch(
    () => petVitals.value.name,
    (name) => {
        if (!petNameEditing) petNameDraft.value = name
    }
)

const feedFromSettings = () => {
    const result = applyFeeding(petVitals.value)
    let next = result.vitals
    let taskCompleted = false
    if (result.effect === 'ok') {
        const task = recordDailyTask(next, 'feed')
        next = task.vitals
        taskCompleted = task.completedNow
    }
    petVitals.value = next
    setPetVitals(petVitals.value)
    emitPetReaction('vitals-updated', {
        message: `${result.vitals.name || '小 Lin'} 的养成状态有更新`,
    })
    void syncPetVitalsToServer(petVitals.value)
    if (result.effect === 'ok') {
        proxy?.$message?.({
            type: 'success',
            message: taskCompleted
                ? '喂饱啦，今日任务完成，奖励已到账'
                : '喂饱啦，心情也变好了',
        })
    } else if (result.effect === 'full') {
        proxy?.$message?.({ type: 'warning', message: '它已经吃得很饱了' })
    } else {
        proxy?.$message?.({ type: 'primary', message: '刚喂过，等 60 秒再试吧' })
    }
}

const resetPetGrowth = () => {
    if (!window.confirm('重新养一只会清空名字、等级、成就和每日任务，并同步到其他设备。确认继续吗？')) {
        return
    }
    const next = resetPetVitals(petVitals.value)
    petVitals.value = next
    petNameDraft.value = next.name
    setPetVitals(next)
    emitPetReaction('vitals-updated', {
        message: '宠物成长已重置',
    })
    void syncPetVitalsToServer(next)
    proxy?.$message?.({
        type: 'success',
        message: '已经重新开始，新的陪伴从今天算起',
    })
}

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

const snapshotPetSettings = (): DesktopPetSettings => ({ ...petSettings })
const isSamePetSettings = (a: DesktopPetSettings, b: DesktopPetSettings) =>
    a.desktopPetEnabled === b.desktopPetEnabled &&
    a.petSize === b.petSize &&
    a.petScale === b.petScale &&
    a.petActivity === b.petActivity &&
    a.petRoamingEnabled === b.petRoamingEnabled &&
    a.petDragEnabled === b.petDragEnabled &&
    a.petBubbleEnabled === b.petBubbleEnabled &&
    a.petOpacity === b.petOpacity &&
    a.petAutoSleepEnabled === b.petAutoSleepEnabled &&
    a.petHomeCorner === b.petHomeCorner &&
    a.petScope === b.petScope

let lastSavedPetSettings: DesktopPetSettings = { ...petSettings }
let petSaveTimer: number | undefined
let petSaving = false
let petRevision = 0

const flushPetSettings = async () => {
    if (petSaving) return
    const payload = snapshotPetSettings()
    if (isSamePetSettings(payload, lastSavedPetSettings)) return
    const revision = petRevision
    petSaving = true
    try {
        const res = await updateSiteSettings(payload)
        if (res?.code !== 200) throw new Error(res?.message || '保存失败')
        lastSavedPetSettings = payload
        setDesktopPetSettings(payload)
        proxy?.$message?.({ type: 'success', message: '桌宠设置已保存' })
        emitPetReaction('settings-saved', {
            message: '桌宠设置已保存',
            actionPath: '/petManage',
            actionLabel: '去宠物管理',
        })
    } catch {
        if (petRevision === revision) {
            Object.assign(petSettings, lastSavedPetSettings)
            broadcastDesktopPetSettings(lastSavedPetSettings)
        }
        proxy?.$message?.({ type: 'error', message: '桌宠设置保存失败，请稍后重试' })
    } finally {
        petSaving = false
        if (
            petRevision !== revision &&
            !isSamePetSettings(snapshotPetSettings(), lastSavedPetSettings)
        ) {
            window.clearTimeout(petSaveTimer)
            petSaveTimer = window.setTimeout(() => void flushPetSettings(), 120)
        }
    }
}

watch(
    petSettings,
    () => {
        if (!canEditPet.value) {
            Object.assign(petSettings, lastSavedPetSettings)
            return
        }
        if (isSamePetSettings(snapshotPetSettings(), lastSavedPetSettings)) return
        petRevision++
        broadcastDesktopPetSettings(snapshotPetSettings())
        window.clearTimeout(petSaveTimer)
        petSaveTimer = window.setTimeout(() => void flushPetSettings(), 350)
    },
    { deep: true }
)

const resetPetSettings = () => {
    if (!canEditPet.value) return
    if (!window.confirm('恢复默认桌宠设置？当前尺寸、范围与行为会重置。')) return
    Object.assign(petSettings, { ...DEFAULT_DESKTOP_PET_SETTINGS })
    proxy?.$message?.({ type: 'primary', message: '已恢复默认设置，正在保存' })
}

const go = (path: string) => {
    router.push(path)
}

let unsubscribeReaction: (() => void) | undefined
let unsubscribeSync: (() => void) | undefined

onMounted(() => {
    petSync.value = refreshPetSyncStatus()
    unsubscribeSync = onPetSyncStatusChange((next) => {
        petSync.value = next
    })
    unsubscribeReaction = onPetReaction((payload) => {
        if (payload.kind === 'vitals-updated') {
            petVitals.value = getPetVitals()
        }
    })
    void mergeRemotePetVitals(petVitals.value).then((merged) => {
        petVitals.value = merged
        setPetVitals(merged)
    })
})

onMounted(async () => {
    try {
        const res = await getSiteSettings()
        if (res?.code === 200 && res.data) {
            const next = normalizeDesktopPetSettings(res.data)
            lastSavedPetSettings = { ...next }
            Object.assign(petSettings, next)
            setDesktopPetSettings(next)
        }
    } catch {
        // 读取失败时沿用本机缓存，表单仍可继续使用
    }
})

onUnmounted(() => {
    unsubscribeReaction?.()
    unsubscribeSync?.()
    window.clearTimeout(petSaveTimer)
})
</script>

<style lang="less" scoped>
.pet-manage-page {
    width: 100%;
}

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
    grid-template-columns: minmax(0, 1fr) minmax(350px, 390px);
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

    :deep(.yk-button) {
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

.pet-home-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
    padding: 18px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 24px;
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

.pet-home-room {
    position: relative;
    isolation: isolate;
    min-height: clamp(390px, 50vh, 560px);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, #8f6a4e 16%, var(--admin-line, var(--gray1)));
    border-radius: 20px;
    background:
        linear-gradient(180deg,
            color-mix(in srgb, var(--pcolor) 7%, #f8fbff) 0%,
            #edf5ff 57%,
            transparent 57%),
        linear-gradient(180deg,
            transparent 0%,
            transparent 57%,
            #ddba98 57%,
            #c9936c 100%);
    box-shadow:
        inset 0 0 0 5px rgba(255, 255, 255, 0.34),
        inset 0 -18px 34px rgba(111, 68, 39, 0.1);

    &::before {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 43%;
        content: '';
        opacity: 0.3;
        background:
            repeating-linear-gradient(90deg,
                transparent 0 39px,
                rgba(104, 64, 36, 0.18) 39px 40px);
        pointer-events: none;
    }
}

.pet-home-window {
    position: absolute;
    top: 48px;
    left: 50%;
    width: 152px;
    height: 112px;
    transform: translateX(-50%);
    overflow: hidden;
    border: 7px solid rgba(255, 255, 255, 0.9);
    border-radius: 76px 76px 12px 12px;
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
    top: 20px;
    right: 24px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff2b0;
    box-shadow: 0 0 18px rgba(255, 242, 176, 0.72);
}

.pet-home-star {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.7);
}

.pet-home-star-a {
    top: 30px;
    left: 28px;
}

.pet-home-star-b {
    top: 58px;
    left: 44px;
}

.pet-home-curtain {
    position: absolute;
    top: 38px;
    z-index: 1;
    width: 58px;
    height: 142px;
    border-radius: 14px 10px 26px 12px;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.9) 0 9px,
            color-mix(in srgb, var(--pcolor) 18%, #e3edff) 9px 16px);
    opacity: 0.86;
    box-shadow: 0 10px 20px rgba(71, 96, 143, 0.1);
}

.pet-home-curtain-left {
    left: calc(50% - 104px);
    transform: rotate(4deg);
    transform-origin: top right;
}

.pet-home-curtain-right {
    right: calc(50% - 104px);
    transform: rotate(-4deg) scaleX(-1);
    transform-origin: top left;
}

.pet-home-shelf {
    position: absolute;
    top: 174px;
    left: 22px;
    width: 86px;
    height: 10px;
    border-radius: 4px;
    background: #a97852;
    box-shadow: 0 5px 0 rgba(126, 82, 50, 0.16);

    i {
        position: absolute;
        bottom: 9px;
        width: 12px;
        border-radius: 3px 3px 0 0;
        background: var(--pcolor);
    }

    i:nth-child(1) {
        left: 10px;
        height: 32px;
        opacity: 0.68;
    }

    i:nth-child(2) {
        left: 27px;
        height: 25px;
        background: var(--scolor, #1fb4a2);
        opacity: 0.65;
    }

    i:nth-child(3) {
        left: 44px;
        height: 36px;
        background: #e9976e;
        opacity: 0.8;
    }
}

.pet-home-picture {
    position: absolute;
    top: 142px;
    right: 24px;
    display: grid;
    width: 48px;
    height: 48px;
    place-items: center;
    border: 5px solid #fff8ef;
    border-radius: 12px;
    background: color-mix(in srgb, var(--pcolor) 16%, #fff);
    box-shadow: 0 7px 14px rgba(101, 70, 44, 0.12);
    color: var(--pcolor);
    font-size: 18px;
}

.pet-home-plant {
    position: absolute;
    right: 18px;
    bottom: 66px;
    z-index: 1;
    font-size: 42px;
    filter: drop-shadow(0 8px 10px rgba(62, 84, 50, 0.16));
    transform: rotate(-4deg);
}

.pet-home-rug {
    position: absolute;
    bottom: 22px;
    left: 50%;
    width: min(78%, 260px);
    height: 62px;
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
    bottom: 52px;
    left: 34px;
    width: 74px;
    height: 38px;
    border-radius: 18px 18px 14px 14px;
    background: linear-gradient(145deg, #e8f0ff, #bfd1ee);
    box-shadow: 0 7px 12px rgba(69, 91, 130, 0.14);
    transform: rotate(-4deg);
}

.pet-home-bowl {
    position: absolute;
    right: 28px;
    bottom: 30px;
    z-index: 1;
    font-size: 30px;
    filter: drop-shadow(0 5px 7px rgba(82, 49, 27, 0.18));
}

.pet-home-room-note {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    padding: 5px 9px;
    border: 1px solid rgba(255, 255, 255, 0.56);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.48);
    color: rgba(56, 74, 105, 0.72);
    font-size: 10px;
    backdrop-filter: blur(5px);
    pointer-events: none;
}

.pet-home-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    button {
        display: flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 8px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 12px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--admin-text, var(--gray));
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;

        span {
            font-size: 15px;
        }

        &:first-child {
            border-color: transparent;
            background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
            color: #fff;
            box-shadow: 0 8px 18px var(--pcolor3);
        }

        &:last-child:nth-child(odd) {
            grid-column: 1 / -1;
        }

        &:hover:not(:disabled) {
            transform: translateY(-1px);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
    }
}

.pet-home-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 1px;

    button {
        padding: 0;
        border: none;
        background: transparent;
        color: var(--admin-muted, var(--gray6));
        font: inherit;
        font-size: 11px;
        cursor: pointer;
        transition: color 0.18s ease;

        &:hover:not(:disabled) {
            color: var(--pcolor);
        }

        &:last-child {
            color: var(--pcolor);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
    }
}

@media (max-width: 1180px) {
    .pet-manage-grid {
        grid-template-columns: 1fr;
    }

    .pet-manage-side {
        position: static;
        order: -1;
    }

    .pet-home-room {
        min-height: 480px;
    }
}

@media (max-width: 760px) {
    .pet-hero {
        align-items: flex-start;
        flex-direction: column;
        padding: 22px 20px;
    }

    .pet-hero-actions {
        width: 100%;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    .pet-card {
        padding: 18px 16px;
    }

    .pet-card-badges {
        justify-content: flex-start;
    }

    .pet-name-row,
    .pet-row,
    .pet-next-row,
    .pet-reset-row {
        align-items: stretch;
        flex-direction: column;
        gap: 12px;
    }

    .pet-name-field input {
        width: 100%;
    }

    .pet-stat-grid,
    .pet-task-list,
    .pet-achievement-groups {
        grid-template-columns: 1fr;
    }

    .pet-home-room {
        min-height: 420px;
    }

    .pet-next-progress,
    .pet-range {
        width: 100%;
    }

    .pet-range input[type='range'] {
        width: auto;
        flex: 1;
    }

    .pet-choice-group {
        align-self: flex-start;
    }
}

@media (prefers-reduced-motion: reduce) {
    .pet-stat-track span,
    .pet-milestone-track span,
    .pet-next-progress span {
        transition: none;
    }
}
</style>
