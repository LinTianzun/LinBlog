import { defineAsyncComponent } from 'vue'

const LineChart = defineAsyncComponent(() => import('./line.vue'))
const PieChart = defineAsyncComponent(() => import('./pie.vue'))

export { LineChart, PieChart }
