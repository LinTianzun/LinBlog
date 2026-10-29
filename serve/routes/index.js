
module.exports = (app) => {
    //  引入用户相关路由
    require('./user')(app)
    //  引入权限管理路由
    require('./permission')(app)
    //  引入评论相关路由
    require('./comment')(app)
    //  引入点赞相关路由
    require('./praise')(app)
    //  引入文章相关路由
    require('./article')(app)
    //  引入消息相关路由
    require('./message')(app)
    //  引入随笔门户互动路由（点赞/评论）
    //  必须先于 /api/public/diary/:id 挂载，避免 comment/praise 被动态 ID 路由截获
    require('./diaryInteraction')(app)
    //  引入日记相关路由
    require('./diary')(app)
    //  引入文件相关路由
    require('./file')(app)
    //  引入图片上传相关路由
    require('./upload')(app)
    //  引入上传票据路由
    require('./ticket')(app)
    //  引入分类相关路由
    require('./subset')(app)
    //  引入标签相关路由
    require('./label')(app)
    //  引入总览统计聚合路由
    require('./overview')(app)
    //  引入门户浏览计数路由
    require('./view')(app)
    //  引入系统日志路由
    require('./systemLog')(app)
    //  门户 SEO：站点地图、robots 与 RSS
    require('./seo')(app)
}
