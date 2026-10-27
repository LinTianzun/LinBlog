import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { YikeResolver } from '@yike-design/resolver'
import { createHtmlPlugin } from "vite-plugin-html";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [YikeResolver()] }),
    Components({ resolvers: [YikeResolver({ sideEffect: true })] }),
    vueDevTools(),
    createHtmlPlugin({}),
  ],

  // 前端 API 代理：将 /api 请求转发到 Express 后端
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
    },
  },

  optimizeDeps: {
    // editor-for-vue 是深度依赖，默认会被预打包并内联 slimEditor 的副本；
    // 一旦内联，改动裁剪版后 dev 下仍跑旧副本，必须强制重新预打包。
    exclude: ["@wangeditor/editor-for-vue"],
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

  resolve: {
    alias: {
      // 用按需装配的裁剪版替换官方整包 editor：
      // 整包预打包了 video / 上传图片等全部模块（源码约 800KB），无法 tree-shake。
      // editor-for-vue 只用到 createEditor / createToolbar / DomEditor，
      // 裁剪版提供同签名导出，因此 Vue 封装层无需改动。
      "@wangeditor/editor": path.resolve(
        __dirname,
        "src/components/editor/slimEditor.ts",
      ),
    },
  },

  build: {
    // 剩余超阈值的只有 editor（编辑器自身体积，且仅在编辑页按需加载）；
    // yike-design 与 echarts 已压到阈值内，故阈值收紧到 600 以便后续回归能报警。
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 大体积第三方库单独分包，避免页面级 chunk 被编辑器/图表撑大
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("echarts") || id.includes("zrender"))
              return "echarts";
            if (id.includes("@yike-design")) return "yike-design";
          }
        },
      },
    },
  },
});
