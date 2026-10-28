import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getMyPermissions } from "../api/permission";

const PERMISSION_STORAGE_KEY = "linlogPermissions";
const SUPER_ADMIN_STORAGE_KEY = "linlogSuperAdmin";

const readStoredPermissions = (): string[] => {
  try {
    const raw = localStorage.getItem(PERMISSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const writeStoredPermissions = (permissions: string[]): void => {
  try {
    localStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify(permissions));
  } catch {
    // 隐私模式下写入失败时降级为内存态，不影响页面可用
  }
};

/**
 * 登录态会话：保存后端授予的权限集合与超级管理员标记。
 *
 * 权限以登录后一次性拉取为准（localStorage 只做首屏缓存，避免刷新时闪现无权限态），
 * 后端权限矩阵变更后，重新登录或再次拉取即可生效，不需要重启服务。
 */
export const useSessionStore = defineStore("session", () => {
  const permissions = ref<string[]>(readStoredPermissions());
  const isSuperAdmin = ref(localStorage.getItem(SUPER_ADMIN_STORAGE_KEY) === "1");
  const loaded = ref(false);
  const loading = ref(false);

  const permissionSet = computed(() => new Set(permissions.value));

  // 超级管理员固定拥有全部权限，前端不逐项比对权限清单
  const can = (permissionKey?: string | null): boolean => {
    if (!permissionKey) return true;
    if (isSuperAdmin.value) return true;
    return permissionSet.value.has(permissionKey);
  };

  const canAny = (keys: string[] = []): boolean => keys.some((key) => can(key));

  const applyPayload = (payload: {
    permissions?: string[];
    isSuperAdmin?: boolean;
  }): void => {
    permissions.value = Array.isArray(payload.permissions) ? payload.permissions : [];
    isSuperAdmin.value = Boolean(payload.isSuperAdmin);
    writeStoredPermissions(permissions.value);
    try {
      localStorage.setItem(SUPER_ADMIN_STORAGE_KEY, isSuperAdmin.value ? "1" : "0");
    } catch {
      // 同上：写入失败只影响首屏缓存
    }
    loaded.value = true;
  };

  const refresh = async (): Promise<void> => {
    if (loading.value) return;
    if (!localStorage.getItem("token")) {
      clear();
      return;
    }

    loading.value = true;
    try {
      const result = await getMyPermissions();
      if (result.code === 200 && result.data) {
        applyPayload(result.data);
        return;
      }
    } catch {
      // 接口异常时保留上一次的权限快照，避免误把可用功能隐藏掉
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  };

  const clear = (): void => {
    permissions.value = [];
    isSuperAdmin.value = false;
    loaded.value = false;
    writeStoredPermissions([]);
    try {
      localStorage.removeItem(SUPER_ADMIN_STORAGE_KEY);
    } catch {
      // 忽略清理失败
    }
  };

  return { permissions, isSuperAdmin, loaded, loading, can, canAny, refresh, clear, applyPayload };
});
