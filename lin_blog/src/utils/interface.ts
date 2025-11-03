//  回复内容
export type ReplyDat =
    {
        id: number;
        atricle?: {
            id: number;
            title: string;
        };
        user: {
            id: string;
            name: string;
            imgurl: string;
        }
        comment: string;//内容
        moment: string;//时间
        complaint: number;//举报数
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
    moment: Date;//时间
    weatherId: number;//天气
    content: string;
    picture?: string[];
}
