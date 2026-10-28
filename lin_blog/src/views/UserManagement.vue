<template>
    <yk-space dir="vertical" size="l" class="admin-page user-management">
        <!-- 页面标题与搜索 -->
        <top-title name="用户管理" :is-search="true" @search="handleSearch" />
        <yk-text v-if="loading" type="secondary">
            正在加载用户数据...
        </yk-text>

        <yk-text v-else-if="errorMessage" type="danger">
            {{ errorMessage }}
        </yk-text>
        <!-- 用户统计 -->
        <yk-space class="statistics" size="m">
            <stat-card name="用户总数" :total="allTotal" tone="primary" clickable
                :active="statusFilter === 'all'" @click="handleFilterAll" />
            <stat-card name="管理员" :total="activeRoleCounts.admin" tone="success"
                :active="statusFilter === 'admin'"
                clickable @click="handleFilterRole('admin')" />
            <stat-card name="编辑与普通用户" :total="editorAndNormal" tone="warning"
                :active="statusFilter === 'staff'"
                clickable @click="handleFilterRole('staff')" />
            <stat-card name="封禁用户" :total="bannedTotal" tone="error" :active="statusFilter === 'banned'"
                clickable @click="handleFilterBanned" />
        </yk-space>

        <!-- 用户列表 -->
        <yk-space dir="vertical" size="m" class="user-list" >
            <yk-space align="center" justify="space-between" class="user-list-header">
                <yk-title :level="4" style="margin: 0;">
                    用户列表
                </yk-title>

                <yk-space align="center" size="m">
                    <yk-text type="secondary" style="margin-right: 16px;">
                        共 {{ total }} 位用户
                    </yk-text>

                    <button v-if="canCreateUser" class="add-user-btn" @click="openAddUserModal">
                        + 添加用户
                    </button>
                    <router-link v-if="canViewPermissions" class="permission-entry" to="/permissionManagement">
                        权限管理
                    </router-link>
                </yk-space>
            </yk-space>

            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>用户名</th>
                            <th>邮箱</th>
                            <th>用户角色</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr v-for="user in filteredUsers" :key="user.id">
                            <td>{{ user.id }}</td>
                            <td>{{ user.username }}</td>
                            <td>{{ user.mail }}</td>
                            <td>
                                <span class="role-tag" :class="`role-${user.user_type}`">
                                    <IconCrownFill v-if="isSuperAdminUser(user)" class="role-crown" />
                                    {{ roleName(user.user_type) }}
                                </span>
                                <yk-tag v-if="isSuperAdminUser(user)" size="s" type="danger" class="role-super">
                                    超级管理员
                                </yk-tag>
                            </td>
                            <td>
                                <yk-switch :model-value="Number(user.status) === 1" :checked-value="true"
                                    :unchecked-value="false" checked-color="#1fb4a2" unchecked-color="#fa5247"
                                    :disabled="isCurrentUser(user) ||
                                        updatingStatusIds.has(String(user.id)) ||
                                        !canDisableUser ||
                                        !canOperateUser(user)
                                        " :loading="updatingStatusIds.has(String(user.id))"
                                         @change="(checked:boolean | number | string) => handleStatusChange(user, checked)" />
                            </td>
                            <td>
                                <div class="action-buttons">
                                    <yk-button type="secondary" size="m" status="primary" :disabled="!canEditTarget(user)"
                                        @click="openEditUserModal(user)">
                                         编辑
                                    </yk-button>

                                    <yk-popconfirm placement="top"  trigger="click" title="确认删除" :content="`确定删除用户「${user.username}」吗？`"
                                        @confirm="handleDeleteUser(user)" >
                                        <yk-button type="secondary" size="m" status="danger"
                                            :disabled="deletingUserId === user.id || !canDeleteTarget(user)">
                                             {{ deletingUserId === user.id ? '正在删除...' : '删除' }}
                                        </yk-button>
                                        
                                    </yk-popconfirm>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="filteredUsers.length === 0">
                            <td colspan="6" class="empty-state">
                                没有找到符合条件的用户
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="user-pagination">
                <AdminPager v-model:page="currentPage" v-model:page-size="pageSize" :total="total"
                    :page-size-options="[2, 5, 10, 20]" :show-page-size="true" :show-total="true"
                    :disabled="loading" @change="handlePagerChange" />
            </div>

        </yk-space>


        <!-- 添加用户弹窗 -->
        <div v-if="addUserModalVisible" class="modal-mask" @click.self="closeAddUserModal">
            <div class="user-modal">
                <div class="modal-header">
                    <h3>添加用户</h3>
                    <button type="button" class="modal-close" @click="closeAddUserModal">
                        ×
                    </button>
                </div>

                <form @submit.prevent="submitAddUser">
                    
                    <div class="form-item">
                        <label for="new-username">用户名</label>
                        <input id="new-username" v-model.trim="newUser.username" type="text" placeholder="请输入用户名"
                            required />
                    </div>

                    <div class="form-item">
                        <label for="new-mail">邮箱</label>
                        <input id="new-mail" v-model.trim="newUser.mail" type="email" placeholder="请输入邮箱" required />
                    </div>

                    <div class="form-item">
                        <label for="new-password">初始密码</label>
                        <input id="new-password" v-model="newUser.password" type="password" placeholder="请输入初始密码"
                            minlength="6" required />
                    </div>

                    <div class="form-item">
                        <label for="new-role">用户角色</label>
                        <select id="new-role" v-model="newUser.user_type">
                            <option v-for="option in assignableRoles" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                        <p v-if="!canAssignAdmin" class="form-hint">
                            仅超级管理员可以创建管理员账号
                        </p>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" @click="closeAddUserModal">
                            取消
                        </button>
                        <button type="submit" class="add-user-btn" :disabled="submitting">
                            {{ submitting ? '正在创建...' : '确认添加' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- 编辑用户弹窗 -->
        <div v-if="editUserModalVisible" class="modal-mask" @click.self="closeEditUserModal">
            <div class="user-modal">
                <div class="modal-header">
                    <h3>编辑用户</h3>

                    <button type="button" class="modal-close" @click="closeEditUserModal">
                        ×
                    </button>
                </div>

                <form @submit.prevent="submitEditUser">

                    <div class="form-item">
                        <label for="edit-username">用户名</label>
                        <input id="edit-username" v-model.trim="editUser.username" type="text" placeholder="请输入用户名"
                            required />
                    </div>

                    <div class="form-item">
                        <label for="edit-mail">邮箱</label>
                        <input id="edit-mail" v-model.trim="editUser.mail" type="email" placeholder="请输入邮箱" required />
                    </div>

                    <div class="form-item">
                        <label for="edit-role">用户角色</label>
                        <select id="edit-role" v-model="editUser.user_type">
                            <option v-for="option in assignableRoles" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" @click="closeEditUserModal">
                            取消
                        </button>

                       <button type="submit" class="add-user-btn" :disabled="editSubmitting || !isEditChanged">
                            {{ editSubmitting ? '正在保存...' : '保存修改' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </yk-space>
</template>


<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import StatCard from '../components/common/StatCard.vue'
import AdminPager from '../components/common/AdminPager.vue'
import { getAllUsers, createUser, updateUser, deleteUser, updateUserStatus , type UserInfo, type CreateUserParams, type UpdateUserParams } from '../api/user'
import { useSessionStore } from '../store/session.ts'

const proxy: any = getCurrentInstance()?.proxy
const session = useSessionStore()

// 用户管理的四个动作各自对应独立权限，被收权后入口与按钮一起隐藏
const canCreateUser = computed(() => session.can('user.create'))
const canEditUser = computed(() => session.can('user.edit'))
const canDisableUser = computed(() => session.can('user.disable'))
const canDeleteUser = computed(() => session.can('user.delete'))

// 让「可删除」同时参与删除按钮的禁用判断，避免权限丢失后仍可点击
const canDeleteTarget = (user: UserInfo): boolean =>
    canDeleteUser.value && canOperateUser(user)
const canViewPermissions = computed(() => session.can('permission.view'))
// 授予管理员角色是极高风险权限，只有超级管理员能选「管理员」
const canAssignAdmin = computed(() => session.isSuperAdmin)

const assignableRoles = computed(() => {
    const roles = [
        { value: 'normal', label: '普通用户' },
        { value: 'editor', label: '编辑' },
        { value: 'visitor', label: '游客' },
    ]
    return canAssignAdmin.value
        ? [{ value: 'admin', label: '管理员' }, ...roles]
        : roles
})

// 超级管理员账号固定不可编辑/删除/禁用；管理员账号只能由超级管理员操作
const isSuperAdminUser = (user: UserInfo): boolean =>
    Number(user.is_super_admin) === 1 || user.isSuperAdmin === true

const canOperateUser = (user: UserInfo): boolean => {
    if (isSuperAdminUser(user)) return false
    // 非超级管理员不能动其他管理员账号
    if (user.user_type === 'admin' && !session.isSuperAdmin) return false
    return true
}

const canEditTarget = (user: UserInfo): boolean =>
    canEditUser.value && canOperateUser(user)

// 用户列表与分页状态
const users = ref<UserInfo[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const searchKeyword = ref('')
const loading = ref(false)
const errorMessage = ref('')
// 正在删除的用户 ID，避免重复提交
const deletingUserId = ref<number | null>(null)

// 全局统计数据，不随搜索条件变化
const allTotal = ref(0)

// 封禁用户总数
const bannedTotal = ref(0)

const roleCounts = ref({
    admin: 0,
    editor: 0,
    normal: 0,
    visitor: 0
})

// 各角色启用数（排除封禁），用于「管理员」「编辑与普通用户」卡片
const activeRoleCounts = ref({
    admin: 0,
    editor: 0,
    normal: 0,
    visitor: 0
})

// 卡片筛选状态：all=全部，admin=仅管理员，staff=编辑+普通用户（不含游客），banned=仅封禁
const statusFilter = ref<'all' | 'admin' | 'staff' | 'banned'>('all')

// 编辑与普通用户 = 启用的编辑 + 启用的普通用户（不含游客）
const editorAndNormal = computed(() =>
    activeRoleCounts.value.editor + activeRoleCounts.value.normal
)

const addUserModalVisible = ref(false)
const submitting = ref(false)
const updatingStatusIds = ref(new Set<string>())

const newUser = ref({
    username: '',
    mail: '',
    password: '',
    user_type: 'normal'
})

// 编辑用户弹窗状态
const editUserModalVisible = ref(false)
const editingUserId = ref<number | string | null>(null)
const editSubmitting = ref(false)
const editMessage = ref('')
const editMessageType = ref<'success' | 'error'>('success')

// 编辑用户表单
const editUser = ref({
    username: '',
    mail: '',
    user_type: 'normal'
})

// 保存打开编辑弹窗时的原始数据，用于判断是否有修改
const originalEditUser = ref({
    username: '',
    mail: '',
    user_type: 'normal'
})

// 获取当前登录用户 ID
function getCurrentUserId(): string | null {
    // 这里的 userInfo 必须替换为你项目实际保存用户信息的 key
    const raw = localStorage.getItem('userInfo');

    if (!raw) return null;

    try {
        const currentUser = JSON.parse(raw);
        return currentUser?.id != null
            ? String(currentUser.id)
            : null;
    } catch {
        return null;
    }
}

// 判断是否为当前登录用户
function isCurrentUser(user: UserInfo): boolean {
    const currentUserId = getCurrentUserId();

    return currentUserId !== null &&
        String(user.id) === currentUserId;
}

// 判断表单内容是否发生变化
const isEditChanged = computed(() => {
    return (
        editUser.value.username.trim() !== originalEditUser.value.username ||
        editUser.value.mail.trim() !== originalEditUser.value.mail ||
        editUser.value.user_type !== originalEditUser.value.user_type
    )
})

const openAddUserModal = () => {
    addUserModalVisible.value = true
}

// 打开编辑用户弹窗，并填入当前用户信息
const openEditUserModal = (user: UserInfo) => {
    editingUserId.value = user.id
    editUser.value = {
        username: user.username,
        mail: user.mail,
        user_type: user.user_type
    }
    // 保存原始数据快照
    originalEditUser.value = {
        username: user.username,
        mail: user.mail,
        user_type: user.user_type
    }

    editMessage.value = ''
    editMessageType.value = 'success'
    editUserModalVisible.value = true
}

// 关闭编辑用户弹窗
const closeEditUserModal = () => {
    if (editSubmitting.value) return

    editUserModalVisible.value = false
    editingUserId.value = null
    editMessage.value = ''
}

const closeAddUserModal = () => {
    if (submitting.value) return

    addUserModalVisible.value = false
    newUser.value = {
        username: '',
        mail: '',
        password: '',
        user_type: 'normal'
    }
}

//  提交添加用户表单
const submitAddUser = async () => {
    if (submitting.value) return

    const username = newUser.value.username.trim()
    const mail = newUser.value.mail.trim()
    const password = newUser.value.password
    const user_type = newUser.value.user_type

    if (!username || !mail || !password) {
        proxy?.$message({
            type: 'warning',
            message: '请填写用户名、邮箱和初始密码'
        })
        return
    }

    if (password.length < 6) {
        proxy?.$message({
            type: 'warning',
            message: '初始密码至少需要 6 个字符'
        })
        return
    }

    const params: CreateUserParams = {
        username,
        mail,
        password,
        user_type: user_type as CreateUserParams['user_type']
    }

    submitting.value = true

    try {
        const result = await createUser(params)

        if (result.code !== 200) {
            proxy?.$message({
                type: 'error',
                message: result.message || '创建用户失败'
            })
            return
        }

        // 创建成功后重置表单并关闭弹窗
        newUser.value = {
            username: '',
            mail: '',
            password: '',
            user_type: 'normal'
        }

        addUserModalVisible.value = false

        // 刷新第一页及统计数据
        currentPage.value = 1
        await fetchUsers(1, pageSize.value, searchKeyword.value)

        proxy?.$message({
            type: 'success',
            message: '用户创建成功'
        })
    } catch (error: any) {
        console.error('创建用户失败：', error)

        proxy?.$message({
            type: 'error',
            message:
                error.response?.data?.message ||
                error.message ||
                '创建用户失败，请检查后端服务'
        })
    } finally {
        submitting.value = false
    }
}

// 处理用户启用/禁用状态切换
async function handleStatusChange(
    user: UserInfo,
    checked: boolean | string | number
) {
    const id = String(user.id)

    if (
        updatingStatusIds.value.has(id) ||
        isCurrentUser(user)
    ) {
        return
    }

    const oldStatus: 0 | 1 =
        Number(user.status) === 1 ? 1 : 0

    const newStatus: 0 | 1 =
        checked === true || checked === 1 || checked === 'true'
            ? 1
            : 0

    if (oldStatus === newStatus) return

    updatingStatusIds.value.add(id)

    try {
        const result = await updateUserStatus(user.id, newStatus)

        if (result.code !== 200) {
            throw new Error(result.message || '修改用户状态失败')
        }

        // 服务端确认成功后才更新状态
        user.status = newStatus

        // 状态变化影响统计与筛选视图，重新拉取（含全局计数与当前筛选列表）
        await fetchUsers(currentPage.value)

        proxy?.$message({
            type: 'success',
            message: newStatus === 1 ? '用户已启用' : '用户已禁用'
        })
    } catch (error: any) {
        proxy?.$message({
            type: 'error',
            message:
                error?.response?.data?.message ||
                error?.message ||
                '修改用户状态失败'
        })

        // 失败后重新加载服务端数据，恢复正确状态
        await fetchUsers(
            currentPage.value,
            pageSize.value,
            searchKeyword.value
        )
    } finally {
        updatingStatusIds.value.delete(id)
    }
}

//  保存编辑后的用户资料
const submitEditUser = async () => {
    if (editSubmitting.value) return

    // 没有实际修改，不发送请求
    if (!isEditChanged.value) {
        proxy?.$message({
            type: 'warning',
            message: '用户信息未发生变化，无需保存'
        })
        return
    }

    const userId = editingUserId.value

    if (userId === null || userId === '') {
        proxy?.$message({
            type: 'error',
            message: '未找到当前编辑的用户'
        })
        return
    }

    const username = editUser.value.username.trim()
    const mail = editUser.value.mail.trim()
    const user_type = editUser.value.user_type

    if (!username || !mail) {
        proxy?.$message({
            type: 'warning',
            message: '请填写用户名和邮箱'
        })
        return
    }

    const params: UpdateUserParams = {
        username,
        mail,
        user_type: user_type as UpdateUserParams['user_type']
    }

    editSubmitting.value = true

    try {
        const result = await updateUser(Number(userId), params)

        if (result.code !== 200) {
            proxy?.$message({
                type: 'error',
                message: result.message || '更新用户失败'
            })
            return
        }

        // 先刷新列表
        await fetchUsers(
            currentPage.value,
            pageSize.value,
            searchKeyword.value
        )

        // 关闭弹窗并清理编辑状态
        editUserModalVisible.value = false
        editingUserId.value = null
        editMessage.value = ''

        // 显示全局成功提示
        proxy?.$message({
            type: 'success',
            message: '用户资料更新成功'
        })
    } catch (error: any) {
        console.error('更新用户失败：', error)

        proxy?.$message({
            type: 'error',
            message:
                error.response?.data?.message ||
                error.message ||
                '更新用户失败，请检查后端服务'
        })
    } finally {
        editSubmitting.value = false
    }
}

// 删除用户
const handleDeleteUser = async (user: UserInfo) => {
    if (deletingUserId.value !== null) return

    deletingUserId.value = user.id

    try {
        const result = await deleteUser(user.id)

        if (result.code !== 200) {
            proxy?.$message({
                type: 'error',
                message: result.message || '删除用户失败'
            })
            return
        }

        // 如果删除的是当前页最后一条记录，且不是第一页，
        // 就退回上一页，避免显示空白列表
        const targetPage =
            users.value.length === 1 && currentPage.value > 1
                ? currentPage.value - 1
                : currentPage.value

        await fetchUsers(
            targetPage,
            pageSize.value,
            searchKeyword.value
        )

        proxy?.$message({
            type: 'success',
            message: `用户「${user.username}」删除成功`
        })
    } catch (error: any) {
        console.error('删除用户失败：', error)

        proxy?.$message({
            type: 'error',
            message:
                error.response?.data?.message ||
                error.message ||
                '删除用户失败，请检查后端服务'
        })
    } finally {
        deletingUserId.value = null
    }
}

// 根据页码和每页条数从后端获取用户数据
const fetchUsers = async (
    page = currentPage.value,
    size = pageSize.value,
    search = searchKeyword.value
) => {
    if (statusFilter.value === 'banned') {
        await fetchUsersByStatus(page, size, search, 0)
        return
    }

    // 管理员/编辑与普通用户卡片：按角色过滤（staff = 编辑+普通用户）
    const roleFilter =
        statusFilter.value === 'admin' ? 'admin'
            : statusFilter.value === 'staff' ? 'staff'
                : ''
    if (roleFilter) {
        await fetchUsersByRole(page, size, search, roleFilter)
        return
    }

    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getAllUsers(page, size, search)
        // console.log('获取用户列表结果：', result)
        if (result.code === 200) {
            users.value = result.data.list
            total.value = result.data.total
            currentPage.value = result.data.page

            // 更新全局统计数据
            allTotal.value = result.data.allTotal
            bannedTotal.value = result.data.bannedTotal ?? 0

            roleCounts.value = {
                admin: result.data.roleCounts?.admin ?? 0,
                editor: result.data.roleCounts?.editor ?? 0,
                normal: result.data.roleCounts?.normal ?? 0,
                visitor: result.data.roleCounts?.visitor ?? 0
            }

            activeRoleCounts.value = {
                admin: result.data.activeRoleCounts?.admin ?? 0,
                editor: result.data.activeRoleCounts?.editor ?? 0,
                normal: result.data.activeRoleCounts?.normal ?? 0,
                visitor: result.data.activeRoleCounts?.visitor ?? 0
            }
        } else {
            errorMessage.value =
                result.message || '获取用户列表失败'
        }
    } catch (error: any) {
        console.error('获取用户列表失败：', error)

        errorMessage.value =
            error.response?.data?.message ||
            error.message ||
            '获取用户列表失败，请检查后端服务'
    } finally {
        loading.value = false
    }
}

// 按状态筛选（卡片点击）：仅拉取对应状态的用户，统计仍取全局值
const fetchUsersByStatus = async (
    page: number,
    size: number,
    search: string,
    status: 0 | 1
) => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getAllUsers(page, size, search, status)
        if (result.code === 200) {
            users.value = result.data.list
            total.value = result.data.total
            currentPage.value = result.data.page
            return
        }
        errorMessage.value = result.message || '获取用户列表失败'
    } catch (error: any) {
        console.error('获取用户列表失败：', error)
        errorMessage.value =
            error.response?.data?.message ||
            error.message ||
            '获取用户列表失败，请检查后端服务'
    } finally {
        loading.value = false
    }
}

// 按角色组筛选（卡片点击）：admin=仅管理员，staff=编辑+普通用户
const fetchUsersByRole = async (
    page: number,
    size: number,
    search: string,
    role: 'admin' | 'staff'
) => {
    loading.value = true
    errorMessage.value = ''

    try {
        // 与卡片统计口径一致：只列出启用的该角色用户，封禁账号由封禁卡片负责
        const result = await getAllUsers(page, size, search, 1, role)
        if (result.code === 200) {
            users.value = result.data.list
            total.value = result.data.total
            currentPage.value = result.data.page
            return
        }
        errorMessage.value = result.message || '获取用户列表失败'
    } catch (error: any) {
        console.error('获取用户列表失败：', error)
        errorMessage.value =
            error.response?.data?.message ||
            error.message ||
            '获取用户列表失败，请检查后端服务'
    } finally {
        loading.value = false
    }
}

// 分页条：v-model 已经同步了页码/每页条数，这里只负责按最新值拉数据。
// 加载期间由 :disabled 直接拦住点击，这里不能再加 loading 判断——
// 否则页码已写入但请求没发，数据和高亮会对不上。
const handlePagerChange = ({ page, pageSize: size }: { page: number; pageSize: number }) => {
    fetchUsers(page, size)
}

// 搜索
const handleSearch = (value: string) => {
    searchKeyword.value = value.trim();
    currentPage.value = 1;
    fetchUsers(1, pageSize.value, searchKeyword.value);
}

// 当前页内搜索
const filteredUsers = computed(() => users.value);

// 卡片筛选：点击切换对应视角，再点一次取消回到全部
const handleFilterAll = () => {
    statusFilter.value = 'all'
    void fetchUsers(1)
}

const handleFilterBanned = () => {
    statusFilter.value = statusFilter.value === 'banned' ? 'all' : 'banned'
    void fetchUsers(1)
}

const handleFilterRole = (role: 'admin' | 'staff') => {
    statusFilter.value = statusFilter.value === role ? 'all' : role
    void fetchUsers(1)
}

// 角色名称映射
const roleName = (role: string) => {
    const roleMap: Record<string, string> = {
        admin: '管理员',
        editor: '编辑',
        normal: '普通用户',
        visitor: '游客'
    }

    return roleMap[role] || role
}

// 页面初始化
onMounted(() => {
    fetchUsers(1)
})
</script>

<style lang="less" scoped>
.user-management {
    width: 100%;
}

.statistics {
    width: 100%;
    align-items: stretch;
}

.user-list {
    width: 100%;
    min-width: 0;
    padding: @space-xl;
    border: 1px solid @line-color-s;
    border-radius: @radius-m;
    background: @bg-color-l;
}

.table-wrapper {
    width: 100%;
    overflow-x: visible;
}

table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

th,
td {
    padding: 14px 16px;
    border-bottom: 1px solid @line-color-s;
    white-space: nowrap;
}

th {
    color: @font-color-s;
    font-weight: 500;
}

td {
    color: @font-color-l;
}

.role-tag {
    display: inline-block;
    padding: 4px 10px;
    border-radius: @radius-s;
    background: @bg-color-s;
    font-size: 12px;
}

.role-crown {
    margin-right: 4px;
    color: var(--wcolor);
    font-size: 12px;
}

.role-super {
    margin-left: 6px;
}

.permission-entry {
    display: inline-flex;
    align-items: center;
    padding: 8px 15px;
    border: 1px solid @line-color-m;
    border-radius: @radius-s;
    color: @font-color-l;
    font-size: 13px;
    text-decoration: none;
    transition: border-color 160ms ease, color 160ms ease, background 160ms ease;

    &:hover {
        border-color: var(--pcolor3);
        background: var(--pcolor1);
        color: var(--pcolor);
    }
}

.form-hint {
    margin: 0;
    color: @font-color-s;
    font-size: 12px;
}

.role-admin {
    color: @pcolor;
    background: @pcolor-1;
}

.role-editor {
    color: @scolor;
    background: @scolor-1;
}

.role-normal {
    color: @wcolor;
    background: @wcolor-1;
}

.role-visitor {
    color: @font-color-m;
    background: @bg-color-ss;
}

.empty-state {
    padding: 32px;
    color: @font-color-s;
    text-align: center;
}

@media (max-width: 700px) {
    .statistics {
        flex-wrap: wrap;
    }

    :deep(.stat-card) {
        flex: 1 1 40%;
    }

    .user-list {
        padding: @space-m;
    }
}

.user-pagination {
    display: flex;
    justify-content: center;
    padding-top: @space-l;
    width: 100%;
}

.add-user-btn,
.cancel-btn {
    padding: 9px 16px;
    border: 1px solid @line-color-m;
    border-radius: @radius-s;
    cursor: pointer;
    font-size: 14px;
}

.add-user-btn {
    color: #fff;
    background: @pcolor;
    border-color: @pcolor;
}

.add-user-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.cancel-btn {
    color: @font-color-l;
    background: @bg-color-l;
}

.modal-mask {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgb(0 0 0 / 40%);
}

.user-modal {
    width: 100%;
    max-width: 460px;
    padding: 24px;
    border-radius: @radius-m;
    background: @bg-color-l;
    box-shadow: 0 12px 40px rgb(0 0 0 / 15%);
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
}

.modal-header h3 {
    margin: 0;
    font-size: 20px;
}

.modal-close {
    border: none;
    background: transparent;
    font-size: 26px;
    cursor: pointer;
}

.form-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 18px;
}

.form-item label {
    font-size: 14px;
    color: @font-color-s;
}

.form-item input,
.form-item select {
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    padding: 9px 12px;
    border: 1px solid @line-color-m;
    border-radius: @radius-s;
    background: @bg-color-l;
    color: @font-color-l;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
}

.user-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    box-sizing: border-box;
}

.user-list-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-left: auto;
}

.create-message {
    margin: 0 0 16px;
    font-size: 14px;
}

.message-success {
    color: @scolor;
}

.message-error {
    color: @ecolor;
}

.edit-user-btn {
    padding: 5px 12px;
    border: 1px solid @line-color-m;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease;
}

.edit-user-btn:hover {
    background: @gray-1;
}

.action-buttons {
    display: flex;
    align-items: center;
    gap: 12px;
}
</style>
