<template>
    <yk-space dir="vertical" size="xl" style="width: 50%;">
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
                <yk-radio-group v-model="checkRadio" type="button" :solid="true">
                    <yk-radio value="week">近一周</yk-radio>
                    <yk-radio value="moon">近一月</yk-radio>
                </yk-radio-group>
            </div>
            <div style="display: flex;">
                <PieChart :data="survey.data.device" title="设备总数" :chartHeight="'208px'" />
                <PieChart :data="survey.data.website" title="访问总数" :chartHeight="'208px'" />
            </div>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { LineChart, PieChart } from '../echarts/index.ts'
    import { visit, survey } from '../../mock/data.ts'

    const visitRadio = ref('week')
    const checkRadio = ref('week')

    //  访问量
    const visitData = ref([])

    const getVisit = (e) => {
        let data = visit.data
        if (e == 'week') {
            data = data.slice(0, 7)
        }

        visitData.value = data
        // console.log(visitData.value)
    }

    //  数据监测
    // const device = ref([])
    // const website = ref([])



    // const getDevice = (e) => {
    //     let data = survey.data.device
    //     if (e == 'week') {
    //         data = data.slice(0, 7)
    //     }

    //     device.value = data
    // }

    // const getWebsite = (e) => {
    //     let data = survey.data.website
    //     if (e == 'week') {
    //         data = data.slice(0, 7)
    //     }

    //     website.value = data
    // }

    onMounted(() => {
        getVisit(visitRadio.value)
        // getDevice(checkRadio.value)
        // getWebsite(checkRadio.value)
    })
</script>

<style lang="less" scoped>

</style>