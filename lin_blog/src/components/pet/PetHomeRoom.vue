<template>
    <div id="pet-home-panel" class="pet-home-room" :class="roomClasses"
        data-pet-home-zone role="tabpanel"
        :aria-labelledby="`pet-home-tab-${tab}`">
        <template v-if="tab === 'home'">
            <div class="pet-home-interior" aria-hidden="true">
                <span class="pet-home-window">
                    <span class="pet-home-moon" />
                    <span class="pet-home-star pet-home-star-a" />
                    <span class="pet-home-star pet-home-star-b" />
                </span>
                <span class="pet-home-curtain pet-home-curtain-left" />
                <span class="pet-home-curtain pet-home-curtain-right" />
                <span class="pet-home-shelf">
                    <i />
                    <i />
                    <i />
                </span>
                <span class="pet-home-picture">♥</span>
                <span class="pet-home-wall-photo pet-home-wall-photo-a" />
                <span class="pet-home-wall-photo pet-home-wall-photo-b" />
                <span class="pet-home-clock" />
                <span class="pet-home-door" />
                <span class="pet-home-hanging-plant">
                    <i class="pet-home-hanging-pot" />
                </span>
                <span class="pet-home-plant">🪴</span>
                <span class="pet-home-table">
                    <i class="pet-home-table-top" />
                    <i class="pet-home-table-leg is-left" />
                    <i class="pet-home-table-leg is-right" />
                    <i class="pet-home-table-cup" />
                </span>
                <span class="pet-home-lamp">
                    <i class="pet-home-lamp-shade" />
                    <i class="pet-home-lamp-stand" />
                    <i class="pet-home-lamp-base" />
                </span>
                <span class="pet-home-bed">
                    <i class="pet-home-bed-headboard" />
                    <i class="pet-home-bed-pillow" />
                    <i class="pet-home-bed-blanket" />
                </span>
                <span class="pet-home-rug" />
                <span class="pet-home-cushion" />
                <span class="pet-home-bowl">🥣</span>
                <span class="pet-home-baseboard" />
                <span class="pet-home-lamp-glow" />
            </div>
        </template>
        <template v-else>
            <PetYard3D v-if="scene3d !== 'fallback'" :tab="tab"
                :plot-count="plots.length" :plot-columns="plotColumns"
                :weather="weather" :day-phase="dayPhase"
                :chicken-ready="chicken.eggReady || chicken.manureReady"
                :cow-ready="cow.milkReady || cow.manureReady"
                :pond-ready="pondReady"
                @ready="scene3d = 'ready'" @unavailable="scene3d = 'fallback'" />
            <div v-if="scene3d !== 'ready'" class="pet-pixel-backdrop"
                aria-hidden="true">
                <span class="pet-pixel-house" />
                <span v-if="tab !== 'fish'"
                    class="pet-pixel-path pet-pixel-path-top" />
                <span v-if="tab === 'grow'"
                    class="pet-pixel-path pet-pixel-path-branch" />
                <span class="pet-pixel-path pet-pixel-path-house" />
                <span v-if="tab === 'grow'"
                    class="pet-pixel-path pet-pixel-path-main" />
                <span class="pet-pixel-path pet-pixel-path-bottom" />
                <span class="pet-pixel-tree pet-pixel-tree-a" />
                <span class="pet-pixel-tree pet-pixel-tree-b" />
                <span class="pet-pixel-tree pet-pixel-tree-c" />
                <span class="pet-pixel-tree pet-pixel-tree-d" />
                <span class="pet-pixel-tree pet-pixel-tree-e" />
                <span class="pet-pixel-bush pet-pixel-bush-a" />
                <span class="pet-pixel-bush pet-pixel-bush-b" />
                <span class="pet-pixel-bush pet-pixel-bush-c" />
                <span class="pet-pixel-flower pet-pixel-flower-a" />
                <span class="pet-pixel-flower pet-pixel-flower-b" />
                <span class="pet-pixel-flower pet-pixel-flower-c" />
                <span class="pet-pixel-flower pet-pixel-flower-d" />
                <span class="pet-pixel-flower pet-pixel-flower-e" />
                <span class="pet-pixel-barrel" />
                <span class="pet-pixel-crate" />
                <span class="pet-pixel-hay" />
                <span v-if="tab === 'raise'"
                    class="pet-pixel-hay pet-pixel-hay-b" />
                <span class="pet-pixel-fence" />
                <span v-if="tab === 'grow'" class="pet-pixel-scarecrow" />
                <span class="pet-pixel-beehive" />
                <span v-if="tab === 'grow'" class="pet-pixel-watering-can" />
                <span class="pet-pixel-milk-can" />
                <span class="pet-pixel-rock pet-pixel-rock-a" />
                <span class="pet-pixel-rock pet-pixel-rock-b" />
                <span class="pet-pixel-chicken-free" />
            </div>
            <div v-if="ownedDecorations.length"
                class="pet-yard-decorations" aria-hidden="true">
                <span v-for="decoration in ownedDecorations"
                    :key="decoration.id" class="pet-yard-decor"
                    :class="`is-${decoration.id}`"
                    :title="decoration.name" />
            </div>

            <button v-if="tab === 'raise'" type="button" class="pet-home-coop"
                :class="{ 'is-ready': chicken.eggReady || chicken.manureReady }"
                :aria-label="chickenLabel" :title="chickenLabel"
                data-homestead-target="coop" @click="emit('collect-chicken')">
                <i class="pet-pixel-coop-run" aria-hidden="true" />
                <i class="pet-pixel-coop-wall" aria-hidden="true" />
                <i class="pet-pixel-coop-roof" aria-hidden="true" />
                <i class="pet-pixel-coop-door" aria-hidden="true" />
                <i class="pet-pixel-coop-loft" aria-hidden="true" />
                <b class="pet-pixel-chicken" aria-hidden="true" />
                <b v-if="chicken.eggReady" class="pet-home-yard-badge is-egg"
                    aria-hidden="true">🥚</b>
                <b v-if="chicken.manureReady" class="pet-home-yard-badge is-manure"
                    aria-hidden="true">💩</b>
            </button>

            <button v-if="tab === 'raise'" type="button" class="pet-home-pasture"
                :class="{ 'is-ready': cow.milkReady || cow.manureReady }"
                :aria-label="cowLabel" :title="cowLabel"
                data-homestead-target="cow" @click="emit('collect-cow')">
                <i class="pet-pixel-pasture-fence" aria-hidden="true" />
                <i class="pet-pixel-pasture-gate" aria-hidden="true" />
                <b class="pet-pixel-cow" aria-hidden="true" />
                <b class="pet-pixel-sheep" aria-hidden="true" />
                <i class="pet-pixel-trough" aria-hidden="true" />
                <b v-if="cow.milkReady" class="pet-home-yard-badge is-milk"
                    aria-hidden="true">🥛</b>
                <b v-if="cow.manureReady" class="pet-home-yard-badge is-manure"
                    aria-hidden="true">💩</b>
            </button>

            <div v-if="tab === 'grow'" class="pet-home-plots"
                :style="{ '--plot-columns': plotColumns }">
                <button v-for="plot in plots" :key="plot.index" type="button"
                    class="pet-home-plot"
                    :class="{ 'is-ready': plot.ripe, 'is-watered': plot.watered, 'is-empty': !plot.cropId }"
                    :aria-label="plot.label" :title="plot.label"
                    :data-homestead-target="`plot-${plot.index}`"
                    @click="emit('plot-click', plot.index)">
                    <b v-if="plot.cropId" class="pet-pixel-crop"
                        :class="plot.visualClass" aria-hidden="true" />
                    <i v-if="plot.watered && !plot.ripe && plot.cropId"
                        class="pet-pixel-water" aria-hidden="true" />
                    <span v-if="!plot.cropId" class="pet-home-plot-empty"
                        aria-hidden="true">+</span>
                </button>
            </div>

            <button v-if="tab === 'fish'" type="button" class="pet-home-pond"
                :class="{ 'is-ready': pondReady }" :aria-label="pondLabel"
                :title="pondLabel" data-homestead-target="pond"
                @click="emit('pond-click')">
                <i class="pet-pixel-pond-dock" aria-hidden="true" />
                <i class="pet-pixel-pond-ripple pet-pixel-pond-ripple-a" aria-hidden="true" />
                <i class="pet-pixel-pond-ripple pet-pixel-pond-ripple-b" aria-hidden="true" />
                <i class="pet-pixel-reeds pet-pixel-reeds-a" aria-hidden="true" />
                <i class="pet-pixel-reeds pet-pixel-reeds-b" aria-hidden="true" />
                <i class="pet-pixel-lily pet-pixel-lily-a" aria-hidden="true" />
                <i class="pet-pixel-lily pet-pixel-lily-b" aria-hidden="true" />
                <b class="pet-pixel-fish" aria-hidden="true" />
                <b v-if="pondReady" class="pet-home-yard-badge is-fish"
                    aria-hidden="true">🐟</b>
            </button>

        </template>
    </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import PetYard3D from './PetYard3D.vue'
