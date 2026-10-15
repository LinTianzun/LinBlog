
import axios from 'axios'

const request = axios.create({
    // 开发环境通过 Vite 代理转发到后端
    baseURL: '/api',
    timeout: 10000
})

// 请求拦截：自动携带登录 Token
request.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token')

        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }

        return config
    },
    error => Promise.reject(error)
)

// 响应拦截：统一处理响应
request.interceptors.response.use(
    response => response.data,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token')
            localStorage.removeItem('userInfo')

            // 仅在浏览器环境中跳转
            if (window.location.pathname !== '/loginRegister') {
                window.location.href = '/loginRegister'
            }
        }

        return Promise.reject(error)
    }
)

export default request