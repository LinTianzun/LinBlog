import request from "../utils/request";

// 单个权限项（后端 config/accessControl.js 的 PERMISSIONS）
export interface PermissionItem {
  key: string;
  group: string;
  label: string;
  description: string;
  risk?: "high" | "critical";
  protected?: boolean;
}

// 权限分组（后端 PERMISSION_GROUPS）
export interface PermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: PermissionItem[];
}

// 角色列（后端 ROLES + 实时权限与成员数）
export interface PermissionRole {
  key: string;
  userType: string;
  label: string;
  description: string;
  editable: boolean;
  tone: string;
  permissions: string[];
  memberCount: number;
}

export interface PermissionCatalog {
  roles: PermissionRole[];
  groups: PermissionGroup[];
  editableRoles: string[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export interface PermissionChange {
  roleKey: string;
  permissionKey: string;
  allowed: boolean;
}

// 角色权限矩阵（需要 permission.view 权限）
export function getPermissionCatalog() {
  return request.get<ApiResult<PermissionCatalog>>("/permission/catalog");
}

// 当前登录账号的有效权限集合（任何登录用户可读）
export function getMyPermissions() {
  return request.get<
    ApiResult<{ permissions: string[]; isSuperAdmin: boolean; canEditPermissions: boolean }>
  >("/permission/me");
}

// 保存矩阵变更（仅超级管理员）；只提交发生变化的格子
export function updatePermissionMatrix(changes: PermissionChange[]) {
  return request.put<ApiResult<PermissionCatalog>>("/permission/matrix", { changes });
}
