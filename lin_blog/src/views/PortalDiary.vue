<template>
    <PortalLayout active-path="/portal/diary">
        <PortalPageHeader index="03" kicker="MICRO JOURNAL" title="随笔"
            :description="`共 ${total} 篇。每一篇都记着那天的天气——点开任意一篇，可以在当前页读完整内容。`"
            aside-label="DAYS & WEATHER" :aside-value="`${total} 篇`" aside-note="天气是日子的注脚，短句、照片和当时的心情一起留在这里。">
            <div v-if="weatherFilters.length" class="weather-bar">
                <button type="button" class="weather-pill" :class="{ active: !activeWeather }"
                    @click="selectWeather('')">
                    全部天气
                    <span>{{ allTotal }}</span>
                </button>
                <button v-for="item in weatherFilters" :key="item.name" type="button" class="weather-pill"
                    :class="{ active: activeWeather === item.name }" @click="selectWeather(item.name)">
                    <img v-if="item.iconUrl" :src="item.iconUrl" :alt="item.name" />
                    {{ item.name }}
                    <span>{{ item.count }}</span>
                </button>
            </div>

            <div class="sort-bar">
                <span class="filter-caption">SORT</span>
                <button type="button" class="sort-btn" :class="{ active: sort === 'latest' }"
                    @click="setSort('latest')">
                    最新
                </button>
                <button type="button" class="sort-btn" :class="{ active: sort === 'hot' }"
                    @click="setSort('hot')">
                    最热
                </button>
            </div>
        </PortalPageHeader>

        <section class="list-area">
            <div v-if="loading" class="list-state">
                <yk-spinner size="m" />
            </div>

            <div v-else-if="diaryList.length" class="diary-wall">
                <article v-for="(diary, i) in diaryList" :key="diary.id" class="diary-card"
                    :style="{ animationDelay: `${Math.min(i, 8) * 50}ms` }">
                    <button type="button" class="diary-trigger" @click="openDiary(diary)">
                        <div class="diary-head">
                            <time class="diary-date">{{ formatDate(diary.createdAt) }}</time>
                            <span v-if="diary.weatherName" class="diary-weather">
                                <img v-if="weatherIcon(diary.weatherName)" :src="weatherIcon(diary.weatherName)"
                                    :alt="diary.weatherName" />
                                {{ diary.weatherName }}
                            </span>
                        </div>

                        <h2 class="diary-title">{{ diary.title }}</h2>
                        <p class="diary-text">{{ diary.content }}</p>

                        <div v-if="diary.picture.length" class="diary-thumbs">
                            <img v-for="(pic, pi) in diary.picture.slice(0, 3)" :key="pi" :src="pic" alt=""
                                loading="lazy" />
                            <span v-if="diary.picture.length > 3" class="thumb-more">
                                +{{ diary.picture.length - 3 }}
                            </span>
                        </div>

                        <span class="diary-more">
                            读全文
                            <IconRightOutline />
                        </span>
                        <span class="diary-views">
                            <IconEyeOutline />{{ diary.views }}
                        </span>
                    </button>
                </article>
            </div>

            <div v-else class="list-state">
                <yk-empty :description="activeWeather ? '这个天气下还没有随笔' : '这里还没有随笔'" />
                <yk-button v-if="activeWeather" type="text" size="s" @click="selectWeather('')">
                    查看全部天气
                </yk-button>
            </div>

            <div v-if="total > pageSize" class="list-pagination">
                <yk-pagination :current="page" :total="total" :page-size="pageSize" @change="changePage" />
            </div>
        </section>

        <PortalDiaryDetail :open="detailVisible" :item="activeDiary" @close="closeDiary"
            @view-counted="handleViewCounted" />
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPageHeader from '../components/portal/PortalPageHeader.vue'
import PortalDiaryDetail from '../components/portal/PortalDiaryDetail.vue'
import { getPublicDiaries, type PortalDiary, type PortalWeatherFacet } from '../api/portal'
import type { PortalSort } from '../api/portal'
import { weathers } from '../utils/weather'

const route = useRoute()
const router = useRouter()

const diaryList = ref<PortalDiary[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 9
const loading = ref(false)
const sort = ref<PortalSort>('latest')

const detailVisible = ref(false)
const activeDiary = ref<PortalDiary | null>(null)

// 天气筛选交给后端 SQL 完成，翻页后筛选依然生效；
// 标签数量由后端按全量统计（ weatherFacet ），不再由当前页内容推导。
const activeWeather = ref('')
const weatherFacet = ref<PortalWeatherFacet[]>([])
const allTotal = ref(0)

// 分面按数量降序，但标签本身沿用前端图标字典的固定顺序，避免列表抖动
const weatherFilters = computed(() => {
    const counts = new Map(weatherFacet.value.map(item => [item.weatherName, item.count]))
    return weathers
        .filter(item => counts.has(item.name))
        .map(item => ({ ...item, count: counts.get(item.name) || 0 }))
})

const weatherIcon = (name: string | null): string => {
    if (!name) return ''
    return weathers.find(item => item.name === name)?.iconUrl || ''
}

const formatDate = (value: string): string => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}

