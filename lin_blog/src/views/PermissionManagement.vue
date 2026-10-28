<template>
    <yk-space dir="vertical" size="l" class="admin-page permission-page">
        <top-title name="权限管理" description="角色权限矩阵 · 仅超级管理员可修改" :is-search="false">
            <template #custom>
                <yk-space align="center" size="m">
                    <yk-text type="third">
                        共 {{ totalPermissionCount }} 项能力 · {{ editableRoles.length }} 个可编辑角色
                    </yk-text>
                    <yk-button type="secondary" :disabled="loading" @click="loadCatalog">
                        <IconRefreshOutline /> 重新加载
                    </yk-button>
                </yk-space>
            </template>
        </top-title>

        <yk-text v-if="loading" type="secondary">正在加载权限矩阵…</yk-text>

        <yk-text v-else-if="errorMessage" type="danger">{{ errorMessage }}</yk-text>

        <template v-else>
            <!-- 角色概览：点选高亮对应列，便于横向比对 -->
            <yk-space class="permission-roles" size="m">
                <button v-for="role in roles" :key="role.key" type="button" class="permission-role"
                    :class="[`tone-${role.tone}`, { 'is-active': focusRole === role.key }]"
                    @click="toggleFocusRole(role.key)">
                    <span class="permission-role-head">
                        <span class="permission-role-name">
                            <IconCrownFill v-if="role.key === 'super_admin'" class="permission-role-crown" />
                            {{ role.label }}
                        </span>
                        <yk-tag v-if="!role.editable" size="s" type="info">固定</yk-tag>
                    </span>
                    <span class="permission-role-count">
                        <strong>{{ rolePermissionCount(role) }}</strong>
                        <small>项权限</small>
                    </span>
                    <span class="permission-role-meta">
                        {{ role.memberCount }} 位成员 · {{ role.description }}
                    </span>
                </button>
            </yk-space>

            <div class="permission-panel">
                <div class="permission-toolbar">
                    <yk-space align="center" size="m" class="permission-toolbar-left">
                        <yk-input v-model="keyword" placeholder="搜索权限名称或标识" class="permission-search"
                            :limit="30" clearable />
                        <yk-text type="third">
                            命中 {{ filteredGroups.reduce((sum, group) => sum + group.permissions.length, 0) }} 项
                        </yk-text>
                    </yk-space>

                    <yk-space align="center" size="s">
                        <yk-text v-if="pendingCount > 0" type="primary" class="permission-pending">
                            {{ pendingCount }} 项待保存
                        </yk-text>
                        <yk-text v-else type="third">已与服务端一致</yk-text>
                        <yk-button v-if="pendingCount > 0" type="secondary" :disabled="saving"
                            @click="resetDraft">撤销</yk-button>
                    </yk-space>
                </div>

                <div class="permission-matrix">
                    <table>
                        <thead>
                            <tr>
                                <th class="permission-col-name">权限</th>
                                <th v-for="role in roles" :key="role.key" class="permission-col-role"
                                    :class="{ 'is-focus': focusRole === role.key }">
                                    <span class="permission-col-role-label">{{ role.label }}</span>
                                    <yk-button v-if="isRoleEditable(role)" type="secondary" size="s"
                                        class="permission-col-role-action"
                                        @click.stop="toggleWholeRole(role)">
                                        {{ isRoleFullyGranted(role) ? '全部取消' : '全部授予' }}
                                    </yk-button>
                                    <span v-else class="permission-col-role-lock">
                                        <IconLockFill /> 固定
                                    </span>
                                </th>
                            </tr>
                        </thead>

                        <tbody v-for="group in filteredGroups" :key="group.key">
                            <tr class="permission-group-row">
                                <th :colspan="roles.length + 1">
                                    <span class="permission-group-label">{{ group.label }}</span>
                                    <span class="permission-group-desc">{{ group.description }}</span>
                                </th>
                            </tr>

                            <tr v-for="permission in group.permissions" :key="permission.key"
                                class="permission-row">
                                <td class="permission-cell-name">
                                    <span class="permission-name">
                                        {{ permission.label }}
                                        <yk-tag v-if="permission.risk === 'critical'" size="s" type="danger">
                                            极高风险
                                        </yk-tag>
                                        <yk-tag v-else-if="permission.risk === 'high'" size="s" type="warning">
                                            高风险
                                        </yk-tag>
                                    </span>
                                    <span class="permission-desc">{{ permission.description }}</span>
                                    <code class="permission-key">{{ permission.key }}</code>
                                </td>

                                <td v-for="role in roles" :key="`${role.key}-${permission.key}`"
                                    class="permission-cell" :class="{ 'is-focus': focusRole === role.key }">
                                    <button type="button" class="permission-switch"
                                        :class="{
                                            'is-on': isGranted(role, permission),
                                            'is-locked': !isCellEditable(role, permission),
                                            'is-dirty': isDirty(role, permission),
                                        }"
                                        :disabled="!isCellEditable(role, permission)"
                                        :aria-pressed="isGranted(role, permission)"
                                        :title="cellTitle(role, permission)"
                                        @click="toggleCell(role, permission)">
                                        <span class="permission-switch-dot">
                                            <IconTickOutline v-if="isGranted(role, permission)" />
                                            <IconLockFill v-else-if="!isCellEditable(role, permission)" />
                                            <IconCrossOutline v-else />
                                        </span>
                                    </button>
                                </td>
                            </tr>
                        </tbody>

                        <tbody v-if="filteredGroups.length === 0">
                            <tr>
                                <td :colspan="roles.length + 1" class="permission-empty">
                                    没有匹配的权限项
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="permission-footer">
                    <yk-space align="center" size="m">
                        <yk-text v-if="!canEdit" type="secondary">
                            只读模式：仅超级管理员可以修改权限矩阵
                        </yk-text>
                        <yk-text v-else-if="pendingCount > 0" type="primary">
                            保存后立即生效，已登录用户下次请求即按新权限生效
                        </yk-text>
                        <yk-text v-else type="third">
                            勾选权限后点击保存，变更会写入系统日志
                        </yk-text>
                    </yk-space>

                    <yk-space align="center" size="s">
                        <yk-button v-if="canEdit" type="secondary" :disabled="saving || pendingCount === 0"
                            @click="resetDraft">撤销</yk-button>
                        <yk-button v-if="canEdit" :disabled="saving || pendingCount === 0"
                            :loading="saving" @click="saveMatrix">
                            {{ saving ? '正在保存…' : `保存 ${pendingCount || ''} 项变更` }}
                        </yk-button>
                    </yk-space>
                </div>
            </div>
        </template>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import {
    getPermissionCatalog,
    updatePermissionMatrix,
    type PermissionChange,
    type PermissionItem,
    type PermissionRole,
} from '../api/permission'
import { useSessionStore } from '../store/session'

