const SUPER_ADMIN_EMAIL = 'admin@linlog.com'

const ROLES = [
    {
        key: 'super_admin',
        userType: 'admin',
        label: '超级管理员',
        description: '系统唯一所有者，固定全权限且不可删除',
        editable: false,
        tone: 'danger'
    },
    {
        key: 'admin',
        userType: 'admin',
        label: '管理员',
        description: '管理非超级管理员账号与系统日常运营',
        editable: true,
        tone: 'primary'
    },
    {
        key: 'editor',
        userType: 'editor',
        label: '编辑',
        description: '管理全站内容、审核与分类标签',
        editable: true,
        tone: 'success'
    },
    {
        key: 'normal',
        userType: 'normal',
        label: '普通用户',
        description: '创作并管理自己的内容',
        editable: true,
        tone: 'warning'
    },
    {
        key: 'visitor',
        userType: 'visitor',
        label: '游客',
        description: '仅浏览与使用个人账号设置',
        editable: true,
        tone: 'neutral'
    }
]

const EDITABLE_ROLE_KEYS = ['admin', 'editor', 'normal', 'visitor']

const PERMISSION_GROUPS = [
    {
        key: 'overview',
        label: '系统总览',
        description: '控制后台首页的数据统计范围'
    },
    {
        key: 'content',
        label: '内容管理',
        description: '文章、摄影图库、随笔与分类标签'
    },
    {
        key: 'interaction',
        label: '评论互动',
        description: '发表评论、回复、点赞与举报'
    },
    {
        key: 'file',
        label: '本地文件',
        description: '文件上传、整理、恢复与彻底清除'
    },
    {
        key: 'message',
        label: '消息通知',
        description: '私信以及面向用户的系统通知'
    },
    {
        key: 'user',
        label: '用户管理',
        description: '查看、维护和分配用户角色'
    },
    {
        key: 'system',
        label: '系统与权限',
        description: '权限矩阵、系统日志等高风险能力'
    }
]

