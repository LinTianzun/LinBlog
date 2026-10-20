<template>
    <div class="editor">
        <yk-affix :offset="64" @change="toolbarTop">
            <Toolbar class="editor-toolbar" :class="{istop:top }" :editor="editorRef" :defaultConfig="toolbarConfig"
                :mode="mode" />
        </yk-affix>
        <div class="editor-main">
            <slot></slot>
            <!-- <forms :classify="0" @formData="formData" /> -->
            <Editor v-model="valueHtml" :defaultConfig="editorConfig" :mode="mode" @onChange="onChange"
                @onCreated="handleCreated" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { IToolbarConfig, IDomEditor } from '@wangeditor/editor'
import './style.less'
import { colors } from './colors.js'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'

const mode = 'default'

// 工具栏固定状态
const top = ref(false)

const toolbarTop = (value: boolean): void => {
    top.value = value
}

const emits = defineEmits<{
    (event: 'editors', content: string): void
}>()

// 获取编辑器内容
const onChange = (): void => {
    emits('editors', valueHtml.value)
}

// 编辑器实例
const editorRef = shallowRef<IDomEditor | null>(null)

// 内容 HTML
const valueHtml = ref('<p>hello</p>')

// 工具栏配置
const toolbarConfig: Partial<IToolbarConfig> = {}

// 菜单配置
const editorConfig = {
    MENU_CONF: {
        color: {
            colors,
        },
        bgColor: {
            colors,
        },
        uploadImage: {
            // 后续在这里配置真实的图片上传接口
        },
        codeSelectLang: {
            codeLangs: [
                { text: 'CSS', value: 'css' },
                { text: 'HTML', value: 'html' },
                { text: 'XML', value: 'xml' },
            ],
        },
    },
}

// 编辑器创建完成
const handleCreated = (editor: IDomEditor): void => {
    editorRef.value = editor
}

// 组件销毁时销毁编辑器
onBeforeUnmount(() => {
    const editor = editorRef.value
    if (!editor) return

    editor.destroy()
    editorRef.value = null
})
</script>


<style lang="less" scoped>
    .editor {
        width: 100%;

        &-toolbar {
            /* overflow: hidden; */
            /* border-radius: @radius-m; */
            /* width: 100%; */
        }

        &-main {
            width: 100%;
            height: 100%;
            margin-top: @space-l;
            height: calc(100vh * 0.4);
            background: @bg-color-l;
            border-radius: @radius-m;
            padding: @space-xl;
            display: flex;
            flex-direction: column;
            /* align-items: center; */
            overflow-y: hidden;

            @media (max-height: 850px) {
                height: calc(100vh * 0.65);
            }

            @media (min-height: 851px) {
                height: calc(100vh * 0.75);
            }
        }
    }

    .istop {
        width: 100%;
        box-shadow: @shadow-m ;
        /* border: 1px solid @line-color-m; */
    }
</style>
<style lang="less">
    .w-e-bar {
        width: 100%;
        justify-content: center;
        border-radius: @radius-s;
        /* overflow: hidden; */
    }
</style>