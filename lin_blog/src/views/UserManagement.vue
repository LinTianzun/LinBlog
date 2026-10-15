<template>
    <yk-space dir="vertical" size="l" class="user-management">
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
            <div class="stat-card">
                <yk-space dir="vertical" size="s">
                    <yk-text type="secondary">用户总数</yk-text>
                    <yk-title :level="2" class="stat-number">
                        {{ allTotal }}
                    </yk-title>
                </yk-space>
            </div>

            <div class="stat-card">
                <yk-space dir="vertical" size="s">
                    <yk-text type="secondary">管理员</yk-text>
                    <yk-title :level="2" class="stat-number">
                        {{ roleCounts.admin }}
                    </yk-title>
                </yk-space>
            </div>

            <div class="stat-card">
                <yk-space dir="vertical" size="s">
                    <yk-text type="secondary">编辑与普通用户</yk-text>
                    <yk-title :level="2" class="stat-number">
                        {{ allTotal - roleCounts.admin }}
                    </yk-title>
                </yk-space>
            </div>
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

                    <button class="add-user-btn" @click="openAddUserModal">
                        + 添加用户
                    </button>
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
                                    {{ roleName(user.user_type) }}
                                </span>
                            </td>
                            <td>
                                <button type="button" class="edit-user-btn" @click="openEditUserModal(user)">
                                    编辑
                                </button>
                            </td>
                        </tr>

                        <tr v-if="filteredUsers.length === 0">
                            <td colspan="5" class="empty-state">
                                没有找到符合条件的用户
                            </td>
                        </tr>
                    </tbody>
                </table>


            </div>

            <div class="user-pagination">
                <yk-pagination :current="currentPage" :page-size-options="[2, 5, 10, 20]" :total="total"
                    :layouts="['prev', 'pager', 'next', 'pageSize']" size="m" @change="changePage"
                    @page-size-change="changePageSize" />
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
                    <p v-if="createMessage" class="create-message" :class="`message-${createMessageType}`">
                        {{ createMessage }}
                    </p>
                    
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
                            <option value="normal">普通用户</option>
                            <option value="editor">编辑</option>
                            <option value="visitor">游客</option>
                            <option value="admin">管理员</option>
                        </select>
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

                <form @submit.prevent>
                    <p v-if="editMessage" class="create-message" :class="`message-${editMessageType}`">
                        {{ editMessage }}
                    </p>

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
                            <option value="normal">普通用户</option>
                            <option value="editor">编辑</option>
                            <option value="visitor">游客</option>
                            <option value="admin">管理员</option>
                        </select>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" @click="closeEditUserModal">
                            取消
                        </button>

                        <button type="submit" class="add-user-btn" :disabled="editSubmitting">
                            {{ editSubmitting ? '正在保存...' : '保存修改' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </yk-space>
</template>


<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import TopTitle from '../components/bar/TopTitle.vue'
import { getAllUsers, createUser, type UserInfo, type CreateUserParams } from '../api/user'

// 用户列表与分页状态
const users = ref<UserInfo[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const searchKeyword = ref('')
const loading = ref(false)
const errorMessage = ref('')

// 全局统计数据，不随搜索条件变化
const allTotal = ref(0)

const roleCounts = ref({
    admin: 0,
    editor: 0,
    normal: 0,
    visitor: 0
})


const addUserModalVisible = ref(false)
const submitting = ref(false)
const createMessage = ref('')
const createMessageType = ref<'success' | 'error'>('success')

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


const submitAddUser = async () => {
    if (submitting.value) return

    const username = newUser.value.username.trim()
    const mail = newUser.value.mail.trim()
    const password = newUser.value.password
    const user_type = newUser.value.user_type

    if (!username || !mail || !password) {
        createMessageType.value = 'error'
        createMessage.value = '请填写用户名、邮箱和初始密码'
        return
    }

    if (password.length < 6) {
        createMessageType.value = 'error'
        createMessage.value = '初始密码至少需要 6 个字符'
        return
    }

    const params: CreateUserParams = {
        username,
        mail,
        password,
        user_type: user_type as CreateUserParams['user_type']
    }

    submitting.value = true
    createMessage.value = ''

    try {
        const result = await createUser(params)

        if (result.code !== 200) {
            createMessageType.value = 'error'
            createMessage.value = result.message || '创建用户失败'
            return
        }

        createMessageType.value = 'success'
        createMessage.value = '用户创建成功'

        // 重置表单并关闭弹窗
        newUser.value = {
            username: '',
            mail: '',
            password: '',
            user_type: 'normal'
        }

        addUserModalVisible.value = false

        // 回到第一页，刷新列表与统计数据
        currentPage.value = 1
        await fetchUsers(1, pageSize.value, searchKeyword.value)
    } catch (error: any) {
        console.error('创建用户失败：', error)

        createMessageType.value = 'error'
        createMessage.value =
            error.response?.data?.message ||
            error.message ||
            '创建用户失败，请检查后端服务'
    } finally {
        submitting.value = false
    }
}


// 根据页码和每页条数从后端获取用户数据
const fetchUsers = async (
    page = currentPage.value,
    size = pageSize.value,
    search = searchKeyword.value
) => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getAllUsers(page, size, search)
        console.log('获取用户列表结果：', result)
        if (result.code === 200) {
            users.value = result.data.list
            total.value = result.data.total
            currentPage.value = result.data.page

            // 更新全局统计数据
            allTotal.value = result.data.allTotal

            roleCounts.value = {
                admin: result.data.roleCounts?.admin ?? 0,
                editor: result.data.roleCounts?.editor ?? 0,
                normal: result.data.roleCounts?.normal ?? 0,
                visitor: result.data.roleCounts?.visitor ?? 0
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

// 切换页码，包括通过 jumper 跳转
const changePage = (page: number) => {
    if (page === currentPage.value || loading.value) return
    fetchUsers(page)
}

// 切换每页显示条数
const changePageSize = (size: number) => {
    if (loading.value || size === pageSize.value) return

    pageSize.value = size
    currentPage.value = 1

    // 更改每页条数后，从第一页重新查询
    fetchUsers(1, size)
}



// 搜索
const handleSearch = (value: string) => {
    searchKeyword.value = value.trim();
    currentPage.value = 1;
    fetchUsers(1, pageSize.value, searchKeyword.value);
}

// 当前页内搜索
const filteredUsers = computed(() => users.value);

// 当前页内角色统计
const countByRole = (role: string) =>
    users.value.filter(user => user.user_type === role).length

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

.stat-card {
    flex: 1;
    min-width: 0;
    padding: @space-xl;
    border: 1px solid var(--yk-color-border, #eee);
    border-radius: @radius-m;
    background: var(--yk-color-surface, #fff);
}

.stat-number {
    margin: 0;
}

.user-list {
    width: 100%;
    min-width: 0;
    padding: @space-xl;
    border: 1px solid var(--yk-color-border, #eee);
    border-radius: @radius-m;
    background: var(--yk-color-surface, #fff);
}

.table-wrapper {
    width: 100%;
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

th,
td {
    padding: 14px 16px;
    border-bottom: 1px solid var(--yk-color-border, #eee);
    white-space: nowrap;
}

th {
    color: var(--yk-color-text-secondary, #888);
    font-weight: 500;
}

td {
    color: var(--yk-color-text-primary, #333);
}

.role-tag {
    display: inline-block;
    padding: 4px 10px;
    border-radius: @radius-s;
    background: #f0f0f0;
    font-size: 12px;
}

.role-admin {
    color: #315fcb;
    background: #e8efff;
}

.role-editor {
    color: #218653;
    background: #e5f7ed;
}

.role-normal {
    color: #a56512;
    background: #fff2df;
}

.role-visitor {
    color: #7651ba;
    background: #f0eaff;
}

.empty-state {
    padding: 32px;
    color: #999;
    text-align: center;
}

@media (max-width: 700px) {
    .statistics {
        flex-wrap: wrap;
    }

    .stat-card {
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
    border: 1px solid var(--yk-color-border, #ddd);
    border-radius: @radius-s;
    cursor: pointer;
    font-size: 14px;
}

.add-user-btn {
    color: #fff;
    background: #315fcb;
    border-color: #315fcb;
}

.add-user-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.cancel-btn {
    color: var(--yk-color-text-primary, #333);
    background: var(--yk-color-surface, #fff);
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
    background: var(--yk-color-surface, #fff);
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
    color: var(--yk-color-text-secondary, #666);
}

.form-item input,
.form-item select {
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    padding: 9px 12px;
    border: 1px solid var(--yk-color-border, #ddd);
    border-radius: @radius-s;
    background: var(--yk-color-surface, #fff);
    color: var(--yk-color-text-primary, #333);
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
    color: #218653;
}

.message-error {
    color: #d9363e;
}

.edit-user-btn {
    padding: 5px 12px;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease;
}

.edit-user-btn:hover {
    background: rgba(128, 128, 128, 0.12);
}
</style>