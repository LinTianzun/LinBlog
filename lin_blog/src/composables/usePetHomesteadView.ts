import { computed, type Ref } from 'vue'
import {
    HOMESTEAD_ANIMALS,
    HOMESTEAD_ANIMAL_IDS,
    HOMESTEAD_ITEMS,
    animalStatusText,
    canCompleteOrder,
    getHomesteadCrop,
    getHomesteadDecoration,
    getHomesteadItem,
    homesteadAchievements,
    homesteadBarnSpeedMultiplier,
    homesteadLevelRewards,
    isAnimalManureReady,
    isAnimalProduceReady,
    isPlotRipe,
    isPondReady,
    plotProgress,
    plotStatusText,
    pondStatusText,
    type HomesteadState,
    type HomesteadWeatherId,
} from '../utils/desktopPetHomestead'

/**
 * 小院视图的派生数据：菜地、动物、鱼塘、仓库、订单与成就。
 * 只依赖 homestead 快照与当前时钟，纯函数式推导，不触发任何写入。
 */
export function usePetHomesteadView(
    homestead: Ref<HomesteadState>,
    nowTick: Ref<number>,
    weatherId: Ref<HomesteadWeatherId>
) {
    const speedMultiplier = computed(() =>
        homesteadBarnSpeedMultiplier(homestead.value.barnLevel, weatherId.value)
    )

    const pixelCropClass = (plot: {
        cropId: string | null
        progress: number
        ripe: boolean
    }) => {
        // 素材里萝卜/草莓的像素图分别对应胡萝卜与番茄，保持原映射不变
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

    const canFertilizePlot = (plot: HomesteadState['plots'][number]) =>
        Boolean(plot.cropId) &&
        Boolean(plot.wateredAt) &&
        !plot.fertilizedAt &&
        !isPlotRipe(plot, nowTick.value, weatherId.value) &&
        homestead.value.inventory.fertilizer > 0

    const homesteadPlots = computed(() =>
        homestead.value.plots.map((plot, index) => {
            const crop = getHomesteadCrop(plot.cropId)
            const progress = plotProgress(plot, nowTick.value, weatherId.value)
            const ripe = isPlotRipe(plot, nowTick.value, weatherId.value)
            const canFertilize = canFertilizePlot(plot)
            return {
                index,
                cropId: plot.cropId,
                icon: crop?.icon || '',
                ripe,
                watered: plot.wateredAt > 0,
                fertilized: plot.fertilizedAt > 0,
                canFertilize,
                progress,
                visualClass: pixelCropClass({
                    cropId: plot.cropId,
                    progress,
                    ripe,
                }),
                label: `第 ${index + 1} 块菜地：${plotStatusText(
                    plot,
                    nowTick.value,
                    weatherId.value
                )}${canFertilize ? '，点击施肥' : ''}`,
            }
        })
    )

    const animalView = (id: 'chicken' | 'cow') => {
        const definition = HOMESTEAD_ANIMALS[id]
        const animal = homestead.value.animals[id]
        const produceReady = isAnimalProduceReady(
            animal,
            definition,
            nowTick.value,
            speedMultiplier.value
        )
        const manureReady = isAnimalManureReady(
            animal,
            definition,
            nowTick.value,
            speedMultiplier.value
        )
        return { ...definition, produceReady, manureReady }
    }

    const chickenView = computed(() => {
        const { produceReady, manureReady, ...definition } = animalView('chicken')
        return { ...definition, eggReady: produceReady, manureReady }
    })

    const cowView = computed(() => {
        const { produceReady, manureReady, ...definition } = animalView('cow')
        return { ...definition, milkReady: produceReady, manureReady }
    })

    const chickenLabel = computed(
        () =>
            `鸡舍：${animalStatusText(
                homestead.value,
                'chicken',
                nowTick.value,
                weatherId.value
            )}`
    )
    const cowLabel = computed(
        () =>
            `奶牛：${animalStatusText(
                homestead.value,
                'cow',
                nowTick.value,
                weatherId.value
            )}`
    )

    const pondReady = computed(() =>
        isPondReady(homestead.value, nowTick.value, weatherId.value)
    )
    const pondLabel = computed(
        () =>
            `鱼塘：${pondStatusText(
                homestead.value,
                nowTick.value,
                weatherId.value
            )}`
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

    const claimableHomesteadAchievementCount = computed(
        () =>
            homesteadAchievements(homestead.value).filter(
                (item) => item.unlocked && !item.claimed
            ).length
    )
    const claimableHomesteadLevelRewardCount = computed(
        () =>
            homesteadLevelRewards(homestead.value).filter(
                (item) => item.unlocked && !item.claimed
            ).length
    )

    // 一键照料能处理的事项数：成熟收获、缺水浇水、可施肥、动物产出/粪便、鱼塘
    const homesteadTendCount = computed(() => {
        let count = 0
        let fertilizable = 0
        for (const plot of homestead.value.plots) {
            if (isPlotRipe(plot, nowTick.value, weatherId.value)) count++
            else if (plot.cropId && !plot.wateredAt) count++
            else if (plot.cropId && !plot.fertilizedAt) fertilizable++
        }
        count += Math.min(fertilizable, homestead.value.inventory.fertilizer)
        for (const id of HOMESTEAD_ANIMAL_IDS) {
            const definition = HOMESTEAD_ANIMALS[id]
            const animal = homestead.value.animals[id]
            if (
                isAnimalProduceReady(animal, definition, nowTick.value, speedMultiplier.value)
            ) {
                count++
            }
            if (
                isAnimalManureReady(animal, definition, nowTick.value, speedMultiplier.value)
            ) {
                count++
            }
        }
        if (pondReady.value) count++
        return count
    })

    return {
        homesteadPlots,
        pixelCropClass,
        chicken: chickenView,
        cow: cowView,
        chickenLabel,
        cowLabel,
        pondReady,
        pondLabel,
        inventoryChips,
        completedOrderCount,
        claimableOrderCount,
        homesteadPlotColumns,
        ownedDecorations,
        claimableHomesteadAchievementCount,
        claimableHomesteadLevelRewardCount,
        homesteadTendCount,
    }
}
