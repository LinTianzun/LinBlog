<template>
    <div class="forms" :class="{formsHeight:props.classify ? 0 : 1}">
        <yk-space dir="vertical" size="xl">
            <input type="text" class="forms-title" v-model="formData.title" placeholder="请输入标题">

            <yk-space style="width: 100%;align-items: center;">
                <div class="forms-subset">
                    <input type="text" v-model="subsetName" placeholder="选择分类" style="width: 100px;line-height: 28px;">
                    <IconDownOutline />
                    <yk-dropdown @selected="subsetSelect">
                        <yk-dropdown-item v-for="(item, index) in subsetList" :key="index"
                            :value="item.id">{{item.name}}</yk-dropdown-item>
                    </yk-dropdown>
                </div>
                <yk-space style="align-items: center;width: 100%;" size="s">
                    <yk-tag v-for="(tag, index) in formData.label" :key="index" class="tag" shape="round"
                        @close="deleteLabel(tag)" closeable>
                        {{ tag }}
                    </yk-tag>
                    <yk-text @click="showModal" style="cursor: pointer;white-space: nowrap;" type="third"
                        v-show="formData.label.length<3">
                        插入标签
                    </yk-text>
                </yk-space>

            </yk-space>

            <div :class="{introduce:props.classify ? 0 : 1}">
                <yk-text-area v-model="val" clearable placeholder="请输入简介" :auto-size="raws"
                    :max-length="800"></yk-text-area>
            </div>

            <!-- <div v-if="props.classify == 0">

            </div> -->
        </yk-space>
        <div class="forms-cover" v-if="props.classify == 0">
            <yk-upload :limit="1" :file-list="fileUrl" desc="封面 800 X 600" accept="image/*"></yk-upload>
        </div>
    </div>

    <yk-modal v-model="visible" title="标签" size="s" :show-footer="false">
        <yk-space dir="vertical" size="l">
            <yk-input v-model="inputLabel" @submit="addLabel" :limit="5" placeholder="请输入标签回车确定" style="width: 280px;"
                clearable></yk-input>
            <yk-space size="s">
                <yk-tag v-for="(tag, index) in formData.label" :key="index" class="tag" shape="round"
                    @close="deleteLabel(tag)" closeable>
                    {{ tag }}
                </yk-tag>
            </yk-space>
            <yk-space wrap size="s" style="padding-top: 8px;">
                <yk-tag v-for="(tag, index) in labelArr" :key="index" class="tag" shape="round" style="cursor: pointer;"
                    @click="selectLabel(tag)">
                    {{ tag }}
                </yk-tag>
            </yk-space>
        </yk-space>
    </yk-modal>
</template>

<script lang="ts" setup>
    import { ref, watch, onMounted, computed, shallowRef, onBeforeUnmount } from 'vue'
    import { subset, mklabel } from '../../mock/data.ts'
    import { LabelData } from '../../utils/interface.ts'
    import '@wangeditor/editor/dist/css/style.css' // 引入 css
    import { Editor, Toolbar } from '@wangeditor/editor-for-vue'

    const props = defineProps({
        classify: {
            type: Number,
            default: 0,
        },
    })

    const emits = defineEmits(['formData'])

    const formData = ref({
        title: '',
        subsetId: undefined,
        label: [],   //  标签
        introduce: '',   //  简介
        cover: '',
        classify: props.classify
    })

    //  简介行数
    const raws = computed(() => {
        if (props.classify == 1) {
            return {
                minRows: 18,
                maxRows: 18,
            }
        } else {
            return {
                minRows: 4,
                maxRows: 10,
            }
        }
    })

    //  分类名称
    const subsetName = ref()

    //  获取分类
    const subsetList = ref()
    const getSubset = () => {
        subsetList.value = subset.data.list
        // console.log(subsetList.value)
    }

    //  选择分类
    const subsetSelect = (e) => {
        // console.log(e)
        formData.value.subsetId = e
        const subset = subsetList.value.find(item => item.id === e);
        if (subset) {
            subsetName.value = subset.name;
        }
    }

    //  标签
    //  所有标签
    const tags = ref([])
    const labelArr = ref([])
    const inputLabel = ref()
    const getTags = () => {
        tags.value = mklabel.data.list
        for (let i = 0; i < tags.value.length; i++) {
            labelArr.value.push(tags.value[i].name)
        }
        // console.log(labelArr.value)
    }

    //  标签弹窗
    const visible = ref < boolean > (false)
    const showModal = () => {
        visible.value = true
    }

    //  新增标签
    const addLabel = () => {
        if (inputLabel.value && formData.value.label.length < 3) {
            formData.value.label.push(inputLabel.value)
        }
        inputLabel.value = ''
        // console.log(labelArr.value)
    }
    //  选择标签
    const selectLabel = (e) => {
        if (formData.value.label.length < 3) {
            formData.value.label.push(e)
            labelArr.value = labelArr.value.filter(item => {
                return item != e
            })
        }
        // console.log(labelArr.value)
    }

    //  删除标签
    const deleteLabel = (e) => {
        labelArr.value.unshift(e)
        formData.value.label = formData.value.label.filter(item => {
            return item != e
        })
    }

    //  封面
    const fileUrl = ref([])

    watch(formData.value, (e) => {
        emits('formData', e)
    })


    onMounted(() => {
        getSubset()
        getTags()
    })

</script>

<style lang="less" scoped>
    .forms {
        position: relative;
        width: 100%;
        height: calc(100vh * 0.71);

        @media (max-height: 850px) {
            height: calc(100vh * 0.71);
        }

        @media (min-height: 851px) {
            height: calc(100vh * 0.798);
        }

        &-title {
            font-size: @size-xl;
            font-weight: bold;
            color: @font-color-l;
            align-items: center;
            /* padding-bottom: @space-m; */
        }

        &-subset {
            width: 100%;

            .yk-dropdown {
                position: absolute;
                top: 0;
                left: 0;
            }
        }

        .introduce {
            width: 100%;
            border-bottom: 1px solid @gray-2;
            padding-top: @space-xl;
        }

        &-cover {
            position: absolute;
            right: 0;
            top: 0;
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

    .formsHeight {
        height: auto;
        /* background: @bg-color-l; */

        /* @media (max-height: 850px) {
            height: calc(100vh * 0.6);
        }

        @media (min-height: 951px) {
            height: calc(100vh * 0.7);
        } */
    }
</style>
<style lang="less">
    .forms {
        .yk-dropdown__title {
            opacity: 0;
            height: 24px;
            width: 100px;
        }

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


        .yk-upload-picture,
        .yk-upload__picture-button {
            position: absolute;
            top: 0;
            right: 0;
            width: 160px;
            height: 120px;
        }
    }
</style>