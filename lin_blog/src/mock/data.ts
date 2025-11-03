import Mock from 'mockjs'
const Random = Mock.Random
//  模拟数据

//  总览数据
export const overview = Mock.mock({
    code: 200,//200正常、300未通过token验证、500错误、400功能拒绝
    "data": {
        "file": Random.float(60, 100, 2, 2) + 'M',
        "atricle|0-50": 0,
        "gallery|0-50": 0,
        "diary|0-50": 0
    }
})

//  访问量
export const visit = Mock.mock({
    "data|30": [{
        //  时间
        "date": "@datetime('MM-dd')",
        "count|10-100": 12
    }]
})

//  数据监测
export const survey = Mock.mock({
    //返回数据
    "data": {
        "device": [
            {
                "key": "mobile",
                "name": '移动端',
                "value|30-120": 50
            },
            {
                "key": "pc",
                "name": '桌面端',
                "value|30-120": 40
            }
        ],
        "website": [
            {
                "key": "yike-wall",
                "name": '留言墙',
                "value|30-120": 55
            },
            {
                "key": "yike-design",
                "name": '图标库',
                "value|30-120": 30
            },
            {
                "key": "yike-sso",
                "name": 'sso',
                "value|30-120": 42
            },
            {
                "key": "yike-game",
                "name": '游戏',
                "value|30-120": 60
            },
            {
                "key": "yike-blog",
                "name": 'blog',
                "value|30-120": 23
            }
        ]
    }
})

//  评论
export const comment = Mock.mock({
    "data": {
        "count": 123,
        "list|123": [
            {
                "id|+1": 0,
                "article": {
                    "id|+1": 2,
                    "title": "@ctitle(3,12)"
                },
                "user": {
                    "id|+1": 3,
                    "name": "@ctitle(3,12)",
                    "imgurl": "/src/assets/img/xw10.jpg"
                },
                "comment": "@cparagraph(1,4)",//内容
                "moment": "@datetime",//时间
                "complaint|0-12": 0//举报数
            }
        ]

    }
})

//  文章状态
export const state = Mock.mock({
    "data": [
        {
            "id": 0,
            "name": "已发布",
            "value|0-30": 4,
        },
        {
            "id": 1,
            "name": "未发布",
            "value|0-30": 4,
        }
    ]
})

//  分组
export const subset = Mock.mock({
    "data": {
        "count": 123,
        "list|4": [
            {
                "id|+1": 0,
                "name": "@ctitle(2,6)",
                "value|0-30": 4,
                "moment": "@datetime()",
            }
        ]

    }
})

//  图片合集
const photos = [
    "/src/assets/img/xw01.jpg",
    "/src/assets/img/xw02.jpg",
    "/src/assets/img/xw03.jpg",
    "/src/assets/img/xw04.jpg",
    "/src/assets/img/xw05.jpg",
    "/src/assets/img/xw06.png",
    "/src/assets/img/xw07.jpg",
    "/src/assets/img/xw08.jpg",
    "/src/assets/img/xw09.jpg",
    "/src/assets/img/xw10.jpg",
    "/src/assets/img/xw11.jpg",
]

//  图片合集
const photosarr = [
    [

    ],
    [
        "/src/assets/img/xw05.jpg",
        "/src/assets/img/xw06.png",
    ],
    [
        "/src/assets/img/xw01.jpg",
        "/src/assets/img/xw02.jpg",
        "/src/assets/img/xw09.jpg",
    ],
    [
        "/src/assets/img/xw03.jpg",
        "/src/assets/img/xw04.jpg",
        "/src/assets/img/xw07.jpg",
        "/src/assets/img/xw08.jpg",
        "/src/assets/img/xw11.jpg",
    ],
]

//  文件数据
export const mkfiles = Mock.mock({
    "count": 64,
    "list|64": [{
        "id|+1": 0,
        "url|1": photos,//地址
        "fileName": "@ctitle(2,12)",//文件名 
        "format": "jpg",//格式
        "subsetId|0-4": 3,//所属类型 
    }]
})

//  标签
export const mklabel = Mock.mock({
    "data": {
        "count": 12,
        "list|12": [
            {
                "id|+1": 0,
                "name": "@ctitle(2,4)",
                "value|0-30": 4,
                "moment": "@datetime()",
            }
        ]

    }
})

//  文章数据
export const mkarticle = Mock.mock({
    "count": 64,
    "list|64": [{
        "id|+1": 0,
        "title": "@ctitle(4,8)",
        "subsetId|0-4": 3,
        "moment": "@datetime()",
        "label|0-3": ["@ctitle(2,4)"],
        "introduce": "@cparagraph(4,6)",
        "cover|1": photos,//封面地址
        "views|12-360": 36,
        "state|0-1": 0,//状态0未发布、1已发布
        "comment|1-36": 3,
        "praise|12-200": 56,
    }]
})

//  图库数据
export const mkgallery = Mock.mock({
    "count": 64,
    "list|64": [{
        "id|+1": 0,
        "title": "@ctitle(4,8)",
        "subsetId|0-4": 3,
        "moment": "@datetime()",
        "introduce": "@cparagraph(4,6)",
        "cover|1": photos,//封面地址
        "content|1": photosarr,//封面地址
        "views|12-360": 36,
        "comment|1-36": 3,
        "praise|12-200": 56,
    }]
})

//  日记数据
export const mkdiary = Mock.mock({
    "count": 64,
    "list|64": [{
        "id|+1": 0,
        "title": "@ctitle(2,6)",
        "moment": "@datetime()",
        "weatherId|0-7": 0,
        "content": "@cparagraph(2,10)",
        "picture|1": photosarr,
    }]
})

//  图片列表
export const mkphotos = Mock.mock({
    "data|15": [{
        "id|+1": 0,
        "url|1": photos,//地址
        "fileName": "@ctitle(2,12)",//文件名 
        "format": "jpg",//格式
        "subsetId|0-4": 3,//所属类型 
    }]
})


// export const overview = Mock.mock({
//     code: 200,//200正常、300未通过token验证、500错误、400功能拒绝
//     "data": {
//         "file": Random.float(60, 100, 3, 3) + 'M',
//         "atricle|0-50": 0,
//         "gallery|0-50": 0,
//         "diary|0-50": 0,
//         "project|0-50": 0,
//         "resource|0-50": 0,
//     }
// })