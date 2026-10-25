import request from "../utils/request";

// 用户信息类型
export interface UserInfo {
  id: number;
  username: string;
  mail: string;
  user_type: string;
  imgurl?: string;
  status: 0 | 1;
}

// 分页用户列表响应类型
export interface UserListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    allTotal: number;
    roleCounts: Record<string, number>;
    bannedTotal: number;
    activeRoleCounts: Record<string, number>;
    page: number;
    pageSize: number;
    totalPage: number;
    list: UserInfo[];
  };
}

// 分页查询所有用户
export function getAllUsers(page = 1, pageSize = 5, keyword = "", status?: 0 | 1) {
  return request.post("/user/allUser", null, {
    params: {
      page,
      pageSize,
      keyword,
      status,
    },
  });
}

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
  return request.post('/user/createUser', data)
}

// 编辑用户时提交的数据
export interface UpdateUserParams {
  username: string;
  mail: string;
  user_type: 'normal' | 'editor' | 'visitor' | 'admin';
}

// 更新用户（仅管理员）
export function updateUser(id: number, data: UpdateUserParams) {
  return request.put(`/user/updateUser/${id}`, data)
}

// 删除用户（仅管理员，具体权限由后端校验）
export function deleteUser(id: number) {
  return request.delete(`/user/deleteUser/${id}`)
}

// 修改用户启用/禁用状态（仅管理员）
export function updateUserStatus(id: number, status: 0 | 1) {
  return request.put(`/user/updateUserStatus/${id}`, { status });
}
