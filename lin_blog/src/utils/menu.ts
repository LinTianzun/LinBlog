
export interface MenuItem {
    path: string
    name: string
    icon: string
}

// 全部菜单：管理员使用
export const navLinks: MenuItem[] = [
    {
        path: 'overView',
        name: '系统总览',
        icon: 'IconHomepageFill'
    },
    {
        path: 'userManagement',
        name: '用户管理',
        icon: 'IconAvatarFill'
    },
    {
        path: 'permissionManagement',
        name: '权限管理',
        icon: 'IconSecurityOutline'
    },
    {
        path: 'systemLog',
        name: '系统日志',
        icon: 'IconStatisticsFill'
    },
    {
        path: 'localfile',
        name: '本地文件',
        icon: 'IconFolderCloseFill'
    },
    {
        path: 'article',
        name: '博客文章',
        icon: 'IconFileFill'
    },
    {
        path: 'gallery',
        name: '摄影图库',
        icon: 'IconImageFill'
    },
    {
        path: 'diary',
        name: '随笔随记',
        icon: 'IconFillFill'
    },
    {
        path: 'setting',
        name: '系统设置',
        icon: 'IconSettingsFill'
    }
]

//  总览总数
export const overLink = [
    {
        path: '',
        name: '本地文件',
        icon: 'IconFolderCloseFill',
        viewTo: 'localfile',
        total: '0M',
        bgColor: 'background:linear-gradient(180deg, #2b5aedcc 0%, #2B5AED 100%)',

    },
    {
        path: 'editarticle',
        name: '博客文章',
        icon: 'IconFileFill',
        viewTo: 'article',
        total: 0,
        bgColor: 'background:linear-gradient(180deg, #ff600829 0%, #ff60083d 100%)',
    },
    {
        path: 'editgallery',
        name: '摄影图库',
        icon: 'IconImageFill',
        viewTo: 'gallery',
        total: 0,
        bgColor: 'background:linear-gradient(180deg, #25df0629 0%, #25df063d 100%)',
    },
    {
        path: 'diary',
        name: '随笔随记',
        icon: 'IconFillFill',
        viewTo: 'diary',
        total: 0,
        bgColor: 'background:linear-gradient(180deg, #00c9f529 0%, #00c9f53d 100%)',
    },
]
