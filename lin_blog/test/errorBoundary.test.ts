import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatErrorDetail, isRetryableError } from '../src/utils/errorBoundary.ts'

describe('formatErrorDetail', () => {
    it('prefers stack over message', () => {
        const err = new Error('boom')
        const detail = formatErrorDetail(err)
        assert.ok(detail.includes('boom'))
        assert.ok(detail.length > 'boom'.length)
    })

    it('falls back to message when stack is missing', () => {
        assert.equal(formatErrorDetail({ message: 'no stack here' }), 'no stack here')
    })

    it('stringifies non-error values', () => {
        assert.equal(formatErrorDetail('plain string'), 'plain string')
        assert.equal(formatErrorDetail(42), '42')
    })

    it('handles null and undefined as unknown error', () => {
        assert.equal(formatErrorDetail(null), '未知错误')
        assert.equal(formatErrorDetail(undefined), '未知错误')
    })

    it('handles empty message gracefully', () => {
        assert.equal(formatErrorDetail({ message: '   ' }), '未知错误')
    })

    it('truncates overly long details', () => {
        const long = 'x'.repeat(2000)
        const detail = formatErrorDetail({ message: long })
        assert.ok(detail.length < 1300, `expected truncated, got ${detail.length}`)
        assert.ok(detail.includes('已截断'))
    })
})

describe('isRetryableError', () => {
    it('ordinary runtime errors are retryable', () => {
        assert.equal(isRetryableError(new TypeError('bad type')), true)
        assert.equal(isRetryableError(new Error('generic')), true)
    })

    it('syntax and reference errors are not retryable', () => {
        const syntax = new Error('bad syntax')
        syntax.name = 'SyntaxError'
        assert.equal(isRetryableError(syntax), false)

        const reference = new Error('not defined')
        reference.name = 'ReferenceError'
        assert.equal(isRetryableError(reference), false)
    })

    it('non-error values are retryable', () => {
        assert.equal(isRetryableError(null), true)
        assert.equal(isRetryableError('oops'), true)
    })
})
