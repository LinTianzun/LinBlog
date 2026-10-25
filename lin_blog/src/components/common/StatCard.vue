<template>
    <div class="stat-card" :class="[tone ? `stat-card-${tone}` : '', {
        'stat-card-clickable': clickable,
        'stat-card-active': active,
    }]"
        :style="bgColor" @click="emit('click')">
        <yk-space dir="vertical" size="s">
            <yk-text type="secondary">{{ name }}</yk-text>
            <yk-title :level="2" class="stat-card-value">
                {{ total }}
            </yk-title>
        </yk-space>

        <component :is="icon" v-if="icon" class="stat-card-icon" />

        <yk-button v-else-if="to" size="xl" type="secondary" shape="square" aria-label="新建"
            @click.stop="handleClick">
            <IconPlusOutline />
        </yk-button>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
    name: string
    total: string | number
    // 卡片背景，总览页传渐变色；不传时可用 tone 选择功能色浅底
    bgColor?: string
    // 功能色调：primary 蓝 / success 青 / warning 橙 / error 红，配套浅色底与选中描边
    tone?: '' | 'primary' | 'success' | 'warning' | 'error'
    // 右侧展示的图标组件（yike 图标）
    icon?: unknown
    // 跳转路径：传了则整卡可点击
    to?: string
    // 选中态：卡片作为筛选入口时高亮当前筛选
    active?: boolean
    // 可点击（无 to 时由父级监听 click 事件实现筛选等自定义行为）
    clickable?: boolean
}>(), {
    bgColor: '',
    tone: '',
    icon: undefined,
    to: '',
    active: false,
    clickable: false,
})

const emit = defineEmits<{
    (e: 'click'): void
}>()

const router = useRouter()

const clickable = computed(() => Boolean(props.to) || props.clickable)

const handleClick = (): void => {
    if (props.to) {
        router.push(props.to)
    }
}
</script>

<style lang="less" scoped>
    .stat-card {
        display: flex;
        flex: 1;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        padding: @space-xl;
        border-radius: @radius-m;
        background: @bg-color-l;
        border: 1px solid @gray-1;
        transition: transform @animatb, box-shadow @animatb;

        // 浅色渐变卡上的文字保持默认色；深色卡（如总览第一张）由父级覆盖为白色
        &-value {
            margin: 0;
        }

        &-icon {
            width: 28px;
            height: 28px;
            color: @font-color-s;
        }

        &-clickable {
            cursor: pointer;

            &:hover {
                transform: translateY(-2px);
                box-shadow: @shadow-s;
            }
        }

        &-active {
            border-color: var(--card-accent);
            box-shadow: 0 0 0 2px var(--card-accent-soft);
        }

        // 各功能色调：浅色底 + 选中态描边与光圈颜色
        &-primary {
            --card-accent: @pcolor-light;
            --card-accent-soft: rgba(43, 90, 237, 0.18);
            background: rgba(43, 90, 237, 0.08);
        }

        &-success {
            --card-accent: @scolor-light;
            --card-accent-soft: rgba(31, 180, 162, 0.2);
            background: rgba(31, 180, 162, 0.1);
        }

        &-warning {
            --card-accent: @wcolor-light;
            --card-accent-soft: rgba(255, 170, 26, 0.22);
            background: rgba(255, 170, 26, 0.12);
        }

        &-error {
            --card-accent: @ecolor-light;
            --card-accent-soft: rgba(250, 82, 71, 0.2);
            background: rgba(250, 82, 71, 0.1);
        }

        &-primary &-icon,
        &-success &-icon,
        &-warning &-icon,
        &-error &-icon {
            color: var(--card-accent);
        }
    }
</style>
