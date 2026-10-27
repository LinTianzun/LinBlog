<template>
    <div class="datas">
        <div class="card">
            <div class="card-title">
                <div class="card-title-copy">
                    <p class="card-title-name">访问量</p>
                    <span>站内内容访问趋势</span>
                </div>
                <yk-radio-group v-model="visitRadio" type="button" :solid="true" @change="getVisit">
                    <yk-radio value="week">近一周</yk-radio>
                    <yk-radio value="moon">近一月</yk-radio>
                </yk-radio-group>
            </div>
            <LineChart :data="visitData" :chartHeight="'208px'" />
        </div>
        <div class="card">
            <div class="card-title">
                <div class="card-title-copy">
                    <p class="card-title-name">数据监测</p>
                    <span>访问设备与来源构成</span>
                </div>
                <yk-radio-group v-model="checkRadio" type="button" :solid="true" @change="changeCheck">
                    <yk-radio value="week">近一周</yk-radio>
                    <yk-radio value="moon">近一月</yk-radio>
                </yk-radio-group>
            </div>
            <div class="datas-charts">
                <PieChart :data="deviceData" title="设备总数" :chartHeight="'208px'" />
                <PieChart :data="websiteData" title="访问总数" :chartHeight="'208px'" />
            </div>
        </div>
    </div>
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

    const getVisit = () => {
        loadVisit()
    }

    //  数据监测的周/月切换（两张饼图共用一个时段）
    const changeCheck = () => {
        loadSurvey()
    }

    //  访问量折线图与数据监测饼图时段互相独立，分别拉取
    const loadVisit = async () => {
        try {
            const res = await getVisitStats(visitRadio.value === 'moon' ? 'moon' : 'week')
            if (res.code !== 200 || !res.data) return
            visitData.value = res.data.visit
        } catch (error) {
            console.error('访问量加载失败：', error)
        }
    }

    const loadSurvey = async () => {
        try {
            const res = await getVisitStats(checkRadio.value === 'moon' ? 'moon' : 'week')
            if (res.code !== 200 || !res.data) return
            deviceData.value = res.data.device
            websiteData.value = res.data.website
        } catch (error) {
            console.error('数据监测加载失败：', error)
        }
    }

    onMounted(() => {
        loadVisit()
        loadSurvey()
    })
</script>

<style lang="less" scoped>
.datas {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
    gap: @space-xl;
}

.card {
    width: 100%;
    box-sizing: border-box;
}

.card-title-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;

    span {
        color: var(--gray6);
        font-size: 11px;
    }
}

.datas-charts {
    display: flex;
    min-width: 0;

    :deep(.pie-chart) {
        min-width: 0;
        flex: 1;
    }
}

@media (max-width: 720px) {
    .datas-charts {
        flex-direction: column;
    }
}
</style>
