<template>
    <PortalLayout active-path="/portal/messages">
        <PortalPageHeader index="04" kicker="GUEST BOOK" title="留言墙"
            :description="`这里收录着读者留下的话，共 ${wallTotal} 条。留言会直接进入博主的后台私信收件箱。`"
            aside-label="OPEN LETTERS" :aside-value="`${wallTotal} 条`" aside-note="没有算法排序，只有路过时留下的一句话。">
            <div class="wall-compose portal-glass">
                <yk-text-area v-model="wallDraft" :max-length="512" show-word-limit
                    :auto-size="{ minRows: 2, maxRows: 5 }" placeholder="给博主留一句想说的话…" />
                <div class="wall-compose-actions">
                    <span v-if="wallError" class="wall-error">{{ wallError }}</span>
                    <span v-else class="wall-hint">Ctrl + Enter 可以快速发送</span>
                    <yk-button type="primary" size="s" :loading="wallSubmitting" :disabled="!wallDraft.trim()"
                        @click="submitWallMessage">
                        留言
                    </yk-button>
                </div>
            </div>
        </PortalPageHeader>

        <section class="list-area">
            <div v-if="wallLoading" class="block-state">
                <yk-spinner size="m" />
            </div>
            <template v-else-if="wallList.length">
                <div class="wall-grid">
                    <div v-for="message in wallList" :key="message.id" class="wall-card portal-glass"
                        :class="cardTone(message.id)">
                        <div class="wall-head">
                            <yk-avatar :size="32" :img-url="message.senderAvatar || undefined" />
                            <div class="wall-user">
                                <span class="wall-name">{{ message.senderName || '匿名访客' }}</span>
                                <time class="wall-date">{{ formatDateTime(message.createdAt) }}</time>
                            </div>
                        </div>
                        <p class="wall-text">{{ message.content }}</p>
                    </div>
                </div>

                <!-- 自研分页：yk-pagination 的受控模式表现不稳（数据翻页但高亮不同步），
                     留言墙页数少，这里用轻量控件保证行为完全可控且风格统一 -->
                <div v-if="wallTotalPage > 1" class="wall-pager">
                    <button type="button" class="pager-btn" :disabled="wallPage === 1" @click="goPage(wallPage - 1)">
                        上一页
                    </button>
                    <button v-for="page in visiblePages" :key="page" type="button" class="pager-num"
                        :class="{ active: page === wallPage }" @click="goPage(page)">
                        {{ page }}
                    </button>
                    <button type="button" class="pager-btn" :disabled="wallPage === wallTotalPage"
                        @click="goPage(wallPage + 1)">
                        下一页
                    </button>
                </div>
            </template>
            <div v-else class="block-state">
                <yk-empty description="还没有留言，来抢第一楼吧" />
            </div>
        </section>
    </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PortalLayout from '../components/portal/PortalLayout.vue'
import PortalPageHeader from '../components/portal/PortalPageHeader.vue'
import { getWallMessages, createWallMessage, type PortalWallMessage } from '../api/portal'
import { applyPortalSeo } from '../utils/portalSeo'

const wallList = ref<PortalWallMessage[]>([])
const wallTotal = ref(0)
const wallTotalPage = ref(0)
const wallLoading = ref(false)
const wallDraft = ref('')
const wallSubmitting = ref(false)
const wallError = ref('')
const wallPage = ref(1)
const wallPageSize = ref(12)

// 留言卡片配色：按 id 稳定分配一个色阶，避免整墙清一色白板。
// 颜色全部由 --pcolor 与页面底色混合而来，因此明暗主题切换时自动跟随。
const TONE_COUNT = 6
const cardTone = (id: number): string => {
    const tone = Math.abs(id) % TONE_COUNT
    return `tone-${tone}`
}

