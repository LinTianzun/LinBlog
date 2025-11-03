<template>
    <div :style="{height: chartHeight}" ref="chart" class="chart">

    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted, onBeforeUnmount, markRaw, watch } from 'vue'
    // 引入 echarts 核心模块，核心模块提供了 echarts 使用必须要的接口。
    import * as echarts from 'echarts/core';
    // 引入折线图图表，图表后缀都为 Chart
    import { LineChart } from 'echarts/charts';
    // 引入标题，提示框，直角坐标系，数据集，内置数据转换器组件，组件后缀都为 Component
    import {
        TitleComponent,
        TooltipComponent,
        GridComponent,
        DatasetComponent,
        TransformComponent,
        LegendComponent
    } from 'echarts/components';
    // 标签自动布局、全局过渡动画等特性
    import { LabelLayout, UniversalTransition } from 'echarts/features';
    // 引入 Canvas 渲染器，注意引入 CanvasRenderer 或者 SVGRenderer 是必须的一步
    import { CanvasRenderer } from 'echarts/renderers';

    // 注册必须的组件
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
    ]);

    const chart = ref < HTMLDivElement > ([])

    const myChart = ref()

    //  接收从父组件传递过来的option，和echarts的高度
    const props = defineProps(['data', 'chartHeight'])

    //  可以根据父组件传递过来的option对象生成折线图、柱状图、饼图等等

    const xAxisD = ref < string > ([])
    const seriesD = ref < number > ([])
    const option = ref()

    const visit = (e) => {
        // console.log(e)
        xAxisD.value = []
        seriesD.value = []

        for (let i = 0; i < e.length; i++) {
            xAxisD.value.push(e[i].date)
            seriesD.value.push(e[i].count)
        }

        option.value = {
            color: ['#2B5AED'],
            grod: {
                top: "4%",
                left: "0%",
                right: "0%",
                bottom: "0%",
                containLabel: true,
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

    onMounted(() => {
        visit(props.data)
        //  函数体
        //  ！！！这里必须使用markRaw包裹住，否则当页面高度发生变化时控制台会报错
        myChart.value = markRaw(echarts.init(chart.value as HTMLDivElement))
        myChart.value.setOption(option.value)
        //  监听页面视图变化echarts图的宽带发生变化
        window.addEventListener("resize", () => {
            myChart.value.resize()
        })
    })

    watch(() => props.data, (n) => {
        visit(n)
        myChart.value = markRaw(echarts.init(chart.value as HTMLDivElement))
        myChart.value.setOption(option.value)
    })

    //  组件销毁之前一定要取消监听事件，不然会影响性能和临时内存
    onBeforeUnmount(() => {
        window.removeEventListener("resize", () => {
            myChart.value.resize()
        })
    })

</script>

<style lang="less" scoped>
    .chart {
        width: 100%;
    }
</style>