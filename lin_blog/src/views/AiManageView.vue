<template>
    <yk-space dir="vertical" size="l" class="admin-page ai-manage">
        <top-title name="AI 管理" description="统一管理接入模型、用量策略与调用记录" :is-search="false">
            <template #custom>
                <yk-space size="s">
                    <yk-button size="s" type="secondary" :loading="importing" @click="handleImportEnv">
                        导入环境变量配置
                    </yk-button>
                    <yk-button size="s" type="primary" @click="openCreateModel">+ 接入模型</yk-button>
                </yk-space>
            </template>
        </top-title>

        <yk-text v-if="loading" type="secondary">正在加载 AI 配置...</yk-text>

        <template v-else>
            <!-- 提示条：失败或成功都只占一行，不再替换整页内容 -->
            <div v-if="errorMessage" class="ai-banner is-error">{{ errorMessage }}</div>
            <div v-else-if="noticeMessage" class="ai-banner is-success">{{ noticeMessage }}</div>

            <!-- 概览 -->
            <yk-space class="ai-overview" size="m">
                <stat-card name="接入模型" :total="models.length" tone="primary" :icon="IconAppFill" />
                <stat-card name="启用中" :total="enabledCount" tone="success" :icon="IconTickFill" />
                <stat-card name="今日调用" :total="todayCount" tone="warning" :icon="IconStatisticsFill" />
                <stat-card name="默认模型" :total="defaultModelName" :icon="IconPaintBrushFill" />
            </yk-space>

            <!-- 接入模型 -->
            <section class="ai-panel">
                <header class="ai-panel-header">
                    <div class="ai-panel-heading">
                        <yk-title :level="4" style="margin: 0;">接入模型</yk-title>
                        <yk-text type="secondary">默认模型优先被调用，停用的模型不参与请求</yk-text>
                    </div>
                </header>

                <yk-empty v-if="models.length === 0"
                    description="还没有接入任何模型，可点右上角「接入模型」或「导入环境变量配置」" />

                <div v-else class="ai-model-grid">
                    <article v-for="item in models" :key="item.id" class="ai-model-card"
                        :class="{ 'is-default': item.isDefault, 'is-disabled': !item.enabled }">
                        <header class="ai-model-card-head">
                            <span class="ai-model-avatar" :class="{ 'is-default': item.isDefault }"
                                aria-hidden="true">{{ item.name.slice(0, 1) }}</span>
                            <div class="ai-model-card-title">
                                <strong :title="item.name">{{ item.name }}</strong>
                                <div class="ai-model-tags">
                                    <yk-tag v-if="item.isDefault" size="s" type="primary">默认</yk-tag>
                                    <yk-tag v-if="!item.enabled" size="s" type="warning">已停用</yk-tag>
                                    <yk-tag v-else size="s" type="success">运行中</yk-tag>
                                </div>
                            </div>
                            <yk-switch :model-value="item.enabled" :checked-value="true" :unchecked-value="false"
                                checked-color="#1fb4a2" unchecked-color="#fa5247" :loading="togglingId === item.id"
                                @change="(checked: boolean | number | string) => toggleEnabled(item, checked)" />
                        </header>

                        <dl class="ai-model-facts">
                            <div class="ai-model-fact">
                                <dt>文本模型</dt>
                                <dd>{{ item.chatModel || '-' }}</dd>
                            </div>
                            <div class="ai-model-fact">
                                <dt>配图模型</dt>
                                <dd>{{ item.imageModel || '未配置' }}</dd>
                            </div>
                            <div class="ai-model-fact">
                                <dt>配图尺寸</dt>
                                <dd>{{ item.imageSize || '-' }}</dd>
                            </div>
                            <div class="ai-model-fact">
                                <dt>接口密钥</dt>
                                <dd class="is-mono">{{ item.apiKeyMasked || '未设置' }}</dd>
                            </div>
                            <div class="ai-model-fact is-wide">
                                <dt>接口地址</dt>
                                <dd class="is-mono" :title="item.baseUrl">{{ item.baseUrl }}</dd>
                            </div>
                            <div class="ai-model-fact is-wide">
                                <dt>模型限额</dt>
                                <dd>{{ modelLimitText(item) }}</dd>
                            </div>
                        </dl>

                        <div v-if="item.health && item.health.testCount > 0" class="ai-model-health">
                            <span class="ai-model-health-item">
                                延迟
                                <strong>{{ formatDuration(item.health.avgLatencyMs) }}</strong>
                            </span>
                            <span class="ai-model-health-item">
                                成功率
                                <strong>{{ item.health.successRate }}%</strong>
                            </span>
                            <span class="ai-model-health-item">
                                最近测试
                                <strong>{{ formatTime(item.health.lastTestAt) }}</strong>
                            </span>
                            <yk-tag v-if="item.health.consecutiveFailures > 0" size="s" type="danger">
                                连续失败 {{ item.health.consecutiveFailures }} 次
                            </yk-tag>
                        </div>

                        <p v-if="item.remark" class="ai-model-remark">{{ item.remark }}</p>

                        <footer class="ai-model-card-foot">
                            <yk-button size="s" type="secondary" :loading="testingId === item.id"
                                @click="handleTest(item)">连通性测试</yk-button>
                            <yk-button size="s" type="secondary" @click="openEditModel(item)">编辑</yk-button>
                            <yk-popconfirm placement="top" trigger="click" title="确认删除"
                                :content="'确定删除模型「' + item.name + '」吗？'" @confirm="handleDelete(item)">
                                <yk-button size="s" type="secondary" status="danger">删除</yk-button>
                            </yk-popconfirm>
                        </footer>
                    </article>
                </div>
            </section>

            <!-- 用量统计 -->
            <section v-if="stats" class="ai-panel">
                <header class="ai-panel-header">
                    <div class="ai-panel-heading">
                        <yk-title :level="4" style="margin: 0;">用量统计</yk-title>
                        <yk-text type="secondary">近 {{ stats.days }} 天的调用量、成功率与耗时</yk-text>
                    </div>
                </header>

                <div class="ai-stats-grid">
                    <div class="ai-stats-window">
                        <p class="ai-stats-window-title">近 7 天</p>
                        <p class="ai-stats-window-total">{{ stats.summary.last7Days.total }}<span>次调用</span></p>
                        <ul class="ai-stats-window-facts">
                            <li><span>成功率</span><strong>{{ stats.summary.last7Days.successRate }}%</strong></li>
                            <li><span>平均耗时</span><strong>{{ formatDuration(stats.summary.last7Days.avgDurationMs) }}</strong></li>
                            <li><span>Token 消耗</span><strong>{{ formatNumber(stats.summary.last7Days.totalTokens) }}</strong></li>
                        </ul>
                    </div>
                    <div class="ai-stats-window">
                        <p class="ai-stats-window-title">近 30 天</p>
                        <p class="ai-stats-window-total">{{ stats.summary.last30Days.total }}<span>次调用</span></p>
                        <ul class="ai-stats-window-facts">
                            <li><span>成功率</span><strong>{{ stats.summary.last30Days.successRate }}%</strong></li>
                            <li><span>平均耗时</span><strong>{{ formatDuration(stats.summary.last30Days.avgDurationMs) }}</strong></li>
                            <li><span>Token 消耗</span><strong>{{ formatNumber(stats.summary.last30Days.totalTokens) }}</strong></li>
                        </ul>
                    </div>
                    <div class="ai-stats-window">
                        <p class="ai-stats-window-title">累计</p>
                        <p class="ai-stats-window-total">{{ stats.summary.all.total }}<span>次调用</span></p>
                        <ul class="ai-stats-window-facts">
                            <li><span>失败次数</span><strong>{{ stats.summary.all.failed }}</strong></li>
                            <li><span>待确认图片</span><strong>{{ stats.pending.total }} 张</strong></li>
                            <li><span>占用空间</span><strong>{{ formatBytes(stats.pending.bytes) }}</strong></li>
                        </ul>
                    </div>
                </div>

                <div class="ai-stats-breaks">
                    <div class="ai-stats-break">
                        <p class="ai-stats-break-title">按模型</p>
                        <yk-empty v-if="stats.byModel.length === 0" description="暂无数据" />
                        <ul v-else class="ai-stats-list">
                            <li v-for="row in stats.byModel" :key="row.modelName || 'unknown'">
                                <div class="ai-stats-list-main">
                                    <strong>{{ row.modelName || '未记录模型' }}</strong>
                                    <span>{{ row.total }} 次 · 成功率 {{ row.successRate }}%</span>
                                </div>
                                <div class="ai-stats-list-side">
                                    <span>{{ formatDuration(row.avgDurationMs) }}</span>
                                    <span>{{ formatNumber(row.promptTokens + row.completionTokens) }} token</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <div class="ai-stats-break">
                        <p class="ai-stats-break-title">按功能</p>
                        <yk-empty v-if="stats.byFeature.length === 0" description="暂无数据" />
                        <ul v-else class="ai-stats-list">
                            <li v-for="row in stats.byFeature" :key="row.feature">
                                <div class="ai-stats-list-main">
                                    <strong>{{ featureLabel(row.feature) }}</strong>
                                    <span>{{ row.total }} 次 · 成功率 {{ row.successRate }}%</span>
                                </div>
                                <div class="ai-stats-list-side">
                                    <span>平均 {{ formatDuration(row.avgDurationMs) }}</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="ai-stats-breaks">
                    <div class="ai-stats-break">
                        <p class="ai-stats-break-title">模型健康</p>
                        <yk-empty v-if="stats.health.length === 0" description="尚未进行连通性测试" />
                        <ul v-else class="ai-stats-list">
                            <li v-for="row in stats.health" :key="row.modelId">
                                <div class="ai-stats-list-main">
                                    <strong>{{ row.modelName }}</strong>
                                    <span>
                                        平均 {{ formatDuration(row.avgLatencyMs) }} · 成功率 {{ row.successRate }}%
                                        <template v-if="row.lastError"> · {{ row.lastError }}</template>
                                    </span>
                                </div>
                                <div class="ai-stats-list-side">
                                    <span>最近测试 {{ formatTime(row.lastTestAt) }}</span>
                                    <yk-tag v-if="row.consecutiveFailures > 0" size="s" type="danger">
                                        连续失败 {{ row.consecutiveFailures }} 次
                                    </yk-tag>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <div class="ai-stats-break">
                        <p class="ai-stats-break-title">每日趋势</p>
                        <yk-empty v-if="stats.trend.length === 0" description="暂无数据" />
                        <div v-else class="ai-trend-chart">
                            <LineChart :data="trendChartData" chart-height="160px" />
                        </div>
                    </div>
                </div>
            </section>

            <div class="ai-columns">
                <!-- 用量策略 -->
                <section class="ai-panel">
                    <header class="ai-panel-header">
                        <div class="ai-panel-heading">
                            <yk-title :level="4" style="margin: 0;">用量策略</yk-title>
                            <yk-text type="secondary">限制普通用户调用 AI 的次数</yk-text>
                        </div>
                        <yk-button size="s" type="primary" :loading="savingSettings" @click="saveSettings">保存策略</yk-button>
                    </header>

                    <div class="ai-policy">
                        <div class="ai-policy-row">
                            <div class="ai-policy-copy">
                                <strong>启用次数限制</strong>
                                <span>关闭后所有账号都可以不限次数调用 AI</span>
                            </div>
                            <yk-switch v-model="settings.quotaEnabled" :checked-value="true" :unchecked-value="false"
                                checked-color="#1fb4a2" unchecked-color="#fa5247" />
                        </div>

                        <div class="ai-policy-row">
                            <div class="ai-policy-copy">
                                <strong>每用户每日上限</strong>
                                <span>按自然日统计，0 表示不限次数</span>
                            </div>
                            <div class="ai-policy-input">
                                <input v-model.number="settings.dailyLimitPerUser" type="number" min="0" max="1000" />
                                <span>次 / 天</span>
                            </div>
                        </div>

                        <div class="ai-policy-row">
                            <div class="ai-policy-copy">
                                <strong>每用户每月上限</strong>
                                <span>按自然月统计，0 表示不限次数</span>
                            </div>
                            <div class="ai-policy-input">
                                <input v-model.number="settings.monthlyLimitPerUser" type="number" min="0" max="10000" />
                                <span>次 / 月</span>
                            </div>
                        </div>

                        <div class="ai-policy-row">
                            <div class="ai-policy-copy">
                                <strong>超级管理员不限次数</strong>
                                <span>开启后超管账号不受每日与每月上限约束</span>
                            </div>
                            <yk-switch v-model="settings.superAdminUnlimited" :checked-value="true" :unchecked-value="false"
                                checked-color="#1fb4a2" unchecked-color="#fa5247" />
                        </div>
                    </div>

                    <p class="ai-policy-tip">
                        当前策略下，普通用户每日可用 <strong>{{ dailyLimitText }}</strong> 次、每月可用
                        <strong>{{ monthlyLimitText }}</strong> 次。
                    </p>
                </section>

                <!-- 调用记录 -->
                <section class="ai-panel">
                    <header class="ai-panel-header">
                        <div class="ai-panel-heading">
                            <yk-title :level="4" style="margin: 0;">最近调用记录</yk-title>
                            <yk-text type="secondary">最新 {{ usage.length }} 条</yk-text>
                        </div>
                    </header>

                    <yk-empty v-if="usage.length === 0" description="暂无调用记录" />

                    <div v-else class="ai-usage-list">
                        <div v-for="item in usage" :key="item.id" class="ai-usage-item">
                            <span class="ai-usage-dot" :class="'is-' + item.status" aria-hidden="true" />
                            <div class="ai-usage-main">
                                <div class="ai-usage-title">
                                    <strong>{{ item.username || '（已注销）' }}</strong>
                                    <yk-tag size="s">{{ featureLabel(item.feature) }}</yk-tag>
                                </div>
                                <p class="ai-usage-meta">
                                    {{ item.modelName || '未知模型' }}
                                    <span v-if="item.detail">· {{ item.detail }}</span>
                                </p>
                            </div>
                            <div class="ai-usage-side">
                                <span class="ai-usage-status" :class="'is-' + item.status">{{ statusLabel(item.status) }}</span>
                                <time class="ai-usage-time">{{ formatTime(item.createdAt) }}</time>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </template>

        <!-- 模型编辑弹窗 -->
        <yk-modal :model-value="modelModalVisible" :title="editingModel ? '编辑接入模型' : '接入新模型'" size="s"
            :closeable="!savingModel" @update:model-value="closeModelModal">
            <form class="ai-form" @submit.prevent="submitModel">
                <p class="ai-form-hint">
                    填写 OpenAI 兼容的接口地址与密钥即可接入。密钥会加密入库，保存后只显示掩码。
                </p>

                <section class="ai-form-group">
                    <p class="ai-form-group-title">基础信息</p>

                    <label class="ai-form-field">
                        <span class="ai-form-label">模型名称<i>*</i></span>
                        <input v-model.trim="modelForm.name" type="text" placeholder="例如：智谱 GLM" required />
                        <span class="ai-form-tip">仅用于后台展示与识别</span>
                    </label>

                    <label class="ai-form-field">
                        <span class="ai-form-label">接口地址<i>*</i></span>
                        <input v-model.trim="modelForm.baseUrl" type="text"
                            placeholder="https://open.bigmodel.cn/api/paas/v4" required />
                        <span class="ai-form-tip">需包含完整路径，末尾斜杠会自动去掉</span>
                    </label>

                    <label class="ai-form-field">
                        <span class="ai-form-label">接口密钥<i>*</i></span>
                        <div class="ai-form-secret">
                            <input v-model.trim="modelForm.apiKey" :type="showSecret ? 'text' : 'password'"
                                :placeholder="editingModel ? '留空表示不修改密钥' : '请输入 API Key'" />
                            <button type="button" class="ai-form-secret-toggle" @click="showSecret = !showSecret">
                                {{ showSecret ? '隐藏' : '显示' }}
                            </button>
                        </div>
                        <span class="ai-form-tip">
                            {{ editingModel ? '留空则保留原密钥；密钥加密存储，页面只显示末四位' : '密钥加密入库，不会明文回显' }}
                        </span>
                    </label>
                </section>

                <section class="ai-form-group">
                    <p class="ai-form-group-title">模型能力</p>

                    <label class="ai-form-field">
                        <span class="ai-form-label">文本模型<i>*</i></span>
                        <input v-model.trim="modelForm.chatModel" type="text" placeholder="glm-4-flash" required />
                        <span class="ai-form-tip">用于写作建议与写作辅助</span>
                    </label>

                    <div class="ai-form-pair">
                        <label class="ai-form-field">
                            <span class="ai-form-label">配图模型</span>
                            <input v-model.trim="modelForm.imageModel" type="text" placeholder="cogview-3-flash" />
                            <span class="ai-form-tip">留空则不提供 AI 配图</span>
                        </label>

                        <label class="ai-form-field">
                            <span class="ai-form-label">配图尺寸</span>
                            <input v-model.trim="modelForm.imageSize" type="text" placeholder="1344x768" />
                            <span class="ai-form-tip">宽 x 高，7:4 适合博客封面</span>
                        </label>
                    </div>
                </section>

                <section class="ai-form-group">
                    <p class="ai-form-group-title">高级选项</p>

                    <label class="ai-form-field">
                        <span class="ai-form-label">超时时间（毫秒）</span>
                        <input v-model.number="modelForm.timeoutMs" type="number" min="1000" max="120000" step="1000" />
                        <span class="ai-form-tip">单次请求的最长等待时间，建议 20000</span>
                    </label>

                    <div class="ai-form-pair">
                        <label class="ai-form-field">
                            <span class="ai-form-label">该模型每日上限</span>
                            <input v-model.number="modelForm.dailyLimitPerUser" type="number" min="0" max="1000" />
                            <span class="ai-form-tip">每用户对该模型的每日次数，0 表示不限</span>
                        </label>

                        <label class="ai-form-field">
                            <span class="ai-form-label">该模型每月上限</span>
                            <input v-model.number="modelForm.monthlyLimitPerUser" type="number" min="0" max="10000" />
                            <span class="ai-form-tip">每用户对该模型的每月次数，0 表示不限</span>
                        </label>
                    </div>

                    <label class="ai-form-field">
                        <span class="ai-form-label">备注</span>
                        <input v-model.trim="modelForm.remark" type="text" placeholder="例如：由环境变量导入" />
                    </label>

                    <div class="ai-form-switches">
                        <label class="ai-form-switch">
                            <yk-switch v-model="modelForm.enabled" :checked-value="true" :unchecked-value="false"
                                checked-color="#1fb4a2" unchecked-color="#fa5247" />
                            <span>启用该模型</span>
                        </label>

                        <label class="ai-form-switch">
                            <yk-switch v-model="modelForm.isDefault" :checked-value="true" :unchecked-value="false"
                                checked-color="#2b5aed" unchecked-color="#fa5247" />
                            <span>设为默认模型</span>
                        </label>
                    </div>
                </section>
            </form>

            <template #footer>
                <yk-button size="s" :disabled="savingModel" @click="closeModelModal">取消</yk-button>
                <yk-button size="s" type="primary" :loading="savingModel" @click="submitModel">
                    {{ savingModel ? '保存中...' : '确认保存' }}
                </yk-button>
            </template>
        </yk-modal>
    </yk-space>
