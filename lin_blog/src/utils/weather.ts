//  天气图标（经 import 让 Vite 打包资源，避免 /src 绝对路径在生产构建下 404）
import qingSvg from '../assets/weather/qing.svg'
import duoyunSvg from '../assets/weather/duoyun.svg'
import daxueSvg from '../assets/weather/daxue.svg'
import dayuSvg from '../assets/weather/dayu.svg'
import fengSvg from '../assets/weather/feng.svg'
import leiyujiaojiaSvg from '../assets/weather/leiyujiaojia.svg'
import wuSvg from '../assets/weather/wu.svg'
import yueliangSvg from '../assets/weather/yueliang.svg'

export const weathers = [
    {
        id: 0,
        name: '晴天',
        iconUrl: qingSvg
    },
    {
        id: 1,
        name: '多云',
        iconUrl: duoyunSvg
    },
    {
        id: 2,
        name: '大雪',
        iconUrl: daxueSvg
    },
    {
        id: 3,
        name: '大雨',
        iconUrl: dayuSvg
    },
    {
        id: 4,
        name: '阵风',
        iconUrl: fengSvg
    },
    {
        id: 5,
        name: '雷雨',
        iconUrl: leiyujiaojiaSvg
    },
    {
        id: 6,
        name: '雾霾',
        iconUrl: wuSvg
    },
    {
        id: 7,
        name: '夜晚',
        iconUrl: yueliangSvg
    }
]
