//  回复内容
export type ReplyDat =
    {
        id: number;
        article?: {
            id: number;
            title: string;
            // 图库也是 article 表的行（classify=image），总览点评论跳转时要区分入口
            classify?: 'article' | 'image' | null;
        };
        user: {
            id: string;
            name: string;
            imgurl: string;
        }
        comment: string;//内容
        moment: string;//时间
        complaint: number;//举报数
        isUnread?: boolean;//未读标记（私信用）
    }


//  分组
export interface SubsetData {
    id: number | string
    name: string | number
    value: number
    moment: string
}

//  文件
export interface FileData {
    id: number;
    url: string;
    fileName: string;
    format: string;
    size?: number;
    subsetId?: number;
    selected?: boolean;
}

//  标签
export interface LabelData {
    id: number | string
    name: string | number
    moment: string
}

//  文章
export interface ArticleData {
    id: number;
    title: string;
    subsetId?: number;
    moment: Date;//时间
    label?: string[];
    introduce?: string;//简介 
    cover?: string;//封面地址
    views: number;//查看次数
    state: number;//状态0未发布、1已发布
    comment: number;//评论数
    praise: number;//点赞次数
    content?: string | string[];
}

//  日记
export interface DiaryData {
    id: number;
    title: string;
    moment: Date | string;//时间
    weatherId: number;//天气
    weatherName?: string;//天气名称（用于匹配前端图标）
    content: string;
    picture?: string[];
    views?: number;
    likes?: number;
    comments?: number;
    // 后台卡片区分「评论」与「回复」：一级评论数与回复数由后端按 parent_id 统计
    rootComments?: number;
    replyComments?: number;
}
