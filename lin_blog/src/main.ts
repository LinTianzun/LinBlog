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

// 启动时恢复用户选择的主题预设（设置 data-theme 与 data-theme-preset）
initThemePreset()

//  路由
import router from './router'

const pinia = createPinia()
const app = createApp(App)

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
router.isReady().then(() => app.mount('#app'))
