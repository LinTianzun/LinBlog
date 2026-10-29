const seoController = require('../controller/seoController')

module.exports = (app) => {
    app.get('/sitemap.xml', seoController.getSitemap)
    app.get('/robots.txt', seoController.getRobots)
    app.get('/feed.xml', seoController.getFeed)

    // 便利别名：反向代理未单独转发根级 SEO 文件时仍可直接访问
    app.get('/api/seo/sitemap.xml', seoController.getSitemap)
    app.get('/api/seo/robots.txt', seoController.getRobots)
    app.get('/api/seo/feed.xml', seoController.getFeed)
}
