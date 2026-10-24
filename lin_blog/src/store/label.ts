import { defineStore } from 'pinia'
import { getLabels } from '../api/label'
import type { LabelData } from '../utils/interface'

export const useLabelStore = defineStore('labels', {
    state: () => {
        return {
            data: [] as LabelData[]
        }
    },
    actions: {
        // 从数据库加载标签，写入 data
        async fetchLabels() {
            try {
                const result = await getLabels()
                if (result.code === 200 && result.data) {
                    this.data = result.data.list.map(item => ({
                        id: item.id,
                        name: item.name,
                        moment: item.moment
                    }))
                }
            } catch {
                // 请求失败时保留现有数据，由调用方提示错误
            }
        },
        labelName(e?: number | string) {
            for (let i = 0; i < this.$state.data.length; i++) {
                if (String(this.$state.data[i].id) === String(e)) {
                    return this.$state.data[i].name
                }
            }
            return ''
        }
    }
})
