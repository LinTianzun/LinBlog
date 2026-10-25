<template>
    <div class="stat-card" :class="{ 'stat-card-clickable': clickable, 'stat-card-active': active }"
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
    // 卡片背景，总览页传渐变色；不传时用用户管理页的白底描边样式
    bgColor?: string
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
            border-color: #2b5aed;
            box-shadow: 0 0 0 2px rgba(43, 90, 237, 0.18);
        }
    }
</style>
