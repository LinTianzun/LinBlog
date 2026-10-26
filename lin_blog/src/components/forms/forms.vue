<template>
    <div class="forms" :class="{formsHeight:props.classify ? 0 : 1}">
        <div class="forms-layout">
            <div class="forms-content">
                <input type="text" class="forms-title" v-model="formData.title" maxlength="150"
                    placeholder="请输入标题">

                <div class="forms-meta">
                    <yk-dropdown :title="subsetName || '选择分类'" type="secondary" size="s" trigger="click"
                        @selected="subsetSelect">
                        <yk-dropdown-item v-for="(item, index) in subsetList" :key="index"
                            :value="item.id">{{item.name}}</yk-dropdown-item>
                    </yk-dropdown>
                    <yk-space class="forms-tags" align="center" size="s">
                        <yk-tag v-for="(tag, index) in formData.label" :key="index" class="tag" shape="round"
                            @close="deleteLabel(tag)" closeable>
                            {{ tag }}
                        </yk-tag>
                        <yk-text @click="showModal" style="cursor: pointer;white-space: nowrap;" type="third"
                            v-show="formData.label.length<3">
                            插入标签
                        </yk-text>
                    </yk-space>
                </div>

                <div :class="{introduce:props.classify ? 0 : 1}">
                    <yk-text-area v-model="formData.introduce" clearable placeholder="请输入简介" :auto-size="raws"
                        :max-length="512"></yk-text-area>
                </div>
            </div>

            <div class="forms-cover" v-if="props.classify == 0">
                <span class="forms-cover-label">文章封面</span>
                <yk-upload :file-list="coverFileList" :upload-url="uploadUrl" :limit="1" :multiple="false"
                    accept="image/jpeg,image/png,image/webp,image/gif" :max-size="8 * 1024 * 1024"
                    desc="上传封面" @handle-success="handleCoverSuccess"
                    @handle-error="handleCoverError" @handle-delete="handleCoverDelete" />
                <p v-if="coverUploadError" class="forms-cover-error">
                    {{ coverUploadError }}
                </p>
            </div>
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
import { ref, watch, onMounted, computed, getCurrentInstance } from 'vue'
import { useSubsetStore } from '../../store/subset.ts'
import { useLabelStore } from '../../store/label.ts'
import { buildImageUploadUrl } from '../../utils/uploadUrl.ts'
import { getRequestErrorMessage } from '../../api/file.ts'

type FormData = {
    title: string
    subsetId: number | undefined
    subsetName?: string
    label: string[]
    introduce: string
    cover: string
    classify: number
}

type InitialFormData = Partial<FormData>

type SubsetOption = {
    id: number
    name: string
}

type LabelOption = {
    id: number
    name: string
}

type CoverFile = {
    name: string
    url: string
}

type UploadResponse = {
    data?: {
        url?: string
    }
    url?: string
}

const props = withDefaults(defineProps<{
    classify?: number
    initialData?: InitialFormData
}>(), {
    classify: 0,
    initialData: undefined,
})

const emits = defineEmits<{
    formData: [data: FormData]
}>()

type MessageProxy = {
    $message?: (options: {
        type: 'primary' | 'warning' | 'error' | 'success'
        message: string
    }) => void
}

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const subsetStore = useSubsetStore()
const labelStore = useLabelStore()

const formData = ref<FormData>({
    title: '',
    subsetId: undefined,
    label: [],
    introduce: '',
    cover: '',
    classify: props.classify,
})

const emitFormData = (): void => {
    emits('formData', {
        ...formData.value,
        label: [...formData.value.label],
    })
}

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

// 封面上传
const coverFileList = ref<CoverFile[]>([])
const coverUploadError = ref('')
// 每次上传前换取一次性票据：URL 里流通的是 5 分钟失效的短期票据，
// 不再是长期有效的登录 token（避免进入访问日志与浏览器历史）
const uploadUrl = ref('')
const ticketBusy = ref(false)

const refreshUploadUrl = async (): Promise<void> => {
    if (ticketBusy.value) return
    ticketBusy.value = true
    try {
        uploadUrl.value = await buildImageUploadUrl()
        coverUploadError.value = ''
    } catch (error) {
        coverUploadError.value = getRequestErrorMessage(error)
    } finally {
        ticketBusy.value = false
    }
}

const syncCoverFileList = () => {
    coverFileList.value = formData.value.cover
        ? [{ name: '文章封面', url: formData.value.cover }]
        : []
}

