const assert = require('node:assert/strict')
const test = require('node:test')

const { isSpaFallbackRequest } = require('../utils/frontendStatic')

function request(method, path) {
    return { method, path }
}

test('frontend fallback serves client-side routes', () => {
    assert.equal(isSpaFallbackRequest(request('GET', '/portal')), true)
    assert.equal(isSpaFallbackRequest(request('GET', '/editarticle/42')), true)
    assert.equal(isSpaFallbackRequest(request('HEAD', '/loginRegister')), true)
})

test('frontend fallback leaves API, health and SEO routes untouched', () => {
    for (const path of ['/api', '/api/article', '/healthz', '/sitemap.xml', '/robots.txt', '/feed.xml']) {
        assert.equal(isSpaFallbackRequest(request('GET', path)), false, path)
    }
})

test('frontend fallback does not mask missing static files or unsupported methods', () => {
    assert.equal(isSpaFallbackRequest(request('GET', '/assets/missing.js')), false)
    assert.equal(isSpaFallbackRequest(request('POST', '/portal')), false)
})
