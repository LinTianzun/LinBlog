// 真实 MySQL 集成测试：仅在显式提供 LINBLOG_INTEGRATION_DB 时运行。
// 会创建独立的验证数据库并在结束后删除，绝不触碰默认业务库。
const assert = require('node:assert/strict')
const test = require('node:test')

const targetDb = process.env.LINBLOG_INTEGRATION_DB || ''

if (!targetDb) {
    test('skipped: set LINBLOG_INTEGRATION_DB to run real-DB integration tests', () => {
        assert.ok(true)
    })
} else {
    if (targetDb === 'linlog') {
        throw new Error('拒绝在默认业务库上运行集成测试')
    }

    process.env.LINBLOG_DB_NAME = targetDb
    process.env.LINBLOG_JWT_SECRET = process.env.LINBLOG_JWT_SECRET || 'integration-test-secret-at-least-32-chars'

    const db = require('../model/db/dbnew')
    const userModel = require('../model/dbModel/users/index')
    const articleModel = require('../model/dbModel/article/index')
    const imageModel = require('../model/dbModel/image/index')
    const fileModel = require('../model/dbModel/file/index')
    const commentController = require('../controller/commentController')
    const userController = require('../controller/userController')

    const ids = {}

    async function seedBaseData() {
        const password = '$2a$10$integrationfakehashintegrationfakehash0000000000000000000000'
        const users = [
            ['管理员', 'it-admin@test.local', 'admin'],
            ['普通用户', 'it-normal@test.local', 'normal'],
            ['游客', 'it-visitor@test.local', 'visitor']
        ]
        for (const [username, mail, user_type] of users) {
            const result = await db.query(
                'INSERT INTO users (username, mail, password, user_type) VALUES (?, ?, ?, ?)',
                [username, mail, password, user_type]
            )
            ids[user_type] = result.insertId
        }

        const subset = await db.query(
            "INSERT INTO subset (subset_name, classify) VALUES ('集成测试分类', 'article')"
        )
        ids.subset = subset.insertId

        const published = await articleModel.insertArticle({
            userId: ids.normal,
            title: '已发布文章',
            content: '正文内容',
            classify: 'article',
            subsetId: ids.subset,
            introduce: '简介',
            cover: '',
            state: undefined
        })
        ids.publishedArticle = published.articleId
        await db.query("UPDATE article SET state = 'published' WHERE id = ?", [ids.publishedArticle])

        const draft = await articleModel.insertArticle({
            userId: ids.normal,
            title: '普通用户草稿',
            content: '草稿内容',
            classify: 'article',
            subsetId: ids.subset,
            introduce: '',
            cover: ''
        })
        ids.draftArticle = draft.articleId

        const adminDraft = await articleModel.insertArticle({
            userId: ids.admin,
            title: '管理员草稿',
            content: '管理员草稿内容',
            classify: 'article',
            subsetId: ids.subset,
            introduce: '',
            cover: ''
        })
        ids.adminDraftArticle = adminDraft.articleId
    }

    test.before(async () => {
        await db.initDatabase()
        await seedBaseData()
    })

    test('migrations run idempotently and create the schema', async () => {
        // before 钩子已跑过一轮，这里再跑一轮验证幂等
        await db.initDatabase()

        const rows = await db.query(
            'SELECT COUNT(*) AS total FROM schema_migrations'
        )
        assert.ok(Number(rows[0].total) > 0)

        const tables = await db.query(
            "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ? AND table_name IN ('users','article','comment','image','diary','message')",
            [targetDb]
        )
        assert.equal(Number(tables[0].total), 6)

        const fileColumns = await db.query(
            `SELECT COLUMN_NAME
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME = 'file'
               AND COLUMN_NAME IN ('deleted_at', 'backup_deleted_at')`,
            [targetDb]
        )
        assert.deepEqual(
            fileColumns.map(row => row.COLUMN_NAME).sort(),
            ['backup_deleted_at', 'deleted_at']
        )
    })

    test('staff role filter excludes visitors and respects status', async () => {
        const result = await userModel.findUsersByPage(1, 20, 0, '', 1, 'staff')
        const names = result.list.map(u => u.username)
        assert.ok(names.includes('普通用户'))
        assert.ok(!names.includes('游客'))
        assert.equal(result.total, 1)
    })

    test('concurrent registration returns one success and one stable conflict', async () => {
        function response() {
            return {
                statusCode: 0,
                body: null,
                status(code) { this.statusCode = code; return this },
                json(body) { this.body = body; return this }
            }
        }

        const payload = {
            body: {
                username: '并发注册用户',
                mail: 'concurrent-register@test.local',
                password: '123456'
            }
        }
        const first = response()
        const second = response()

        await Promise.all([
            userController.register(payload, first),
            userController.register(payload, second)
        ])

        const statuses = [first.statusCode, second.statusCode].sort((a, b) => a - b)
        assert.deepEqual(statuses, [201, 400])

        const conflict = first.statusCode === 400 ? first : second
        assert.equal(conflict.body.code, 400)
        assert.match(conflict.body.message, /该(邮箱|用户名)已被注册|该用户名或邮箱已被注册/)
    })

    test('normal user can update own draft but not others articles', async () => {
        const own = await articleModel.findArticleMutationAccess(ids.draftArticle, ids.normal, 'normal')
        assert.equal(own.exists, true)
        assert.equal(own.allowed, true)

        const affected = await articleModel.updateArticle(
            ids.draftArticle, { title: '改名后的草稿' }, ids.normal, 'normal'
        )
        assert.equal(affected, 1)

        const other = await articleModel.findArticleMutationAccess(ids.adminDraftArticle, ids.normal, 'normal')
        assert.equal(other.exists, true)
        assert.equal(other.allowed, false)

        const banned = await articleModel.updateArticle(
            ids.draftArticle, { title: '越权标题', state: 'published' }, ids.normal, 'normal'
        )
        assert.equal(banned, 0)
    })

    test('article status transition enforces permissions', async () => {
        const denied = await articleModel.updateArticleStatus(
            ids.draftArticle, 'rejected', ids.normal, 'normal'
        )
        assert.equal(denied, 0)

        // 管理员驳回后，作者可把文章退回草稿
        await db.query("UPDATE article SET state = 'rejected' WHERE id = ?", [ids.draftArticle])
        const backToDraft = await articleModel.updateArticleStatus(
            ids.draftArticle, 'draft', ids.normal, 'normal'
        )
        assert.equal(backToDraft, 1)
    })

    test('image roundtrip stores and reads binary content', async () => {
        const payload = Buffer.from('integration-image-bytes-中文内容')
        await imageModel.createImage({
            filename: 'it-image.jpg',
            mimeType: 'image/jpeg',
            size: payload.length,
            checksum: 'a'.repeat(64),
            data: payload,
            userId: ids.admin
        })

        const rows = await imageModel.findActiveImageByFilename('it-image.jpg')
        assert.equal(rows.length, 1)
        assert.equal(rows[0].mime_type, 'image/jpeg')
        assert.equal(Number(rows[0].size), payload.length)
        assert.ok(Buffer.from(rows[0].data).equals(payload))
    })

    test('file soft-delete and restore preserve lifecycle timestamps', async () => {
        const inserted = await fileModel.insertFile({
            fileName: '生命周期测试.txt',
            format: 'txt',
            size: 12,
            url: 'integration-file-lifecycle.txt',
            subsetId: null
        })

        const affected = await fileModel.softDeleteFiles([inserted.fileId])
        assert.equal(affected, 1)

        const deleted = await fileModel.findFileById(inserted.fileId)
        assert.equal(Number(deleted.status), 0)
        assert.ok(deleted.deleted_at)
        assert.equal(deleted.backup_deleted_at, null)

        const trash = await fileModel.getDeletedFilesByPage({
            pageSize: 20,
            offset: 0
        })
        assert.ok(trash.list.some(file => Number(file.id) === Number(inserted.fileId)))

        const restored = await fileModel.restoreFile(inserted.fileId)
        assert.equal(restored, 1)

        const active = await fileModel.findFileById(inserted.fileId)
        assert.equal(Number(active.status), 1)
        assert.equal(active.deleted_at, null)
        assert.equal(active.backup_deleted_at, null)
    })

    test('cover cleanup keeps referenced images and removes orphaned ones', async () => {
        await db.query(
            "UPDATE article SET cover = '/api/uploads/it-image.jpg' WHERE id = ?",
            [ids.publishedArticle]
        )

        const referenced = await imageModel.deactivateImageIfUnreferenced('it-image.jpg')
        assert.equal(referenced.deactivated, false)
        assert.ok(referenced.referenceCount >= 1)

        await articleModel.deleteArticle(ids.publishedArticle, ids.admin, 'admin')
        const orphaned = await imageModel.deactivateImageIfUnreferenced('it-image.jpg')
        assert.equal(orphaned.deactivated, true)

        const after = await imageModel.findActiveImageByFilename('it-image.jpg')
        assert.equal(after.length, 0)
    })

    test('comment flow enforces state and parent boundaries end-to-end', async () => {
        function response() {
            return {
                statusCode: 0,
                body: null,
                status(code) { this.statusCode = code; return this },
                json(body) { this.body = body; return this }
            }
        }

        // 独立建一篇文章，避免与前面用例的删除操作相互影响
        const freshArticle = await articleModel.insertArticle({
            userId: ids.normal,
            title: '评论边界测试文章',
            content: '正文',
            classify: 'article',
            subsetId: ids.subset,
            introduce: '',
            cover: ''
        })
        const freshArticleId = freshArticle.articleId
        await db.query("UPDATE article SET state = 'published' WHERE id = ?", [freshArticleId])

        const res1 = response()
        await commentController.createComment({
            body: { articleId: freshArticleId, content: '一级评论' },
            user: { userId: ids.normal, userType: 'normal' },
            ip: '127.0.0.1'
        }, res1)
        assert.equal(res1.statusCode, 201)
        const commentId = res1.body.data.commentId

        const res2 = response()
        await commentController.createComment({
            body: { articleId: freshArticleId, content: '二级回复', parentId: commentId },
            user: { userId: ids.admin, userType: 'admin' },
            ip: '127.0.0.1'
        }, res2)
        assert.equal(res2.statusCode, 201)
        const replyId = res2.body.data.commentId

        const res3 = response()
        await commentController.createComment({
            body: { articleId: freshArticleId, content: '三级回复', parentId: replyId },
            user: { userId: ids.normal, userType: 'normal' },
            ip: '127.0.0.1'
        }, res3)
        assert.equal(res3.statusCode, 400)

        const res4 = response()
        await commentController.createComment({
            body: { articleId: ids.draftArticle, content: '草稿不能评论' },
            user: { userId: ids.normal, userType: 'normal' },
            ip: '127.0.0.1'
        }, res4)
        assert.equal(res4.statusCode, 403)

        const rows = await db.query(
            'SELECT COUNT(*) AS total FROM comment WHERE article_id = ? AND status = 1',
            [freshArticleId]
        )
        assert.equal(Number(rows[0].total), 2)
    })

    test('disable and re-enable user through guarded status update', async () => {
        const disable = await userModel.updateUserStatusGuarded(ids.normal, 0, ids.admin)
        assert.equal(disable.ok, true)
        const disabled = await userModel.findUserById(ids.normal)
        assert.equal(Number(disabled[0].status), 0)

        const enable = await userModel.updateUserStatusGuarded(ids.normal, 1, ids.admin)
        assert.equal(enable.ok, true)
        const enabled = await userModel.findUserById(ids.normal)
        assert.equal(Number(enabled[0].status), 1)

        // 自己禁用自己：返回 last_admin 或 self_status_change 拒绝原因，而非抛错
        const self = await userModel.updateUserStatusGuarded(ids.admin, 0, ids.admin)
        assert.equal(self.ok, false)
        assert.equal(self.reason, 'self_status_change')
    })

    test.after(async () => {
        await db.closeDatabase()
        const mysql = require('mysql2/promise')
        const config = require('../config/default')
        const connection = await mysql.createConnection({
            host: config.database.HOST,
            user: config.database.USER,
            password: config.database.PASSWORD
        })
        try {
            await connection.query(`DROP DATABASE IF EXISTS \`${targetDb.replace(/`/g, '``')}\``)
            console.log(`[Integration] 已删除验证库 ${targetDb}`)
        } finally {
            await connection.end()
        }
    })
}
