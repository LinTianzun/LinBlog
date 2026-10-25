const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const diaryController = require(path.resolve(__dirname, '../controller/diaryController.js'))
const diaryModel = require(path.resolve(__dirname, '../model/dbModel/diary/index.js'))

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

test('updateDiary applies normalized payload to existing diary', async () => {
    const originalFind = diaryModel.findDiaryById
    const originalWeather = diaryModel.findWeatherByName
    const originalUpdate = diaryModel.updateDiary
    let captured = null

    diaryModel.findDiaryById = async (id) => {
        assert.equal(id, 5)
        return { id, title: '旧标题', content: '旧内容', picture: 'a.jpg', weather_id: 1 }
    }
    diaryModel.findWeatherByName = async (name) => {
        assert.equal(name, '雷雨')
        return { id: 6, weather_name: name }
    }
    diaryModel.updateDiary = async (payload) => {
        captured = payload
        return { affectedRows: 1 }
    }

    try {
        const res = createRes()
        await diaryController.updateDiary({
            params: { id: '5' },
            query: {},
            body: { title: ' 新标题 ', content: '新内容', picture: ['a.jpg', 'b.jpg'], weatherName: '雷雨' }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.message, '日记更新成功')
        assert.deepEqual(captured, {
            id: 5,
            title: '新标题',
            content: '新内容',
            picture: 'a.jpg,b.jpg',
            weatherId: 6
        })
    } finally {
        diaryModel.findDiaryById = originalFind
        diaryModel.findWeatherByName = originalWeather
        diaryModel.updateDiary = originalUpdate
    }
})

test('updateDiary returns 404 for missing diary and validates fields', async () => {
    const originalFind = diaryModel.findDiaryById
    const originalUpdate = diaryModel.updateDiary
    let updateCalled = false

    // id=5 存在（用于字段校验用例），其余视为不存在
    diaryModel.findDiaryById = async (id) => (Number(id) === 5 ? { id: 5 } : null)
    diaryModel.updateDiary = async () => {
        updateCalled = true
        return { affectedRows: 0 }
    }

    try {
        const missing = createRes()
        await diaryController.updateDiary({ params: { id: '99' }, query: {}, body: { title: 't', content: 'c' } }, missing)
        assert.equal(missing.statusCode, 404)

        const badId = createRes()
        await diaryController.updateDiary({ params: { id: 'abc' }, query: {}, body: { title: 't', content: 'c' } }, badId)
        assert.equal(badId.statusCode, 400)
        assert.equal(badId.body.message, '日记ID必须是有效数字')

        const emptyTitle = createRes()
        await diaryController.updateDiary({
            params: { id: '5' },
            query: {},
            body: { title: '   ', content: 'c' }
        }, emptyTitle)
        assert.equal(emptyTitle.statusCode, 400)
        assert.equal(emptyTitle.body.message, '日记标题不能为空')

        assert.equal(updateCalled, false)
    } finally {
        diaryModel.findDiaryById = originalFind
        diaryModel.updateDiary = originalUpdate
    }
})

test('updateDiary rejects unknown weather and too many pictures', async () => {
    const originalFind = diaryModel.findDiaryById
    const originalWeather = diaryModel.findWeatherByName

    diaryModel.findDiaryById = async () => ({ id: 5 })
    diaryModel.findWeatherByName = async () => null

    try {
        const badWeather = createRes()
        await diaryController.updateDiary({
            params: { id: '5' },
            query: {},
            body: { title: 't', content: 'c', weatherName: '不存在' }
        }, badWeather)
        assert.equal(badWeather.statusCode, 400)
        assert.equal(badWeather.body.message, '天气类型不存在')

        const tooMany = createRes()
        await diaryController.updateDiary({
            params: { id: '5' },
            query: {},
            body: { title: 't', content: 'c', picture: ['1', '2', '3', '4', '5', '6', '7'] }
        }, tooMany)
        assert.equal(tooMany.statusCode, 400)
        assert.equal(tooMany.body.message, '图片最多6张')
    } finally {
        diaryModel.findDiaryById = originalFind
        diaryModel.findWeatherByName = originalWeather
    }
})
