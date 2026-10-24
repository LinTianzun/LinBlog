import { defineStore } from 'pinia'
import type { SubsetData } from '../utils/interface'
import { getSubsets } from '../api/subset'
import { getArticleStateSummary, type ArticleStateSummary } from '../api/article'

const emptySummary: ArticleStateSummary = {
    all: 0,
    published: 0,
    draft: 0,
    rejected: 0,
    uncategorized: 0,
}

export const useSubsetStore = defineStore('subsets', {
    // 为了完整类型推理，推荐使用箭头函数
    state: () => {
        return {
            // 所有这些属性都将自动推断出它们的类型
            count: 0,
            data: [] as SubsetData[],
            stateSummary: { ...emptySummary } as ArticleStateSummary
        }
    },
    getters: {
        exclude: (state) => {
            let arr = []
            //  拿到所有的id，计算未分组数（未分类 = 文章总数 - 已归类数）
            let n = state.stateSummary.all
            for (let i = 0; i < state.data.length; i++) {
                arr[i] = state.data[i].id
                n = n - state.data[i].value
            }
            return { id: arr.join(','), name: "未分类", value: n }
        },
        //  状态页签：全部/已发布/未发布
        stateTabs(): { id: number; name: string; value: number }[] {
            const summary = this.stateSummary
            return [
                { id: 0, name: '已发布', value: summary.published },
                { id: 1, name: '未发布', value: summary.draft + summary.rejected },
            ]
        }
    },
    actions: {
        // 从数据库加载文章分类，写入 count 和 data
        async fetchSubsets(classify: 'article' | 'image' = 'article') {
            try {
                const result = await getSubsets(classify)
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
        // 从数据库加载文章状态统计
        async fetchStateSummary(classify: 'article' | 'image' = 'article') {
            try {
                const result = await getArticleStateSummary(classify)
                if (result.code === 200 && result.data) {
                    this.stateSummary = { ...emptySummary, ...result.data }
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
