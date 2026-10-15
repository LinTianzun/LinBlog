import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { YikeResolver } from '@yike-design/resolver'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [YikeResolver()] }),
    Components({ resolvers: [YikeResolver({ sideEffect: true })] }),
  ],

  // 前端 API 代理：将 /api 请求转发到 Express 后端
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
    },
  },

  css: {
    // CSS 预处理器
    preprocessorOptions: {
      less: {
        charset: false,
        additionalData:
          '@import "@yike-design/ui/es/components/styles/basis.less";',
      },
    },
  },
})
