<template>
    <yk-space dir="vertical" size="xl" class="admin-page pet-manage-page">
        <top-title name="宠物管理" description="照顾桌宠的成长，并调整全站展示与行为" :is-search="false" />

        <div class="pet-manage-grid">
            <main class="pet-manage-main">
                <PetCompanionPanel
                    :display-pet-name="displayPetName"
                    :pet-title="petTitle"
                    :pet-vitals="petVitals"
                    :selected-food="selectedFood"
                    :selected-food-id="selectedFoodId"
                    :feed-cooldown-left="feedCooldownLeft"
                    :feed-cooldown-seconds="feedCooldownSeconds"
                    :can-edit-pet="canEditPet"
                    :pet-sync-state="petSyncState"
                    :pet-sync-hint="petSyncHint"
                    :pet-sync-label="petSyncLabel"
                    :pet-name-draft="petNameDraft"
                    :pet-milestone="petMilestone"
                    :pet-milestones="petMilestones"
                    :pet-daily-tasks="petDailyTasks"
                    :completed-daily-task-count="completedDailyTaskCount"
                    :unlocked-achievement-count="unlockedAchievementCount"
                    :new-achievement-count="newAchievementCount"
                    @feed="feedFromSettings"
                    @retry-sync="retryPetSync"
                    @pet-name-input="onPetNameInputValue"
                    @save-name="savePetName"
                    @reset-growth="resetPetGrowth" />

                <PetDisplaySettings :settings="petSettings" :can-edit-pet="canEditPet" />
            </main>

            <aside class="pet-manage-side">
                <PetHomePanel
                    :tabs="PET_HOME_TABS"
                    :pet-home-tab="petHomeTab"
                    :pet-home-status="petHomeStatus"
                    :pet-home-room-class="petHomeRoomClass"
                    :pet-home-note="petHomeNote"
                    :display-pet-name="displayPetName"
                    :pet-vitals="petVitals"
                    :settings="petSettings"
                    :selected-food="selectedFood"
                    :feed-cooldown-left="feedCooldownLeft"
                    :can-edit-pet="canEditPet"
                    :homestead="homestead"
                    :homestead-plots="homesteadPlots"
                    :homestead-plot-columns="homesteadPlotColumns"
                    :homestead-tend-count="homesteadTendCount"
                    :selected-seed-id="selectedSeedId"
                    :inventory-chips="inventoryChips"
                    :chicken="chicken"
                    :chicken-label="chickenLabel"
                    :cow="cow"
                    :cow-label="cowLabel"
                    :pond-ready="pondReady"
                    :pond-label="pondLabel"
                    :owned-decorations="ownedDecorations"
                    :completed-order-count="completedOrderCount"
                    :claimable-order-count="claimableOrderCount"
                    :claimable-homestead-achievement-count="claimableHomesteadAchievementCount"
                    :auto-help-status="autoHelpStatus"
                    @select-tab="selectPetHomeTab"
                    @plot-click="handlePlotClick"
                    @collect-chicken="collectChicken"
                    @collect-cow="collectCow"
                    @pond-click="handlePondClick"
                    @open-business="openBusiness"
                    @select-seed="selectSeed"
                    @tend="tendHomesteadNow"
                    @request-auto-help="requestAutoHelp"
                    @update:auto-help-enabled="autoHelpEnabled = $event"
                    @feed="feedFromSettings"
                    @send-command="sendDesktopPetCommand"
                    @reset-settings="resetPetSettings"
                    @open-preferences="go('/setting')" />
            </aside>
        </div>

        <PetFarmBusiness v-model="businessOpen" v-model:panel="businessPanel"
            :homestead="homestead" @deliver-order="deliverOrder"
            @claim-achievement="claimAchievementReward"
            @buy-seed="buySeedNow" @buy-fertilizer="buyFertilizerNow"
            @buy-plot="buyPlotExpansionNow" @upgrade-barn="upgradeBarnNow"
            @upgrade-pond="upgradePondNow"
            @buy-decoration="buyDecorationNow" />
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
import {
    getPetFood,
    getSelectedPetFoodId,
    onSelectedPetFoodChange,
    setSelectedPetFoodId,
    type PetFoodId,
} from '../utils/desktopPetFood'
import { emitPetReaction, onPetReaction } from '../utils/desktopPetScene'
import {
    PET_FEED_COOLDOWN_MS,
    PET_DAILY_TASK_DEFINITIONS,
    applyFeeding,
    getPetVitals,
    recordDailyTask,
    resetPetVitals,
    setPetVitals,
    vitalsCompanionTitle,
    vitalsMilestoneWall,
    vitalsNextMilestone,
    type PetVitals,
} from '../utils/desktopPetVitals'
import {
    HOMESTEAD_ANIMALS,
    HOMESTEAD_ANIMAL_IDS,
    HOMESTEAD_CROPS,
    HOMESTEAD_FERTILIZER_PACK,
    HOMESTEAD_ITEMS,
    HOMESTEAD_SEED_PACKS,
    animalStatusText,
    buyFertilizerPack,
    buyHomesteadDecoration,
    buyHomesteadPlot,
    buySeedPack,
    canCompleteOrder,
    claimHomesteadAchievement,
    collectAnimal,
    completeOrder,
    fertilizePlot,
    fishPond,
    formatHomesteadDuration,
    getHomesteadCrop,
    getHomesteadDecoration,
    getHomesteadItem,
    getHomesteadState,
    harvestPlot,
    homesteadAchievements,
    homesteadBarnSpeedMultiplier,
    isAnimalManureReady,
    isAnimalProduceReady,
    isPlotRipe,
    isPondReady,
    plantCropWithSeed,
    plotProgress,
    plotRemainingMs,
    plotStatusText,
    pondStatusText,
    resetHomesteadState,
    setHomesteadState,
    tendHomestead,
    upgradeHomesteadBarn,
    upgradeHomesteadPond,
    waterPlot,
    type HomesteadAnimalId,
    type HomesteadCropId,
    type HomesteadDecorationId,
    type HomesteadState,
} from '../utils/desktopPetHomestead'
import {
    flushPetSyncQueue,
    getPetSyncStatus,
    mergeRemoteHomestead,
    mergeRemotePetVitals,
    onPetSyncStatusChange,
    refreshPetSyncStatus,
    syncHomesteadToServer,
    syncPetVitalsToServer,
    type PetSyncState,
    type PetSyncStatus,
} from '../utils/desktopPetSync'
import {
    HOMESTEAD_AUTO_HELP_EVENT,
    HOMESTEAD_TAB_EVENT,
    autoHelpStatusText,
    type HomesteadAutoHelpEventDetail,
} from '../utils/desktopPetAutoHelp'
import { useSessionStore } from '../store/session.ts'
import PetCompanionPanel from '../components/pet/PetCompanionPanel.vue'
import PetDisplaySettings from '../components/pet/PetDisplaySettings.vue'
import PetHomePanel from '../components/pet/PetHomePanel.vue'
import PetFarmBusiness from '../components/pet/PetFarmBusiness.vue'
import {
    PET_HOME_TABS,
    type PetHomeTab,
} from '../components/pet/petManageTypes'

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

const canEditPet = computed(() => session.can('permission.edit'))
const petSettings = reactive<DesktopPetSettings>({ ...getDesktopPetSettings() })
const petVitals = ref<PetVitals>(getPetVitals())
const homestead = ref<HomesteadState>(getHomesteadState())
const selectedSeedId = ref<HomesteadCropId>('radish')
const selectedSeed = computed(
    () => getHomesteadCrop(selectedSeedId.value) || HOMESTEAD_CROPS[0]
)
const businessOpen = ref(false)
type HomesteadBusinessPanel = 'orders' | 'shop' | 'achievements'
const businessPanel = ref<HomesteadBusinessPanel>('orders')
const selectedFoodId = ref<PetFoodId>(getSelectedPetFoodId())
const selectedFood = computed(() => getPetFood(selectedFoodId.value))
const petHomeTab = ref<PetHomeTab>('grow')
const petHomeRoomClass = computed(() =>
    petHomeTab.value === 'home'
        ? ['is-home-interior']
        : ['is-pixel-farm', `is-tab-${petHomeTab.value}`]
)
const petHomeNote = computed(
    () => PET_HOME_TABS.find((tab) => tab.id === petHomeTab.value)?.note || ''
)
const petHomeStatus = computed(() => {
    const tab = PET_HOME_TABS.find((item) => item.id === petHomeTab.value)
    return petHomeTab.value === 'home' ? '在小屋' : `在${tab?.label || '农场'}区`
})
const selectPetHomeTab = (tab: PetHomeTab) => {
    petHomeTab.value = tab
}
const nowTick = ref(Date.now())
const feedCooldownLeft = computed(() =>
    Math.max(
        0,
        petVitals.value.lastFedAt + PET_FEED_COOLDOWN_MS - nowTick.value
    )
)
const feedCooldownSeconds = computed(() =>
    Math.ceil(feedCooldownLeft.value / 1000)
)
let feedClockTimer: number | undefined
let unsubscribeFood: (() => void) | undefined
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
    if (current.state === 'local') return '未登录时养成与小院进度只保存在当前设备'
    if (current.state === 'syncing') return '正在把最新养成与小院进度保存到云端'
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
    return '养成与小院进度已与云端一致'
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

const homesteadPlots = computed(() =>
    homestead.value.plots.map((plot, index) => {
        const crop = getHomesteadCrop(plot.cropId)
        return {
            index,
            cropId: plot.cropId,
            icon: crop?.icon || '',
            ripe: isPlotRipe(plot, nowTick.value),
            watered: plot.wateredAt > 0,
            fertilized: plot.fertilizedAt > 0,
            canFertilize:
                Boolean(plot.cropId) &&
                Boolean(plot.wateredAt) &&
                !plot.fertilizedAt &&
                !isPlotRipe(plot, nowTick.value) &&
                homestead.value.inventory.fertilizer > 0,
            progress: plotProgress(plot, nowTick.value),
            visualClass: pixelCropClass({
                cropId: plot.cropId,
                progress: plotProgress(plot, nowTick.value),
                ripe: isPlotRipe(plot, nowTick.value),
            }),
            label: `第 ${index + 1} 块菜地：${plotStatusText(
                plot,
                nowTick.value
            )}${
                Boolean(plot.cropId) &&
                Boolean(plot.wateredAt) &&
                !plot.fertilizedAt &&
                !isPlotRipe(plot, nowTick.value) &&
                homestead.value.inventory.fertilizer > 0
                    ? '，点击施肥'
                    : ''
            }`,
        }
    })
)

const pixelCropClass = (plot: {
    cropId: string | null
    progress: number
    ripe: boolean
}) => {
    const visualCrop =
        plot.cropId === 'radish'
            ? 'carrot'
            : plot.cropId === 'strawberry'
              ? 'tomato'
              : plot.cropId || 'cabbage'
    const stage = plot.ripe
        ? 3
        : Math.min(2, Math.max(0, Math.floor(plot.progress * 3)))
    return {
        [`is-${visualCrop}`]: true,
        [`is-stage-${stage}`]: true,
    }
}

const chicken = computed(() => {
    const definition = HOMESTEAD_ANIMALS.chicken
    const animal = homestead.value.animals.chicken
    const speedMultiplier = homesteadBarnSpeedMultiplier(
        homestead.value.barnLevel
    )
    return {
        ...definition,
        eggReady: isAnimalProduceReady(
            animal,
            definition,
            nowTick.value,
            speedMultiplier
        ),
        manureReady: isAnimalManureReady(
            animal,
            definition,
            nowTick.value,
            speedMultiplier
        ),
    }
})

const cow = computed(() => {
    const definition = HOMESTEAD_ANIMALS.cow
    const animal = homestead.value.animals.cow
    const speedMultiplier = homesteadBarnSpeedMultiplier(
        homestead.value.barnLevel
    )
    return {
        ...definition,
        milkReady: isAnimalProduceReady(
            animal,
            definition,
            nowTick.value,
            speedMultiplier
        ),
        manureReady: isAnimalManureReady(
            animal,
            definition,
            nowTick.value,
            speedMultiplier
        ),
    }
})

const chickenLabel = computed(
    () => `鸡舍：${animalStatusText(homestead.value, 'chicken', nowTick.value)}`
)
const cowLabel = computed(
    () => `奶牛：${animalStatusText(homestead.value, 'cow', nowTick.value)}`
)
const pondReady = computed(() => isPondReady(homestead.value, nowTick.value))
const pondLabel = computed(
    () => `鱼塘：${pondStatusText(homestead.value, nowTick.value)}`
)

