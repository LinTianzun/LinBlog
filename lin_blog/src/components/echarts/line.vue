<template>
    <div :style="{height: chartHeight}" ref="chart" class="chart">

    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, markRaw, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
    TitleComponent,
    TooltipComponent,
    GridComponent,
    DatasetComponent,
    TransformComponent,
    LegendComponent
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
    TitleComponent,
    TooltipComponent,
    GridComponent,
    DatasetComponent,
    TransformComponent,
    LabelLayout,
    UniversalTransition,
    CanvasRenderer,
    LegendComponent,
    LineChart
])

type VisitData = {
    date: string
    count: number
}

const props = defineProps<{
    data: VisitData[]
    chartHeight: string
}>()

const chart = ref<HTMLDivElement | null>(null)
const myChart = ref<echarts.ECharts | null>(null)

const xAxisD = ref<string[]>([])
const seriesD = ref<number[]>([])
const option = ref<echarts.EChartsCoreOption>({})

const visit = (data: VisitData[]): void => {
    xAxisD.value = data.map(item => item.date)
    seriesD.value = data.map(item => item.count)

    option.value = {
        color: ['#2B5AED'],
        grid: {
            top: '4%',
            left: '0%',
            right: '0%',
            bottom: '0%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: xAxisD.value
        },
        yAxis: {
            type: 'value'
        },
        series: [
            {
                data: seriesD.value,
                type: 'line',
                smooth: true
            }
        ]
    }
}

const resizeChart = (): void => {
    myChart.value?.resize()
}

watch(
    () => props.data,
    (data) => {
        visit(data)
        myChart.value?.setOption(option.value)
    },
    { deep: true }
)

onMounted(() => {
    visit(props.data)

    if (!chart.value) return

    myChart.value = markRaw(echarts.init(chart.value))
    myChart.value.setOption(option.value)

    window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', resizeChart)
    myChart.value?.dispose()
    myChart.value = null
})
</script>


<style lang="less" scoped>
    .chart {
        width: 100%;
    }
</style>