<template>
    <PortalLayout active-path="/portal/diary">
        <PortalPageHeader index="03" kicker="MICRO JOURNAL" title="随笔"
            :description="`共 ${total} 篇。每一篇都记着那天的天气——点开任意一篇，可以在当前页读完整内容。`"
            aside-label="DAYS & WEATHER" :aside-value="`${total} 篇`" aside-note="天气是日子的注脚，短句、照片和当时的心情一起留在这里。">
            <div class="diary-toolbar">
                <div v-if="weatherFilters.length" class="weather-rail" aria-label="按天气筛选随笔">
                    <button type="button" class="weather-pill" :class="{ active: !activeWeather }"
                        @click="selectWeather('')">
                        <span class="weather-name">全部天气</span>
                        <span class="weather-count">{{ allTotal }}</span>
                    </button>
                    <button v-for="item in weatherFilters" :key="item.name" type="button" class="weather-pill"
                        :class="{ active: activeWeather === item.name }" @click="selectWeather(item.name)">
                        <img v-if="item.iconUrl" :src="item.iconUrl" :alt="item.name" />
                        <span class="weather-name">{{ item.name }}</span>
                        <span class="weather-count">{{ item.count }}</span>
                    </button>
                </div>

                <div class="sort-bar">
                    <span class="filter-caption">排序</span>
                    <button type="button" class="sort-btn" :class="{ active: sort === 'latest' }"
                        @click="setSort('latest')">
                        最新
                    </button>
                    <button type="button" class="sort-btn" :class="{ active: sort === 'hot' }"
                        @click="setSort('hot')">
                        最热
                    </button>
                </div>
            </div>
        </PortalPageHeader>

        <section class="list-area">
            <div v-if="loading" class="list-state">
                <yk-spinner size="m" />
            </div>

            <div v-else-if="diaryList.length" class="journal-stream">
                <article v-for="(diary, i) in diaryList" :key="diary.id"
                    class="journal-entry" :class="{
                        'has-pictures': diary.picture.length > 0,
                        'image-left': diary.picture.length > 0 && i % 2 === 1
                    }" :style="{ '--stagger': `${Math.min(i, 8) * 55}ms` }">
                    <button type="button" class="journal-trigger" :aria-label="`阅读随笔：${diary.title}`"
                        @click="openDiary(diary)">
                        <span class="journal-date">
                            <span class="journal-day">{{ dateParts(diary.createdAt).day }}</span>
                            <span class="journal-month">{{ dateParts(diary.createdAt).month }}</span>
                            <span class="journal-weekday">{{ dateParts(diary.createdAt).weekday }}</span>
                            <span v-if="diary.weatherName" class="journal-weather">
                                <img v-if="weatherIcon(diary.weatherName)" :src="weatherIcon(diary.weatherName)"
                                    :alt="diary.weatherName" />
                                {{ diary.weatherName }}
                            </span>
                        </span>

                        <span class="journal-content">
                            <span class="journal-topline">
                                <span class="journal-kicker">日志 {{ journalNumber(i) }}</span>
                                <span class="journal-year">{{ dateParts(diary.createdAt).year }}</span>
                            </span>

                            <span class="journal-main">
                                <span class="journal-copy">
                                    <span class="journal-title">{{ diary.title }}</span>
                                    <span class="journal-text">{{ diary.content }}</span>
                                    <span class="journal-footer">
                                        <span class="journal-more">
                                            阅读全文
                                            <IconRightOutline />
                                        </span>
                                        <span class="journal-stats">
                                            <span><IconEyeOutline />{{ diary.views }}</span>
                                            <span><IconHeartOutline />{{ diary.likes }}</span>
                                            <span><IconCommentOutline />{{ diary.comments }}</span>
                                        </span>
                                    </span>
                                </span>

                                <span v-if="diary.picture.length" class="journal-pictures"
                                    :class="`pictures-${Math.min(diary.picture.length, 4)}`">
                                    <img v-for="(pic, pi) in diary.picture.slice(0, 4)" :key="pi"
                                        v-bind="responsiveImageAttrs(pic, {
                                            widths: IMAGE_WIDTHS.card,
                                            sizes: '(max-width: 720px) 50vw, 24vw'
                                        })" alt="" />
                                    <span v-if="diary.picture.length > 4" class="picture-more">
                                        +{{ diary.picture.length - 4 }}
                                    </span>
                                </span>
                            </span>
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

            <div class="list-pagination">
                <AdminPager v-model:page="page" :page-size="pageSize" :total="total" :disabled="loading"
                    @change="handlePagerChange" />
            </div>
        </section>

        <PortalDiaryDetail :open="detailVisible" :item="activeDiary" @close="closeDiary"
            @view-counted="handleViewCounted" @interaction-change="handleInteractionChange" />
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
import AdminPager from '../components/common/AdminPager.vue'
import { IMAGE_WIDTHS, responsiveImageAttrs } from '../utils/imageOptimization'

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