const handleCoverSuccess = (response: UploadResponse): void => {
    const url = response.data?.url || response.url
    if (!url) return

    coverUploadError.value = ''
    formData.value.cover = url
    coverFileList.value = [{ name: '文章封面', url }]
    // 票据按次消费，上传成功后换一张，避免下次上传拿到已用尽的票据
    void refreshUploadUrl()
}

const handleCoverError = (error: unknown): void => {
    let message = '封面上传失败，请确认后端服务已启动并重新登录后再试'

    if (typeof error === 'string' && error.trim()) {
        message = error
    } else if (typeof error === 'object' && error !== null) {
        const response = error as {
            error?: unknown
            message?: unknown
        }
        const responseMessage = response.error || response.message
        if (typeof responseMessage === 'string' && responseMessage.trim()) {
            message = responseMessage
        }
    }

    coverUploadError.value = message
    proxy?.$message?.({ type: 'error', message })
}

const handleCoverDelete = (): void => {
    coverUploadError.value = ''
    formData.value.cover = ''
    coverFileList.value = []
    void refreshUploadUrl()
}

const getSubset = () => {
    subsetList.value = subsetStore.data.map(item => ({
        id: Number(item.id),
        name: String(item.name),
    }))
    syncSubsetName()
}

const syncSubsetName = () => {
    const selected = subsetList.value.find(
        item => item.id === formData.value.subsetId
    )
    subsetName.value = formData.value.subsetName || selected?.name || ''
}

// 选择分类
const subsetSelect = (value: string | number) => {
    const id = Number(value)
    if (!Number.isFinite(id)) return

    formData.value.subsetId = id

    const selectedSubset = subsetList.value.find(item => item.id === id)
    if (selectedSubset) {
        subsetName.value = selectedSubset.name
        formData.value.subsetName = selectedSubset.name
    }
}

// 标签
const tags = ref<LabelOption[]>([])
const labelArr = ref<string[]>([])
const inputLabel = ref<string>('')

const getTags = () => {
    tags.value = labelStore.data.map((item: { id: string | number; name: string | number }) => ({
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

// 表单数据变化时通知父组件
watch(
    formData,
    (data) => {
        emits('formData', {
            ...data,
            label: [...data.label],
        })
    },
    { deep: true }
)

watch(
    () => formData.value.subsetId,
    () => {
        syncSubsetName()
    }
)

watch(
    () => props.initialData,
    (data) => {
        if (!data) return

        formData.value = {
            ...formData.value,
            ...data,
            label: Array.isArray(data.label) ? [...data.label] : [],
            classify: props.classify,
        }
        syncSubsetName()
        syncCoverFileList()
        emitFormData()
    },
    { deep: true, immediate: true }
)

onMounted(() => {
    //  分类来自数据库；图库共用文章分组
    void subsetStore.fetchSubsets('article').then(() => getSubset())
    //  标签建议来自数据库字典表
    if (labelStore.data.length === 0) {
        void labelStore.fetchLabels().then(() => getTags())
    } else {
        getTags()
    }
    emitFormData()
    void refreshUploadUrl()
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
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            font-size: @size-xl;
            font-weight: bold;
            color: @font-color-l;
            align-items: center;
        }

        &-layout {
            display: flex;
            width: 100%;
            gap: @space-xl;
            align-items: flex-start;
        }

        &-content {
            flex: 1;
            min-width: 0;
        }

        &-meta {
            display: flex;
            align-items: center;
            gap: @space-l;
            width: 100%;
            margin-top: @space-l;
        }

        &-tags {
            flex: 1;
            min-width: 0;
        }

        .introduce {
            width: 100%;
            border-bottom: 1px solid @gray-2;
            padding-top: @space-xl;
        }

        &-cover {
            flex: 0 0 160px;
            display: flex;
            flex-direction: column;
            gap: @space-s;

            &-label {
                color: @font-color-m;
                font-size: @size-s;
                line-height: 20px;
            }

            &-error {
                max-width: 160px;
                color: #d84a3a;
                font-size: @size-s;
                line-height: 1.5;
                overflow-wrap: anywhere;
            }
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

        .forms-cover {
            .yk-upload__picture,
            .yk-upload-picture,
            .yk-upload__picture-button {
                width: 160px;
                height: 120px;
            }
        }

        @media (max-width: 900px) {
            .forms-layout {
                flex-direction: column-reverse;
            }

            .forms-cover {
                width: 100%;
                flex-basis: auto;
            }

            .forms-cover .yk-upload__picture,
            .forms-cover .yk-upload-picture,
            .forms-cover .yk-upload__picture-button {
                width: 160px;
                height: 120px;
            }
        }
    }
</style>
