/**
 * 分页参数验证与格式化工具
 * @param {Object} query - req.query 对象（分页参数来源）
 * @param {Object} options - 可选配置
 * @param {number} options.defaultPage - 默认页码（默认1）
 * @param {number} options.defaultPageSize - 默认每页条数（默认10）
 * @param {number} options.maxPageSize - 每页最大条数限制（默认50）
 * @returns {Object} { success: boolean, data: { page, pageSize } | errorMsg: string }
 */
function formatPaginationParams(query, options = {}) {
    // 合并默认配置与用户配置
    const {
        defaultPage = 1,
        defaultPageSize = 10,
        maxPageSize = 50
    } = options

    //  提取并转换分页参数（从query中获取，转为整数）
    let { page, pageSize } = query
    page = parseInt(page, 10) || defaultPage
    pageSize = parseInt(pageSize, 10) || defaultPageSize

    //  合法性校验
    if (page < 1) {
        return {
            success: false,
            errorMsg: `页码必须是大于0的整数(当前：${page})`
        }
    }

    if (pageSize < 1 || pageSize > maxPageSize) {
        return {
            success: false,
            errorMsg: `每页条数必须是1-${maxPageSize}之间的整数(当前：${pageSize})`
        }
    }

    //  校验通过，返回格式化后的参数
    return {
        success: true,
        data: {
            page,
            pageSize,
            offset: (page - 1) * pageSize // 新增：计算偏移量（直接供SQL使用）
        }
    }
}

module.exports = {
    formatPaginationParams
}