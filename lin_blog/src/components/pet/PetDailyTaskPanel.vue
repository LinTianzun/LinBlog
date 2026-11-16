<template>
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
</template>

<script lang="ts" setup>
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
    petDailyTasks: DailyTaskView[]
    completedDailyTaskCount: number
}>()
</script>
