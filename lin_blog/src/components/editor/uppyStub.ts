/**
 * `@wangeditor/core` 的 `createUploader` 依赖 @uppy/core + @uppy/xhr-upload，
 * 这是预构建 ESM 产物里的顶层 import，rollup 无法 tree-shake，稳定占掉约 75 KB。
 *
 * 本站编辑器不启用图片/视频上传（封面走独立的 forms 上传组件），也就从不调用
 * `createUploader`。这里用同形状的占位类替换真实 Uppy：真被调用时给出明确报错，
 * 而不是静默失败。
 */

export class UppyNotAvailableError extends Error {
    constructor() {
        super('编辑器内上传未启用：请使用表单里的封面上传')
        this.name = 'UppyNotAvailableError'
    }
}

export default class UppyStub {
    constructor() {
        throw new UppyNotAvailableError()
    }
}
