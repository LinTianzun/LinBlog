const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const diaryController = require(path.resolve(__dirname, '../controller/diaryController.js'))
const diaryModel = require(path.resolve(__dirname, '../model/dbModel/diary/index.js'))

// 与前端 src/utils/weather.ts 对齐的 8 种天气名，种子数据改动时应保持同步
const FRONTEND_WEATHER_NAMES = [
    '晴天', '多云', '大雪', '大雨', '阵风', '雷雨', '雾霾', '夜晚'
]

function createRes() {
    return {
        statusCode: 0,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        }
    }
}

test('createDiary accepts all frontend weather names and stores the dictionary id', async () => {
    const originalFind = diaryModel.findWeatherByName
    const originalInsert = diaryModel.insertDiary
    const inserted = []

    try {
        for (const name of FRONTEND_WEATHER_NAMES) {
            diaryModel.findWeatherByName = async (query) => {
                assert.equal(query, name)
                return { id: 10 + FRONTEND_WEATHER_NAMES.indexOf(name) }
            }
            diaryModel.insertDiary = async (payload) => {
                inserted.push(payload)
                return { diaryId: inserted.length }
            }

            const res = createRes()
            await diaryController.createDiary({
                body: { title: `天气验证-${name}`, content: '内容', weatherName: name }
            }, res)

            assert.equal(res.statusCode, 201)
            assert.equal(res.body.code, 200)
        }

        assert.equal(inserted.length, FRONTEND_WEATHER_NAMES.length)
        inserted.forEach((payload, index) => {
            assert.equal(payload.weatherId, 10 + index)
        })
    } finally {
        diaryModel.findWeatherByName = originalFind
        diaryModel.insertDiary = originalInsert
    }
})

test('createDiary rejects unknown weather names with 400', async () => {
    const originalFind = diaryModel.findWeatherByName

    try {
        diaryModel.findWeatherByName = async () => null

        const res = createRes()
        await diaryController.createDiary({
            body: { title: '天气验证-失败', content: '内容', weatherName: '不存在的天气' }
        }, res)

        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 400)
        assert.equal(res.body.message, '天气类型不存在')
    } finally {
        diaryModel.findWeatherByName = originalFind
    }
})

test('createDiary allows empty weather and stores null weatherId', async () => {
    const originalInsert = diaryModel.insertDiary
    let captured = null

    try {
        diaryModel.insertDiary = async (payload) => {
            captured = payload
            return { diaryId: 1 }
        }

        const res = createRes()
        await diaryController.createDiary({
            body: { title: '天气验证-为空', content: '内容' }
        }, res)

        assert.equal(res.statusCode, 201)
        assert.equal(captured.weatherId, null)
    } finally {
        diaryModel.insertDiary = originalInsert
    }
})
