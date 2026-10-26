<template>
    <div :style="{height: chartHeight}" ref="chart" class="chart">

    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, markRaw, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import {
    TitleComponent,
    TooltipComponent,
    LegendComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
    TitleComponent,
    TooltipComponent,
    CanvasRenderer,
    LegendComponent,
    PieChart
])

type PieData = {
    name: string
    value: number
}

const props = defineProps<{
    data: PieData[]
    title: string
    chartHeight: string
}>()

const chart = ref<HTMLDivElement | null>(null)
const myChart = ref<echarts.ECharts | null>(null)
const option = ref<echarts.EChartsCoreOption>({})

const survey = (data: PieData[]): void => {
    const total = data.reduce((sum, item) => sum + item.value, 0)

    option.value = {
        color: ['#2B5AED', '#FA5247', '#1CCBB6', '#F625AF', '#FFB435'],
        title: {
            text: total,
            subtext: props.title,
            left: 'center',
            top: '34%',
            textStyle: {
                fontSize: 32,
                color: '#686B73',
                align: 'center'
            },
            subtextStyle: {
                fontSize: 14,
                color: '#686B73'
            }
        },
        tooltip: {
            trigger: 'item'
        },
        legend: {
            show: false,
            bottom: 0,
            icon: 'circle'
        },
        series: [
            {
                type: 'pie',
                radius: ['60%', '76%'],
                avoidLabelOverlap: true,
                label: {
                    show: true
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 40,
                        fontWeight: 'bold'
                    }
                },
                labelLine: {
                    show: false
                },
                data
            }
        ]
    }
}

watch(
    () => [props.data, props.title],
    () => {
        survey(props.data)
        myChart.value?.setOption(option.value)
    },
    { deep: true }
)

const resizeChart = (): void => {
    myChart.value?.resize()
}

onMounted(() => {
    survey(props.data)

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
