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

  build: {
    // 编辑器/图表已按需异步加载；剩余超阈值的是懒加载 vendor 包，属正常体积
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 大体积第三方库单独分包，避免页面级 chunk 被编辑器/图表撑大
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
            if (id.includes('@yike-design')) return 'yike-design'
          }
        },
      },
    },
  },
})
