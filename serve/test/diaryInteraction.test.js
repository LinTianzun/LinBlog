const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/diaryInteractionController.js')
const originalLoad = Module._load

let likeState = null
let toggleResult = null
let commentResult = null
let commentPage = { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] }
let commentInputs = []
let logCalls = []

const diaryInteractionModel = {
    parseDiaryId(value) {
        const parsed = Number(value)
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
    },
    async findLikeState() { return likeState },
    async toggleLike() { return toggleResult },
    async getCommentsByDiary() { return commentPage },
    async createComment(input) {
        commentInputs.push(input)
        return commentResult
    }
}

Module._load = function (request, parent, isMain) {
    const filename = parent && parent.filename
    if (filename === controllerPath) {
        if (request === '../model/dbModel/diaryInteraction/index') return diaryInteractionModel
        if (request === '../utils/logHelper') {
            return { writeSystemLog: (entry) => logCalls.push(entry) }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const controller = require(controllerPath)
Module._load = originalLoad

function makeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}

test.beforeEach(() => {
    likeState = null
    toggleResult = null
    commentResult = null
    commentPage = { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] }
    commentInputs = []
    logCalls = []
})

test('随笔点赞状态匿名可读且不带 liked 标记', async () => {
    likeState = { liked: false, likes: 4 }
    const res = makeResponse()
    await controller.getLikeState({ params: { id: '3' }, user: { userId: null, userType: 'visitor' } }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data, { liked: false, likes: 4 })
})

test('随笔不存在时点赞状态返回 404', async () => {
    likeState = null
    const res = makeResponse()
    await controller.getLikeState({ params: { id: '999' }, user: { userId: 1, userType: 'normal' } }, res)

    assert.equal(res.statusCode, 404)
})

test('游客切换随笔点赞被拒绝且不写库', async () => {
    const res = makeResponse()
    await controller.toggleLike({ params: { id: '3' }, user: { userId: null, userType: 'visitor' } }, res)

    assert.equal(res.statusCode, 401)
    assert.match(res.body.message, /登录/)
    assert.equal(logCalls.length, 0)
})

test('登录用户点赞随笔返回新状态并写系统日志', async () => {
    toggleResult = { liked: true, likes: 5 }
    const res = makeResponse()
    await controller.toggleLike({
        params: { id: '3' },
        user: { userId: 42, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data, { liked: true, likes: 5 })
    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].action, 'like')
    assert.equal(logCalls[0].module, 'diary')
    assert.equal(logCalls[0].targetId, 3)
})

test('取消随笔点赞记录 unlike 动作', async () => {
    toggleResult = { liked: false, likes: 4 }
    const res = makeResponse()
    await controller.toggleLike({ params: { id: '3' }, user: { userId: 42, userType: 'normal' } }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(logCalls[0].action, 'unlike')
})

test('随笔评论列表要求有效的随笔ID', async () => {
    for (const diaryId of ['0', '-1', 'abc', undefined]) {
        const res = makeResponse()
        await controller.getComments({ query: { diaryId } }, res)
        assert.equal(res.statusCode, 400, `diaryId=${diaryId} 应被拒绝`)
    }
})

test('游客发表随笔评论被拒绝', async () => {
    const res = makeResponse()
    await controller.createComment({
        body: { diaryId: 3, content: '写得真好' },
        user: { userId: null, userType: 'visitor' }
    }, res)

    assert.equal(res.statusCode, 401)
    assert.equal(commentInputs.length, 0)
})

test('随笔评论内容做空值与长度校验', async () => {
    const empty = makeResponse()
    await controller.createComment({
        body: { diaryId: 3, content: '   ' },
        user: { userId: 42, userType: 'normal' }
    }, empty)
    assert.equal(empty.statusCode, 400)
    assert.match(empty.body.message, /不能为空/)

    const tooLong = makeResponse()
    await controller.createComment({
        body: { diaryId: 3, content: 'x'.repeat(513) },
        user: { userId: 42, userType: 'normal' }
    }, tooLong)
    assert.equal(tooLong.statusCode, 400)
    assert.match(tooLong.body.message, /512/)

    assert.equal(commentInputs.length, 0)
})

test('登录用户评论随笔成功并写日志', async () => {
    commentResult = { commentId: 12 }
    const res = makeResponse()
    await controller.createComment({
        body: { diaryId: '3', content: '  写得真好  ' },
        user: { userId: 42, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 201)
    assert.deepEqual(commentInputs, [{ diaryId: 3, userId: 42, content: '写得真好', parentId: 0 }])
    assert.equal(res.body.data.commentId, 12)
    assert.equal(logCalls[0].module, 'diary')
    assert.equal(logCalls[0].targetType, 'diary_comment')
})

test('回复随笔评论时 parentId 透传到模型并记录回复日志', async () => {
    commentResult = { commentId: 13 }
    const res = makeResponse()
    await controller.createComment({
        body: { diaryId: 3, content: '回复你', parentId: 12 },
        user: { userId: 42, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 201)
    assert.deepEqual(commentInputs, [{ diaryId: 3, userId: 42, content: '回复你', parentId: 12 }])
    assert.match(logCalls[0].detail, /回复/)
})

test('回复目标不存在时返回 400 且不写日志', async () => {
    commentResult = { invalidParent: true }
    const res = makeResponse()
    await controller.createComment({
        body: { diaryId: 3, content: '回复', parentId: 999 },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /回复的评论/)
    assert.equal(logCalls.length, 0)
})

test('评论已删除随笔返回 404', async () => {
    commentResult = null
    const res = makeResponse()
    await controller.createComment({
        body: { diaryId: 3, content: 'hi' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 404)
})

test('随笔互动路由挂在可选认证下', () => {
    const express = require('express')
    const app = express()
    const routes = []
    app.get = (routePath, ...handlers) => {
        routes.push({ method: 'get', path: routePath, handlers })
        return app
    }
    app.post = (routePath, ...handlers) => {
        routes.push({ method: 'post', path: routePath, handlers })
        return app
    }

    require('../routes/diaryInteraction')(app)

    const paths = routes.map(route => route.path)
    assert.deepEqual(paths, [
        '/api/public/diary/praise/:id',
        '/api/public/diary/praise/:id',
        '/api/public/diary/comment',
        '/api/public/diary/comment'
    ])
    for (const route of routes) {
        assert.equal(route.handlers[0].name, 'optionalAuthMiddleware')
    }
})
