<template>
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
import { computed } from 'vue'
import { type PetMilestoneGroup } from '../../utils/desktopPetVitals'

const props = defineProps<{
    petMilestones: PetMilestoneGroup[]
}>()

const unlockedAchievementCount = computed(() =>
    props.petMilestones.reduce(
        (total, group) =>
            total + group.items.filter((item) => item.unlocked).length,
        0
    )
)
const newAchievementCount = computed(() =>
    props.petMilestones.reduce(
        (total, group) => total + group.items.filter((item) => item.isNew).length,
        0
    )
)

const petMilestonePercent = (current: number, target: number) =>
    Math.min(100, Math.round((current / target) * 100))
</script>
