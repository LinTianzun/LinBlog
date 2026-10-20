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
                <yk-text-area v-model="formData.introduce" clearable placeholder="请输入简介" :auto-size="raws"
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
import { ref, watch, onMounted, computed } from 'vue'
import { subset, mklabel } from '../../mock/data.ts'
import '@wangeditor/editor/dist/css/style.css'

type FormData = {
    title: string
    subsetId: number | undefined
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type SubsetOption = {
    id: number
    name: string
}

type LabelOption = {
    id: number
    name: string
}

const props = defineProps({
    classify: {
        type: Number,
        default: 0,
    },
})

const emits = defineEmits<{
    formData: [data: FormData]
}>()

const formData = ref<FormData>({
    title: '',
    subsetId: undefined,
    label: [],
    introduce: '',
    cover: '',
    classify: props.classify,
})

// 简介行数
const raws = computed(() => {
    if (props.classify === 1) {
        return {
            minRows: 18,
            maxRows: 18,
        }
    }

    return {
        minRows: 4,
        maxRows: 10,
    }
})

// 分类名称
const subsetName = ref<string>('')

// 分类列表
const subsetList = ref<SubsetOption[]>([])

const getSubset = () => {
    subsetList.value = subset.data.list.map((item: { id: string | number; name: string }) => ({
        id: Number(item.id),
        name: String(item.name),
    }))
}

// 选择分类
const subsetSelect = (value: string | number) => {
    const id = Number(value)
    if (!Number.isFinite(id)) return

    formData.value.subsetId = id

    const selectedSubset = subsetList.value.find(item => item.id === id)
    if (selectedSubset) {
        subsetName.value = selectedSubset.name
    }
}

// 标签
const tags = ref<LabelOption[]>([])
const labelArr = ref<string[]>([])
const inputLabel = ref<string>('')

const getTags = () => {
    tags.value = mklabel.data.list.map((item: { id: string | number; name: string }) => ({
        id: Number(item.id),
        name: String(item.name),
    }))
    labelArr.value = tags.value.map((item: LabelOption) => item.name)
}

// 标签弹窗
const visible = ref(false)

const showModal = () => {
    visible.value = true
}

// 新增标签
const addLabel = () => {
    const label = inputLabel.value.trim()

    if (label && formData.value.label.length < 3) {
        if (!formData.value.label.includes(label)) {
            formData.value.label.push(label)
            labelArr.value = labelArr.value.filter(item => item !== label)
        }
    }

    inputLabel.value = ''
}

// 选择标签
const selectLabel = (label: string) => {
    if (
        formData.value.label.length < 3 &&
        !formData.value.label.includes(label)
    ) {
        formData.value.label.push(label)
        labelArr.value = labelArr.value.filter(item => item !== label)
    }
}

// 删除标签
const deleteLabel = (label: string) => {
    formData.value.label = formData.value.label.filter(
        item => item !== label
    )

    if (!labelArr.value.includes(label)) {
        labelArr.value.push(label)
    }
}

// 封面
const fileUrl = ref<unknown[]>([])

// 表单数据变化时通知父组件
watch(
    formData,
    (data) => {
        emits('formData', data)
    },
    { deep: true }
)

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