import type {
    HomesteadDayPhaseDefinition,
    HomesteadWeatherDefinition,
} from '../../utils/desktopPetHomestead'

interface PetHomePlot {
    index: number
    cropId: string | null
    ripe: boolean
    watered: boolean
    visualClass: Record<string, boolean>
    label: string
}

interface PetHomeChicken {
    eggReady: boolean
    manureReady: boolean
}

interface PetHomeCow {
    milkReady: boolean
    manureReady: boolean
}

interface PetHomeDecoration {
    id: string
    name: string
}

const scene3d = ref<'loading' | 'ready' | 'fallback'>('loading')

const props = defineProps<{
    tab: 'home' | 'grow' | 'raise' | 'fish'
    roomClass: string[]
    weather: HomesteadWeatherDefinition
    dayPhase: HomesteadDayPhaseDefinition
    plots: PetHomePlot[]
    plotColumns: number
    chicken: PetHomeChicken
    chickenLabel: string
    cow: PetHomeCow
    cowLabel: string
    pondReady: boolean
    pondLabel: string
    ownedDecorations: PetHomeDecoration[]
}>()

const roomClasses = computed(() => [
    ...props.roomClass,
    ...(scene3d.value === 'ready' && props.tab !== 'home'
        ? ['is-yard3d']
        : []),
])

watch(
    () => props.tab,
    (tab) => {
        if (tab === 'home') scene3d.value = 'loading'
    }
)

const emit = defineEmits<{
    (e: 'plot-click', index: number): void
    (e: 'collect-chicken'): void
    (e: 'collect-cow'): void
    (e: 'pond-click'): void
}>()
</script>
