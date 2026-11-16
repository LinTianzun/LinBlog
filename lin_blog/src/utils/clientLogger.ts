const isDevelopment = import.meta.env.DEV

export const logError = (message: string, error: unknown) => {
    if (isDevelopment) console.error(message, error)
}

export const logWarning = (message: string, error: unknown) => {
    if (isDevelopment) console.warn(message, error)
}
