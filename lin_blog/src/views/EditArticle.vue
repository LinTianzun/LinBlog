<template>
    <div class="edit-article">
        <div class="edit-article-topbar">
            <p class="edit-article-topbar-title">新建博客文章</p>
            <yk-space align="center">
                <yk-text type="secondary">{{saveMoment}}</yk-text>
                <yk-button type="secondary" @click="submitArticle(0)">保存</yk-button>
                <yk-button @click="submitArticle(1)">发布</yk-button>
            </yk-space>
        </div>

        <yk-space class="edit-article-body">
            <editor @editors="editorData">
                <forms :classify="0" @formData="formData"></forms>
            </editor>
        </yk-space>

    </div>
</template>

<script lang="ts" setup>
    import { ref, watch, onMounted, computed, shallowRef, onBeforeUnmount, getCurrentInstance } from 'vue'
    import editor from '../components/editor/editor.vue'
    import forms from '../components/forms/forms.vue'
    import { momentDay } from '../utils/moment.ts'

    const proxy = getCurrentInstance()?.proxy

    const articleData = ref()

    //  收取form内容
    const form = ref()
    const formData = (e) => {
        // console.log(e)
        form.value = e
    }

    const editors = ref()
    //  收取editor内容
    const editorData = (e) => {
        // console.log(e)
        editors.value = e
    }

    const saveMoment = ref()

    //  发布(1)or保存(0) 内容
    const submitArticle = (e) => {
        if (form.value && form.value.title) {
            if (e == 0) {
                let nowDate = new Date()
                saveMoment.value = momentDay(nowDate) + ' 保存'
            }

            let request = {
                ...form.value,
                ...{
                    content: editors.value,
                    state: e,
                    classify: 0,
                    moment: new Date(),
                }
            }
            console.log(request)
        } else {
            proxy.$message({ type: 'warning', message: '请输入标题' })
        }
    }

</script>

<style lang="less" scoped>
    .edit-article {
        padding: @space-xl;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;


        &-topbar {
            width: 85%;
            border-radius: @radius-m;
            background: @bg-color-l;
            padding: @space-l @space-xl;
            margin-bottom: @space-l;
            display: flex;
            justify-content: space-between;
            align-items: center;

            &-title {
                .font-xl();
                font-weight: 600;
                user-select: none;
            }
        }

        &-body {
            width: 85%;
            /* background: @bg-color-l; */
            border-radius: @radius-m;
            /* flex: noen; */
            display: flex;
            flex-direction: column;
            /* padding: 3% 10%; */
            align-items: center;
        }
    }
</style>