type MessageOptions = { type: 'primary' | 'success' | 'warning' | 'error'; message: string }
type MessageProxy = { $message?: (options: MessageOptions) => void }

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const session = useSessionStore()

const showMessage = (type: MessageOptions['type'], message: string): void => {
    proxy?.$message?.({ type, message })
}

const describeError = (error: unknown, fallback: string): string => {
    const response = (error as { response?: { data?: { message?: string } } })?.response
    return response?.data?.message || (error instanceof Error ? error.message : fallback)
}

const roles = ref<PermissionRole[]>([])
const editableRoles = ref<string[]>([])
const groups = ref<{ key: string; label: string; description: string; permissions: PermissionItem[] }[]>([])
// 草稿以「角色:权限」为键，保存时只提交与服务端不一致的格子
const draft = ref<Record<string, boolean>>({})
const keyword = ref('')
const focusRole = ref('')
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const canEdit = computed(() => session.isSuperAdmin)
const totalPermissionCount = computed(() =>
    groups.value.reduce((sum, group) => sum + group.permissions.length, 0)
)

const filteredGroups = computed(() => {
    const term = keyword.value.trim().toLowerCase()
    if (!term) return groups.value

    return groups.value
        .map(group => ({
            ...group,
            permissions: group.permissions.filter(permission =>
                permission.label.toLowerCase().includes(term) ||
                permission.key.toLowerCase().includes(term) ||
                permission.description.toLowerCase().includes(term)
            )
        }))
        .filter(group => group.permissions.length > 0)
})

const cellKey = (roleKey: string, permissionKey: string): string => `${roleKey}:${permissionKey}`

const serverValue = (role: PermissionRole, permission: PermissionItem): boolean =>
    role.permissions.includes(permission.key)

const isGranted = (role: PermissionRole, permission: PermissionItem): boolean => {
    const key = cellKey(role.key, permission.key)
    const value = draft.value[key]
    return value === undefined ? serverValue(role, permission) : value
}

const isRoleEditable = (role: PermissionRole): boolean =>
    canEdit.value && role.editable && editableRoles.value.includes(role.key)