const loadDiaries = async () => {
    loading.value = true
    try {
        const result = await getPublicDiaries({
            page: page.value,
            pageSize,
            sort: sort.value,
            weather: activeWeather.value || undefined
        })
        if (result.code === 200) {
            diaryList.value = result.data?.list || []
            total.value = result.data?.total || 0
            weatherFacet.value = result.data?.weatherFacet || []
            allTotal.value = result.data?.facetTotal || 0
        }
    } catch {
        diaryList.value = []
        total.value = 0
    } finally {
        loading.value = false
    }
}

const changePage = (next: number) => {
    page.value = next
    void loadDiaries()
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 筛选条件同步到地址栏，分享或刷新后上下文不丢
const syncQuery = () => {
    const query: Record<string, string> = {}
    if (sort.value !== 'latest') query.sort = sort.value
    if (activeWeather.value) query.weather = activeWeather.value
    void router.replace({ path: '/portal/diary', query })
}

const selectWeather = (name: string) => {
    if (activeWeather.value === name) return
    activeWeather.value = name
    page.value = 1
    syncQuery()
    void loadDiaries()
}

// 排序切换：最新按记录日期，最热按浏览量
const setSort = (next: PortalSort) => {
    if (sort.value === next) return
    sort.value = next
    page.value = 1
    syncQuery()
    void loadDiaries()
}

const openDiary = (item: PortalDiary) => {
    activeDiary.value = item
    detailVisible.value = true
}

const closeDiary = () => {
    detailVisible.value = false
    activeDiary.value = null
}

// 详情回读的真实浏览量写回卡片，避免打开后列表数字滞后
const handleViewCounted = (payload: { id: number; views: number }) => {
    const target = diaryList.value.find(item => item.id === payload.id)
    if (target) target.views = payload.views
}

onMounted(async () => {
    // 支持从地址栏恢复筛选：?weather=晴天 / ?sort=hot
    if (typeof route.query.weather === 'string') activeWeather.value = route.query.weather
    if (route.query.sort === 'hot') sort.value = 'hot'

    await loadDiaries()

    // 支持直接打开某篇随笔：?open=12
    if (typeof route.query.open === 'string') {
        const id = Number(route.query.open)
        const target = diaryList.value.find(item => item.id === id)
        if (target) openDiary(target)
    }
})
</script>

<style lang="less" scoped>
.weather-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 16px 18px;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    background: var(--portal-surface);
}

.weather-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    img {
        width: 16px;
        height: 16px;
    }

    span {
        font-size: 11px;
        color: @font-color-s;
        font-variant-numeric: tabular-nums;
    }

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.active {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }
}

.list-area {
    margin-top: 48px;
}

.sort-bar {
    display: flex;
    align-items: center;
    gap: 6px;
}

.filter-caption {
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
}

.sort-btn {
    padding: 5px 14px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.active {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }
}

.list-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 300px;
}

// 随笔墙：卡片大小错落，像贴满照片的软木板
.diary-wall {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-auto-flow: dense;
    gap: 22px;
    align-items: start;
}

.diary-card {
    grid-column: span 4;
    border: 1px solid @line-color-s;
    border-radius: 2px;
    background: @bg-color-l;
    animation: card-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    transition: border-color 0.2s ease, transform 0.25s ease, box-shadow 0.25s ease;

    // 每三张里有一张横跨两列，避免整版过于规整
    &:nth-child(3n + 1) {
        grid-column: span 8;
    }

    &:hover {
        border-color: @pcolor;
        transform: translateY(-3px);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);

        .diary-title {
            color: @pcolor;
        }

        .diary-more {
            gap: 8px;
        }
    }
}

.diary-trigger {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    padding: 24px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
}

.diary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.diary-date {
    font-size: 12px;
    color: @font-color-s;
    font-variant-numeric: tabular-nums;
}

.diary-weather {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: @pcolor;
    font-size: 12px;
    font-weight: 500;

    img {
        width: 15px;
        height: 15px;
    }
}

.diary-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 19px;
    font-weight: 600;
    line-height: 1.5;
    color: @font-color-l;
    transition: color 0.2s ease;
}

.diary-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.85;
    color: @font-color-s;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.diary-thumbs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;

    img,
    .thumb-more {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 2px;
        object-fit: cover;
    }

    // “+N” 压在最后一张缩略图上，不另起一行
    .thumb-more {
        position: absolute;
        right: 8px;
        bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px !important;
        height: 40px !important;
        aspect-ratio: auto;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 13px;
    }
}

.diary-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: @font-color-s;
    transition: gap 0.2s ease, color 0.2s ease;
}

.diary-views {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: @font-color-s;
    font-variant-numeric: tabular-nums;
}

.list-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 28px;
}

@keyframes card-in {
    from {
        opacity: 0;
        transform: translateY(14px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 900px) {
    .diary-card,
    .diary-card:nth-child(3n + 1) {
        grid-column: span 6;
    }
}

@media (max-width: 560px) {
    .diary-card,
    .diary-card:nth-child(3n + 1) {
        grid-column: span 12;
    }
}
</style>
