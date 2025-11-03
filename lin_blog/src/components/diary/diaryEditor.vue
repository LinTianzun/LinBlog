<template>
    <div class="diary-editor">
        <div class="diary-editor-top">
            <div class="diary-editor-top-form">
                <input type="text" class="diary-editor-top-title" placeholder="请输入标题" v-model="diaryForm.title">

                <yk-popover title="选择天气" placement="bottomRight">
                    <template #content>
                        <yk-space wrap :size="[32,20]" style="padding: 16px 8px;">
                            <div class="diary-editor-top-weather" v-for="(item, index) in weathers" :key="index"
                                :class="{selected:swWeatherId===item.id}">
                                <img :src="item.iconUrl" @click="selectWeather(item)" alt="">
                            </div>
                        </yk-space>
                    </template>

                    <img :src="seWeather" alt="">
                </yk-popover>
            </div>

            <yk-text-area class="diary-editor-top-content" v-model="diaryForm.content" placeholder="请输入..."
                :max-length="1600" clearable :auto-size="{
                    minRows: 20,
                    maxRows: 20,
                  }">
            </yk-text-area>

            <div class="diary-editor-top-picture">
                <yk-upload :upload-url="uploadUrl" :limit="dynamicLimit" :file-list="diaryForm.picture"
                    accept="image/*"></yk-upload>
            </div>
        </div>


        <div class="diary-editor-foot">
            <yk-space size="s">
                <yk-button type="secondary">取消</yk-button>
                <yk-button>新建笔记</yk-button>
            </yk-space>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted, onBeforeUnmount } from 'vue'
    import { weathers } from '../../utils/weather.ts'

    type DiaryForm = {
        title?: string
        weatherId: number
        content?: string
        picture?: string
    }

    const diaryForm = ref < DiaryForm > ({ id: 0 })

    //  当前天气
    const seWeather = ref()
    const swWeatherId = ref()
    //  选择天气
    const selectWeather = (e) => {
        seWeather.value = e.iconUrl
        swWeatherId.value = e.id
    }

    //  日记内容
    const diaryContent = ref()

    // 动态 limit
    const dynamicLimit = ref < number > (4); // 默认值为 4

    // 更新 limit 的方法
    const updateLimit = () => {
        dynamicLimit.value = window.innerHeight <= 850 ? 4 : 9; // 小于等于 850px 时 limit=4，否则 limit=6
    };

    //  日记图片
    //  上传地址
    // const uploadUrl = 'https://www.huohuo90.com:3005/upload'
    const fileUrl = ref([])

    onMounted(() => {
        selectWeather({
            id: 0,
            name: '晴天',
            iconUrl: '/src/assets/weather/qing.svg'
        });

        // 初始化 limit 并监听窗口大小变化
        updateLimit();
        window.addEventListener('resize', updateLimit);
    })

    onBeforeUnmount(() => {
        // 清理事件监听器
        window.removeEventListener('resize', updateLimit);
    });
</script>

<style lang="less" scoped>
    .diary-editor {
        width: 100%;
        height: calc(100vh * 0.76);
        background: @bg-color-l;
        border-radius: @radius-m;
        overflow: hidden;

        &-top {
            padding: @space-xl;

            &-form {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            &-title {
                font-size: @size-xl;
                font-weight: bold;
                color: @font-color-l;
                padding-bottom: @space-m;
            }

            &-content {
                height: calc(100vh * 0.45);

                @media (max-height: 850px) {
                    height: calc(100vh * 0.45);
                    /* 屏幕高度 ≤ 850px 时使用这个高度 */
                }

                @media (min-height: 955px) {
                    height: calc(100vh * 0.55);
                    /* 屏幕高度 > 850px 时使用另一个固定高度，例如 500px */
                }
            }

            &-picture {
                padding-top: @space-xl;
                /* width: 100%; */
                /* height: 20px; */
                /* background-color: green; */
            }

            .selected {
                &::before {
                    position: absolute;
                    bottom: -4px;
                    left: 50%;
                    content: '';
                    display: block;
                    width: 6px;
                    height: 6px;
                    border-radius: 3px;
                    background: @pcolor;
                }
            }


            img {
                width: 20px;
                margin-left: @space-s;
            }
        }

        &-foot {
            width: 100%;
            position: absolute;
            right: 12px;
            bottom: 8px;
            display: flex;
            justify-content: end;
            padding: @space-m;
            border-top: 1px solid @line-color-m;
        }

        input {
            border: none;
            background: transparent;
            outline: none;

            &::placeholder {
                color: @gray-5;
            }
        }
    }
</style>
<style lang="less">
    .diary-editor {
        .yk-text-area {
            background-color: transparent;
            border: none;
            border-radius: 0;
            padding: 0;
            /* border-bottom: 1px solid @line-color-m; */
        }

        .yk-text-area__inner {
            font-size: @size-m;
            line-height: 1.5;

            &::placeholder {
                color: @gray-5;
            }
        }
    }
</style>