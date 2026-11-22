const newsletterController = require('../controller/newsletterController')
const { sameOrigin } = require('../middleware/sameOrigin')
const { newsletterSubscribeLimit } = require('../middleware/rateLimit')

module.exports = (app) => {
    app.get('/api/newsletter/status', newsletterController.getStatus)
    app.post(
        '/api/newsletter/subscribe',
        sameOrigin,
        newsletterSubscribeLimit,
        newsletterController.subscribe
    )
    app.get('/api/newsletter/confirm', newsletterController.confirm)
    app.get('/api/newsletter/unsubscribe', newsletterController.unsubscribe)
}
