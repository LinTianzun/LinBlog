<template>
    <div class="edit-gallery">
        <div class="edit-gallery-topbar">
            <p class="edit-gallery-topbar-title">新建摄影图库</p>
            <yk-space>
                <yk-button type="secondary" @click="backHome">取消</yk-button>
                <yk-button>发布</yk-button>
            </yk-space>
        </div>

        <yk-space class="edit-gallery-body">
            <editphoto style="width: 70%;" />
            <div class="edit-gallery-body-tag">
                <forms :classify="1" />
            </div>
        </yk-space>

    </div>
</template>

<script lang="ts" setup>
    import editphoto from '../components/gallery/editPhoto.vue'
    import forms from '../components/forms/forms.vue'
    import { useRouter } from 'vue-router'

    const router = useRouter();

    //  返回总览
    const backHome = () => {
        router.push('/')
    }
</script>

<style lang="less" scoped>
    .edit-gallery {
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


            /* height: 100px; */
            /* margin-top: 10px;
            background: @bg-color-l; */

            &-tag {
                width: 35%;
                /* width: 100%; */

                background: @bg-color-l;
                border-radius: @radius-m;
                flex: noen;
                display: flex;
                padding: @space-l @space-xl;
                /* justify-content: center; */
            }
        }
    }
</style>