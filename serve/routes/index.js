
module.exports = (app) => {
    //  引入用户相关路由
    require('./user')(app)
    //  引入评论相关路由
    require('./comment')(app)
    //  引入文章相关路由
    require('./article')(app)
    //  引入消息相关路由
    require('./message')(app)
    //  引入日记相关路由
    require('./diary')(app)
    //  引入图片上传相关路由
    require('./upload')(app)
    //  引入分类相关路由
    require('./subset')(app)
    //  引入标签相关路由
    require('./label')(app)
}