const isCellEditable = (role: PermissionRole, permission: PermissionItem): boolean =>
    isRoleEditable(role) && !permission.protected

const isDirty = (role: PermissionRole, permission: PermissionItem): boolean => {
    const value = draft.value[cellKey(role.key, permission.key)]
    return value !== undefined && value !== serverValue(role, permission)
}

const cellTitle = (role: PermissionRole, permission: PermissionItem): string => {
    if (permission.protected) return '该权限由超级管理员固定持有，不可修改'
    if (!role.editable) return `${role.label}为系统固定角色，权限不可修改`
    if (!canEdit.value) return '只读模式：仅超级管理员可以修改'
    return `${role.label} · ${permission.label}`
}

const pendingChanges = computed<PermissionChange[]>(() => {
    const changes: PermissionChange[] = []
    for (const role of roles.value) {
        for (const group of groups.value) {
            for (const permission of group.permissions) {
                const value = draft.value[cellKey(role.key, permission.key)]
                if (value === undefined || value === serverValue(role, permission)) continue
                changes.push({ roleKey: role.key, permissionKey: permission.key, allowed: value })
            }
        }
    }
    return changes
})

const pendingCount = computed(() => pendingChanges.value.length)

const rolePermissionCount = (role: PermissionRole): number => {
    let count = 0
    for (const group of groups.value) {
        for (const permission of group.permissions) {
            if (isGranted(role, permission)) count += 1
        }
    }
    return count
}

const isRoleFullyGranted = (role: PermissionRole): boolean => {
    const editablePermissions = groups.value
        .flatMap(group => group.permissions)
        .filter(permission => !permission.protected)
    return editablePermissions.length > 0 && editablePermissions.every(permission => isGranted(role, permission))
}

const toggleCell = (role: PermissionRole, permission: PermissionItem): void => {
    if (!isCellEditable(role, permission)) return
    draft.value = {
        ...draft.value,
        [cellKey(role.key, permission.key)]: !isGranted(role, permission)
    }
}

// 整列授予/取消：受保护权限始终跳过，避免提交无效变更
const toggleWholeRole = (role: PermissionRole): void => {
    const grantAll = !isRoleFullyGranted(role)
    const next = { ...draft.value }
    for (const group of groups.value) {
        for (const permission of group.permissions) {
            if (permission.protected) continue
            next[cellKey(role.key, permission.key)] = grantAll
        }
    }
    draft.value = next
}

const resetDraft = (): void => {
    draft.value = {}
}

const toggleFocusRole = (roleKey: string): void => {
    focusRole.value = focusRole.value === roleKey ? '' : roleKey
}

const applyCatalog = (payload: {
    roles: PermissionRole[]
    groups: { key: string; label: string; description: string; permissions: PermissionItem[] }[]
    editableRoles: string[]
}): void => {
    roles.value = payload.roles
    groups.value = payload.groups
    editableRoles.value = payload.editableRoles
    draft.value = {}
}

const loadCatalog = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getPermissionCatalog()
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '权限矩阵加载失败')
        }
        applyCatalog(result.data)
    } catch (error) {
        errorMessage.value = describeError(error, '权限矩阵加载失败，请检查后端服务')
    } finally {
        loading.value = false
    }
}

const saveMatrix = async (): Promise<void> => {
    if (saving.value || pendingCount.value === 0) return

    saving.value = true

    try {
        const result = await updatePermissionMatrix(pendingChanges.value)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '权限矩阵保存失败')
        }
        applyCatalog(result.data)
        // 自己的权限可能同时变化（比如管理员被收回权限），同步刷新会话
        await session.refresh()
        showMessage('success', `已保存 ${pendingChanges.value.length} 项权限变更`)
    } catch (error) {
        showMessage('error', describeError(error, '权限矩阵保存失败'))
    } finally {
        saving.value = false
    }
}

onMounted(() => {
    void loadCatalog()
})
</script>

<style lang="less" scoped>
.permission-page {
    width: 100%;
}

.permission-roles {
    width: 100%;
    align-items: stretch;
    flex-wrap: wrap;
}

