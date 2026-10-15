import request from "../utils/request";

// 用户信息类型
export interface UserInfo {
  id: number;
  username: string;
  mail: string;
  user_type: string;
  imgurl?: string;
}

// 分页用户列表响应类型
export interface UserListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    page: number;
    pageSize: number;
    totalPage: number;
    list: UserInfo[];
  };
}

// 分页查询所有用户
export function getAllUsers(page = 1, pageSize = 5, keyword = "") {
  return request.post("/user/allUser", null, {
    params: {
      page,
      pageSize,
      keyword,
    },
  });
}
// export function getAllUsers(page = 1, pageSize = 5) {
//     return request.post<unknown, UserListResponse>(
//         '/user/allUser',
//         null,
//         {
//             params: {
//                 page,
//                 pageSize
//             }
//         }
//     )
// }


// 创建用户时提交的数据
export interface CreateUserParams {
  username: string;
  mail: string;
  password: string;
  user_type: 'normal' | 'editor' | 'visitor' | 'admin';
  imgurl?: string;
}

// 创建用户（仅管理员）
export function createUser(data: CreateUserParams) {
  return request.post('/user/createUser', data);
}
