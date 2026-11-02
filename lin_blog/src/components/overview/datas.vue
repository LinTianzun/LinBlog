<template>
    <div v-if="canViewOverview" class="datas">
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
        <div class="card">
            <div class="card-title">
                <div class="card-title-copy">
                    <p class="card-title-name">热门路径</p>
                    <span>访问量最高的页面 TOP {{ topPaths.length || 10 }}</span>
                </div>
                <yk-radio-group v-model="pathRadio" type="button" :solid="true" @change="loadTopPaths">
                    <yk-radio value="week">近一周</yk-radio>
                    <yk-radio value="moon">近一月</yk-radio>
                </yk-radio-group>
            </div>
            <ul v-if="topPaths.length" class="top-paths">
                <li v-for="(item, idx) in topPaths" :key="item.path" class="top-path-item">
                    <span class="top-path-rank" :class="{ 'top-path-rank-hot': idx < 3 }">{{ idx + 1 }}</span>
                    <span class="top-path-name" :title="item.path">{{ formatPath(item.path) }}</span>
                    <span class="top-path-visits">{{ item.visits }} 次</span>
                    <span class="top-path-bar" :style="{ width: barWidth(item.visits) + '%' }"></span>
                </li>
            </ul>
            <p v-else class="top-paths-empty">暂无访问数据</p>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { computed, ref, onMounted } from 'vue'
    import { LineChart, PieChart } from '../echarts/index.ts'
    import { getVisitStats, getTopPaths, type VisitPoint, type PieItem, type TopPathItem } from '../../api/overview.ts'
    import { useSessionStore } from '../../store/session.ts'

    const session = useSessionStore()

    // 访问量趋势与设备/来源分布同属全站统计，按 overview.viewAll 收窄
    const canViewOverview = computed(() => session.can('overview.viewAll'))

    const visitRadio = ref('week')
    const checkRadio = ref('week')

    //  访问量
    const visitData = ref<VisitPoint[]>([])
    const deviceData = ref<PieItem[]>([])
    const websiteData = ref<PieItem[]>([])
    const topPaths = ref<TopPathItem[]>([])
    const pathRadio = ref('week')

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
            visitData.value = res.data.visit ?? []
        } catch (error) {
            console.error('访问量加载失败：', error)
        }
    }

    const loadSurvey = async () => {
        try {
            const res = await getVisitStats(checkRadio.value === 'moon' ? 'moon' : 'week')
            if (res.code !== 200 || !res.data) return
            deviceData.value = res.data.device ?? []
            websiteData.value = res.data.website ?? []
        } catch (error) {
            console.error('数据监测加载失败：', error)
        }
    }

    const loadTopPaths = async () => {
        try {
            const res = await getTopPaths(pathRadio.value === 'moon' ? 'moon' : 'week')
            if (res.code !== 200 || !res.data) return
            topPaths.value = res.data.paths ?? []
        } catch (error) {
            console.error('热门路径加载失败：', error)
        }
    }

    // 把 /api/public/article/123 简化成「文章 123」之类的人读标签
    const formatPath = (raw: string) => {
        if (!raw) return '未知'
        const m = raw.match(/\/api\/public\/([\w]+)(?:\/([\d]+))?/)
        if (m) {
            const labels: Record<string, string> = { article: '文章', diary: '随笔', gallery: '图库', subset: '分类', label: '标签', comment: '评论' }
            const base = labels[m[1]] || m[1]
            return m[2] ? `${base} #${m[2]}` : base + '列表'
        }
        return raw.replace(/^\//, '')
    }

    const barWidth = (visits: number) => {
        const max = topPaths.value[0]?.visits || 1
        return Math.max(4, Math.round((visits / max) * 100))
    }

    onMounted(() => {
        loadVisit()
        loadSurvey()
        loadTopPaths()
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

.top-paths {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.top-path-item {
    display: flex;
    align-items: center;
    gap: @space-s;
    padding: 6px 10px;
    border-radius: @radius-m;
    background: var(--gray1);
    position: relative;
    overflow: hidden;
}

.top-path-rank {
    flex: 0 0 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--gray4);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
}

.top-path-rank-hot {
    background: var(--pcolor);
}

.top-path-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}

.top-path-visits {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--gray6);
}

.top-path-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--pcolor);
    opacity: 0.5;
}

.top-paths-empty {
    text-align: center;
    color: var(--gray5);
    padding: 24px 0;
    font-size: 13px;
}

@media (max-width: 720px) {
    .datas-charts {
        flex-direction: column;
    }
}
</style>
