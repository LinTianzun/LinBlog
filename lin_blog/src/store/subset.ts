import { defineStore } from 'pinia'
import type { SubsetData } from '../utils/interface'
import { getSubsets } from '../api/subset'

export const useSubsetStore = defineStore('subsets', {
    // 为了完整类型推理，推荐使用箭头函数
    state: () => {
        return {
            // 所有这些属性都将自动推断出它们的类型
            count: 0,
            data: [] as SubsetData[]
        }
    },
    getters: {
        exclude: (state) => {
            let arr = []
            let n = state.count
            //  拿到所有的id，计算未分组数
            for (let i = 0; i < state.data.length; i++) {
                arr[i] = state.data[i].id
                n = n - state.data[i].value
            }
            return { id: arr.join(','), name: "未分类", value: n }
        }
    },
    actions: {
        // 从数据库加载文章分类，写入 count 和 data
        async fetchSubsets() {
            try {
                const result = await getSubsets('article')
                if (result.code === 200 && result.data) {
                    this.count = result.data.count
                    this.data = result.data.list.map(item => ({
                        id: item.id,
                        name: item.name,
                        value: item.value ?? 0,
                        moment: item.moment,
                    }))
                }
            } catch {
                // 请求失败时保留现有数据，由调用方提示错误
            }
        },
        subsetName(e?: number) {
            for (let i = 0; i < this.$state.data.length; i++) {
                if (this.$state.data[i].id === e) {
                    return this.$state.data[i].name
                }
            }
            return "未分类"
        }
    }
})