const dateParts = (value: string): { day: string; month: string; weekday: string; year: string } => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return { day: '--', month: '', weekday: '', year: '' }
    }
    return {
        day: String(date.getDate()).padStart(2, '0'),
        month: `${date.getMonth() + 1}月`,
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
        year: String(date.getFullYear())
    }
}

const journalNumber = (index: number): string => {
    return String((page.value - 1) * pageSize + index + 1).padStart(2, '0')
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

// 页码已由 v-model 同步，这里重新加载并回到页顶
const handlePagerChange = (): void => {
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

// 点赞/评论后把真实计数写回卡片
const handleInteractionChange = (payload: { id: number; likes: number; comments: number }) => {
    const target = diaryList.value.find(item => item.id === payload.id)
    if (target) {
        target.likes = payload.likes
        target.comments = payload.comments
    }
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
.diary-toolbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
}

.weather-rail {
    display: flex;
    flex: 1;
    gap: 7px;
    min-width: 0;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
    scrollbar-color: var(--portal-accent-soft) transparent;
}

.weather-pill {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: 6px;
    padding: 7px 12px;
    border: 1px solid @line-color-s;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: @font-color-m;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease,
        transform 0.2s ease;

    img {
        width: 16px;
        height: 16px;
    }

    .weather-count {
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        color: var(--portal-text-tertiary);
    }

    &:hover {
        border-color: @pcolor;
        color: @pcolor;
        transform: translateY(-1px);
    }

    &.active {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;

        .weather-count {
            color: @pcolor;
        }
    }
}

.list-area {
    margin-top: 48px;
}

.sort-bar {
    display: flex;
    align-items: center;
    flex-shrink: 0;
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

// 随笔日志：用日期书脊串起每一篇，而不是随机高矮的卡片墙
.journal-stream {
    border-top: 1px solid var(--portal-line-soft);
}

.journal-entry {
    border-bottom: 1px solid var(--portal-line-soft);
    animation: journal-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: var(--stagger, 0ms);
}

.journal-trigger {
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
}

.journal-date {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    padding: 30px 20px 30px 0;
    border-right: 1px solid var(--portal-line-soft);

    &::after {
        content: '';
        position: absolute;
        top: 42px;
        right: -4px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--portal-page-bg);
        box-shadow: 0 0 0 1px var(--portal-accent);
        transition: background var(--portal-transition-fast), transform var(--portal-transition-fast);
    }
}

.journal-day {
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: 44px;
    font-weight: 600;
    line-height: 0.92;
    font-variant-numeric: tabular-nums;
}

.journal-month {
    color: var(--portal-text-secondary);
    font-family: var(--portal-serif);
    font-size: 14px;
}

.journal-weekday,
.journal-year {
    color: var(--portal-text-tertiary);
    font-size: 10px;
    letter-spacing: 0.08em;
}

.journal-weather {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    color: var(--portal-text-secondary);
    font-size: 11px;

    img {
        width: 15px;
        height: 15px;
    }
}

.journal-content {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 14px;
    padding: 24px 0 26px 34px;
}

.journal-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.journal-kicker {
    color: var(--portal-accent-strong);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
}

.journal-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
    align-items: center;
}

.journal-entry.has-pictures .journal-main {
    grid-template-columns: minmax(0, 0.82fr) minmax(300px, 1.18fr);
}

.journal-copy {
    display: flex;
    min-width: 0;
    min-height: 128px;
    flex-direction: column;
    gap: 14px;
}

.journal-title {
    max-width: 22ch;
    color: var(--portal-text-primary);
    font-family: var(--portal-serif);
    font-size: clamp(25px, 2.3vw, 36px);
    font-weight: 600;
    line-height: 1.32;
    letter-spacing: -0.015em;
    transition: color var(--portal-transition-fast);
}

.journal-text {
    max-width: 64ch;
    color: var(--portal-text-secondary);
    font-size: 14px;
    line-height: 1.9;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.journal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--portal-line-soft);
}