const inventoryChips = computed(() =>
    HOMESTEAD_ITEMS.filter(
        (item) => homestead.value.inventory[item.id] > 0
    ).map((item) => ({
        ...item,
        count: homestead.value.inventory[item.id],
    }))
)

const orderCards = computed(() =>
    homestead.value.orders.map((order, index) => {
        const items = order.requirements.map((requirement) => {
            const item = getHomesteadItem(requirement.itemId)
            const have = homestead.value.inventory[requirement.itemId]
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
            canComplete: canCompleteOrder(homestead.value, order),
        }
    })
)
const completedOrderCount = computed(
    () => orderCards.value.filter((order) => order.completed).length
)
const claimableOrderCount = computed(
    () => orderCards.value.filter((order) => order.canComplete).length
)
const homesteadPlotColumns = computed(() =>
    homestead.value.plotCount > 6 ? 4 : homestead.value.plotCount > 4 ? 3 : 2
)
const ownedDecorations = computed(() =>
    homestead.value.decorations
        .map((id) => getHomesteadDecoration(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
)
const homesteadAchievementCards = computed(() =>
    homesteadAchievements(homestead.value)
)
const claimableHomesteadAchievementCount = computed(
    () =>
        homesteadAchievementCards.value.filter(
            (item) => item.unlocked && !item.claimed
        ).length
)

const homesteadTendCount = computed(() => {
    let count = 0
    let fertilizable = 0
    for (const plot of homestead.value.plots) {
        if (isPlotRipe(plot, nowTick.value)) count++
        else if (plot.cropId && !plot.wateredAt) count++
        else if (plot.cropId && !plot.fertilizedAt) fertilizable++
    }
    count += Math.min(fertilizable, homestead.value.inventory.fertilizer)
    const speedMultiplier = homesteadBarnSpeedMultiplier(
        homestead.value.barnLevel
    )
    for (const id of HOMESTEAD_ANIMAL_IDS) {
        const definition = HOMESTEAD_ANIMALS[id]
        const animal = homestead.value.animals[id]
        if (
            isAnimalProduceReady(
                animal,
                definition,
                nowTick.value,
                speedMultiplier
            )
        ) {
            count++
        }
        if (
            isAnimalManureReady(
                animal,
                definition,
                nowTick.value,
                speedMultiplier
            )
        ) {
            count++
        }
    }
    if (isPondReady(homestead.value, nowTick.value)) count++
    return count
})

const autoHelpEnabled = computed({
    get: () => homestead.value.autoHelp.enabled,
    set: (enabled: boolean) => {
        if (enabled === homestead.value.autoHelp.enabled) return
        const saved = setHomesteadState({
            ...homestead.value,
            autoHelp: { ...homestead.value.autoHelp, enabled },
            updatedAt: Date.now(),
        })
        homestead.value = saved
        void syncHomesteadToServer(saved)
        proxy?.$message?.({
            type: 'primary',
            message: enabled
                ? '自动帮忙已开启，它闲下来会自己去小院干活'
                : '自动帮忙已关闭，小院交给你亲手打理',
        })
    },
})

const autoHelpStatus = computed(() => {
    if (!petSettings.desktopPetEnabled) {
        return '桌宠已隐藏，打开后才能自己去干活'
    }
    if (petSettings.petScope === 'portal') {
        return '当前只在门户显示，后台小院不会自动帮忙'
    }
    if (!petSettings.petRoamingEnabled) {
        return '需要开启「允许自主漫游」才能自己去干活'
    }
    return autoHelpStatusText(homestead.value, nowTick.value)
})

const requestAutoHelp = () => {
    if (!homestead.value.autoHelp.enabled) return
    if (!petSettings.desktopPetEnabled) {
        proxy?.$message?.({
            type: 'warning',
            message: '桌宠当前已隐藏，打开后才能去小院帮忙',
        })
        return
    }
    sendDesktopPetCommand('homestead')
    proxy?.$message?.({
        type: 'primary',
        message: '小 Lin 去小院看看有什么要忙的',
    })
}

const petNameDraft = ref(petVitals.value.name)
let petNameEditing = false
const onPetNameInputValue = (value: string) => {
    petNameEditing = true
    petNameDraft.value = value
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

const selectSeed = (id: HomesteadCropId) => {
    selectedSeedId.value = id
}

const openBusiness = (panel: HomesteadBusinessPanel) => {
    businessPanel.value = panel
    businessOpen.value = true
}

watch(businessOpen, (open) => {
    document.body.classList.toggle('pet-farm-business-open', open)
})

const deliverOrder = (orderId: string) => {
    const result = completeOrder(homestead.value, orderId, Date.now())
    if (!result.changed) {
        proxy?.$message?.({
            type: 'warning',
            message:
                result.reason === 'missing'
                    ? '仓库里的材料还不够，再攒一攒吧'
                    : result.reason === 'completed'
                      ? '这个订单今天已经交付过了'
                      : '这个订单已经失效，刷新后再看看',
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: `订单完成，获得 ${result.order?.reward || 0} 金币`,
    })
}

const buySeedNow = (cropId: HomesteadCropId) => {
    const crop = getHomesteadCrop(cropId)
    const pack = HOMESTEAD_SEED_PACKS[cropId]
    const next = buySeedPack(homestead.value, cropId, Date.now())
    if (next === homestead.value) {
        proxy?.$message?.({ type: 'warning', message: '金币不够，先完成几个订单吧' })
        return
    }
    commitHomestead(next)
    proxy?.$message?.({
        type: 'success',
        message: `买了 ${pack.count} 颗${crop?.name || ''}种子`,
    })
}

const buyFertilizerNow = () => {
    const next = buyFertilizerPack(homestead.value, Date.now())
    if (next === homestead.value) {
        proxy?.$message?.({ type: 'warning', message: '金币不够，先完成几个订单吧' })
        return
    }
    commitHomestead(next)
    proxy?.$message?.({
        type: 'success',
        message: `买了 ${HOMESTEAD_FERTILIZER_PACK.count} 份肥料`,
    })
}

const purchaseMessage = (
    reason: 'ok' | 'max' | 'coins' | 'owned' | 'unknown'
): string => {
    if (reason === 'max') return '这里已经扩建到最高等级了'
    if (reason === 'coins') return '金币不够，先完成几个订单吧'
    if (reason === 'owned') return '这个装饰已经摆在院子里了'
    return '暂时没法购买，稍后再试试'
}

const buyPlotExpansionNow = () => {
    const result = buyHomesteadPlot(homestead.value, Date.now())
    if (!result.changed) {
        proxy?.$message?.({
            type: 'warning',
            message: purchaseMessage(result.reason),
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: `菜地扩建到 ${result.state.plotCount} 块，可以多种一点了`,
    })
}

const upgradeBarnNow = () => {
    const result = upgradeHomesteadBarn(homestead.value, Date.now())
    if (!result.changed) {
        proxy?.$message?.({
            type: 'warning',
            message: purchaseMessage(result.reason),
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: `畜棚升到 Lv.${result.state.barnLevel}，动物产出更快了`,
    })
}

const upgradePondNow = () => {
    const result = upgradeHomesteadPond(homestead.value, Date.now())
    if (!result.changed) {
        proxy?.$message?.({
            type: 'warning',
            message: purchaseMessage(result.reason),
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: `鱼塘升到 Lv.${result.state.pondLevel}，钓鱼冷却缩短了`,
    })
}

const buyDecorationNow = (decorationId: HomesteadDecorationId) => {
    const decoration = getHomesteadDecoration(decorationId)
    const result = buyHomesteadDecoration(
        homestead.value,
        decorationId,
        Date.now()
    )
    if (!result.changed) {
        proxy?.$message?.({
            type: 'warning',
            message: purchaseMessage(result.reason),
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: `把${decoration?.name || '新装饰'}摆进了小院`,
    })
}

const claimAchievementReward = (achievementId: string) => {
    const result = claimHomesteadAchievement(
        homestead.value,
        achievementId,
        Date.now()
    )
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message:
                result.reason === 'claimed'
                    ? '这个成就奖励已经领过了'
                    : '先完成成就目标，再来领取奖励',
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: `领取「${result.achievement?.name}」奖励，获得 ${result.achievement?.reward} 金币`,
    })
}

const commitHomestead = (next: HomesteadState) => {
    const saved = setHomesteadState(next)
    homestead.value = saved
    void syncHomesteadToServer(saved)
}

const handlePlotClick = (index: number) => {
    const plot = homestead.value.plots[index]
    const crop = getHomesteadCrop(plot?.cropId)
    const now = Date.now()
    if (!plot || !crop) {
        const seed = selectedSeed.value
        if (homestead.value.seedStock[seed.id] <= 0) {
            proxy?.$message?.({
                type: 'warning',
                message: `${seed.name}种子用完了，去商店补一点吧`,
            })
            return
        }
        const next = plantCropWithSeed(homestead.value, index, seed.id, now)
        if (next === homestead.value) return
        commitHomestead(next)
        proxy?.$message?.({
            type: 'success',
            message: `种下了${seed.name}，还剩 ${next.seedStock[seed.id]} 颗种子`,
        })
        return
    }
    if (isPlotRipe(plot, now)) {
        const result = harvestPlot(homestead.value, index, now)
        if (!result.changed) return
        commitHomestead(result.state)
        proxy?.$message?.({
            type: 'success',
            message: `收获了 ${result.amount} 个${crop.name}`,
        })
        return
    }
    if (!plot.wateredAt) {
        const next = waterPlot(homestead.value, index, now)
        if (next === homestead.value) return
        commitHomestead(next)
        proxy?.$message?.({
            type: 'success',
            message: `给${crop.name}浇了水，成熟时间缩短 20%`,
        })
        return
    }
    if (!plot.fertilizedAt && homestead.value.inventory.fertilizer > 0) {
        const next = fertilizePlot(homestead.value, index, now)
        if (next === homestead.value) return
        commitHomestead(next)
        proxy?.$message?.({
            type: 'success',
            message: `给${crop.name}施了肥，成熟时间再缩短 20%`,
        })
        return
    }
    proxy?.$message?.({
        type: 'primary',
        message: `${crop.name}还要 ${formatHomesteadDuration(
            plotRemainingMs(plot, now)
        )} 才能收获${plot.fertilizedAt ? '' : '，攒到肥料后还能再快一点'}`,
    })
}

const collectHomesteadAnimal = (animalId: HomesteadAnimalId) => {
    const now = Date.now()
    const result = collectAnimal(homestead.value, animalId, now)
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message: animalStatusText(homestead.value, animalId, now),
        })
        return
    }
    commitHomestead(result.state)
    const summary = result.items
        .map((item) => `${item.item.icon}${item.item.name}`)
        .join('、')
    proxy?.$message?.({
        type: 'success',
        message: `收起了 ${summary}`,
    })
}

const collectChicken = () => {
    collectHomesteadAnimal('chicken')
}

const collectCow = () => {
    collectHomesteadAnimal('cow')
}

const handlePondClick = () => {
    const now = Date.now()
    const result = fishPond(homestead.value, now)
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message: pondStatusText(homestead.value, now),
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: '钓到一条鱼，已经放进仓库',
    })
}

const tendHomesteadNow = () => {
    const now = Date.now()
    const result = tendHomestead(homestead.value, now)
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message: '小院现在很安稳，没有需要忙的',
        })
        return
    }
    commitHomestead(result.state)
    const parts: string[] = []
    if (result.watered) parts.push(`浇了 ${result.watered} 块地`)
    if (result.fertilized) parts.push(`施了 ${result.fertilized} 块地`)
    if (result.harvested) parts.push(`收了 ${result.harvested} 块地`)
    if (result.collected.length) {
        const count = result.collected.reduce(
            (total, item) => total + item.count,
            0
        )
        parts.push(`收起了 ${count} 份产物`)
    }
    if (result.fished) parts.push('钓到一条鱼')
    proxy?.$message?.({
        type: 'success',
        message: `小院忙完了：${parts.join('，')}`,
    })
}

const feedFromSettings = (foodId: PetFoodId = selectedFoodId.value) => {
    const food = getPetFood(foodId)
    setSelectedPetFoodId(food.id)
    selectedFoodId.value = food.id
    const result = applyFeeding(petVitals.value, Date.now(), food.id)
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
                ? `${food.name}喂饱啦，今日任务完成，奖励已到账`
                : `${food.name}喂饱啦，心情也变好了`,
        })
    } else if (result.effect === 'full') {
        proxy?.$message?.({
            type: 'warning',
            message: `它已经吃得很饱了，${food.name}先留着吧`,
        })
    } else {
        proxy?.$message?.({
            type: 'primary',
            message: `刚喂过，等 ${feedCooldownSeconds.value}s 再试吧`,
        })
    }
}