</template>

<script lang="ts" setup>
    import { computed, getCurrentInstance, onMounted, reactive, ref } from 'vue'
    import { LineChart } from '../components/echarts'
    import {
        IconAppFill,
        IconPaintBrushFill,
        IconStatisticsFill,
        IconTickFill,
    } from '@yike-design/ui/es/components/svg-icon'
    import TopTitle from '../components/bar/TopTitle.vue'
    import StatCard from '../components/common/StatCard.vue'
    import {
        createAiModel,
        deleteAiModel,
        getAiModels,
        getAiSettings,
        getAiUsage,
        getAiUsageStats,
        getRequestErrorMessage,
        importAiModelFromEnv,
        testAiModel,
        updateAiModel,
        updateAiSettings,
        type AiModelItem,
        type AiSettings,
        type AiUsageRecord,
        type AiUsageStats,
    } from '../api/ai'

    const models = ref<AiModelItem[]>([])
    const usage = ref<AiUsageRecord[]>([])
    const stats = ref<AiUsageStats | null>(null)
    const loading = ref(true)
    const errorMessage = ref('')
    const noticeMessage = ref('')

    type MessageOptions = {
        type: 'primary' | 'error'
        message: string
    }

    type ProxyWithMessage = {
        $message?: (options: MessageOptions) => void
    }

    const proxy = getCurrentInstance()?.proxy as ProxyWithMessage | null | undefined

    // 成功与失败都给可见反馈：页面顶部的提示条容易被滚动区挡住
    const notify = (type: 'primary' | 'error', message: string): void => {
        proxy?.$message?.({ type, message })
    }

    const settings = reactive<AiSettings>({
        quotaEnabled: true,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true,
    })
    const savingSettings = ref(false)

    const modelModalVisible = ref(false)
    const editingModel = ref<AiModelItem | null>(null)
    const savingModel = ref(false)
    const testingId = ref<number | null>(null)
    const togglingId = ref<number | null>(null)
    const importing = ref(false)
    const showSecret = ref(false)

    const modelForm = reactive({
        name: '',
        baseUrl: '',
        apiKey: '',
        chatModel: '',
        imageModel: '',
        imageSize: '1344x768',
        timeoutMs: 20000,
        dailyLimitPerUser: 0,
        monthlyLimitPerUser: 0,
        enabled: true,
        isDefault: false,
        remark: '',
    })

    const enabledCount = computed(() => models.value.filter(item => item.enabled).length)

    const defaultModelName = computed(() => {
        const target = models.value.find(item => item.isDefault) || models.value.find(item => item.enabled)
        return target ? target.name : '未设置'
    })

    // 今日调用数：调用记录按时间倒序返回，当天记录排在最前面
    const todayCount = computed(() => {
        const today = new Date().toDateString()
        return usage.value.filter(item => String(item.createdAt || '').slice(0, 10) === today.slice(0, 10)).length
    })

    const dailyLimitText = computed(() => (
        settings.quotaEnabled && settings.dailyLimitPerUser > 0 ? String(settings.dailyLimitPerUser) : '不限'
    ))

    const monthlyLimitText = computed(() => (
        settings.quotaEnabled && settings.monthlyLimitPerUser > 0 ? String(settings.monthlyLimitPerUser) : '不限'
    ))

    const trendChartData = computed(() => (
        (stats.value?.trend || []).map(item => ({ date: item.day, count: item.total }))
    ))

    const featureLabel = (value: string): string => {
        const labels: Record<string, string> = {
            suggest: '写作建议',
            writing: '写作辅助',
            cover: 'AI 配图',
        }
        return labels[value] || value
    }

    const statusLabel = (value: string): string => {
        const labels: Record<string, string> = {
            success: '成功',
            failed: '失败',
            denied: '被拒绝',
        }
        return labels[value] || value
    }

    // 后端回传 ISO（UTC），这里统一按访客本地时区显示，避免出现「差 8 小时」的错觉
    const formatTime = (value: string | null | undefined): string => {
        if (!value) return '-'
        const date = new Date(String(value).includes('T')
            ? String(value)
            : String(value).replace(' ', 'T'))
        if (Number.isNaN(date.getTime())) {
            return String(value).replace('T', ' ').slice(0, 16)
        }
        const pad = (input: number): string => String(input).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    // 耗时按量级切换单位，避免面板上出现「1500 毫秒」这种不好读的数字
    const formatDuration = (ms: number): string => {
        const value = Number(ms) || 0
        if (value <= 0) return '-'
        if (value < 1000) return `${value} 毫秒`
        return `${(value / 1000).toFixed(1)} 秒`
    }

    const formatNumber = (value: number): string => {
        const num = Number(value) || 0
        if (num < 1000) return String(num)
        if (num < 10000) return num.toLocaleString('zh-CN')
        return `${(num / 10000).toFixed(1)} 万`
    }

    const formatBytes = (value: number): string => {
        const bytes = Number(value) || 0
        if (bytes <= 0) return '0 B'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    // 模型级限额：未设置时说明跟随全局策略
    const modelLimitText = (item: AiModelItem): string => {
        const daily = Number(item.dailyLimitPerUser) || 0
        const monthly = Number(item.monthlyLimitPerUser) || 0
        if (daily <= 0 && monthly <= 0) return '跟随全局策略'
        const parts: string[] = []
        parts.push(daily > 0 ? `每日 ${daily} 次` : '每日不限')
        parts.push(monthly > 0 ? `每月 ${monthly} 次` : '每月不限')
        return parts.join(' · ')
    }

    const fetchModels = async (): Promise<void> => {
        const result = await getAiModels()
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '获取模型列表失败')
        }
        models.value = result.data.list || []
    }

    const fetchSettings = async (): Promise<void> => {
        const result = await getAiSettings()
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '获取用量策略失败')
        }
        Object.assign(settings, result.data)
    }

    const fetchUsage = async (): Promise<void> => {
        try {
            const result = await getAiUsage(50)
            if (result.code === 200 && result.data) {
                usage.value = result.data.list || []
            }
        } catch {
            // 调用记录加载失败不阻塞模型与策略配置
            usage.value = []
        }
    }

    const fetchStats = async (): Promise<void> => {
        try {
            const result = await getAiUsageStats(30)
            if (result.code === 200 && result.data) {
                stats.value = result.data
            }
        } catch {
            // 统计加载失败不阻塞模型与策略配置
            stats.value = null
        }
    }

    const loadAll = async (): Promise<void> => {
        loading.value = true
        errorMessage.value = ''
        try {
            await Promise.all([fetchModels(), fetchSettings()])
            await Promise.all([fetchUsage(), fetchStats()])
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, 'AI 配置加载失败，请稍后重试')
        } finally {
            loading.value = false
        }
    }

    const openCreateModel = (): void => {
        editingModel.value = null
        showSecret.value = false
        Object.assign(modelForm, {
            name: '',
            baseUrl: '',
            apiKey: '',
            chatModel: '',
            imageModel: '',
            imageSize: '1344x768',
            timeoutMs: 20000,
            dailyLimitPerUser: 0,
            monthlyLimitPerUser: 0,
            enabled: true,
            isDefault: models.value.length === 0,
            remark: '',
        })
        modelModalVisible.value = true
    }

    const openEditModel = (item: AiModelItem): void => {
        editingModel.value = item
        showSecret.value = false
        Object.assign(modelForm, {
            name: item.name,
            baseUrl: item.baseUrl,
            apiKey: '',
            chatModel: item.chatModel,
            imageModel: item.imageModel,
            imageSize: item.imageSize,
            timeoutMs: item.timeoutMs,
            dailyLimitPerUser: item.dailyLimitPerUser || 0,
            monthlyLimitPerUser: item.monthlyLimitPerUser || 0,
            enabled: item.enabled,
            isDefault: item.isDefault,
            remark: item.remark,
        })
        modelModalVisible.value = true
    }

    const closeModelModal = (): void => {
        if (savingModel.value) return
        modelModalVisible.value = false
    }

    const submitModel = async (): Promise<void> => {
        savingModel.value = true
        errorMessage.value = ''
        try {
            const payload = {
                name: modelForm.name,
                baseUrl: modelForm.baseUrl,
                chatModel: modelForm.chatModel,
                imageModel: modelForm.imageModel,
                imageSize: modelForm.imageSize,
                timeoutMs: modelForm.timeoutMs,
                dailyLimitPerUser: modelForm.dailyLimitPerUser,
                monthlyLimitPerUser: modelForm.monthlyLimitPerUser,
                enabled: modelForm.enabled,
                isDefault: modelForm.isDefault,
                remark: modelForm.remark,
                ...(modelForm.apiKey ? { apiKey: modelForm.apiKey } : {}),
            }

            if (editingModel.value) {
                const result = await updateAiModel(editingModel.value.id, payload)
                if (result.code !== 200) {
                    throw new Error(result.message || '更新模型失败')
                }
            } else {
                const result = await createAiModel(payload)
                if (result.code !== 200 && result.code !== 201) {
                    throw new Error(result.message || '创建模型失败')
                }
            }

            modelModalVisible.value = false
            await fetchModels()
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '保存模型失败')
        } finally {
            savingModel.value = false
        }
    }

    const toggleEnabled = async (item: AiModelItem, checked: boolean | number | string): Promise<void> => {
        togglingId.value = item.id
        errorMessage.value = ''
        try {
            const result = await updateAiModel(item.id, { enabled: Boolean(checked) })
            if (result.code !== 200) {
                throw new Error(result.message || '更新状态失败')
            }
            await fetchModels()
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '更新模型状态失败')
        } finally {
            togglingId.value = null
        }
    }

    const handleDelete = async (item: AiModelItem): Promise<void> => {
        errorMessage.value = ''
        try {
            const result = await deleteAiModel(item.id)
            if (result.code !== 200) {
                throw new Error(result.message || '删除模型失败')
            }
            await fetchModels()
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '删除模型失败')
        }
    }

    const handleTest = async (item: AiModelItem): Promise<void> => {
        testingId.value = item.id
        errorMessage.value = ''
        noticeMessage.value = ''
        try {
            const result = await testAiModel(item.id)
            const ok = Boolean(result.data?.ok)
            if (result.data?.health) {
                const index = models.value.findIndex(target => target.id === item.id)
                if (index >= 0) {
                    // 合并而非整体替换：后端快照可能只带回部分字段
                    models.value[index] = {
                        ...models.value[index],
                        health: { ...models.value[index].health, ...result.data.health }
                    }
                }
            }
            if (ok) {
                noticeMessage.value = `「${item.name}」连通性测试通过，耗时 ${formatDuration(result.data?.latencyMs || 0)}`
                notify('primary', noticeMessage.value)
            } else {
                errorMessage.value = result.message || '连通性测试失败'
                notify('error', errorMessage.value)
            }
            // 统计面板里的「模型健康」也要跟着刷新，避免卡片与列表显示不一致
            await fetchStats()
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '连通性测试失败')
            notify('error', errorMessage.value)
        } finally {
            testingId.value = null
        }
    }

    const handleImportEnv = async (): Promise<void> => {
        importing.value = true
        errorMessage.value = ''
        noticeMessage.value = ''
        try {
            const result = await importAiModelFromEnv()
            if (result.code !== 200) {
                throw new Error(result.message || '导入环境变量配置失败')
            }
            noticeMessage.value = result.message || '环境变量配置已导入'
            notify('primary', noticeMessage.value)
            await fetchModels()
            await fetchStats()
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '导入环境变量配置失败')
            notify('error', errorMessage.value)
        } finally {
            importing.value = false
        }
    }

    const saveSettings = async (): Promise<void> => {
        savingSettings.value = true
        errorMessage.value = ''
        try {
            const result = await updateAiSettings({ ...settings })
            if (result.code !== 200) {
                throw new Error(result.message || '保存用量策略失败')
            }
            Object.assign(settings, result.data || settings)
            noticeMessage.value = '用量策略已保存'
            notify('primary', '用量策略已保存')
        } catch (error) {
            errorMessage.value = getRequestErrorMessage(error, '保存用量策略失败')
            notify('error', errorMessage.value)
        } finally {
            savingSettings.value = false
        }
    }

    onMounted(() => {
        void loadAll()
    })
