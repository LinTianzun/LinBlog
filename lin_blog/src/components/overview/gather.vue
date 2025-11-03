<template>
    <yk-space class="gather">
        <div v-for="(item, index) in gathers" :key="index" class="gather_list" :style="item.bgColor">
            <yk-space dir="vertical" size="s">
                <yk-text type="secondary">{{item.name}}</yk-text>
                <yk-title :level="2" style="margin: 0;">{{item.total}}</yk-title>
            </yk-space>
            <yk-button v-if="index>0" size="xl" type="secondary" shape="square" @click="editPage(item.path)">
                <IconPlusOutline />
            </yk-button>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { overLink } from '../../utils/menu.ts'
    import { overview } from '../../mock/data.ts'
    import { useRouter } from 'vue-router'

    const router = useRouter()

    const gathers = ref(overLink)

    //  获取数据量
    const drawGatherData = () => {
        let data = overview.data;
        gathers.value[0].total = data.file
        gathers.value[1].total = data.atricle
        gathers.value[2].total = data.gallery
        gathers.value[3].total = data.diary
    }

    //  跳转指定页面
    const editPage = (e) => {
        // console.log(e)
        router.push(e)
    }

    onMounted(() => {
        drawGatherData()
    })

</script>

<style lang="less" scoped>
    .gather {
        width: 100%;

        &_list {
            display: flex;
            width: 25%;
            /* background: linear-gradient(180deg, #2b5aedcc 0%, #2B5AED 100%); */
            justify-content: space-between;
            align-items: center;
            padding: @space-xl;
            border-radius: @radius-m;

            &:first-child {

                .yk-title,
                .yk-text {
                    color: @white;
                }
            }
        }
    }
</style>