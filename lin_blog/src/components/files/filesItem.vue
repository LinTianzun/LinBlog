<template>
    <div class="file-item">
        <div class="file-item-img" :class="{'file-item-selected':props.data?.selected}">
            <yk-image :src="props.data.url" fit="contain" width="200" height="200" :preview="true" :is-lazy="true">
            </yk-image>
            <yk-space class="file-item-img-tool" size="s">
                <IconDeleteOutline class="files-tool-delete" @click="deleteFile" />
                <yk-popconfirm title="选择分组" trigger="click" placement="bottomRight" @cancel="cancel" @confirm="confirm">
                    <IconSwitchOutline class="files-tool-switch" />
                    <template #content>
                        <yk-scrollbar ref="scrollbar" height="148px" class="subset">
                            <div class="subset-item" v-for="(item, index) in subsetStore.data" :key="index"
                                @click="changeOption(item.id)" :class="{'subset-seledted':subsetSelectedId==item.id}">
                                {{item.name}}{{item.value}}
                            </div>
                        </yk-scrollbar>
                    </template>
                </yk-popconfirm>
            </yk-space>
            <div class="file-item-img-check" @click="checkFile">
                <IconTickMinOutline style="font-size: 24px;" />
            </div>
        </div>
        <div class="file-item-name">
            <p class="file-item-name-file">{{props.data.fileName}}</p>
            <p>.{{props.data.format}}</p>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { mkfiles } from '../../mock/data.ts'
    import { FileData } from '../../utils/interface.ts'
    import { useSubsetStore } from '../../store/subset.ts'
    import './files.less'

    //  store
    const subsetStore = useSubsetStore()

    const emits = defineEmits(['changeSubsetId', 'delete', 'selected'])

    type FileItemProps = {
        data?: FileData
    }

    const props = withDefaults(defineProps < FileItemProps > (), {
    })

    //  分类选择
    const subsetSelectedId = ref(props.data.subsetId)
    //  切换分组
    const changeOption = (e) => {
        subsetSelectedId.value = e
    }


    function cancel() {

    }
    function confirm() {
        //  如果选则与之前不同时
        if (subsetSelectedId.value != props.data?.subsetId) {
            let data = {
                id: props.data?.id,
                subsetId: subsetSelectedId.value
            }
            emits('changeSubsetId', data)
        }
    }

    //  删除
    const deleteFile = () => {
        emits('delete', props.data.id)
    }

    //  选择
    const checkFile = () => {
        emits('selected', props.data.id)
    }

</script>

<style lang="less" scoped>
    .file-item {

        &-img {
            width: 205px;
            position: relative;
            border: 2px solid @bg-color-l;
            border-radius: @radius-s;

            &-tool {
                position: absolute;
                right: @space-s;
                bottom: @space-s;
                opacity: 0;

                .yk-icon {
                    width: 32px;
                    height: 32px;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.56);
                    border-radius: @radius-m;
                    transition: all @animatb;
                    cursor: pointer;

                    &:hover {
                        color: @pcolor;
                        background: rgba(255, 255, 255, 0.72);
                        backdrop-filter: blur(2px);
                    }
                }
            }

            &-check {
                position: absolute;
                width: 24px;
                height: 24px;
                border-radius: @radius-s;
                background: @gray-4;
                left: @space-s;
                top: @space-s;
                cursor: pointer;
                border: 1px solid rgba(255, 255, 255, 0.56);
                opacity: 0;

                .yk-icon {
                    color: white;
                    opacity: 0;
                }
            }

            &:hover {
                background: @pcolor-1;

                .file-item-img-tool {
                    opacity: 1;
                }

                .file-item-img-check {
                    opacity: 1;
                }
            }

        }

        &-selected {
            background: @pcolor-1;
            border: 2px solid @pcolor-3;

            .file-item-img-tool {
                opacity: 0;
            }

            .file-item-img-check {
                background: @pcolor;
                /* border: 1px solid rgba(255, 255, 255, 0.56); */
                opacity: 1;

                .yk-icon {
                    opacity: 1;
                }
            }

            &:hover {

                .file-item-img-tool {
                    opacity: 0;
                }

            }
        }

        &-name {
            display: flex;
            padding-top: @space-l;
            justify-content: center;

            &-file {
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 1;
                -webkit-box-orient: vertical;
                text-overflow: ellipsis;
            }
        }
    }
</style>