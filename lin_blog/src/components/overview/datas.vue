<template>
    <yk-space class="datas" dir="vertical" size="xl" style="width: 50%;">
        <div class="card">
            <div class="card-title">
                <p class="card-title-name">访问量</p>
                <yk-radio-group v-model="visitRadio" type="button" :solid="true" @change="getVisit">
                    <yk-radio value="week">近一周</yk-radio>
                    <yk-radio value="moon">近一月</yk-radio>
                </yk-radio-group>
            </div>
            <LineChart :data="visitData" :chartHeight="'208px'" />
        </div>
        <div class="card">
            <div class="card-title">
                <p class="card-title-name">数据监测</p>
                <yk-radio-group v-model="checkRadio" type="button" :solid="true" @change="changeCheck">
                    <yk-radio value="week">近一周</yk-radio>
                    <yk-radio value="moon">近一月</yk-radio>
                </yk-radio-group>
            </div>
            <div style="display: flex;">
                <PieChart :data="deviceData" title="设备总数" :chartHeight="'208px'" />
                <PieChart :data="websiteData" title="访问总数" :chartHeight="'208px'" />
            </div>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { LineChart, PieChart } from '../echarts/index.ts'
    import { getVisitStats, type VisitPoint, type PieItem } from '../../api/overview.ts'

    const visitRadio = ref('week')
    const checkRadio = ref('week')

    //  访问量
    const visitData = ref<VisitPoint[]>([])
    const deviceData = ref<PieItem[]>([])
    const websiteData = ref<PieItem[]>([])

    const getVisit = (period: string) => {
        visitRadio.value = period
        loadStats()
    }

    //  数据监测的周/月切换（两张饼图共用一个时段）
    const changeCheck = () => {
        loadStats()
    }

    const loadStats = async () => {
        try {
            const res = await getVisitStats(visitRadio.value === 'moon' ? 'moon' : 'week')
            if (res.code !== 200 || !res.data) return
            visitData.value = res.data.visit
            deviceData.value = res.data.device
            websiteData.value = res.data.website
        } catch (error) {
            console.error('访问统计加载失败：', error)
        }
    }

    onMounted(() => {
        loadStats()
    })
</script>

<style lang="less" scoped>
.datas {
    display: flex;
    width: 100%;
    height: calc(100vh * 0.67);
    /* 固定高度为屏幕高度 */
}

        .card {
            width: 100%;
            height: 50%;
            background-color: @white;
            border-radius: @radius-m;
            padding: @space-xl;
        }

</style>
