import assert from 'node:assert/strict'
import test from 'node:test'
import { isCommentOwner } from '../src/components/content/comment.ts'

test('本人评论不会被判定为可举报对象', () => {
  assert.equal(isCommentOwner({ userId: 12 }, 12), true)
  assert.equal(isCommentOwner({ userId: '12' as unknown as number }, 12), true)
  assert.equal(isCommentOwner({ userId: 8 }, 12), false)
  assert.equal(isCommentOwner({ userId: 8 }, null), false)
})
