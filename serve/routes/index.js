
module.exports = (app) => {
    //  引入用户相关路由
    require('./user')(app)
    //  引入评论相关路由
    require('./comment')(app)
}