</script>

<style lang="less" scoped>
    .ai-manage {
        width: 100%;

        .ai-overview {
            width: 100%;
        }

        .ai-panel {
            width: 100%;
            padding: 20px 22px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: var(--admin-radius, 18px);
            background: var(--admin-surface, var(--bgColor1));
            box-shadow: var(--admin-shadow-sm, @shadow-s);
        }

        // 提示条：成功与失败都保持一行，不遮挡页面主体
        .ai-banner {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid transparent;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.5;

            &.is-error {
                border-color: color-mix(in srgb, #fa5247 32%, transparent);
                background: color-mix(in srgb, #fa5247 10%, transparent);
                color: #d8412f;
            }

            &.is-success {
                border-color: color-mix(in srgb, #1fb4a2 30%, transparent);
                background: color-mix(in srgb, #1fb4a2 10%, transparent);
                color: #14897b;
            }
        }

        .ai-panel-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 16px;
        }

        .ai-panel-heading {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        // 模型卡片：网格排布，默认模型用主色描边突出
        .ai-model-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 14px;
        }

        .ai-model-card {
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 16px 18px;
            border: 1px solid var(--admin-line, var(--gray1));
            border-radius: 16px;
            background: var(--admin-surface-soft, var(--bgColor2));
            transition: border-color @animatb, box-shadow @animatb, transform @animatb;

            &:hover {
                border-color: color-mix(in srgb, var(--pcolor) 34%, var(--admin-line, var(--gray1)));
                box-shadow: var(--admin-shadow-md, @shadow-m);
                transform: translateY(-1px);
            }

            &.is-default {
                border-color: color-mix(in srgb, var(--pcolor) 42%, transparent);
                background:
                    linear-gradient(180deg, color-mix(in srgb, var(--pcolor) 8%, transparent), transparent 120px),
                    var(--admin-surface-soft, var(--bgColor2));
            }

            &.is-disabled {
                opacity: 0.72;
            }
        }

        .ai-model-card-head {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .ai-model-avatar {
            display: grid;
            width: 38px;
            height: 38px;
            flex: none;
            place-items: center;
            border-radius: 12px;
            background: var(--bgColor3);
            color: var(--gray7);
            font-size: 16px;
            font-weight: 700;

            &.is-default {
                background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
                color: #fff;
                box-shadow: 0 6px 14px var(--pcolor3);
            }
        }

        .ai-model-card-title {
            min-width: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;

            strong {
                overflow: hidden;
                color: var(--gray);
                font-size: 14px;
                font-weight: 650;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        }

        .ai-model-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .ai-model-facts {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px 14px;
            margin: 0;
        }

        // 模型健康：延迟、成功率与最近测试时间
        .ai-model-health {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px 14px;
            padding: 10px 12px;
            border-radius: 12px;
            background: var(--admin-surface-soft, var(--bgColor2));
            font-size: 12px;
            color: var(--gray7);
        }

        .ai-model-health-item {
            display: inline-flex;
            align-items: baseline;
            gap: 5px;

            strong {
                color: var(--gray);
                font-weight: 600;
            }
        }

        .ai-model-fact {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;

            &.is-wide {
                grid-column: 1 / -1;
            }

            dt {
                color: var(--gray7);
                font-size: 11px;
                letter-spacing: 0.02em;
            }

            dd {
                margin: 0;
                overflow: hidden;
                color: var(--gray);
                font-size: 13px;
                text-overflow: ellipsis;
                white-space: nowrap;

                &.is-mono {
                    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
                    font-size: 12px;
                    color: var(--gray8);
                }
            }
        }

        .ai-model-remark {
            margin: 0;
            padding: 8px 10px;
            border-radius: @radius-s;
            background: color-mix(in srgb, var(--pcolor) 7%, transparent);
            color: var(--gray7);
            font-size: 12px;
            line-height: 1.5;
        }

        .ai-model-card-foot {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: auto;
            padding-top: 2px;
        }

        // 策略与调用记录两栏并排
        .ai-columns {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: @space-l;
            width: 100%;
            align-items: start;
        }

        // 用量统计：三个时间窗口并排
        .ai-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: @space-m;
        }

        .ai-stats-window {
            padding: 16px 18px;
            border-radius: 14px;
            background: var(--admin-surface-soft, var(--bgColor2));
            border: 1px solid var(--admin-line, var(--gray1));
        }

        .ai-stats-window-title {
            margin: 0 0 6px;
            font-size: 12px;
            color: var(--gray7);
        }

        .ai-stats-window-total {
            margin: 0 0 12px;
            font-size: 26px;
            font-weight: 700;
            color: var(--gray);
            line-height: 1.1;

            span {
                margin-left: 6px;
                font-size: 12px;
                font-weight: 400;
                color: var(--gray7);
            }
        }

        .ai-stats-window-facts {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;

            li {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 12px;
                font-size: 13px;
                color: var(--gray7);

                strong {
                    color: var(--gray);
                    font-weight: 600;
                }
            }
        }

        // 按模型 / 按功能两栏
        .ai-stats-breaks {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: @space-l;
            margin-top: @space-l;
        }

        .ai-trend-chart {
            margin-top: 4px;
            width: 100%;
            min-width: 0;
        }

        .ai-stats-break {
            min-width: 0;
        }

        .ai-stats-break-title {
            margin: 0 0 10px;
            font-size: 13px;
            font-weight: 600;
            color: var(--gray);
        }

        .ai-stats-list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 4px;

            li {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 11px 12px;
                border-radius: 12px;
                transition: background @animatb;

                &:hover {
                    background: var(--admin-surface-soft, var(--bgColor2));
                }
            }
        }

        .ai-stats-list-main {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;

            strong {
                color: var(--gray);
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            span {
                font-size: 12px;
                color: var(--gray7);
            }
        }

        .ai-stats-list-side {
            flex: none;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
            font-size: 12px;
            color: var(--gray7);
        }

        .ai-policy {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .ai-policy-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding: 14px 2px;
            border-bottom: 1px dashed var(--admin-line, var(--gray1));

            &:last-child {
                border-bottom: 0;
            }
        }

        .ai-policy-copy {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;

            strong {
                color: var(--gray);
                font-size: 13px;
                font-weight: 600;
            }

            span {
                color: var(--gray7);
                font-size: 12px;
                line-height: 1.5;
            }
        }

        .ai-policy-input {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: none;

            input {
                width: 96px;
                padding: 7px 10px;
                border: 1px solid var(--admin-line, var(--gray1));
                border-radius: @radius-s;
                background: var(--bgColor1);
                color: var(--gray);
                font-size: 13px;
                text-align: right;
                transition: border-color @animatb, box-shadow @animatb;

                &:focus {
                    outline: none;
                    border-color: var(--pcolor);
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
                }
            }

            span {
                color: var(--gray7);
                font-size: 12px;
            }
        }

        .ai-policy-tip {
            margin: 14px 0 0;
            padding: 10px 12px;
            border-radius: @radius-s;
            background: color-mix(in srgb, var(--pcolor) 7%, transparent);
            color: var(--gray7);
            font-size: 12px;
            line-height: 1.6;

            strong {
                color: var(--pcolor);
                font-weight: 650;
            }
        }

        // 调用记录：紧凑列表
        .ai-usage-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
            max-height: 420px;
            overflow-y: auto;
        }

        .ai-usage-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 11px 12px;
            border-radius: 12px;
            transition: background @animatb;

            &:hover {
                background: var(--admin-surface-soft, var(--bgColor2));
            }
        }

        .ai-usage-dot {
            width: 8px;
            height: 8px;
            flex: none;
            border-radius: 50%;
            background: var(--gray6);

            &.is-success {
                background: var(--scolor, #1fb4a2);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--scolor, #1fb4a2) 16%, transparent);
            }

            &.is-failed {
                background: var(--ecolor, #fa5247);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--ecolor, #fa5247) 16%, transparent);
            }

            &.is-denied {
                background: var(--wcolor, #ffaa1a);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--wcolor, #ffaa1a) 16%, transparent);
            }
        }

        .ai-usage-main {
            min-width: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .ai-usage-title {
            display: flex;
            align-items: center;
            gap: 8px;

            strong {
                color: var(--gray);
                font-size: 13px;
                font-weight: 600;
            }
        }

        .ai-usage-meta {
            margin: 0;
            overflow: hidden;
            color: var(--gray7);
            font-size: 12px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .ai-usage-side {
            display: flex;
            flex: none;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
        }

        .ai-usage-status {
            padding: 2px 10px;
            border-radius: @radius-r;
            background: color-mix(in srgb, var(--pcolor) 9%, transparent);
            color: var(--pcolor);
            font-size: @size-s;

            &.is-failed {
                background: color-mix(in srgb, var(--ecolor, #fa5247) 10%, transparent);
                color: var(--ecolor, #fa5247);
            }

            &.is-denied {
                background: color-mix(in srgb, var(--wcolor, #ffaa1a) 12%, transparent);
                color: var(--wcolor, #ffaa1a);
            }
        }

        .ai-usage-time {
            color: var(--gray7);
            font-size: 11px;
            font-variant-numeric: tabular-nums;
        }

        // 接入模型弹窗表单













        @media (max-width: 1100px) {
            .ai-columns {
                grid-template-columns: 1fr;
            }

            .ai-stats-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .ai-stats-breaks {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 720px) {
            .ai-model-grid {
                grid-template-columns: 1fr;
            }

            .ai-stats-grid {
                grid-template-columns: 1fr;
            }

            .ai-form-pair {
                grid-template-columns: 1fr;
            }

            .ai-policy-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
        }
    }

.ai-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: min(64vh, 620px);
    overflow-y: auto;
    padding-right: 6px;
    padding-bottom: 4px;
    scrollbar-width: thin;
}

// 细滚动条：弹窗内容较长时不要抢视觉焦点
.ai-form::-webkit-scrollbar {
    width: 6px;
}

.ai-form::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: var(--gray4, var(--gray3));
}

.ai-form::-webkit-scrollbar-track {
    background: transparent;
}
.ai-form-hint {
    margin: 0;
    padding: 10px 12px;
    border-radius: @radius-s;
    background: color-mix(in srgb, var(--pcolor) 7%, transparent);
    color: var(--gray7);
    font-size: 12px;
    line-height: 1.6;
}
.ai-form-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.ai-form-group-title {
    margin: 0;
    padding-left: 10px;
    border-left: 3px solid var(--pcolor);
    color: var(--gray);
    font-size: 13px;
    font-weight: 650;
    line-height: 1.2;
}
.ai-form-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.ai-form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;

    input {
        width: 100%;
        box-sizing: border-box;
        padding: 9px 12px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: @radius-s;
        background: var(--bgColor1);
        color: var(--gray);
        font-size: 13px;
        transition: border-color @animatb, box-shadow @animatb;

        &::placeholder {
            color: var(--gray7);
        }

        &:focus {
            outline: none;
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--pcolor) 16%, transparent);
        }
    }
}
.ai-form-label {
    color: var(--gray8);
    font-size: 13px;
    font-weight: 550;

    i {
        margin-left: 3px;
        color: var(--ecolor, #fa5247);
        font-style: normal;
    }
}
.ai-form-tip {
    color: var(--gray7);
    font-size: 11px;
    line-height: 1.5;
}
.ai-form-secret {
    display: flex;
    align-items: center;
    gap: 8px;

    input {
        flex: 1;
    }
}
.ai-form-secret-toggle {
    flex: none;
    padding: 0 10px;
    height: 34px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: @radius-s;
    background: var(--bgColor2);
    color: var(--gray8);
    font-size: 12px;
    cursor: pointer;
    transition: color @animatb, border-color @animatb;

    &:hover {
        border-color: var(--pcolor);
        color: var(--pcolor);
    }
}
.ai-form-switches {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
}
.ai-form-switch {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--gray8);
    font-size: 13px;
}
</style>