const resetPetGrowth = () => {
    if (!window.confirm('重新养一只会清空名字、等级、成就、每日任务和小院进度。确认继续吗？')) {
        return
    }
    const next = resetPetVitals(petVitals.value)
    petVitals.value = next
    petNameDraft.value = next.name
    setPetVitals(next)
    homestead.value = resetHomesteadState(Date.now(), homestead.value)
    selectedSeedId.value = 'radish'
    emitPetReaction('vitals-updated', {
        message: '宠物成长已重置',
    })
    void syncPetVitalsToServer(next)
    void syncHomesteadToServer(homestead.value)
    proxy?.$message?.({
        type: 'success',
        message: '已经重新开始，新的陪伴从今天算起，小院也整理好了',
    })
}

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

const onHomesteadAutoHelp = (event: Event) => {
    const detail = (event as CustomEvent<HomesteadAutoHelpEventDetail>).detail
    homestead.value = detail?.state || getHomesteadState()
}

const onHomesteadTabRequest = (event: Event) => {
    const tab = (event as CustomEvent<PetHomeTab>).detail
    if (PET_HOME_TABS.some((item) => item.id === tab)) {
        petHomeTab.value = tab
    }
}

onMounted(() => {
    homestead.value = getHomesteadState()
    window.addEventListener(HOMESTEAD_AUTO_HELP_EVENT, onHomesteadAutoHelp)
    window.addEventListener(HOMESTEAD_TAB_EVENT, onHomesteadTabRequest)
    unsubscribeFood = onSelectedPetFoodChange((id) => {
        selectedFoodId.value = id
    })
    feedClockTimer = window.setInterval(() => {
        nowTick.value = Date.now()
    }, 1000)
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
    void mergeRemoteHomestead(homestead.value).then((merged) => {
        homestead.value = setHomesteadState(merged)
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
    window.removeEventListener(HOMESTEAD_AUTO_HELP_EVENT, onHomesteadAutoHelp)
    window.removeEventListener(HOMESTEAD_TAB_EVENT, onHomesteadTabRequest)
    document.body.classList.remove('pet-farm-business-open')
    unsubscribeFood?.()
    unsubscribeReaction?.()
    unsubscribeSync?.()
    window.clearInterval(feedClockTimer)
    window.clearTimeout(petSaveTimer)
})
</script>

<!-- 场景与经营样式统一使用 pet- 前缀，设为全局样式供拆分后的子组件复用 -->
<style lang="less">
.pet-manage-page {
    width: 100%;
}

/* ===== 小屋内部 ===== */
.pet-home-room.is-home-interior {
    border-color: #7a563c;
    background: #f7e9d8;
    box-shadow:
        inset 0 0 0 5px rgba(255, 255, 255, 0.38),
        inset 0 -20px 38px rgba(104, 64, 36, 0.12);
}

.pet-home-room.is-home-interior::before {
    display: none;
}

.pet-home-room.is-home-interior::after {
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.32),
        inset 0 -26px 45px rgba(104, 64, 36, 0.14);
}

.pet-home-room.is-home-interior .pet-home-interior {
    width: 100%;
    box-shadow: none;
}

.pet-home-room.is-home-interior .pet-home-window {
    top: 6%;
    width: 32%;
    border-width: 5px;
}

.pet-home-room.is-home-interior .pet-home-curtain {
    top: 5%;
    width: 10%;
    height: 20%;
}

.pet-home-room.is-home-interior .pet-home-curtain-left {
    left: 28%;
}

.pet-home-room.is-home-interior .pet-home-curtain-right {
    right: 28%;
}

.pet-home-room.is-home-interior .pet-home-shelf {
    top: 27%;
    left: 7%;
    width: 18%;
}

.pet-home-room.is-home-interior .pet-home-picture {
    top: 10%;
    right: 7%;
    width: 11%;
}

.pet-home-room.is-home-interior .pet-home-clock {
    top: 36%;
    left: 8%;
    width: 9%;
}

.pet-home-room.is-home-interior .pet-home-plant {
    right: 5%;
    bottom: 10%;
    font-size: 32px;
}

.pet-home-room.is-home-interior .pet-home-rug {
    bottom: 3.5%;
    width: 46%;
    height: 12%;
}

.pet-home-room.is-home-interior .pet-home-cushion {
    bottom: 8%;
    left: 34%;
    width: 14%;
    height: 6%;
}

.pet-home-room.is-home-interior .pet-home-bowl {
    right: 17%;
    bottom: 5%;
    font-size: 26px;
}

.pet-home-bed {
    position: absolute;
    z-index: 1;
    bottom: 8%;
    left: 5%;
    width: 24%;
    height: 17%;
    border: 4px solid #8a5a3b;
    border-radius: 12px 12px 6px 6px;
    background: #f7e6cf;
    box-shadow:
        inset 0 0 0 3px #e8c9a8,
        0 8px 16px rgba(83, 54, 34, 0.18);
}

.pet-home-bed-pillow {
    position: absolute;
    top: 8%;
    left: 8%;
    width: 34%;
    height: 26%;
    border: 3px solid #e8d4bb;
    border-radius: 8px;
    background: #fffaf0;
}

.pet-home-bed-blanket {
    position: absolute;
    right: 6%;
    bottom: 6%;
    width: 62%;
    height: 44%;
    border-radius: 8px;
    background: color-mix(in srgb, var(--pcolor) 55%, #f4c7a4);
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.2);
}

.pet-home-room.is-home-interior .pet-home-room-note {
    top: 2.5%;
    right: 2.5%;
    left: auto;
    padding: 5px 9px;
    border: 2px solid #d8b99a;
    border-radius: 8px;
    background: #fff8ef;
    color: #7a563c;
    font-family: inherit;
    font-size: 10px;
    backdrop-filter: none;
}

/* ===== 全宽农场场景 ===== */
.pet-home-room {
    min-height: clamp(560px, 62vh, 760px);
    max-height: 760px;
    aspect-ratio: 1 / 1.02;
    border-color: color-mix(in srgb, #6ca34d 24%, var(--admin-line, var(--gray1)));
    border-radius: 22px;
    background:
        linear-gradient(180deg,
            #b9e4ff 0%,
            #dff4ff 31%,
            #f5fbdc 36%,
            #bce37c 38%,
            #8fcb58 58%,
            #72b84d 100%);
    box-shadow:
        inset 0 0 0 5px rgba(255, 255, 255, 0.3),
        inset 0 -20px 38px rgba(50, 96, 37, 0.14);
}

.pet-home-room::before {
    position: absolute;
    z-index: 0;
    inset: 36% 0 0;
    content: '';
    opacity: 0.52;
    background:
        radial-gradient(ellipse 30% 11% at 10% 18%, rgba(255, 255, 255, 0.17), transparent 100%),
        radial-gradient(ellipse 26% 9% at 72% 28%, rgba(43, 111, 42, 0.1), transparent 100%),
        radial-gradient(ellipse 22% 7% at 43% 58%, rgba(255, 246, 173, 0.13), transparent 100%),
        repeating-linear-gradient(104deg,
            transparent 0 18px,
            rgba(54, 126, 45, 0.08) 18px 19px);
    pointer-events: none;
}

.pet-home-room::after {
    position: absolute;
    z-index: 7;
    inset: 0;
    content: '';
    border-radius: inherit;
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.2),
        inset 0 -26px 45px rgba(42, 90, 31, 0.13);
    pointer-events: none;
}

.pet-home-room :where(button) {
    border: 0;
    padding: 0;
    color: inherit;
    background: none;
    font: inherit;
    cursor: pointer;
    appearance: none;
}

.pet-home-room :where(button):focus-visible {
    z-index: 9;
    outline: 3px solid color-mix(in srgb, var(--pcolor) 72%, white);
    outline-offset: 3px;
}

.pet-home-sky {
    position: absolute;
    z-index: 0;
    inset: 0 0 58%;
    overflow: hidden;
    background:
        radial-gradient(circle at 82% 15%, rgba(255, 250, 196, 0.68), transparent 24%),
        linear-gradient(180deg, #9edcff, #e6f7ff 78%, #effbdf 100%);
}

.pet-home-sun {
    top: 8%;
    right: 8%;
    width: 12%;
    background: radial-gradient(circle at 36% 32%, #fffde9, #ffe477 56%, #ffc84f 100%);
    box-shadow:
        0 0 0 9px rgba(255, 225, 110, 0.14),
        0 0 34px rgba(255, 220, 86, 0.55);
}

.pet-home-cloud {
    height: 5.2%;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 5px 14px rgba(83, 149, 186, 0.09);
}

.pet-home-cloud-a {
    top: 14%;
    left: 8%;
    width: 29%;
}

.pet-home-cloud-b {
    top: 24%;
    right: 18%;
    width: 20%;
    opacity: 0.76;
}

.pet-home-cloud-c {
    top: 8%;
    left: 45%;
    width: 14%;
    height: 3.8%;
    opacity: 0.5;
    animation-delay: -11s;
}

.pet-home-hill {
    bottom: -1%;
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    filter: drop-shadow(0 -2px 0 rgba(255, 255, 255, 0.16));
}

.pet-home-hill-a {
    left: -16%;
    width: 66%;
    height: 23%;
    background: linear-gradient(180deg, #a8d97c, #8bc65d);
}

.pet-home-hill-b {
    right: -20%;
    width: 76%;
    height: 20%;
    background: linear-gradient(180deg, #b8e18d, #96cf69);
}

.pet-home-hill-c {
    right: 24%;
    width: 48%;
    height: 14%;
    background: #c9e8a5;
}

.pet-home-birds {
    position: absolute;
    top: 18%;
    left: 48%;
    width: 16%;
    height: 8%;
    opacity: 0.58;
    animation: pet-yard-cloud 21s ease-in-out infinite alternate;

    i {
        position: absolute;
        width: 9%;
        aspect-ratio: 2.6;
        border-top: 2px solid #5b8aa2;
        border-radius: 50%;

        &::after {
            position: absolute;
            top: -2px;
            left: 82%;
            width: 92%;
            height: 100%;
            content: '';
            border-top: 2px solid #5b8aa2;
            border-radius: 50%;
        }
    }

    i:nth-child(1) {
        top: 8%;
        left: 6%;
    }

    i:nth-child(2) {
        top: 36%;
        left: 38%;
        transform: scale(0.78);
    }

    i:nth-child(3) {
        top: 0;
        left: 68%;
        transform: scale(0.62);
    }
}

.pet-home-barn {
    position: absolute;
    z-index: 3;
    top: 10%;
    left: 4%;
    width: 33%;
    height: 32%;
    filter: drop-shadow(0 12px 13px rgba(67, 76, 36, 0.2));
}

.pet-home-barn-silo {
    position: absolute;
    right: 0;
    bottom: 7%;
    width: 21%;
    height: 66%;
    border: 2px solid rgba(255, 255, 255, 0.74);
    border-radius: 40% 40% 5px 5px;
    background:
        repeating-linear-gradient(0deg,
            rgba(111, 128, 137, 0.11) 0 7%,
            transparent 7% 14%),
        linear-gradient(90deg, #f8fbfc, #d7e1e5 48%, #b9c8cf);
    box-shadow: inset -7px 0 10px rgba(88, 112, 122, 0.14);

    i {
        position: absolute;
        top: -7%;
        left: 50%;
        width: 106%;
        height: 20%;
        transform: translateX(-50%);
        border-radius: 50% 50% 35% 35%;
        background: linear-gradient(180deg, #aebdc3, #7f969f);
        box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.3);
    }
}

.pet-home-barn-roof {
    position: absolute;
    z-index: 2;
    top: 0;
    left: 0;
    width: 80%;
    height: 50%;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.07) 0 5%,
            transparent 5% 10%),
        linear-gradient(180deg, #e6534e, #bd3036);
    clip-path: polygon(50% 0, 100% 38%, 91% 38%, 100% 100%, 0 100%, 9% 38%, 0 38%);
    filter: drop-shadow(0 5px 0 rgba(99, 41, 35, 0.14));
}

.pet-home-barn-body {
    position: absolute;
    z-index: 1;
    bottom: 0;
    left: 7%;
    width: 68%;
    height: 68%;
    overflow: hidden;
    border: 3px solid #f9eee1;
    border-radius: 4px 4px 2px 2px;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.07) 0 2%,
            transparent 2% 5%),
        linear-gradient(180deg, #d2413f, #a92c32);
    box-shadow: inset -10px 0 18px rgba(102, 24, 30, 0.16);
}

.pet-home-barn-loft {
    position: absolute;
    top: 12%;
    left: 50%;
    width: 40%;
    height: 31%;
    transform: translateX(-50%);
    border: 3px solid #f8f0e3;
    border-radius: 3px;
    background:
        linear-gradient(42deg,
            transparent calc(50% - 1px),
            #f8f0e3 calc(50% - 1px) calc(50% + 1px),
            transparent calc(50% + 1px)),
        linear-gradient(-42deg,
            transparent calc(50% - 1px),
            #f8f0e3 calc(50% - 1px) calc(50% + 1px),
            transparent calc(50% + 1px)),
        #b82c32;
}

.pet-home-barn-door {
    position: absolute;
    bottom: -1px;
    left: 50%;
    width: 47%;
    height: 47%;
    transform: translateX(-50%);
    border: 3px solid #f8f0e3;
    border-radius: 3px 3px 0 0;
    background:
        linear-gradient(38deg,
            transparent calc(50% - 1px),
            #f8ead8 calc(50% - 1px) calc(50% + 1px),
            transparent calc(50% + 1px)),
        linear-gradient(-38deg,
            transparent calc(50% - 1px),
            #f8ead8 calc(50% - 1px) calc(50% + 1px),
            transparent calc(50% + 1px)),
        #7e3b2b;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
}

.pet-home-barn-window {
    position: absolute;
    top: 50%;
    left: 8%;
    width: 15%;
    aspect-ratio: 1;
    border: 2px solid #f8f0e3;
    background:
        linear-gradient(90deg, transparent 46%, #f8f0e3 46% 54%, transparent 54%),
        linear-gradient(180deg, #dff5ff 46%, #f8f0e3 46% 54%, #dff5ff 54%);
}

.pet-home-barn-vane {
    position: absolute;
    z-index: 3;
    top: -7%;
    left: 27%;
    width: 14%;
    height: 10%;
    border-bottom: 2px solid #fff8e9;
    transform: rotate(-8deg);

    &::before {
        position: absolute;
        right: -2px;
        bottom: -4px;
        width: 10px;
        height: 10px;
        content: '';
        border-top: 2px solid #fff8e9;
        border-right: 2px solid #fff8e9;
        transform: rotate(45deg);
    }
}

.pet-home-windmill {
    position: absolute;
    z-index: 2;
    top: 21%;
    right: 26%;
    width: 11%;
    height: 28%;
    filter: drop-shadow(0 8px 9px rgba(61, 80, 34, 0.15));
}

.pet-home-windmill-tower {
    position: absolute;
    right: 24%;
    bottom: 0;
    width: 52%;
    height: 74%;
    background: linear-gradient(90deg, #f7e7c3, #d9bb84 64%, #b89562);
    clip-path: polygon(36% 0, 64% 0, 88% 100%, 12% 100%);
    box-shadow: inset -5px 0 8px rgba(100, 71, 37, 0.12);
}

.pet-home-windmill-wheel {
    position: absolute;
    top: 0;
    left: 50%;
    width: 74%;
    aspect-ratio: 1;
    transform: translateX(-50%);
    border: 3px solid #7f623d;
    border-radius: 50%;
    background: radial-gradient(circle, #f5d689 0 13%, #9d7646 14% 20%, transparent 21%);
    animation: pet-windmill-spin 14s linear infinite;

    b {
        position: absolute;
        top: 47%;
        left: 50%;
        width: 8%;
        height: 49%;
        transform-origin: 50% 3%;
        border-radius: 999px;
        background: linear-gradient(180deg, #8f7047, #d8bd85);
        box-shadow:
            0 0 0 1px rgba(255, 250, 225, 0.7),
            0 2px 3px rgba(80, 58, 31, 0.18);
    }

    b:nth-child(1) {
        transform: translateX(-50%) rotate(0deg);
    }

    b:nth-child(2) {
        transform: translateX(-50%) rotate(90deg);
    }

    b:nth-child(3) {
        transform: translateX(-50%) rotate(180deg);
    }

    b:nth-child(4) {
        transform: translateX(-50%) rotate(270deg);
    }
}

.pet-home-tree {
    z-index: 2;
    width: 13%;
    height: 18%;
    filter: drop-shadow(0 7px 8px rgba(46, 88, 32, 0.16));
}

.pet-home-tree-a {
    top: 33%;
    right: 5%;
}

.pet-home-tree-b {
    top: 35%;
    left: 34%;
    width: 9%;
    height: 13%;
    opacity: 0.9;
}

.pet-home-tree-trunk {
    width: 15%;
    height: 42%;
    background: linear-gradient(90deg, #a36f45, #7e4f31);
}

.pet-home-tree-canopy {
    height: 80%;
    background:
        radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.34), transparent 35%),
        radial-gradient(circle at 72% 32%, #9bd56d 0 30%, transparent 31%),
        linear-gradient(145deg, #bde58d, #7fc45d 63%, #5fa948);
    box-shadow:
        inset -9px -10px 0 rgba(55, 112, 39, 0.12),
        inset 8px 7px 0 rgba(255, 255, 255, 0.06);
}

.pet-home-path {
    z-index: 1;
    top: 33%;
    bottom: auto;
    left: 7%;
    width: 30%;
    height: 47%;
    opacity: 1;
    background:
        radial-gradient(ellipse 20% 4% at 39% 20%, rgba(255, 247, 213, 0.56), transparent 100%),
        linear-gradient(180deg, #efd49f, #dab67a 72%, #cda365);
    clip-path: polygon(38% 0, 66% 0, 71% 30%, 98% 100%, 5% 100%, 26% 38%);
    filter: drop-shadow(2px 0 0 rgba(255, 249, 221, 0.45));
}

.pet-home-flower-bed {
    position: absolute;
    z-index: 2;
    top: 35.2%;
    right: 0;
    left: 0;
    height: 4.5%;
    opacity: 0.9;
    background:
        radial-gradient(circle at 7% 50%, #fff7ab 0 2px, transparent 2.8px),
        radial-gradient(circle at 13% 80%, #ff9cba 0 2.4px, transparent 3.2px),
        radial-gradient(circle at 22% 45%, #fff 0 2px, transparent 2.8px),
        radial-gradient(circle at 37% 72%, #ffd768 0 2.2px, transparent 3px),
        radial-gradient(circle at 51% 38%, #ffa8c3 0 2px, transparent 2.8px),
        radial-gradient(circle at 66% 76%, #fff 0 2.2px, transparent 3px),
        radial-gradient(circle at 78% 44%, #ffd05c 0 2px, transparent 2.8px),
        radial-gradient(circle at 92% 70%, #ff9ec1 0 2.2px, transparent 3px);
}

.pet-home-coop {
    z-index: 5;
    top: 36%;
    right: 3%;
    width: 20%;
    height: 18%;
    filter: drop-shadow(0 8px 8px rgba(73, 72, 34, 0.18));

    &.is-ready {
        filter:
            drop-shadow(0 0 8px rgba(255, 205, 90, 0.8))
            drop-shadow(0 8px 8px rgba(73, 72, 34, 0.18));
    }
}

.pet-home-coop-run {
    position: absolute;
    z-index: 0;
    bottom: 0;
    left: 0;
    width: 61%;
    height: 48%;
    border: 2px solid #ab7144;
    border-radius: 5px 5px 9px 9px;
    background:
        repeating-linear-gradient(90deg,
            #d9a36c 0 3px,
            transparent 3px 17%),
        repeating-linear-gradient(0deg,
            transparent 0 35%,
            #c58c57 35% 43%,
            transparent 43% 80%,
            #c58c57 80% 88%,
            transparent 88%);
    opacity: 0.92;
}

.pet-home-coop-wall {
    right: 1%;
    bottom: 0;
    left: 36%;
    width: auto;
    height: 67%;
    border: 2px solid #c18043;
    border-radius: 5px 5px 4px 4px;
    background:
        repeating-linear-gradient(90deg,
            rgba(146, 91, 45, 0.1) 0 2px,
            transparent 2px 11%),
        linear-gradient(180deg, #ffe29d, #efbd69);
    box-shadow: inset 0 -7px 0 rgba(142, 83, 37, 0.1);
}

.pet-home-coop-roof {
    z-index: 2;
    top: 2%;
    left: 31%;
    width: 67%;
    height: 45%;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.08) 0 4%,
            transparent 4% 9%),
        linear-gradient(180deg, #e85c4c, #bc3637);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    filter: drop-shadow(0 4px 2px rgba(100, 46, 36, 0.13));
}

.pet-home-coop-door {
    z-index: 3;
    bottom: 0;
    left: 56%;
    width: 23%;
    height: 40%;
    background: #885138;
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.1),
        inset 0 6px 0 rgba(255, 255, 255, 0.04);
}

.pet-home-coop .is-egg {
    top: 7%;
    right: -7%;
}

.pet-home-coop .is-manure {
    top: 48%;
    right: -10%;
}

.pet-home-pasture {
    z-index: 4;
    top: 61%;
    right: auto;
    bottom: auto;
    left: 3%;
    width: 27%;
    height: 20%;
    border: 0;
    border-radius: 45% 55% 38% 48% / 55% 46% 54% 45%;
    background:
        radial-gradient(ellipse at 55% 58%, rgba(221, 245, 174, 0.46), transparent 58%),
        rgba(101, 171, 63, 0.15);
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.14),
        inset 0 0 24px rgba(55, 117, 39, 0.12);
    filter: drop-shadow(0 7px 8px rgba(44, 92, 30, 0.12));

    &.is-ready {
        filter:
            drop-shadow(0 0 8px rgba(255, 205, 90, 0.8))
            drop-shadow(0 7px 8px rgba(44, 92, 30, 0.12));
    }

    &::after {
        display: none;
    }
}

.pet-home-pasture-fence {
    position: absolute;
    z-index: 0;
    inset: 2% 0;
    border: 2px solid #bd8551;
    border-radius: inherit;
    opacity: 0.92;

    &::before,
    &::after {
        position: absolute;
        right: 4%;
        left: 4%;
        height: 12%;
        content: '';
        border-top: 2px solid #a96f43;
        border-bottom: 2px solid #d39a61;
        background:
            repeating-linear-gradient(90deg,
                #c38a53 0 3px,
                transparent 3px 16%);
    }

    &::before {
        top: 26%;
    }

    &::after {
        bottom: 17%;
    }
}

.pet-home-pasture .is-milk {
    top: 1%;
    right: 3%;
}

.pet-home-pasture .is-manure {
    top: 55%;
    right: 4%;
}

.pet-home-plots {
    z-index: 4;
    top: 49%;
    right: auto;
    left: 34%;
    width: 38%;
    height: 29%;
    gap: 4%;
    filter: drop-shadow(0 8px 8px rgba(69, 49, 28, 0.15));
}

.pet-home-plot {
    border: clamp(3px, 0.55vw, 5px) solid #a8693e;
    border-radius: 9px;
    padding: 12% 10% 9%;
    background:
        repeating-linear-gradient(180deg,
            #875331 0 14%,
            #9b6138 14% 28%);
    box-shadow:
        inset 0 0 0 2px #c78b58,
        inset 0 5px 9px rgba(67, 38, 22, 0.2);

    &.is-empty {
        background:
            repeating-linear-gradient(180deg,
                #875331 0 14%,
                #996037 14% 28%);
    }

    &.is-ready {
        animation: pet-crop-ready 1.8s ease-in-out infinite;
    }

    &::before {
        background:
            radial-gradient(circle at 27% 14%, rgba(255, 255, 255, 0.2), transparent 47%),
            repeating-linear-gradient(90deg,
                transparent 0 17%,
                rgba(255, 255, 255, 0.045) 17% 18%);
    }

    b:not(.pet-home-plot-crop) {
        width: 18%;
        height: 34%;
        background: linear-gradient(180deg, #91d86b, #4d9e3d);
    }
}

.pet-home-plot-crop {
    top: 7%;
    right: 7%;
    font-size: clamp(19px, 2.1vw, 29px);
}

.pet-home-plot-water {
    top: 7%;
    left: 8%;
    font-size: clamp(11px, 1.2vw, 15px);
}

.pet-home-plot-empty {
    font-size: clamp(24px, 3vw, 38px);
}

.pet-home-pond {
    z-index: 3;
    right: 2%;
    bottom: 3%;
    width: 31%;
    height: 18%;
    border: 3px solid rgba(77, 159, 80, 0.42);
    border-radius: 46% 54% 53% 47% / 52% 45% 55% 48%;
    background:
        radial-gradient(ellipse at 48% 36%, #e4fbff 0 12%, transparent 13%),
        radial-gradient(ellipse at 50% 44%, #b9edf8 0 45%, #7cd3ea 46% 71%, #52b9da 72% 100%);
    box-shadow:
        inset 0 7px 13px rgba(255, 255, 255, 0.48),
        inset 0 -8px 14px rgba(43, 126, 150, 0.2),
        0 0 0 5px rgba(102, 171, 70, 0.12),
        0 7px 14px rgba(49, 116, 128, 0.17);

    &.is-ready {
        filter: drop-shadow(0 0 9px rgba(255, 205, 90, 0.76));
    }
}

.pet-home-pond-dock {
    position: absolute;
    z-index: 3;
    top: 28%;
    left: -9%;
    width: 37%;
    height: 21%;
    transform: rotate(-8deg);
    border-radius: 2px;
    background:
        repeating-linear-gradient(90deg,
            #b87846 0 13%,
            #925a35 13% 16%,
            #c88b55 16% 28%);
    box-shadow: 0 4px 5px rgba(82, 58, 31, 0.16);

    &::before,
    &::after {
        position: absolute;
        top: 82%;
        width: 7%;
        height: 62%;
        content: '';
        background: #8f5734;
    }

    &::before {
        left: 13%;
    }

    &::after {
        right: 12%;
    }
}

.pet-home-pond-ripple {
    border-color: rgba(255, 255, 255, 0.68);
}

.pet-home-pond-fish {
    position: absolute;
    top: 58%;
    left: 28%;
    width: 11%;
    aspect-ratio: 2.4;
    transform: rotate(-12deg);
    border-radius: 50% 45% 45% 50%;
    background: rgba(47, 120, 145, 0.34);
    animation: pet-fish-swim 4.6s ease-in-out infinite;

    &::after {
        position: absolute;
        top: 8%;
        left: -24%;
        width: 32%;
        height: 84%;
        content: '';
        background: inherit;
        clip-path: polygon(100% 50%, 0 0, 0 100%);
    }
}

.pet-home-reeds {
    right: 2%;
    bottom: 4%;
    font-size: clamp(20px, 2.4vw, 31px);
}

.pet-home-pond .is-fish {
    top: -8%;
    right: 8%;
}

.pet-home-sign {
    z-index: 6;
    top: 41%;
    bottom: auto;
    left: 31.5%;
    display: flex;
    width: 13%;
    min-width: 62px;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 6px 7px 5px;
    border: 2px solid #7f4c25;
    border-radius: 5px;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.05) 0 4%,
            transparent 4% 11%),
        linear-gradient(180deg, #c78348, #9d5d30);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.24),
        0 5px 7px rgba(71, 46, 25, 0.18);
    transform: rotate(-2deg);

    b {
        color: #fff5d8;
        font-size: clamp(9px, 1vw, 12px);
        font-weight: 760;
        letter-spacing: 0.08em;
        text-shadow: 0 1px 1px rgba(86, 45, 18, 0.45);
        white-space: nowrap;
    }

    small {
        color: rgba(255, 244, 211, 0.74);
        font-size: 7px;
        letter-spacing: 0.12em;
        line-height: 1.2;
    }
}

@keyframes pet-windmill-spin {
    to {
        rotate: 360deg;
    }
}

@keyframes pet-fish-swim {
    0%,
    100% {
        transform: translateX(0) rotate(-12deg);
        opacity: 0.38;
    }

    50% {
        transform: translateX(28%) rotate(7deg);
        opacity: 0.7;
    }
}

@keyframes pet-crop-ready {
    0%,
    100% {
        box-shadow:
            inset 0 0 0 2px #c78b58,
            inset 0 5px 9px rgba(67, 38, 22, 0.2),
            0 0 0 1px rgba(255, 215, 120, 0.28);
    }

    50% {
        box-shadow:
            inset 0 0 0 2px #d49b67,
            inset 0 5px 9px rgba(67, 38, 22, 0.17),
            0 0 0 4px rgba(255, 215, 120, 0.34),
            0 0 18px rgba(255, 205, 90, 0.48);
    }
}

.pet-home-room-note {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 5;
    padding: 5px 9px;
    border: 1px solid rgba(255, 255, 255, 0.56);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.48);
    color: rgba(56, 74, 105, 0.72);
    font-size: 10px;
    backdrop-filter: blur(5px);
    pointer-events: none;
}

.pet-homestead-tools {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pet-homestead-hint {
    flex: 1;
    min-width: 0;
    padding: 0 4px;
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
    line-height: 1.5;
}

.pet-homestead-business {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--pcolor) 16%, var(--admin-line, var(--gray1)));
    border-radius: 14px;
    background:
        linear-gradient(135deg,
            color-mix(in srgb, var(--pcolor) 7%, transparent),
            transparent 64%),
        var(--admin-surface, var(--bgColor1));
}

.pet-homestead-coins {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #9a6500;
    font-size: 12px;
    font-weight: 650;

    span {
        font-size: 15px;
        line-height: 1;
    }

    b {
        font-size: 15px;
        font-variant-numeric: tabular-nums;
    }
}

.pet-homestead-orders-progress {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}

.pet-homestead-business-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;

    button {
        position: relative;
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        gap: 4px;
        padding: 0 10px;
        border: 1px solid color-mix(in srgb, var(--pcolor) 22%, var(--admin-line, var(--gray1)));
        border-radius: 10px;
        background: color-mix(in srgb, var(--pcolor) 5%, var(--admin-surface, var(--bgColor1)));
        color: var(--admin-text, var(--gray));
        font: inherit;
        font-size: 11px;
        font-weight: 650;
        cursor: pointer;
        transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;

        span {
            font-size: 13px;
            line-height: 1;
        }

        b {
            display: inline-grid;
            min-width: 17px;
            height: 17px;
            margin-left: 2px;
            padding: 0 4px;
            place-items: center;
            border-radius: 999px;
            background: #f2a63c;
            color: #fff;
            font-size: 9px;
            line-height: 1;
        }

        &:hover {
            border-color: color-mix(in srgb, var(--pcolor) 42%, var(--admin-line, var(--gray1)));
            background: color-mix(in srgb, var(--pcolor) 10%, var(--admin-surface, var(--bgColor1)));
            transform: translateY(-1px);
        }

        &:focus-visible {
            outline: 2px solid var(--pcolor);
            outline-offset: 2px;
        }
    }
}

.pet-homestead-seed.is-sold-out {
    opacity: 0.5;

    &.is-active {
        opacity: 0.78;
    }
}

.pet-homestead-seeds {
    display: flex;
    flex: 1;
    min-width: 0;
    gap: 4px;
    overflow-x: auto;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor2);
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.pet-homestead-seed {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;

    span {
        font-size: 14px;
    }

    small {
        font-size: 10px;
    }

    &.is-active {
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        box-shadow: 0 4px 10px var(--pcolor3);
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
}

.pet-homestead-tend {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 5px;
    min-height: 38px;
    padding: 0 11px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 6px 14px var(--pcolor3);
    transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease;

    span {
        font-size: 14px;
    }

    &:hover:not(:disabled) {
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        box-shadow: none;
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
}

.pet-homestead-tend-count {
    position: absolute;
    top: -6px;
    right: -6px;
    display: grid;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    place-items: center;
    border-radius: 999px;
    background: #ffb44d;
    color: #5a3200;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 2px 6px rgba(90, 50, 0, 0.18);
}

.pet-homestead-store {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    overflow-x: auto;
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    scrollbar-width: thin;
}

.pet-homestead-store-label {
    flex: none;
    color: var(--admin-text, var(--gray));
    font-weight: 650;
}

.pet-homestead-item {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    padding: 3px 7px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--admin-surface, var(--bgColor1));
    white-space: nowrap;

    span {
        font-size: 12px;
    }
}

.pet-homestead-store-empty {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
}

.pet-homestead-auto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    border: 1px dashed color-mix(in srgb, var(--pcolor) 26%, var(--admin-line, var(--gray1)));
    border-radius: 12px;
    background: color-mix(in srgb, var(--pcolor) 5%, var(--admin-surface, var(--bgColor1)));
}

.pet-homestead-auto-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 11px;
        font-weight: 650;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        line-height: 1.45;
    }
}

.pet-homestead-auto-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 7px;
}

.pet-homestead-auto-now {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 30px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--pcolor) 28%, var(--admin-line, var(--gray1)));
    border-radius: 9px;
    background: var(--admin-surface, var(--bgColor1));
    color: var(--pcolor);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.18s ease, transform 0.18s ease;

    span {
        font-size: 13px;
    }

    &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--pcolor) 10%, var(--admin-surface, var(--bgColor1)));
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
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

    b {
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        font-weight: 600;
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

/* ===== Kenney Tiny Farm 像素场景 ===== */
.pet-home-room.is-pixel-farm {
    min-height: clamp(560px, 62vh, 760px);
    max-height: 760px;
    aspect-ratio: 1 / 1.02;
    overflow: hidden;
    border: 4px solid #3c2b2f;
    border-radius: 0;
    background: #84c669;
    box-shadow:
        inset 0 0 0 4px #9ed77d,
        0 6px 0 rgba(54, 43, 44, 0.18);
    image-rendering: pixelated;
}

.pet-home-room.is-pixel-farm::before,
.pet-home-room.is-pixel-farm::after {
    display: none;
}

.pet-pixel-backdrop {
    position: absolute;
    z-index: 0;
    inset: 0;
    background: url('../assets/farm/pixel/grass.png') 0 0 / 64px 64px repeat;
    image-rendering: pixelated;
}

.pet-pixel-backdrop::before,
.pet-pixel-backdrop::after {
    display: none;
}

.pet-pixel-house,
.pet-pixel-tree,
.pet-pixel-bush,
.pet-pixel-flower,
.pet-pixel-hay,
.pet-pixel-barrel,
.pet-pixel-crate,
.pet-pixel-scarecrow,
.pet-pixel-beehive,
.pet-pixel-watering-can,
.pet-pixel-milk-can,
.pet-pixel-rock,
.pet-pixel-chicken-free {
    position: absolute;
    background-repeat: no-repeat;
    background-position: center bottom;
    background-size: 100% 100%;
    image-rendering: pixelated;
    pointer-events: none;
}

.pet-pixel-house {
    z-index: 2;
    top: 4.5%;
    left: 4.5%;
    width: 25%;
    aspect-ratio: 100 / 200;
    background-image: url('../assets/farm/pixel/house.png');
    filter: drop-shadow(4px 4px 0 rgba(60, 43, 47, 0.16));
}

.pet-pixel-path {
    position: absolute;
    z-index: 1;
    background-repeat: repeat;
    image-rendering: pixelated;
    pointer-events: none;
}

.pet-pixel-path-top,
.pet-pixel-path-house,
.pet-pixel-path-bottom {
    background-image: url('../assets/farm/pixel/grass-path-h.png');
    background-repeat: repeat-x;
    background-size: auto 100%;
}

.pet-pixel-path-branch,
.pet-pixel-path-main {
    background-image: url('../assets/farm/pixel/grass-path.png');
    background-repeat: repeat-y;
    background-size: 100% auto;
}

.pet-pixel-path-top {
    top: 21.5%;
    left: 28%;
    width: 48%;
    height: 4.2%;
}

.pet-pixel-path-branch {
    top: 24%;
    left: 51%;
    width: 4.5%;
    height: 16%;
}

.pet-pixel-path-house {
    top: 50%;
    left: 16%;
    width: 18.5%;
    height: 4.2%;
}

.pet-pixel-path-main {
    top: 50%;
    left: 30.7%;
    width: 4.2%;
    height: 42%;
}

.pet-pixel-path-bottom {
    top: 87.5%;
    left: 30.7%;
    width: 41.3%;
    height: 4.2%;
}

.pet-pixel-tree {
    width: 10%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/tree.png');
}

.pet-pixel-tree-a {
    top: 3%;
    right: 30%;
    width: 10%;
}

.pet-pixel-tree-b {
    top: 12%;
    left: 31.5%;
    width: 7.5%;
    opacity: 0.92;
}

.pet-pixel-tree-c {
    bottom: 1%;
    left: 1%;
    width: 7%;
    opacity: 0.82;
}

.pet-pixel-tree-d {
    top: 64%;
    right: 1%;
    width: 9%;
    opacity: 0.82;
}

.pet-pixel-tree-e {
    top: 2%;
    left: 34%;
    width: 8.5%;
    background-image: url('../assets/farm/pixel/tree-oak.png');
}

.pet-pixel-bush {
    width: 5%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/bush.png');
}

.pet-pixel-bush-a {
    top: 30%;
    right: 27.5%;
    width: 4.5%;
}

.pet-pixel-bush-b {
    top: 65%;
    left: 72.5%;
    width: 4%;
}

.pet-pixel-bush-c {
    bottom: 7%;
    left: 24%;
    width: 4.5%;
}

.pet-pixel-flower {
    width: 4.5%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/flower.png');
}

.pet-pixel-flower-a {
    top: 73%;
    left: 66.5%;
    width: 3.8%;
}

.pet-pixel-flower-b {
    top: 52%;
    left: 1.5%;
    width: 3.6%;
}

.pet-pixel-flower-c {
    left: 24%;
    bottom: 2%;
    width: 3.6%;
}

.pet-pixel-flower-d {
    top: 70%;
    left: 72.5%;
    width: 4%;
}

.pet-pixel-flower-e {
    top: 82%;
    right: 35.5%;
    width: 3.8%;
}

.pet-pixel-barrel,
.pet-pixel-crate {
    width: 4.5%;
    aspect-ratio: 1;
}

.pet-pixel-barrel {
    top: 58%;
    right: 5%;
    background-image: url('../assets/farm/pixel/barrel.png');
}

.pet-pixel-crate {
    right: 4%;
    top: 44%;
    background-image: url('../assets/farm/pixel/crate.png');
}

.pet-pixel-hay {
    top: 45%;
    right: 17%;
    width: 6%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/hay.png');
}

.pet-pixel-fence {
    position: absolute;
    z-index: 1;
    top: 38%;
    right: 2.5%;
    width: 25%;
    height: 5%;
    background:
        repeating-linear-gradient(90deg,
            #5a3b2a 0 3px,
            #c58750 3px 6px,
            transparent 6px 28px),
        linear-gradient(180deg,
            transparent 0 20%,
            #6f4531 20% 28%,
            #c58750 28% 40%,
            transparent 40% 58%,
            #6f4531 58% 66%,
            #c58750 66% 78%,
            transparent 78%);
    filter: drop-shadow(2px 2px 0 rgba(60, 43, 47, 0.18));
    image-rendering: pixelated;
    pointer-events: none;
}

.pet-pixel-scarecrow {
    z-index: 3;
    top: 30.5%;
    left: 30.5%;
    width: 8%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/scarecrow.png');
    filter: drop-shadow(3px 3px 0 rgba(60, 43, 47, 0.18));
}

.pet-pixel-beehive {
    z-index: 3;
    top: 51%;
    right: 3.5%;
    width: 6%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/beehive.png');
    filter: drop-shadow(3px 3px 0 rgba(60, 43, 47, 0.18));
}

.pet-pixel-watering-can {
    z-index: 3;
    top: 53%;
    right: 20%;
    width: 5.5%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/watering-can.png');
    filter: drop-shadow(3px 3px 0 rgba(60, 43, 47, 0.18));
}

.pet-pixel-milk-can {
    z-index: 3;
    top: 56%;
    left: 19%;
    width: 4.5%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/milk-can.png');
    filter: drop-shadow(3px 3px 0 rgba(60, 43, 47, 0.18));
}

.pet-yard-decorations {
    position: absolute;
    z-index: 3;
    inset: 0;
    pointer-events: none;
}

.pet-yard-decor {
    position: absolute;
    image-rendering: pixelated;
    filter: drop-shadow(3px 3px 0 rgba(60, 43, 47, 0.18));
    pointer-events: none;
}

.pet-yard-decor.is-lantern {
    bottom: 31%;
    left: 2%;
    width: 4.6%;
    aspect-ratio: 0.72;
    border: 3px solid #3c2b2f;
    border-radius: 38% 38% 30% 30%;
    background: linear-gradient(180deg, #ef6b55 0 48%, #c23a37 48% 100%);
    box-shadow:
        inset 0 -6px 0 #8f222c,
        0 0 12px rgba(255, 210, 120, 0.7);

    &::before {
        position: absolute;
        top: -24%;
        left: 38%;
        width: 24%;
        height: 24%;
        content: '';
        background: #3c2b2f;
    }

    &::after {
        position: absolute;
        bottom: -30%;
        left: 40%;
        width: 20%;
        height: 30%;
        content: '';
        background: #f2c14e;
        box-shadow: 0 4px 0 #c23a37;
    }
}

.pet-yard-decor.is-birdhouse {
    top: 4%;
    right: 30%;
    width: 5%;
    height: 9%;
    background:
        linear-gradient(90deg,
            transparent 44%,
            #6f4531 44% 56%,
            transparent 56%) center bottom / 100% 100% no-repeat;

    &::before {
        position: absolute;
        top: 0;
        left: 10%;
        width: 80%;
        height: 52%;
        content: '';
        border: 3px solid #3c2b2f;
        background: linear-gradient(180deg, #c58750, #8f5c3c);
        box-shadow: inset 0 -5px 0 #7a4a32;
    }

    &::after {
        position: absolute;
        top: -26%;
        left: -14%;
        width: 128%;
        height: 34%;
        content: '';
        background: #b0523c;
        clip-path: polygon(50% 0, 100% 100%, 0 100%);
    }
}

.pet-yard-decor.is-bench {
    bottom: 3%;
    left: 2%;
    width: 9%;
    height: 5.5%;
    background:
        repeating-linear-gradient(90deg,
            #c58750 0 18%,
            #815033 18% 21%) center bottom / 100% 42% no-repeat;

    &::before {
        position: absolute;
        top: -55%;
        left: 5%;
        width: 90%;
        height: 60%;
        content: '';
        border: 2px solid #3c2b2f;
        background:
            repeating-linear-gradient(90deg,
                #c58750 0 18%,
                #815033 18% 21%);
    }

    &::after {
        position: absolute;
        bottom: -55%;
        left: 2%;
        width: 96%;
        height: 60%;
        content: '';
        background:
            linear-gradient(90deg,
                #6f4531 0 12%,
                transparent 12% 88%,
                #6f4531 88%);
    }
}

.pet-yard-decor.is-fountain {
    right: 2%;
    bottom: 37%;
    width: 8%;
    height: 8%;
    border: 3px solid #3c2b2f;
    border-radius: 50% 50% 35% 35% / 30% 30% 70% 70%;
    background:
        radial-gradient(ellipse at 50% 55%,
            #8fe3f1 0 38%,
            #b8c5cf 40% 58%,
            #6f7a83 60% 100%);
    box-shadow: inset 0 6px 0 #d8e1e6;

    &::before {
        position: absolute;
        top: -85%;
        left: 46%;
        width: 8%;
        height: 90%;
        content: '';
        background:
            linear-gradient(180deg,
                transparent 0 8%,
                #9fe7f4 8% 100%);
        animation: pet-fountain-jet 1.4s steps(2, end) infinite;
    }

    &::after {
        position: absolute;
        top: -22%;
        left: 20%;
        width: 60%;
        height: 20%;
        content: '';
        border: 3px solid #3c2b2f;
        border-radius: 50%;
        background: #b8c5cf;
    }
}

.pet-yard-decor.is-pumpkin {
    bottom: 2%;
    left: 26%;
    width: 6%;
    height: 4.5%;
    border: 3px solid #3c2b2f;
    border-radius: 45% 45% 38% 38%;
    background:
        repeating-linear-gradient(90deg,
            #f39a3e 0 22%,
            #d96b22 22% 34%,
            #f39a3e 34% 56%,
            #c45f1f 56% 68%,
            #f39a3e 68% 90%,
            #d96b22 90% 100%);

    &::before {
        position: absolute;
        top: -28%;
        left: 44%;
        width: 12%;
        height: 30%;
        content: '';
        background: #5f7a34;
    }

    &::after {
        position: absolute;
        top: -16%;
        left: 56%;
        width: 24%;
        height: 12%;
        content: '';
        background: #6f9a3d;
        transform: rotate(-18deg);
    }
}

.pet-yard-decor.is-kite {
    top: 4%;
    left: 58%;
    width: 4.2%;
    height: 5.4%;
    background:
        conic-gradient(from 45deg,
            #f0574d 0 25%,
            #f4c14f 0 50%,
            #65b7e8 0 75%,
            #f0574d 0);
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
    animation: pet-kite-float 3.2s steps(2, end) infinite;

    &::before {
        position: absolute;
        top: 92%;
        left: 47%;
        width: 6%;
        height: 90%;
        content: '';
        background:
            repeating-linear-gradient(180deg,
                #f4c14f 0 18%,
                #f0574d 18% 36%);
    }

    &::after {
        position: absolute;
        top: 140%;
        left: 20%;
        width: 60%;
        height: 14%;
        content: '';
        background: #f4c14f;
    }
}

.pet-home-room.is-tab-raise .pet-yard-decor.is-bench {
    right: 2%;
    left: auto;
}

.pet-home-room.is-tab-raise .pet-yard-decor.is-pumpkin {
    left: 53%;
}

.pet-home-room.is-tab-raise .pet-yard-decor.is-birdhouse {
    right: 32%;
    top: 3%;
}

.pet-home-room.is-tab-fish .pet-yard-decor.is-bench {
    bottom: 37%;
    left: 2%;
    right: auto;
}

.pet-home-room.is-tab-fish .pet-yard-decor.is-pumpkin {
    left: 47%;
}

.pet-home-room.is-tab-fish .pet-yard-decor.is-fountain {
    right: 2%;
    bottom: 39%;
}

.pet-home-room.is-tab-fish .pet-yard-decor.is-lantern {
    bottom: 35%;
}

.pet-pixel-rock {
    width: 6%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/rock.png');
    opacity: 0.95;
    filter: drop-shadow(2px 2px 0 rgba(60, 43, 47, 0.16));
}

.pet-pixel-rock-a {
    bottom: 2%;
    left: 16%;
    width: 5.5%;
}

.pet-pixel-rock-b {
    top: 78%;
    left: 66.5%;
    width: 4.5%;
}

.pet-pixel-chicken-free {
    z-index: 3;
    bottom: 3%;
    left: 40%;
    width: 6.5%;
    aspect-ratio: 1;
    background-image: url('../assets/farm/pixel/chicken.png');
    animation: pet-pixel-hop 3.4s steps(2, end) infinite;
    animation-delay: 0.6s;
    opacity: 0.96;
    filter: drop-shadow(2px 2px 0 rgba(60, 43, 47, 0.16));
}

.pet-home-room.is-pixel-farm .pet-home-coop {
    top: 10%;
    right: 4%;
    width: 24%;
    height: 24%;
    border-radius: 0;
    filter: none;

    &.is-ready {
        filter: drop-shadow(0 0 0 transparent);
    }
}

.pet-pixel-coop-run {
    position: absolute;
    z-index: 0;
    bottom: 0;
    left: 0;
    width: 58%;
    height: 43%;
    border-top: 3px solid #b97849;
    border-bottom: 3px solid #6d4632;
    background:
        repeating-linear-gradient(90deg,
            #c98d56 0 3px,
            transparent 3px 22%),
        repeating-linear-gradient(0deg,
            transparent 0 44%,
            #b97849 44% 54%,
            transparent 54%);
}

.pet-pixel-coop-wall {
    position: absolute;
    z-index: 2;
    right: 1%;
    bottom: 0;
    left: 32%;
    width: auto;
    height: 58%;
    border: 3px solid #3c2b2f;
    border-radius: 0;
    background:
        repeating-linear-gradient(90deg,
            transparent 0 17px,
            rgba(60, 43, 47, 0.16) 17px 20px,
            rgba(255, 255, 255, 0.07) 20px 22px,
            transparent 22px 43px),
        repeating-linear-gradient(0deg,
            transparent 0 11px,
            rgba(82, 46, 33, 0.18) 11px 13px),
        #d87844;
    box-shadow:
        inset 0 4px 0 #ed9b5d,
        inset 0 -4px 0 rgba(82, 46, 33, 0.28);
}

.pet-pixel-coop-roof {
    position: absolute;
    z-index: 3;
    top: 5%;
    left: 24%;
    width: 76%;
    height: 42%;
    background:
        repeating-linear-gradient(90deg,
            transparent 0 12px,
            rgba(60, 43, 47, 0.14) 12px 14px),
        repeating-linear-gradient(0deg,
            #d9584f 0 7px,
            #c94945 7px 14px);
    clip-path: polygon(50% 0, 100% 48%, 92% 48%, 92% 100%, 8% 100%, 8% 48%, 0 48%);
    filter: drop-shadow(0 4px 0 #3c2b2f);

    &::before {
        position: absolute;
        top: 0;
        left: 50%;
        width: 4px;
        height: 54%;
        content: '';
        background: #e86a5f;
        box-shadow: 2px 0 0 rgba(60, 43, 47, 0.22);
        transform: translateX(-50%);
    }
}

.pet-pixel-coop-door {
    position: absolute;
    z-index: 4;
    bottom: 0;
    left: 48%;
    width: 22%;
    height: 34%;
    border: 3px solid #3c2b2f;
    border-bottom: 0;
    background: #5f3d30;
    box-shadow: inset 0 5px 0 #84513a;

    &::after {
        position: absolute;
        bottom: -9px;
        left: -22%;
        width: 144%;
        height: 9px;
        content: '';
        border: 2px solid #3c2b2f;
        border-top: 0;
        background: #a66b42;
        box-shadow: inset 0 2px 0 #c98d56;
    }
}

.pet-pixel-coop-loft {
    position: absolute;
    z-index: 4;
    bottom: 38%;
    left: 46%;
    width: 18%;
    height: 16%;
    border: 3px solid #3c2b2f;
    background:
        linear-gradient(45deg,
            transparent 43%,
            #c58750 43% 57%,
            transparent 57%),
        linear-gradient(-45deg,
            transparent 43%,
            #c58750 43% 57%,
            transparent 57%),
        #5f3d30;
    box-shadow: inset 0 0 0 2px #84513a;
}

.pet-pixel-chicken {
    position: absolute;
    z-index: 5;
    bottom: -2%;
    left: 0;
    width: 40%;
    aspect-ratio: 1;
    background: url('../assets/farm/pixel/chicken.png') center / 100% 100% no-repeat;
    image-rendering: pixelated;
    animation: pet-pixel-hop 2.8s steps(2, end) infinite;
    pointer-events: none;
}

.pet-home-room.is-pixel-farm .pet-home-pasture {
    top: 64%;
    right: auto;
    bottom: auto;
    left: 3%;
    width: 27%;
    height: 24%;
    border: 0;
    border-radius: 0;
    background: rgba(125, 196, 96, 0.5);
    box-shadow:
        inset 0 0 0 3px #4e4635,
        inset 0 0 0 6px #78b95b;
    filter: none;

    &.is-ready {
        filter: none;
    }
}

.pet-pixel-pasture-fence {
    position: absolute;
    z-index: 1;
    inset: 4%;
    border: 4px solid #6f4531;
    box-shadow: inset 0 0 0 3px #c58750;

    &::before,
    &::after {
        position: absolute;
        right: -4px;
        left: -4px;
        height: 4px;
        content: '';
        background: #c58750;
        box-shadow:
            0 16px 0 #c58750,
            0 32px 0 #b97849;
    }

    &::before {
        top: 25%;
    }

    &::after {
        bottom: 25%;
        box-shadow: none;
    }
}

.pet-pixel-pasture-gate {
    position: absolute;
    z-index: 3;
    bottom: -2%;
    left: 36%;
    width: 28%;
    height: 13%;
    border: 3px solid #6f4531;
    background:
        linear-gradient(45deg,
            transparent 43%,
            #c58750 43% 57%,
            transparent 57%),
        linear-gradient(-45deg,
            transparent 43%,
            #c58750 43% 57%,
            transparent 57%),
        #8f5c3c;
    box-shadow: 2px 2px 0 rgba(60, 43, 47, 0.2);
    pointer-events: none;
}

.pet-home-room.is-pixel-farm .pet-home-pasture > b.pet-pixel-cow {
    position: absolute;
    z-index: 3;
    bottom: 9%;
    left: 12%;
    width: 52%;
    aspect-ratio: 1;
    background: url('../assets/farm/pixel/cow.png') center / 100% 100% no-repeat;
    image-rendering: pixelated;
    animation: pet-pixel-graze 3.6s steps(2, end) infinite;
    pointer-events: none;
}

.pet-home-room.is-pixel-farm .pet-home-pasture > b.pet-pixel-sheep {
    position: absolute;
    z-index: 2;
    top: 20%;
    right: 8%;
    width: 34%;
    aspect-ratio: 1;
    background: url('../assets/farm/pixel/sheep.png') center / 100% 100% no-repeat;
    image-rendering: pixelated;
    opacity: 0.92;
    pointer-events: none;
}

.pet-pixel-trough {
    position: absolute;
    z-index: 2;
    right: 4%;
    bottom: 2%;
    width: 24%;
    aspect-ratio: 1;
    background: url('../assets/farm/pixel/trough.png') center / 100% 100% no-repeat;
    image-rendering: pixelated;
    opacity: 0.95;
    filter: drop-shadow(2px 2px 0 rgba(60, 43, 47, 0.16));
    pointer-events: none;
}

.pet-home-room.is-pixel-farm .pet-home-plots {
    z-index: 4;
    top: 40%;
    right: auto;
    left: 35%;
    width: 37%;
    height: 32%;
    grid-template-columns: repeat(var(--plot-columns, 2), minmax(0, 1fr));
    gap: 3.2%;
    filter: none;
}

.pet-home-room.is-pixel-farm .pet-home-plot {
    overflow: hidden;
    border: 0;
    border-radius: 0;
    padding: 0;
    background:
        radial-gradient(circle at 22% 26%, rgba(48, 30, 24, 0.26) 0 1px, transparent 1.6px),
        radial-gradient(circle at 68% 64%, rgba(48, 30, 24, 0.22) 0 1px, transparent 1.6px),
        repeating-linear-gradient(180deg,
            #70412d 0 9%,
            #8c5235 9% 18%,
            #a8633d 18% 21%,
            #8c5235 21% 27%,
            #70412d 27% 36%);
    background-size: 19px 19px, 27px 27px, 100% 100%;
    box-shadow:
        inset 0 0 0 4px #c27a45,
        0 0 0 3px #3c2b2f,
        0 5px 0 rgba(52, 91, 37, 0.22);

    &.is-empty {
        background:
            radial-gradient(circle at 22% 26%, rgba(48, 30, 24, 0.26) 0 1px, transparent 1.6px),
            radial-gradient(circle at 68% 64%, rgba(48, 30, 24, 0.22) 0 1px, transparent 1.6px),
            repeating-linear-gradient(180deg,
                #70412d 0 9%,
                #8c5235 9% 18%,
                #a8633d 18% 21%,
                #8c5235 21% 27%,
                #70412d 27% 36%);
        background-size: 19px 19px, 27px 27px, 100% 100%;
    }

    &.is-ready {
        animation: pet-pixel-ready 1s steps(2, end) infinite;
    }

    &::before {
        display: none;
    }
}

.pet-home-plot > b.pet-pixel-crop {
    position: absolute;
    z-index: 2;
    top: 7%;
    right: 9%;
    bottom: 8%;
    left: 9%;
    width: auto;
    height: auto;
    border-radius: 0;
    background-position: center bottom;
    background-repeat: no-repeat;
    background-size: contain;
    box-shadow: none;
    filter: none;
    transform-origin: bottom center;
    image-rendering: pixelated;
    pointer-events: none;

    &::before,
    &::after {
        display: none;
    }
}

.pet-pixel-crop.is-carrot.is-stage-0 {
    background-image: url('../assets/farm/pixel/crop-carrot-0.png');
}

.pet-pixel-crop.is-carrot.is-stage-1 {
    background-image: url('../assets/farm/pixel/crop-carrot-1.png');
}

.pet-pixel-crop.is-carrot.is-stage-2 {
    background-image: url('../assets/farm/pixel/crop-carrot-2.png');
}

.pet-pixel-crop.is-carrot.is-stage-3 {
    background-image: url('../assets/farm/pixel/crop-carrot-2.png');
}

.pet-pixel-crop.is-tomato.is-stage-0 {
    background-image: url('../assets/farm/pixel/crop-tomato-0.png');
}

.pet-pixel-crop.is-tomato.is-stage-1 {
    background-image: url('../assets/farm/pixel/crop-tomato-1.png');
}

.pet-pixel-crop.is-tomato.is-stage-2 {
    background-image: url('../assets/farm/pixel/crop-tomato-2.png');
}

.pet-pixel-crop.is-tomato.is-stage-3 {
    background-image: url('../assets/farm/pixel/crop-tomato-2.png');
}

.pet-pixel-crop.is-corn.is-stage-0 {
    background-image: url('../assets/farm/pixel/crop-corn-0.png');
}

.pet-pixel-crop.is-corn.is-stage-1 {
    background-image: url('../assets/farm/pixel/crop-corn-1.png');
}

.pet-pixel-crop.is-corn.is-stage-2 {
    background-image: url('../assets/farm/pixel/crop-corn-2.png');
}

.pet-pixel-crop.is-corn.is-stage-3 {
    background-image: url('../assets/farm/pixel/crop-corn-2.png');
}

.pet-pixel-crop.is-cabbage.is-stage-0 {
    background-image: url('../assets/farm/pixel/crop-cabbage-0.png');
}

.pet-pixel-crop.is-cabbage.is-stage-1 {
    background-image: url('../assets/farm/pixel/crop-cabbage-1.png');
}

.pet-pixel-crop.is-cabbage.is-stage-2 {
    background-image: url('../assets/farm/pixel/crop-cabbage-2.png');
}

.pet-pixel-crop.is-cabbage.is-stage-3 {
    background-image: url('../assets/farm/pixel/crop-cabbage-2.png');
}

.pet-home-room.is-pixel-farm .pet-home-plot-empty {
    color: rgba(255, 246, 214, 0.78);
    font-family: 'Courier New', monospace;
    font-size: clamp(26px, 3vw, 42px);
    font-weight: 700;
    text-shadow: 3px 3px 0 rgba(62, 43, 40, 0.38);
}

.pet-pixel-water {
    position: absolute;
    z-index: 3;
    top: 9%;
    left: 7%;
    width: 32%;
    height: 18%;
    background:
        linear-gradient(90deg,
            #9fe5ff 0 42%,
            transparent 42% 54%,
            #9fe5ff 54% 100%);
    filter: drop-shadow(2px 2px 0 #337e9e);
    animation: pet-pixel-water 1.6s steps(2, end) infinite;
    pointer-events: none;
}

.pet-home-room.is-pixel-farm .pet-home-pond {
    right: 3%;
    bottom: 4%;
    width: 27%;
    height: 22%;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: linear-gradient(180deg, #6fd2e8 0 55%, #4fb3cf 55% 100%);
    clip-path: polygon(10% 0, 88% 0, 88% 8%, 100% 8%, 100% 84%, 90% 84%, 90% 100%, 12% 100%, 12% 92%, 0 92%, 0 12%, 10% 12%);
    box-shadow:
        inset 0 0 0 4px #3c2b2f,
        inset 0 0 0 9px #d8b47a,
        inset 0 0 0 12px #3c2b2f,
        inset 0 0 0 15px #8fe3f1;
    filter: drop-shadow(4px 4px 0 #3c2b2f);

    &::before {
        position: absolute;
        inset: 7% 8% auto;
        height: 5px;
        content: '';
        background: #9fe7f4;
        box-shadow: 0 8px 0 rgba(159, 231, 244, 0.58);
        pointer-events: none;
    }

    &.is-ready {
        filter:
            drop-shadow(4px 4px 0 #3c2b2f)
            drop-shadow(0 0 9px rgba(255, 226, 117, 0.8));
    }
}

.pet-pixel-pond-dock {
    position: absolute;
    z-index: 3;
    top: 30%;
    left: -8%;
    width: 36%;
    height: 18%;
    border: 3px solid #3c2b2f;
    background:
        repeating-linear-gradient(90deg,
            #c88b55 0 9px,
            #815033 9px 12px);
    box-shadow: 0 3px 0 rgba(60, 43, 47, 0.24);

    &::before,
    &::after {
        position: absolute;
        bottom: -34%;
        width: 4px;
        height: 40%;
        content: '';
        background: #6f4531;
    }

    &::before {
        left: 12%;
    }

    &::after {
        right: 12%;
    }
}

.pet-pixel-pond-ripple {
    position: absolute;
    width: 20%;
    height: 4px;
    background: rgba(226, 251, 255, 0.78);
    animation: pet-pixel-ripple 2.4s steps(2, end) infinite;
}

.pet-pixel-pond-ripple-a {
    top: 37%;
    left: 22%;
}

.pet-pixel-pond-ripple-b {
    right: 18%;
    bottom: 24%;
    animation-delay: 1.1s;
}

.pet-pixel-reeds {
    position: absolute;
    z-index: 4;
    width: 18%;
    aspect-ratio: 1;
    background: url('../assets/farm/pixel/reeds.png') center bottom / 100% 100% no-repeat;
    image-rendering: pixelated;
    pointer-events: none;
}

.pet-pixel-reeds-a {
    top: -8%;
    left: 4%;
}

.pet-pixel-reeds-b {
    right: 3%;
    bottom: 3%;
    width: 14%;
    opacity: 0.9;
    transform: scaleX(-1);
}

.pet-pixel-lily {
    position: absolute;
    z-index: 2;
    width: 14%;
    height: 7%;
    background: #4c9e5e;
    box-shadow:
        3px 0 0 #2f6e43,
        -3px 0 0 #2f6e43,
        0 3px 0 #2f6e43;
    pointer-events: none;

    &::after {
        position: absolute;
        top: -3px;
        right: 1px;
        width: 4px;
        height: 4px;
        content: '';
        background: #ffcf6e;
        box-shadow: 3px 0 0 #e8889c;
    }
}

.pet-pixel-lily-a {
    top: 28%;
    right: 18%;
}

.pet-pixel-lily-b {
    bottom: 18%;
    left: 24%;
    width: 11%;
    opacity: 0.9;
}

.pet-pixel-fish {
    position: absolute;
    z-index: 2;
    top: 63%;
    left: 42%;
    width: 13%;
    height: 7%;
    background: #227f9f;
    box-shadow:
        -4px 0 0 #227f9f,
        -8px 0 0 #227f9f;
    animation: pet-pixel-fish 3.2s steps(2, end) infinite;
}

.pet-home-room.is-pixel-farm .pet-home-sign {
    z-index: 6;
    top: 56%;
    bottom: auto;
    left: 3%;
    width: 13%;
    min-width: 58px;
    gap: 2px;
    padding: 5px 6px;
    border: 3px solid #3c2b2f;
    border-radius: 0;
    background:
        repeating-linear-gradient(0deg,
            #d39a59 0 6px,
            #c98d4f 6px 8px);
    box-shadow: 4px 4px 0 rgba(60, 43, 47, 0.24);
    transform: none;

    &::before,
    &::after {
        position: absolute;
        bottom: -11px;
        width: 4px;
        height: 12px;
        content: '';
        background: #6f4531;
        box-shadow: inset -2px 0 0 #8f5c3c;
    }

    &::before {
        left: 15%;
    }

    &::after {
        right: 15%;
    }

    b {
        color: #fff4d1;
        font-family: 'Courier New', monospace;
        font-size: clamp(10px, 1vw, 13px);
        font-weight: 700;
        letter-spacing: 0.04em;
        text-shadow: 2px 2px 0 #7d4d30;
    }

    small {
        color: #624126;
        font-family: 'Courier New', monospace;
        font-size: 8px;
    }
}

.pet-home-room.is-pixel-farm .pet-home-room-note {
    top: 2.5%;
    right: 2.5%;
    left: auto;
    padding: 4px 7px;
    border: 2px solid #3c2b2f;
    border-radius: 0;
    background: #fff2c7;
    color: #4f3a2b;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    backdrop-filter: none;
}

.pet-home-room.is-pixel-farm .pet-home-yard-badge {
    min-width: 21px;
    height: 21px;
    border: 2px solid #3c2b2f;
    border-radius: 0;
    background: #fff3c6;
    box-shadow: 2px 2px 0 rgba(60, 43, 47, 0.28);
    animation: pet-pixel-badge 1.4s steps(2, end) infinite;
}

@keyframes pet-pixel-hop {
    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-3px);
    }
}

@keyframes pet-pixel-graze {
    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(2px);
    }
}

@keyframes pet-pixel-water {
    0%,
    100% {
        opacity: 0.42;
    }

    50% {
        opacity: 0.9;
    }
}

@keyframes pet-pixel-ripple {
    0%,
    100% {
        transform: translateX(0);
        opacity: 0.45;
    }

    50% {
        transform: translateX(7px);
        opacity: 0.9;
    }
}

@keyframes pet-pixel-fish {
    0%,
    100% {
        transform: translateX(0);
    }

    50% {
        transform: translateX(13px);
    }
}

@keyframes pet-pixel-ready {
    0%,
    100% {
        outline: 3px solid #3c2b2f;
        filter: brightness(1);
    }

    50% {
        outline: 6px solid #ffe07b;
        filter: brightness(1.14);
    }
}

@keyframes pet-pixel-badge {
    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-4px);
    }
}

@keyframes pet-kite-float {
    0%,
    100% {
        transform: translateY(0) rotate(-2deg);
    }

    50% {
        transform: translateY(-6px) rotate(2deg);
    }
}

@keyframes pet-fountain-jet {
    0%,
    100% {
        opacity: 0.72;
        transform: scaleY(0.86);
        transform-origin: bottom center;
    }

    50% {
        opacity: 1;
        transform: scaleY(1);
        transform-origin: bottom center;
    }
}

/* ===== 分区场景 ===== */
.pet-home-room.is-tab-grow .pet-home-plots {
    top: 35%;
    left: 32%;
    width: 45%;
    height: 37%;
}

.pet-home-room.is-tab-grow .pet-pixel-fence {
    top: 73%;
    right: 3%;
    width: 22%;
}

.pet-home-room.is-tab-grow .pet-pixel-hay {
    top: 66%;
    right: 19%;
}

.pet-home-room.is-tab-grow .pet-pixel-watering-can {
    top: 76%;
    right: auto;
    left: 33%;
}

.pet-home-room.is-tab-grow .pet-pixel-crate {
    top: 40%;
    right: 3.5%;
}

.pet-home-room.is-tab-grow .pet-pixel-beehive {
    top: 52%;
    right: 3%;
}

.pet-home-room.is-tab-grow .pet-pixel-barrel {
    top: 61%;
    right: 3.5%;
}

.pet-home-room.is-tab-raise .pet-home-pasture {
    top: auto;
    bottom: 5%;
    left: 3%;
    width: 48%;
    height: 30%;
}

.pet-home-room.is-tab-raise .pet-home-pasture > b.pet-pixel-cow {
    bottom: 10%;
    left: 8%;
    width: 33%;
}

.pet-home-room.is-tab-raise .pet-home-pasture > b.pet-pixel-sheep {
    top: 17%;
    right: 6%;
    width: 22%;
}

.pet-home-room.is-tab-raise .pet-pixel-trough {
    right: 3%;
    bottom: 2%;
    width: 17%;
}

.pet-home-room.is-tab-raise .pet-pixel-pasture-gate {
    left: 70%;
    width: 24%;
}

.pet-home-room.is-tab-raise .pet-home-coop {
    top: 8%;
    right: 5%;
    width: 23%;
    height: 23%;
}

.pet-home-room.is-tab-raise .pet-pixel-fence {
    top: 33%;
    right: 2%;
    width: 26%;
}

.pet-home-room.is-tab-raise .pet-pixel-milk-can {
    top: 35%;
    right: 32%;
    left: auto;
}

.pet-home-room.is-tab-raise .pet-pixel-hay {
    top: 58%;
    right: auto;
    left: 53%;
    width: 7%;
}

.pet-home-room.is-tab-raise .pet-pixel-hay-b {
    top: 47%;
    right: 15%;
    left: auto;
    width: 5.5%;
}

.pet-home-room.is-tab-raise .pet-pixel-chicken-free {
    top: 37%;
    bottom: auto;
    left: 66%;
}

.pet-home-room.is-tab-raise .pet-pixel-crate {
    top: 44%;
    right: 3.5%;
}

.pet-home-room.is-tab-raise .pet-pixel-barrel {
    top: 62%;
    right: 4%;
}

.pet-home-room.is-tab-raise .pet-pixel-beehive {
    top: 52%;
    right: 3%;
}

.pet-home-room.is-tab-fish .pet-home-pond {
    top: auto;
    right: 3%;
    bottom: 4%;
    left: auto;
    width: 44%;
    height: 33%;
}

.pet-home-room.is-tab-fish .pet-pixel-pond-dock {
    top: 22%;
    left: -20%;
    width: 40%;
}

.pet-home-room.is-tab-fish .pet-pixel-crate {
    top: 50%;
    right: auto;
    left: 38%;
}

.pet-home-room.is-tab-fish .pet-pixel-barrel {
    top: 56%;
    right: 3.5%;
}

.pet-home-room.is-tab-fish .pet-pixel-rock-b {
    top: auto;
    right: auto;
    bottom: 3%;
    left: 46%;
}

.pet-home-room.is-tab-fish .pet-pixel-path-bottom {
    display: none;
}

.pet-home-room.is-tab-raise .pet-pixel-scarecrow,
.pet-home-room.is-tab-raise .pet-pixel-watering-can,
.pet-home-room.is-tab-raise .pet-pixel-tree-c,
.pet-home-room.is-tab-raise .pet-pixel-bush-c,
.pet-home-room.is-tab-raise .pet-pixel-flower-b,
.pet-home-room.is-tab-raise .pet-pixel-flower-e,
.pet-home-room.is-tab-raise .pet-home-sign {
    display: none;
}

.pet-home-room.is-tab-grow .pet-pixel-milk-can,
.pet-home-room.is-tab-grow .pet-pixel-chicken-free {
    display: none;
}

.pet-home-room.is-tab-fish .pet-pixel-scarecrow,
.pet-home-room.is-tab-fish .pet-pixel-watering-can,
.pet-home-room.is-tab-fish .pet-pixel-beehive,
.pet-home-room.is-tab-fish .pet-pixel-fence,
.pet-home-room.is-tab-fish .pet-pixel-hay,
.pet-home-room.is-tab-fish .pet-pixel-milk-can,
.pet-home-room.is-tab-fish .pet-pixel-chicken-free,
.pet-home-room.is-tab-fish .pet-pixel-tree-d,
.pet-home-room.is-tab-fish .pet-pixel-bush-a,
.pet-home-room.is-tab-fish .pet-pixel-bush-b,
.pet-home-room.is-tab-fish .pet-pixel-flower-a,
.pet-home-room.is-tab-fish .pet-pixel-flower-d,
.pet-home-room.is-tab-fish .pet-pixel-flower-e {
    display: none;
}

@media (max-width: 1420px) {
    .pet-manage-grid {
        grid-template-columns: minmax(0, 0.86fr) minmax(500px, 1.14fr);
    }
}

@media (max-height: 940px) and (min-width: 1181px) {
    .pet-manage-side {
        position: static;
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
        min-height: 560px;
        max-height: 760px;
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

    .pet-snack-head {
        flex-direction: column;
        align-items: flex-start;
    }

    .pet-snack-grid {
        grid-template-columns: 1fr;
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

    .pet-home-tabs {
        gap: 2px;
        padding: 3px;

        button {
            min-height: 32px;
            gap: 3px;
            font-size: 11px;

            span {
                font-size: 13px;
            }
        }
    }

    .pet-home-room {
        min-height: 500px;
        aspect-ratio: 0.92;
    }

    .pet-home-room-note {
        display: none;
    }

    .pet-home-interior {
        width: 48%;
    }

    .pet-home-yard {
        left: 48%;
    }

    .pet-home-window {
        border-width: 4px;
    }

    .pet-home-curtain {
        width: 16%;
        height: 21%;
    }

    .pet-home-shelf i:nth-child(1) {
        height: 18px;
    }

    .pet-home-shelf i:nth-child(2) {
        height: 14px;
    }

    .pet-home-shelf i:nth-child(3) {
        height: 21px;
    }

    .pet-home-picture {
        border-width: 3px;
        font-size: 11px;
    }

    .pet-home-plant {
        font-size: 28px;
    }

    .pet-home-bowl {
        font-size: 22px;
    }

    .pet-home-chicken {
        font-size: 18px;
    }

    .pet-home-pasture b {
        font-size: 16px;
    }

    .pet-home-reeds {
        font-size: 16px;
    }

    .pet-home-sign {
        display: none;
    }

    .pet-homestead-seed {
        padding: 5px 7px;

        small {
            display: none;
        }
    }

    .pet-homestead-business {
        gap: 6px;
    }

    .pet-homestead-business-actions {
        width: 100%;
        margin-left: 0;

        button {
            flex: 1;
            justify-content: center;
        }
    }

    .pet-homestead-tend {
        padding: 0 9px;
    }

    .pet-home-yard-badge {
        min-width: 19px;
        height: 19px;
        font-size: 11px;
    }

    .pet-home-plot-crop {
        font-size: 15px;
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
    .pet-next-progress span,
    .pet-home-sun,
    .pet-home-cloud,
    .pet-home-tree-canopy,
    .pet-home-pond-ripple,
    .pet-home-plot,
    .pet-home-plot.is-ready,
    .pet-home-plot-crop,
    .pet-home-yard-badge {
        animation: none;
        transition: none;
    }

    .pet-home-coop:hover,
    .pet-home-pasture:hover,
    .pet-home-pond:hover,
    .pet-home-plot:hover {
        transform: none;
    }
}

:global(body.pet-farm-business-open .dsh-pet-root) {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
}
</style>