.journal-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--portal-text-secondary);
    font-size: 13px;
    transition: color var(--portal-transition-fast), gap var(--portal-transition-fast);
}

.journal-stats {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--portal-text-tertiary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

.journal-pictures {
    position: relative;
    display: grid;
    gap: 6px;
    aspect-ratio: 16 / 10;
    min-width: 0;
    overflow: hidden;

    img {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        border-radius: 3px;
        object-fit: cover;
        transition: transform 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
    }

    &.pictures-1 {
        grid-template-columns: 1fr;
        aspect-ratio: 16 / 9;
    }

    &.pictures-2 {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: minmax(0, 1fr);
    }

    &.pictures-3 {
        grid-template-columns: 1.45fr 1fr;
        grid-template-rows: repeat(2, minmax(0, 1fr));

        img:first-child {
            grid-row: 1 / span 2;
        }
    }

    &.pictures-4 {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: repeat(2, minmax(0, 1fr));
    }
}

.picture-more {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 50%;
    background: rgba(8, 12, 20, 0.62);
    color: #fff;
    font-size: 12px;
    backdrop-filter: blur(8px);
}

.journal-entry.image-left .journal-pictures {
    order: -1;
}

.journal-trigger:hover {
    .journal-title {
        color: @pcolor;
    }

    .journal-more {
        gap: 8px;
        color: @pcolor;
    }

    .journal-pictures img {
        transform: scale(1.018);
    }

    .journal-date::after {
        background: var(--portal-accent);
        transform: scale(1.35);
    }
}

.list-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 28px;
}

@keyframes journal-in {
    from {
        opacity: 0;
        transform: translateY(16px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 900px) {
    .journal-entry.has-pictures .journal-main,
    .journal-entry.image-left .journal-main {
        grid-template-columns: 1fr;
    }

    .journal-entry.image-left .journal-pictures {
        order: 0;
    }

    .journal-copy {
        min-height: 0;
    }
}

@media (max-width: 720px) {
    .diary-toolbar {
        align-items: flex-start;
        flex-direction: column;
        gap: 14px;
    }

    .weather-rail {
        width: 100%;
    }

    .journal-trigger {
        grid-template-columns: 1fr;
    }

    .journal-date {
        flex-direction: row;
        align-items: baseline;
        gap: 8px;
        padding: 20px 0 10px;
        border-right: none;
        border-bottom: 1px solid var(--portal-line-soft);

        &::after {
            display: none;
        }
    }

    .journal-day {
        font-size: 30px;
    }

    .journal-weather {
        margin-top: 0;
        margin-left: auto;
    }

    .journal-content {
        padding: 18px 0 28px;
    }

    .journal-title {
        max-width: none;
        font-size: clamp(24px, 6vw, 31px);
    }

    .journal-pictures.pictures-3 {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1.3fr 1fr;

        img:first-child {
            grid-column: 1 / -1;
            grid-row: auto;
        }

        img {
            min-height: 0;
        }
    }
}

@media (prefers-reduced-motion: reduce) {
    .journal-entry {
        animation: none;
    }

    .journal-pictures img {
        transition: none;
    }
}
</style>
