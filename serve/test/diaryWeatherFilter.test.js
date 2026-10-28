const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const modelPath = path.resolve(__dirname, '../model/dbModel/diary/index.js')
const controllerPath = path.resolve(__dirname, '../controller/diaryController.js')
const originalLoad = Module._load

// 捕获模型层实际下发的 SQL 与参数，验证过滤真的发生在 SQL 层
let queries = []
let listRows = []
let facetRows = []
let totalRows = [{ total: 0 }]

const fakeDb = {
    async query(sql, values = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim()
        queries.push({ sql: normalized, values })

        if (normalized.includes('AS weatherName')) return facetRows
        if (normalized.startsWith('SELECT COUNT(*) AS total')) return totalRows
        if (normalized.includes('AS total FROM diary')) return [{ total: listRows.length }]
        return listRows
    }
}

Module._load = function (request, parent, isMain) {
    const fromModel = parent && parent.filename === modelPath
    if (fromModel && request === '../../db/dbnew') return fakeDb
    return originalLoad.call(this, request, parent, isMain)
}

const diaryModel = require(modelPath)
const diaryController = require(controllerPath)
Module._load = originalLoad

test.beforeEach(() => {
    queries = []
    listRows = []
    facetRows = []
    totalRows = [{ total: 0 }]
})

const makeRes = () => {
    const res = {
        statusCode: 200,
        payload: undefined,
        status(code) { this.statusCode = code; return this },
        json(payload) { this.payload = payload; return this }
    }
    return res
}

test('模型层：不带 weather 时不附加天气条件', async () => {
    await diaryModel.getDiariesByPage({ pageSize: 10, offset: 0 })

    const listSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    assert.ok(listSql, '应下发列表查询')
    assert.ok(!listSql.sql.includes('weather_name = ?'), '不应出现天气条件')
    assert.deepEqual(listSql.sql.includes('LEFT JOIN weather'), true)
})

test('模型层：weather 走 SQL WHERE，参数为天气名', async () => {
    await diaryModel.getDiariesByPage({ weather: '晴天', pageSize: 10, offset: 0 })

    const listSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    assert.match(listSql.sql, /AND w\.weather_name = \?/)
    assert.ok(listSql.values.includes('晴天'))
})

test('模型层：随笔列表把评论拆成一级评论与回复两个口径', async () => {
    listRows = [{
        id: 5,
        title: '午后',
        content: '出门走走',
        picture: null,
        weather_id: 1,
        weather_name: '晴天',
        mood: 'calm',
        views: 10,
        likes: 2,
        comments: 4,
        root_comments: 3,
        reply_comments: 1,
        created_at: '2026-10-28 10:00:00'
    }]

    const result = await diaryModel.getDiariesByPage({ pageSize: 10, offset: 0 })

    const listSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    assert.match(listSql.sql, /AS root_comments/)
    assert.match(listSql.sql, /AS reply_comments/)
    assert.match(listSql.sql, /c\.parent_id = 0/)
    assert.match(listSql.sql, /c\.parent_id > 0/)
    assert.deepEqual(result.list[0].root_comments, 3)
    assert.deepEqual(result.list[0].reply_comments, 1)
})

test('控制器：随笔列表回传一级评论数与回复数', async () => {
    listRows = [{
        id: 5,
        title: '午后',
        content: '出门走走',
        picture: 'a.jpg',
        weather_id: 1,
        weather_name: '晴天',
        mood: 'calm',
        views: 10,
        likes: 2,
        comments: 4,
        root_comments: 0,
        reply_comments: 0,
        created_at: '2026-10-28 10:00:00'
    }]

    const res = makeRes()
    await diaryController.getDiaries({ query: {} }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.payload.data.list[0].rootComments, 0)
    assert.deepEqual(res.payload.data.list[0].replyComments, 0)
    assert.deepEqual(res.payload.data.list[0].picture, ['a.jpg'])
})

test('模型层：总数查询带同样的天气条件（LEFT JOIN 保证 JOIN 生效）', async () => {
    await diaryModel.getDiariesByPage({ weather: '大雨', pageSize: 10, offset: 0 })

    const countSql = queries.find(q => q.sql.startsWith('SELECT COUNT(*) AS total FROM diary'))
    assert.ok(countSql, '应下发总数查询')
    assert.match(countSql.sql, /LEFT JOIN weather/)
    assert.match(countSql.sql, /AND w\.weather_name = \?/)
})

test('模型层：weather 与 keyword 可叠加', async () => {
    await diaryModel.getDiariesByPage({ weather: '多云', keyword: '海', pageSize: 10, offset: 0 })

    const listSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    const values = listSql.values
    assert.ok(values.includes('多云'))
    assert.ok(values.includes('%海%'), '关键词应参与过滤')
})

