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
    // import forms from '../../components/forms/forms.vue'
    import { onBeforeUnmount, ref, shallowRef, onMounted, watch } from 'vue'
    import './style.less' // 引入 css
    import { colors } from './colors.js'
    import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
    import { IToolbarConfig } from '@wangeditor/editor'

    //  工具固定
    const top = ref(false)
    const toolbarTop = (e) => {
        // console.log(e)
        top.value = e
    }

    const emits = defineEmits(['editors'])

    //  获取内容
    const onChange = () => {
        emits('editors', valueHtml.value)
        // console.log(valueHtml.value)
    }

    // 编辑器实例，必须用 shallowRef
    const editorRef = shallowRef()

    // 内容 HTML
    const valueHtml = ref('<p>hello</p>')
    //  工具栏配置
    const toolbarConfig = {}
    //  菜单配置
    const editorConfig = {
        MENU_CONF: {
            color: {
                colors,
            },
            bgColor: {
                colors,
            },
            uploadImage: {
                // server: '/api/upload',
                // async customUpload(file: File, insertFn: InsertFnType) {
                //     // const formData = new FormData()
                //     // formData.append('file', 'cover')
                //     // formData.append('id', '123')
                //     // uploadApi(formData).then(() => {
                //     // })
                //     insertFn(url, alt, href)
                // },
            },
            codeSelectLang: {
                // 代码语言
                codeLangs: [
                    { text: 'CSS', value: 'css' },
                    { text: 'HTML', value: 'html' },
                    { text: 'XML', value: 'xml' },
                    // 其他
                ],
            }
        },
    }


    // 模拟 ajax 异步获取内容
    // onMounted(() => {

    // })

    // 组件销毁时，也及时销毁编辑器
    onBeforeUnmount(() => {
        const editor = editorRef.value
        if (editor == null) return
        editor.destroy()
    })

    const handleCreated = (editor) => {
        editorRef.value = editor // 记录 editor 实例，重要！
        // console.log(editor.getAllMenuKeys())
    }
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