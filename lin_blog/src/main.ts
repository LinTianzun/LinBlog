import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

//  引入全局样式
import '@yike-design/ui/es/index.less'

//  引入全局方法
import { YkMessage, YkNotification } from '@yike-design/ui'
import { libraryIcons } from './utils/libraryIcons'

import './style.less'
import './style/theme-presets.less'
import './style/portal.less'
import './style/admin.less'
import { initThemePreset } from './utils/themePreset'
import { ensureServerClock } from './utils/serverClock'
import { registerServiceWorker } from './utils/pwa'
import { installModalA11y } from './utils/modalA11y'

// 启动时恢复用户选择的主题预设（设置 data-theme 与 data-theme-preset）
initThemePreset()

// 定时发布等"本地时间"语义以服务器时区为准，启动时先对齐一次
void ensureServerClock()

//  路由
import router from './router'

const pinia = createPinia()
const app = createApp(App)

// 全局兜底：未被 ErrorBoundary 覆盖的组件异常（如异步生命周期、事件处理器）
// 记录到控制台，避免静默失败；界面层由 ErrorBoundary 负责展示可恢复卡片。
app.config.errorHandler = (err, _instance, info) => {
    console.error('[App] 未处理的组件异常：', info, err)
}

// yike 组件内部会在模板里直接用图标（见 utils/libraryIcons.ts）。
// 过去用 app.use(Icon) 整包注册会拉入 700+ 图标，改为只注册库内部真正引用的那些。
for (const [name, component] of Object.entries(libraryIcons)) {
    app.component(name, component)
}

app.config.globalProperties.$notification = YkNotification
app.config.globalProperties.$message = YkMessage
app
    .use(pinia)
    .use(router)

// 等路由解析完成后再挂载，避免占位路由导致顶栏在匿名页短暂渲染并发出 401 请求
router.isReady().then(() => {
    app.mount('#app')
    // yk-modal 默认缺少对话框语义与焦点管理，挂载后统一增强
    installModalA11y()
})

// 仅生产构建注册：避免 Vite HMR 请求被离线缓存接管
registerServiceWorker()