test('模型层：分面计数合并同类天气并回带总数', async () => {
    facetRows = [
        { weatherName: '晴天', count: 3 },
        { weatherName: '多云', count: 1 }
    ]
    totalRows = [{ total: 5 }]

    const result = await diaryModel.countDiariesByWeather({})

    assert.equal(result.total, 5)
    assert.deepEqual(result.facet, [
        { weatherName: '晴天', count: 3 },
        { weatherName: '多云', count: 1 }
    ])
})

test('模型层：分面查询排除未记天气的随笔', async () => {
    facetRows = []
    await diaryModel.countDiariesByWeather({})

    const facetSql = queries.find(q => q.sql.includes('AS weatherName'))
    assert.match(facetSql.sql, /INNER JOIN weather/)
    assert.match(facetSql.sql, /w\.weather_name IS NOT NULL/)
})

test('模型层：分面总数计入未记天气的随笔（LEFT JOIN）', async () => {
    await diaryModel.countDiariesByWeather({})

    const facetTotalSql = queries.find(q =>
        q.sql.startsWith('SELECT COUNT(*) AS total FROM diary') && q.sql.includes('LEFT JOIN')
    )
    assert.ok(facetTotalSql, '总数应使用 LEFT JOIN')
    assert.ok(!facetTotalSql.sql.includes('weather_name IS NOT NULL'))
})

test('模型层：分面跟随关键词过滤', async () => {
    await diaryModel.countDiariesByWeather({ keyword: '雨' })

    const facetSql = queries.find(q => q.sql.includes('AS weatherName'))
    const totalSql = queries.find(q => q.sql.startsWith('SELECT COUNT(*) AS total FROM diary'))
    assert.ok(facetSql.values.includes('%雨%'))
    assert.ok(totalSql.values.includes('%雨%'))
})

test('控制器：weather 参数透传到模型并返回分面', async () => {
    const originalGet = diaryModel.getDiariesByPage
    const originalCount = diaryModel.countDiariesByWeather
    let getArgs = null
    let countArgs = null

    diaryModel.getDiariesByPage = async (args) => {
        getArgs = args
        return { list: [], total: 0 }
    }
    diaryModel.countDiariesByWeather = async (args) => {
        countArgs = args
        return { facet: [{ weatherName: '晴天', count: 2 }], total: 4 }
    }

    try {
        const res = makeRes()
        await diaryController.getDiaries(
            { query: { weather: '晴天', page: '1', pageSize: '9' } },
            res
        )

        assert.equal(res.statusCode, 200)
        assert.equal(getArgs.weather, '晴天')
        // 控制器把登录用户的归属范围透传给模型，普通用户只看自己名下随笔
        assert.deepEqual(countArgs, {
            keyword: '',
            ownerScope: { userId: null, userType: null }
        })
        assert.deepEqual(getArgs.ownerScope, { userId: null, userType: null })
        assert.deepEqual(res.payload.data.weatherFacet, [
            { weatherName: '晴天', count: 2 }
        ])
        assert.equal(res.payload.data.facetTotal, 4)
    } finally {
        diaryModel.getDiariesByPage = originalGet
        diaryModel.countDiariesByWeather = originalCount
    }
})

test('控制器：weather 为空串时不传递该参数', async () => {
    const originalGet = diaryModel.getDiariesByPage
    const originalCount = diaryModel.countDiariesByWeather
    let getArgs = null

    diaryModel.getDiariesByPage = async (args) => {
        getArgs = args
        return { list: [], total: 0 }
    }
    diaryModel.countDiariesByWeather = async () => ({ facet: [], total: 0 })

    try {
        const res = makeRes()
        await diaryController.getDiaries({ query: { weather: '   ' } }, res)

        assert.equal(getArgs.weather, '')
    } finally {
        diaryModel.getDiariesByPage = originalGet
        diaryModel.countDiariesByWeather = originalCount
    }
})

test('控制器：weather 与 sort 可共存', async () => {
    const originalGet = diaryModel.getDiariesByPage
    const originalCount = diaryModel.countDiariesByWeather
    let getArgs = null

    diaryModel.getDiariesByPage = async (args) => {
        getArgs = args
        return { list: [], total: 0 }
    }
    diaryModel.countDiariesByWeather = async () => ({ facet: [], total: 0 })

    try {
        const res = makeRes()
        await diaryController.getDiaries({ query: { weather: '夜晚', sort: 'hot' } }, res)

        assert.equal(getArgs.weather, '夜晚')
        assert.equal(getArgs.sort, 'hot')
    } finally {
        diaryModel.getDiariesByPage = originalGet
        diaryModel.countDiariesByWeather = originalCount
    }
})

test('控制器：分面查询失败时整个请求返回 500', async () => {
    const originalCount = diaryModel.countDiariesByWeather
    diaryModel.countDiariesByWeather = async () => {
        throw new Error('分面统计失败')
    }

    try {
        const res = makeRes()
        await diaryController.getDiaries({ query: {} }, res)

        assert.equal(res.statusCode, 500)
        assert.match(res.payload.message, /分面统计失败/)
    } finally {
        diaryModel.countDiariesByWeather = originalCount
    }
})
