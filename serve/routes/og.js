const ogController = require('../controller/ogController')

module.exports = (app) => {
    app.get('/og/home.png', ogController.getHomeImage)
    app.get('/og/article/:id.png', ogController.getArticleImage)
    app.get('/og/gallery/:id.png', ogController.getGalleryImage)
    app.get('/og/diary/:id.png', ogController.getDiaryImage)
    app.get('/og/series/:id.png', ogController.getSeriesImage)
    app.get('/og/note/:id.png', ogController.getNoteImage)
}
