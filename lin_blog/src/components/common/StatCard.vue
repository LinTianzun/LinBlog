<template>
    <div class="stat-card" :class="[tone ? `stat-card-${tone}` : '', {
        'stat-card-clickable': clickable,
        'stat-card-active': active,
    }]"
        :style="bgColor" @click="handleClick">
        <div class="stat-card-copy">
            <span class="stat-card-label">{{ name }}</span>
            <strong class="stat-card-value">{{ total }}</strong>
        </div>

        <span v-if="icon" class="stat-card-icon-wrap">
            <component :is="icon" class="stat-card-icon" />
        </span>

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
    // 用户管理页等父级监听 click 实现卡片筛选
    emit('click')
}
</script>

<style lang="less" scoped>
    .stat-card {
        position: relative;
        display: flex;
        flex: 1;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        box-sizing: border-box;
        padding: clamp(18px, 1.8vw, 26px);
        overflow: hidden;
        border-radius: var(--admin-radius, 18px);
        border: 1px solid var(--admin-line, var(--gray1));
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
        transition: transform @animatb, box-shadow @animatb, border-color @animatb;

        &::after {
            position: absolute;
            right: -28px;
            bottom: -54px;
            width: 142px;
            height: 142px;
            content: '';
            border: 1px solid color-mix(in srgb, var(--card-accent, var(--pcolor)) 18%, transparent);
            border-radius: 50%;
            opacity: 0.55;
            pointer-events: none;
        }

        &-copy {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 7px;
        }

        &-label {
            overflow: hidden;
            color: var(--gray6);
            font-size: 12px;
            font-weight: 550;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        // 浅色渐变卡上的文字保持默认色；深色卡（如总览第一张）由父级覆盖为白色
        &-value {
            display: block;
            margin: 0;
            color: var(--gray);
            font-size: clamp(27px, 2.4vw, 38px);
            line-height: 1;
            font-weight: 760;
            letter-spacing: -0.05em;
        }

        &-icon-wrap {
            position: relative;
            z-index: 1;
            display: grid;
            width: 48px;
            height: 48px;
            flex: none;
            place-items: center;
            border: 1px solid color-mix(in srgb, var(--card-accent, var(--pcolor)) 22%, transparent);
            border-radius: 15px;
            color: var(--card-accent, var(--pcolor));
            background: color-mix(in srgb, var(--card-accent, var(--pcolor)) 10%, transparent);
        }

        &-icon {
            width: 23px;
            height: 23px;
        }

        &-clickable {
            cursor: pointer;

            &:hover {
                transform: translateY(-3px);
                border-color: color-mix(in srgb, var(--card-accent, var(--pcolor)) 30%, var(--admin-line, transparent));
                box-shadow: var(--admin-shadow-md, @shadow-m);
            }
        }

        &-active {
            border-color: var(--card-accent);
            box-shadow: 0 0 0 2px var(--card-accent-soft);
        }

        // 各功能色调：浅色底 + 选中态描边与光圈颜色
        &-primary {
            --card-accent: var(--pcolor);
            --card-accent-soft: var(--pcolor2);
            background:
                linear-gradient(140deg, var(--pcolor1), transparent 58%),
                var(--admin-surface, var(--bgColor1));
        }

        &-success {
            --card-accent: var(--scolor);
            --card-accent-soft: color-mix(in srgb, var(--scolor) 15%, transparent);
            background:
                linear-gradient(140deg, color-mix(in srgb, var(--scolor) 12%, transparent), transparent 58%),
                var(--admin-surface, var(--bgColor1));
        }

        &-warning {
            --card-accent: var(--wcolor);
            --card-accent-soft: color-mix(in srgb, var(--wcolor) 16%, transparent);
            background:
                linear-gradient(140deg, color-mix(in srgb, var(--wcolor) 13%, transparent), transparent 58%),
                var(--admin-surface, var(--bgColor1));
        }

        &-error {
            --card-accent: var(--ecolor);
            --card-accent-soft: color-mix(in srgb, var(--ecolor) 14%, transparent);
            background:
                linear-gradient(140deg, color-mix(in srgb, var(--ecolor) 11%, transparent), transparent 58%),
                var(--admin-surface, var(--bgColor1));
        }

        &:not([style*='background']) {
            --card-accent: var(--pcolor);
        }
    }
</style>
