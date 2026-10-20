
import axios, {
    type AxiosInstance,
    type AxiosRequestConfig
} from 'axios'

interface DataRequest {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig,
  ): Promise<T>;
  put<T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig,
  ): Promise<T>;
  patch<T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig,
  ): Promise<T>;
}

const instance: AxiosInstance = axios.create({
    baseURL: '/api',
    timeout: 10000
})

// 请求拦截：自动携带登录 Token
instance.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token')

        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }

        return config
    },
    error => Promise.reject(error)
)

// 响应拦截：业务代码直接获取 response.data
instance.interceptors.response.use(
    response => response.data,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token')
            localStorage.removeItem('userInfo')

            if (window.location.pathname !== '/loginRegister') {
                window.location.href = '/loginRegister'
            }
        }

        return Promise.reject(error)
    }
)

// 仅调整 TypeScript 类型，不改变实际请求行为
const request = instance as unknown as DataRequest

export default request
