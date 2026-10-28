// 真实 MySQL 集成测试：仅在显式提供 LINBLOG_INTEGRATION_DB 时运行。
// 会创建独立的验证数据库并在结束后删除，绝不触碰默认业务库。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
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
    // 文件磁盘操作全部落在临时目录，测试后统一清理，不污染仓库数据目录。
    // 必须在引入 fileController（内部按模块加载读取环境变量）之前设置。
    const integrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linblog-integration-'))
    process.env.LINBLOG_FILE_STORAGE_DIR = path.join(integrationRoot, 'files')
    process.env.LINBLOG_FILE_BACKUP_DIR = path.join(integrationRoot, 'backups')
    process.env.LINBLOG_FILE_BACKUP_MIRROR_DIR = path.join(integrationRoot, 'mirror')

    const db = require('../model/db/dbnew')
    const userModel = require('../model/dbModel/users/index')
    const articleModel = require('../model/dbModel/article/index')
    const imageModel = require('../model/dbModel/image/index')
    const fileModel = require('../model/dbModel/file/index')
    const commentController = require('../controller/commentController')
    const userController = require('../controller/userController')
    const fileController = require('../controller/fileController')
    const uploadController = require('../controller/uploadController')
    const fileStorage = require('../utils/fileStorage')

    const ids = {}

    function response() {
        return {
            // Express 成功路径默认就是 200（只调 json 不调 status）
            statusCode: 200,
            body: null,
            status(code) { this.statusCode = code; return this },
            json(body) { this.body = body; return this }
        }
    }

    // multer/busboy 对非 IncomingMessage 的普通流不会解析出文件，
    // 上传用例走真实 HTTP 服务器 + fetch/FormData，保持端到端语义。
    async function uploadViaHttp(field, filename, type, data) {
        // 控制器假设 res 是 Express response（有 .status/.json），
        // 用 express() 而非裸 http.createServer，保持端到端语义。
        const express = require('express')
        const app = express()
        app.post('/api/upload/image', (req, res) => uploadController.uploadImage(req, res))
        const server = app.listen(0, '127.0.0.1')
        await new Promise(resolve => server.once('listening', resolve))
        // Express 默认错误处理对 multer 抛出的 415/413 会返回 HTML，
        // 控制器设计为 yk-upload 仅看 HTTP 200 + 业务错误码，
        // 这里统一用 200 业务码做断言；multer 错误在真实路由里另有 errorHandler。
        app.use((err, _req, res, _next) => {
            const code = err.status || 400
            res.status(200).json({ code, error: err.message, message: err.message })
        })
        const form = new FormData()
        form.append(field, new Blob([data], { type }), filename)
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}/api/upload/image`, {
                method: 'POST',
                body: form,
                signal: AbortSignal.timeout(10000)
            })
            const text = await res.text()
            try {
                return { status: res.status, body: JSON.parse(text) }
            } catch {
                return { status: res.status, body: { raw: text } }
            }
        } finally {
            if (typeof server.closeAllConnections === 'function') {
                server.closeAllConnections()
            }
            await new Promise(resolve => server.close(resolve))
        }
    }

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

    test('image upload accepts valid files and rejects invalid branches', async () => {
        // 正常分支：落库成功并返回可回读的 URL
        const validPayload = Buffer.from('integration-upload-png-bytes')
        const validRes = await uploadViaHttp('file', 'valid.png', 'image/png', validPayload)
        assert.equal(validRes.status, 200)
        assert.equal(validRes.body.code, 200)
        assert.match(validRes.body.data.url, /^\/api\/uploads\//)
        const savedName = validRes.body.data.url.replace('/api/uploads/', '')
        const saved = await imageModel.findActiveImageByFilename(savedName)
        assert.equal(saved.length, 1)
        assert.ok(Buffer.from(saved[0].data).equals(validPayload))

        // 非法 MIME：HTTP 200 + 业务错误码 415（yk-upload 只处理 200）
        const badMimeRes = await uploadViaHttp('file', 'note.txt', 'text/plain', Buffer.from('hello'))
        assert.equal(badMimeRes.status, 200)
        assert.equal(badMimeRes.body.code, 415)

        // 超过 8MB 上限：multer 中断并映射为 413
        const oversizeRes = await uploadViaHttp('file', 'big.png', 'image/png', Buffer.alloc(8 * 1024 * 1024 + 1))
        assert.equal(oversizeRes.status, 200)
        assert.equal(oversizeRes.body.code, 413)

        // 缺少 file 字段：400 且不写库
        const emptyRes = await uploadViaHttp('other', 'none.txt', 'text/plain', Buffer.from('x'))
        assert.equal(emptyRes.status, 200)
        assert.equal(emptyRes.body.code, 400)
    })

    test('file delete backs up disk file and restore pulls from mirror when backup is lost', async () => {
        const diskName = 'it-disk-lifecycle.txt'
        await fs.promises.mkdir(process.env.LINBLOG_FILE_STORAGE_DIR, { recursive: true })
        await fs.promises.writeFile(path.join(process.env.LINBLOG_FILE_STORAGE_DIR, diskName), 'integration-disk-content')

        const inserted = await fileModel.insertFile({
            fileName: '磁盘生命周期测试.txt',
            format: 'txt',
            size: 24,
            url: diskName,
            subsetId: null
        })

        const deleteRes = response()
        await fileController.deleteFiles({
            body: { fileIds: [inserted.fileId] },
            user: { userId: ids.admin, user_type: 'admin' },
            ip: '127.0.0.1'
        }, deleteRes)
        assert.equal(deleteRes.statusCode, 200)
        assert.equal(deleteRes.body.data.backedUpCount, 1)
        assert.equal(deleteRes.body.data.offsiteFailedCount, 0)
        assert.equal(await fs.promises.access(path.join(process.env.LINBLOG_FILE_STORAGE_DIR, diskName)).then(() => true, () => false), false)
        assert.equal(await fs.promises.access(path.join(process.env.LINBLOG_FILE_BACKUP_DIR, diskName)).then(() => true, () => false), true)
        assert.equal(await fs.promises.access(path.join(process.env.LINBLOG_FILE_BACKUP_MIRROR_DIR, diskName)).then(() => true, () => false), true)

        // 本地备份丢失：回收标记不可恢复，但恢复接口会先从跨盘镜像拉回再恢复
        await fs.promises.unlink(path.join(process.env.LINBLOG_FILE_BACKUP_DIR, diskName))
        const trashRes = response()
        await fileController.getTrashFiles({ query: {} }, trashRes)
        const trashItem = trashRes.body.data.list.find(item => Number(item.id) === Number(inserted.fileId))
        assert.equal(trashItem.recoverable, false)

        const restoreRes = response()
        await fileController.restoreFiles({
            body: { fileIds: [inserted.fileId] },
            user: { userId: ids.admin, user_type: 'admin' },
            ip: '127.0.0.1'
        }, restoreRes)
        assert.equal(restoreRes.statusCode, 200)
        assert.equal(restoreRes.body.data.restoredCount, 1)
        assert.equal(
            await fs.promises.readFile(path.join(process.env.LINBLOG_FILE_STORAGE_DIR, diskName), 'utf8'),
            'integration-disk-content'
        )
        const restored = await fileModel.findFileById(inserted.fileId)
        assert.equal(Number(restored.status), 1)
        assert.equal(restored.deleted_at, null)
    })

    test('restore returns 409 missing_backup when local and mirror copies are both gone', async () => {
        const diskName = 'it-missing-backup.txt'
        await fs.promises.writeFile(path.join(process.env.LINBLOG_FILE_STORAGE_DIR, diskName), 'will-be-lost')
        const inserted = await fileModel.insertFile({
            fileName: '双丢失测试.txt',
            format: 'txt',
            size: 12,
            url: diskName,
            subsetId: null
        })

        const deleteRes = response()
        await fileController.deleteFiles({ body: { fileIds: [inserted.fileId] } }, deleteRes)
        assert.equal(deleteRes.statusCode, 200)

        await fs.promises.rm(path.join(process.env.LINBLOG_FILE_BACKUP_DIR, diskName), { force: true })
        await fs.promises.rm(path.join(process.env.LINBLOG_FILE_BACKUP_MIRROR_DIR, diskName), { force: true })

        const restoreRes = response()
        await fileController.restoreFiles({ body: { fileIds: [inserted.fileId] } }, restoreRes)
        assert.equal(restoreRes.statusCode, 409)
        assert.equal(restoreRes.body.data.restoredCount, 0)
        assert.deepEqual(restoreRes.body.data.failed, [{ id: inserted.fileId, reason: 'missing_backup' }])

        // 数据库仍保持软删状态，不出现半恢复
        const row = await fileModel.findFileById(inserted.fileId)
        assert.equal(Number(row.status), 0)
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
        // 回复二级评论会被归一挂到根评论下（两级结构），应成功而非 400
        assert.equal(res3.statusCode, 201)
        const normalizedParent = await db.query(
            'SELECT parent_id FROM comment WHERE id = ?',
            [res3.body.data.commentId]
        )
        assert.equal(Number(normalizedParent[0].parent_id), Number(commentId))

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
        assert.equal(Number(rows[0].total), 3)
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

    test('diary comment two-level reply and delete work end-to-end', async () => {
        const diaryInteractionModel = require('../model/dbModel/diaryInteraction/index')
        const interactionModel = require('../model/dbModel/commentInteraction/index')

        const diary = await db.query(
            `INSERT INTO diary (title, content, weather_id, status, created_at, updated_at)
             VALUES ('评论边界随笔', '正文', NULL, 1, NOW(), NOW())`
        )
        const diaryId = diary.insertId

        // 一级评论
        const root = await diaryInteractionModel.createComment({
            diaryId, userId: ids.normal, content: '一级评论'
        })
        assert.ok(root.commentId)

        // 回复一级评论 → parent_id 指向一级
        const reply = await diaryInteractionModel.createComment({
            diaryId, userId: ids.admin, content: '二级回复', parentId: root.commentId
        })
        // 回复二级评论 → 归一挂到根评论，replyTo 仍指向所点那条
        const nested = await diaryInteractionModel.createComment({
            diaryId, userId: ids.normal, content: '回复二级', parentId: reply.commentId
        })

        const rows = await db.query(
            `SELECT id, parent_id, reply_to_comment_id, reply_to_user_id, status
             FROM diary_comment WHERE diary_id = ? ORDER BY id`,
            [diaryId]
        )
        assert.equal(rows.length, 3)
        const [rootRow, replyRow, nestedRow] = rows
        assert.equal(Number(rootRow.parent_id), 0)
        assert.equal(Number(replyRow.parent_id), Number(rootRow.id))
        assert.equal(Number(replyRow.reply_to_user_id), ids.normal)
        // 三级归一：parent 仍是根评论，replyTo 指向二级
        assert.equal(Number(nestedRow.parent_id), Number(rootRow.id))
        assert.equal(Number(nestedRow.reply_to_comment_id), Number(replyRow.id))
        assert.equal(Number(nestedRow.reply_to_user_id), ids.admin)

        // 列表回传 replyToUserName，供前端展示「回复 @某人」
        const page = await diaryInteractionModel.getCommentsByDiary(diaryId, 1, 50, 0, null)
        assert.equal(page.total, 3)
        const nestedItem = page.list.find(item => Number(item.id) === Number(nestedRow.id))
        assert.equal(nestedItem.replyToUserName, '管理员')

        // 他人删除：无权限，行数不变
        const denied = await interactionModel.deleteComment('diary', root.commentId, ids.admin, 'normal')
        assert.equal(denied, 0)
        // 管理员删除：逻辑删除并回退 diary.comments
        const deleted = await interactionModel.deleteComment('diary', root.commentId, ids.admin, 'admin')
        assert.equal(deleted, 1)

        const after = await db.query(
            'SELECT status FROM diary_comment WHERE id = ?',
            [root.commentId]
        )
        assert.equal(Number(after[0].status), 0)

        const diaryRows = await db.query('SELECT comments FROM diary WHERE id = ?', [diaryId])
        assert.equal(Number(diaryRows[0].comments), 2)

        // 删除后列表只返回未删除的两条
        const afterPage = await diaryInteractionModel.getCommentsByDiary(diaryId, 1, 50, 0, null)
        assert.equal(afterPage.total, 2)
    })

    test('article and diary lists split comment totals into root comments and replies', async () => {
        const diaryModel = require('../model/dbModel/diary/index')

        // 文章：1 条一级评论 + 2 条回复
        const fresh = await db.query(
            `INSERT INTO article (user_id, title, content, classify, state, created_at, updated_at)
             VALUES (?, '统计口径文章', '正文', 'article', 'published', NOW(), NOW())`,
            [ids.normal]
        )
        const articleId = fresh.insertId

        const makeComment = async (content, parentId = 0) => {
            const row = await db.query(
                `INSERT INTO comment (user_id, article_id, parent_id, content, status, created_at)
                 VALUES (?, ?, ?, ?, 1, NOW())`,
                [ids.normal, articleId, parentId, content]
            )
            return row.insertId
        }
        const rootId = await makeComment('一级评论')
        await makeComment('回复一', rootId)
        await makeComment('回复二', rootId)

        const articlePage = await articleModel.findArticlesByPage({
            page: 1, pageSize: 10, offset: 0, classify: 'article', userId: ids.admin, userType: 'admin'
        })
        const row = articlePage.list.find(item => Number(item.id) === Number(articleId))
        assert.equal(Number(row.root_comments), 1)
        assert.equal(Number(row.reply_comments), 2)

        // 随笔：1 条一级评论 + 1 条回复
        const diary = await db.query(
            `INSERT INTO diary (title, content, status, created_at, updated_at)
             VALUES ('统计口径随笔', '正文', 1, NOW(), NOW())`
        )
        const diaryId = diary.insertId
        await db.query(
            `INSERT INTO diary_comment (user_id, diary_id, parent_id, content, status, created_at)
             VALUES (?, ?, 0, '一级评论', 1, NOW())`,
            [ids.normal, diaryId]
        )
        const diaryRoot = await db.query(
            'SELECT id FROM diary_comment WHERE diary_id = ? ORDER BY id', [diaryId]
        )
        await db.query(
            `INSERT INTO diary_comment (user_id, diary_id, parent_id, content, status, created_at)
             VALUES (?, ?, ?, '回复', 1, NOW())`,
            [ids.normal, diaryId, diaryRoot[0].id]
        )

        const diaryPage = await diaryModel.getDiariesByPage({ pageSize: 10, offset: 0 })
        const diaryRow = diaryPage.list.find(item => Number(item.id) === Number(diaryId))
        assert.equal(Number(diaryRow.root_comments), 1)
        assert.equal(Number(diaryRow.reply_comments), 1)
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
        fs.rmSync(integrationRoot, { recursive: true, force: true })
    })
}
