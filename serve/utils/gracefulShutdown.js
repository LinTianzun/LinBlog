function createGracefulShutdown(options) {
    const {
        server,
        cleanupTasks = [],
        closeDatabase,
        timeoutMs = 10_000,
        logger,
        exit = (code) => process.exit(code),
    } = options
    const shutdownLogger = logger || require('./logger').logger

    let shutdownPromise = null

    return function shutdown(signal, fatalError = null) {
        if (shutdownPromise) return shutdownPromise

        shutdownPromise = (async () => {
            const exitCode = fatalError ? 1 : 0
            shutdownLogger.info(`收到 ${signal}，开始优雅退出`)

            for (const task of cleanupTasks) {
                try {
                    task()
                } catch (err) {
                    shutdownLogger.error('停止后台任务失败', null, err)
                }
            }

            let timeout
            try {
                const closing = new Promise((resolve, reject) => {
                    server.close((err) => {
                        if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') reject(err)
                        else resolve()
                    })
                })

                if (typeof server.closeIdleConnections === 'function') {
                    server.closeIdleConnections()
                }

                const deadline = new Promise((_, reject) => {
                    timeout = setTimeout(() => {
                        const err = new Error('优雅退出超时')
                        err.code = 'SHUTDOWN_TIMEOUT'
                        reject(err)
                    }, timeoutMs)
                    if (timeout.unref) timeout.unref()
                })

                await Promise.race([closing, deadline])
                if (closeDatabase) await closeDatabase()
            } catch (err) {
                shutdownLogger.error('优雅退出失败', null, err)
                exit(1)
                return
            } finally {
                clearTimeout(timeout)
            }

            shutdownLogger.info('服务已停止')
            exit(exitCode)
        })()

        return shutdownPromise
    }
}

module.exports = { createGracefulShutdown }
