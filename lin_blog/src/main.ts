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
    .mount('#app')