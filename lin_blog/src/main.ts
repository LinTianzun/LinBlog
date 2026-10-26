import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

//  引入全局样式
import '@yike-design/ui/es/index.less'

//  引入全局方法
import { YkMessage, YkNotification } from '@yike-design/ui'
//  引入图标库
import Icon from '@yike-design/ui/es/components/svg-icon'

import './style.less'
import './style/theme-presets.less'
import './style/portal.less'
import { initThemePreset } from './utils/themePreset'

// 启动时恢复用户选择的主题预设（设置 data-theme 与 data-theme-preset）
initThemePreset()

//  路由
import router from './router'

const pinia = createPinia()
const app = createApp(App)

app.config.globalProperties.$notification = YkNotification
app.config.globalProperties.$message = YkMessage
app
    .use(pinia)
    .use(router)
    .use(Icon)

// 等路由解析完成后再挂载，避免占位路由导致顶栏在匿名页短暂渲染并发出 401 请求
router.isReady().then(() => app.mount('#app'))
