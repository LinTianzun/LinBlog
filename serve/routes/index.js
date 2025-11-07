
module.exports = (app) => {
    //  引入用户相关路由
    require('./user')(app)
    //  引入评论相关路由
    require('./comment')(app)
    //  引入文章相关路由
    require('./article')(app)
    //  引入消息相关路由
    require('./message')(app)
}