.permission-role {
    display: flex;
    flex: 1 1 200px;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    padding: 16px 18px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--admin-surface, var(--bgColor1));
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;

    &:hover {
        transform: translateY(-2px);
        border-color: var(--pcolor3);
        box-shadow: var(--admin-shadow-md, @shadow-m);
    }

    &.is-active {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 2px var(--pcolor2);
    }

    &-head {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
    }

    &-name {
        overflow: hidden;
        color: var(--gray);
        font-size: 14px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &-crown {
        color: var(--wcolor);
        font-size: 14px;
    }

    &-count {
        display: flex;
        align-items: baseline;
        gap: 5px;

        strong {
            color: var(--gray);
            font-size: clamp(22px, 2vw, 30px);
            font-weight: 760;
            line-height: 1;
            letter-spacing: -0.04em;
        }

        small {
            color: var(--gray6);
            font-size: 11px;
        }
    }

    &-meta {
        overflow: hidden;
        color: var(--gray6);
        font-size: 11.5px;
        line-height: 1.5;
        text-overflow: ellipsis;
    }
}

.permission-panel {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.permission-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 16px clamp(14px, 1.6vw, 22px);
    border-bottom: 1px solid var(--admin-line, var(--gray1));

    .permission-search {
        width: clamp(200px, 22vw, 300px);
    }
}

.permission-pending {
    font-weight: 600;
}

.permission-matrix {
    width: 100%;
    overflow-x: auto;

    table {
        width: 100%;
        min-width: 720px;
        border-collapse: collapse;
        text-align: left;
    }

    th,
    td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--admin-line, var(--gray1));
        vertical-align: middle;
    }
}

.permission-col-name {
    min-width: 260px;
    color: var(--gray6);
    font-size: 12px;
    font-weight: 600;
}

.permission-col-role {
    width: 132px;
    color: var(--gray);
    font-size: 13px;
    font-weight: 650;
    text-align: center;

    &.is-focus {
        background: var(--pcolor1);
    }

    &-label {
        display: block;
        margin-bottom: 6px;
    }

    &-action {
        font-size: 11px;
    }

    &-lock {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--gray6);
        font-size: 11px;
        font-weight: 500;
    }
}

.permission-group-row th {
    padding: 10px 14px;
    background: color-mix(in srgb, var(--bgColor2) 62%, transparent);

    .permission-group-label {
        color: var(--gray);
        font-size: 13px;
        font-weight: 700;
    }

    .permission-group-desc {
        margin-left: 9px;
        color: var(--gray6);
        font-size: 11.5px;
        font-weight: 400;
    }
}

.permission-cell-name {
    min-width: 260px;

    .permission-name {
        display: flex;
        align-items: center;
        gap: 7px;
        color: var(--gray);
        font-size: 13px;
        font-weight: 600;
    }

    .permission-desc {
        display: block;
        margin-top: 4px;
        color: var(--gray6);
        font-size: 11.5px;
        line-height: 1.6;
    }

    .permission-key {
        display: inline-block;
        margin-top: 6px;
        padding: 1px 7px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--bgColor3) 70%, transparent);
        color: var(--gray6);
        font-size: 11px;
    }
}

.permission-cell {
    text-align: center;

    &.is-focus {
        background: var(--pcolor1);
    }
}

.permission-switch {
    display: inline-grid;
    width: 40px;
    height: 24px;
    place-items: center;
    padding: 0;
    border: 1px solid var(--admin-line-strong, var(--gray3));
    border-radius: 999px;
    background: color-mix(in srgb, var(--gray3) 30%, transparent);
    color: var(--gray6);
    font-size: 12px;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease;

    &-dot {
        display: grid;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        place-items: center;
        background: var(--admin-surface, var(--bgColor1));
        transition: transform 160ms ease;
    }

    &.is-on {
        border-color: var(--pcolor);
        background: var(--pcolor);
        color: #fff;

        .permission-switch-dot {
            background: rgba(255, 255, 255, 0.22);
        }
    }

    &.is-dirty {
        box-shadow: 0 0 0 3px var(--pcolor2);
    }

    &.is-locked {
        cursor: not-allowed;
        opacity: 0.55;
    }

    &.is-locked.is-on {
        border-color: color-mix(in srgb, var(--gray6) 55%, transparent);
        background: color-mix(in srgb, var(--gray6) 45%, transparent);
    }
}

.permission-empty {
    padding: 36px 14px;
    color: var(--gray6);
    font-size: 13px;
    text-align: center;
}

.permission-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 16px clamp(14px, 1.6vw, 22px);
    border-top: 1px solid var(--admin-line, var(--gray1));
}

@media (max-width: 760px) {
    .permission-toolbar,
    .permission-footer {
        flex-direction: column;
        align-items: stretch;
    }

    .permission-search {
        width: 100%;
    }
}
</style>