const formatDateTime = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    })}`
}

const loadWall = async () => {
    wallLoading.value = true
    try {
        const result = await getWallMessages({ page: wallPage.value, pageSize: wallPageSize.value })
        if (result.code === 200) {
            wallList.value = result.data?.list || []
            wallTotal.value = result.data?.total || 0
            wallTotalPage.value = result.data?.totalPage || 0
        }
    } catch {
        // 加载失败保留空态，页面其他部分不受影响
    } finally {
        wallLoading.value = false
    }
}

const submitWallMessage = async () => {
    const content = wallDraft.value.trim()
    if (!content || wallSubmitting.value) return
    wallError.value = ''
    wallSubmitting.value = true
    try {
        const result = await createWallMessage(content)
        if (result.code === 200 || result.code === 201) {
            wallDraft.value = ''
            // 新留言在第一页首位，翻回首页让用户看到自己的留言
            if (wallPage.value === 1) {
                // 已在第一页时 watch 不会触发，直接重载让新留言出现在首位
                await loadWall()
            } else {
                wallPage.value = 1
            }
        } else {
            wallError.value = result.message || '留言失败，请稍后重试'
        }
    } catch {
        wallError.value = '留言失败，请稍后重试'
    } finally {
        wallSubmitting.value = false
    }
}

// 页码窗口：总页数较少时全部展示，超过 7 页时以当前页为中心截断
const visiblePages = computed<number[]>(() => {
    const total = wallTotalPage.value
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const current = wallPage.value
    const start = Math.max(1, Math.min(current - 3, total - 6))
    return Array.from({ length: 7 }, (_, i) => start + i)
})

const goPage = (page: number) => {
    if (page < 1 || page > wallTotalPage.value || page === wallPage.value) return
    wallPage.value = page
}

// 页码变化统一由此处触发加载，翻页/提交后回首页都走同一条路径
watch(wallPage, () => {
    void loadWall()
})

// Ctrl + Enter 快速发送
const handleKeydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        void submitWallMessage()
    }
}

onMounted(() => {
    applyPortalSeo({
        title: '留言墙',
        description: '给林知雨留下一句话，所有公开留言都会进入博主的后台私信收件箱。',
        url: new URL('/portal/messages', window.location.origin).toString(),
        type: 'website'
    })
    void loadWall()
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<style lang="less" scoped>
.list-area {
    margin-top: 38px;
}

.block-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 260px;
}

.wall-compose {
    padding: 20px 22px;
    transition: box-shadow var(--portal-transition-medium);

    &:focus-within {
        box-shadow: var(--portal-shadow-hover);
    }
}

.wall-compose-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 12px;
}

.wall-hint,
.wall-error {
    font-size: 13px;
}

.wall-hint {
    color: var(--portal-text-tertiary);
}

.wall-error {
    color: var(--portal-accent-strong);
    font-weight: 500;
}

.wall-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
}

.wall-card {
    padding: 20px;
    transition: all var(--portal-transition-medium);

    &:hover {
        transform: translateY(-3px);
        box-shadow: var(--portal-shadow-hover);
        background: var(--portal-surface-hover);
    }
}

// 留言卡片色阶：同一主色的不同浓度，混回页面底色保证明暗双态都可读
.wall-card.tone-0 {
    background: color-mix(in srgb, var(--pcolor) 8%, var(--portal-page-bg));
}

.wall-card.tone-1 {
    background: color-mix(in srgb, var(--pcolor) 14%, var(--portal-page-bg));
}

.wall-card.tone-2 {
    background: color-mix(in srgb, var(--pcolor) 20%, var(--portal-page-bg));
}

.wall-card.tone-3 {
    background: color-mix(in srgb, var(--pcolor8) 12%, var(--portal-page-bg));
}

.wall-card.tone-4 {
    background: color-mix(in srgb, var(--pcolor8) 18%, var(--portal-page-bg));
}

.wall-card.tone-5 {
    background: color-mix(in srgb, var(--pcolor9) 16%, var(--portal-page-bg));
}

// 卡片顶部再加一条主色细边，强化每片卡片的独立感
.wall-card[class*='tone-'] {
    border-top: 2px solid color-mix(in srgb, var(--pcolor) 45%, transparent);
}

.wall-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.wall-user {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.wall-name {
    font-family: var(--portal-serif);
    font-size: 15px;
    font-weight: 600;
    color: var(--portal-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.wall-date {
    font-size: 12px;
    color: var(--portal-text-tertiary);
    font-variant-numeric: tabular-nums;
}

.wall-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.8;
    color: var(--portal-text-secondary);
    word-break: break-word;
    white-space: pre-wrap;
}

.wall-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 36px;
}

.pager-btn,
.pager-num {
    min-width: 36px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-pill);
    background: var(--portal-surface);
    color: var(--portal-text-secondary);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    &:hover:not(:disabled):not(.active) {
        background: var(--portal-accent-soft);
        border-color: var(--portal-accent);
        color: var(--portal-accent);
    }

    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
}

.pager-num.active {
    background: var(--portal-accent);
    border-color: var(--portal-accent);
    color: var(--portal-text-on-accent);
    font-weight: 600;
}

@media (max-width: 768px) {
    .wall-grid {
        grid-template-columns: 1fr;
    }

    .wall-compose {
        padding: 16px 18px;
    }

    .wall-compose-actions {
        flex-wrap: wrap;
        justify-content: flex-start;
    }
}
</style>