const PERMISSIONS = [
    {
        key: 'overview.viewAll',
        group: 'overview',
        label: '查看全站总览',
        description: '关闭后仅统计当前用户自己的内容；系统设置始终对本人开放'
    },
    {
        key: 'article.viewAll',
        group: 'content',
        label: '查看文章',
        description: '查看文章列表与详情；关闭后仍可查看自己的文章'
    },
    {
        key: 'article.create',
        group: 'content',
        label: '创建文章',
        description: '进入文章编辑器并创建草稿'
    },
    {
        key: 'article.manageOwn',
        group: 'content',
        label: '管理自己的文章',
        description: '编辑和删除自己名下允许操作的文章'
    },
    {
        key: 'article.manageAll',
        group: 'content',
        label: '管理全部文章',
        description: '编辑和删除全站文章',
        risk: 'high'
    },
    {
        key: 'article.publish',
        group: 'content',
        label: '发布与驳回文章',
        description: '修改文章审核状态',
        risk: 'high'
    },
    {
        key: 'gallery.viewAll',
        group: 'content',
        label: '查看图库',
        description: '查看图库列表与详情；关闭后仍可查看自己的图库'
    },
    {
        key: 'gallery.create',
        group: 'content',
        label: '创建图库',
        description: '进入图库编辑器并创建草稿'
    },
    {
        key: 'gallery.manageOwn',
        group: 'content',
        label: '管理自己的图库',
        description: '编辑和删除自己名下允许操作的图库'
    },
    {
        key: 'gallery.manageAll',
        group: 'content',
        label: '管理全部图库',
        description: '编辑和删除全站图库',
        risk: 'high'
    },
    {
        key: 'gallery.publish',
        group: 'content',
        label: '发布与驳回图库',
        description: '修改图库审核状态',
        risk: 'high'
    },
    {
        key: 'diary.viewAll',
        group: 'content',
        label: '查看随笔',
        description: '查看全部随笔；关闭后仍可查看自己的随笔'
    },
    {
        key: 'diary.create',
        group: 'content',
        label: '创建随笔',
        description: '新建随笔随记'
    },
    {
        key: 'diary.manageOwn',
        group: 'content',
        label: '管理自己的随笔',
        description: '编辑和删除自己的随笔'
    },
    {
        key: 'diary.manageAll',
        group: 'content',
        label: '管理全部随笔',
        description: '编辑和删除全站随笔',
        risk: 'high'
    },
    {
        key: 'category.manage',
        group: 'content',
        label: '管理分类',
        description: '新建、编辑和删除内容分类'
    },
    {
        key: 'label.manage',
        group: 'content',
        label: '管理标签',
        description: '新建和删除内容标签'
    },
    {
        key: 'comment.create',
        group: 'interaction',
        label: '发表评论与回复',
        description: '在门户文章、图库和随笔下参与评论'
    },
    {
        key: 'comment.manageOwn',
        group: 'interaction',
        label: '删除自己的评论',
        description: '删除本人发表的评论'
    },
    {
        key: 'comment.moderate',
        group: 'interaction',
        label: '管理全部评论',
        description: '查看并删除任何用户的评论',
        risk: 'high'
    },
    {
        key: 'comment.like',
        group: 'interaction',
        label: '点赞与喜欢',
        description: '点赞文章评论和图库/随笔互动'
    },
    {
        key: 'comment.report',
        group: 'interaction',
        label: '举报评论',
        description: '提交评论举报'
    },
    {
        key: 'file.view',
        group: 'file',
        label: '查看本地文件',
        description: '查看文件列表、容量和回收站'
    },
    {
        key: 'file.upload',
        group: 'file',
        label: '上传文件',
        description: '上传新的本地文件'
    },
    {
        key: 'file.manage',
        group: 'file',
        label: '整理与恢复文件',
        description: '移动、删除和恢复文件'
    },
    {
        key: 'file.purge',
        group: 'file',
        label: '彻底清除文件',
        description: '清理回收站及执行文件维护',
        risk: 'high'
    },
    {
        key: 'message.private',
        group: 'message',
        label: '收发私信',
        description: '使用私信与留言板'
    },
    {
        key: 'message.system',
        group: 'message',
        label: '发送系统消息',
        description: '向用户发送系统消息和通知',
        risk: 'high'
    },
    {
        key: 'user.view',
        group: 'user',
        label: '查看用户',
        description: '访问用户管理并查询账号'
    },
    {
        key: 'user.create',
        group: 'user',
        label: '创建用户',
        description: '通过后台创建账号',
        risk: 'high'
    },
    {
        key: 'user.edit',
        group: 'user',
        label: '编辑用户',
        description: '修改非管理员账号的用户名、邮箱与角色',
        risk: 'high'
    },
    {
        key: 'user.disable',
        group: 'user',
        label: '启用与禁用用户',
        description: '修改非管理员账号的启用状态',
        risk: 'high'
    },
    {
        key: 'user.delete',
        group: 'user',
        label: '删除用户',
        description: '删除非管理员账号',
        risk: 'high'
    },
    {
        key: 'user.assignAdmin',
        group: 'user',
        label: '授予管理员角色',
        description: '创建管理员或将账号提升为管理员；仅超级管理员可操作',
        risk: 'critical'
    },
    {
        key: 'permission.view',
        group: 'system',
        label: '查看权限管理',
        description: '访问角色权限矩阵；管理员默认为只读'
    },
    {
        key: 'permission.edit',
        group: 'system',
        label: '修改权限矩阵',
        description: '仅超级管理员固定拥有，不对其他角色开放',
        risk: 'critical',
        protected: true
    },
    {
        key: 'systemLog.view',
        group: 'system',
        label: '查看系统日志',
        description: '查询登录、内容与用户操作日志'
    }
]

const ALL_PERMISSION_KEYS = PERMISSIONS.map(permission => permission.key)

const CONTENT_ALL = [
    'article.viewAll',
    'article.create',
    'article.manageOwn',
    'article.manageAll',
    'article.publish',
    'gallery.viewAll',
    'gallery.create',
    'gallery.manageOwn',
    'gallery.manageAll',
    'gallery.publish',
    'diary.viewAll',
    'diary.create',
    'diary.manageOwn',
    'diary.manageAll',
    'category.manage',
    'label.manage'
]

const INTERACTION_DEFAULT = [
    'comment.create',
    'comment.manageOwn',
    'comment.like',
    'comment.report'
]

const DEFAULT_ROLE_PERMISSIONS = {
    admin: ALL_PERMISSION_KEYS.filter(key => key !== 'permission.edit' && key !== 'user.assignAdmin'),
    editor: [
        'overview.viewAll',
        ...CONTENT_ALL,
        'comment.create',
        'comment.manageOwn',
        'comment.moderate',
        'comment.like',
        'comment.report',
        'message.private'
    ],
    normal: [
        'article.create',
        'article.manageOwn',
        'gallery.create',
        'gallery.manageOwn',
        'diary.create',
        'diary.manageOwn',
        ...INTERACTION_DEFAULT,
        'message.private'
    ],
    visitor: [
        'message.private'
    ]
}

const PROTECTED_PERMISSION_KEYS = new Set(
    PERMISSIONS.filter(permission => permission.protected).map(permission => permission.key)
)

module.exports = {
    SUPER_ADMIN_EMAIL,
    ROLES,
    EDITABLE_ROLE_KEYS,
    PERMISSION_GROUPS,
    PERMISSIONS,
    ALL_PERMISSION_KEYS,
    DEFAULT_ROLE_PERMISSIONS,
    PROTECTED_PERMISSION_KEYS
}
