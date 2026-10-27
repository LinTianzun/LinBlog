// 门户轮播共享状态：localStorage + 时间戳 + CustomEvent + 单一 interval
// 借鉴 EdgeOne 竞赛 prompt 的同步机制：切页不重置不冻结，跨页共享 index。
// LinBlog 无远程 banner 资源，按 prompt fallback 规则用主题色生成柔和占位。

export interface BannerSlide {
    id: string;
    // 占位用主题色渐变（明暗双态），不写死色值
    gradient: { light: string; dark: string };
    // 柔和风景占位图（SVG，半透明暖色），叠加在主题色渐变之上
    image: string;
    // 标题叠在照片上缘
    title: string;
    subtitle: string;
}

const STORAGE_KEY = 'linblog:portal-banner';
const EVENT_NAME = 'portal-banner:change';
const INTERVAL_MS = 6000; // 单一共享间隔常量

// 9 张刊物式幻灯片：精选自 E:\tuku 的横版画面，并压缩为门户 WebP 资源
// 标题取自 LinBlog 固定文案（林知雨、「写字的人，也在好好生活」）
export const BANNER_SLIDES: BannerSlide[] = [
    {
        id: 'dawn',
        image: '/portal/banner/dawn-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor) 28%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 18%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor) 32%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 22%, var(--bgColor1)))'
        },
        title: '写字的人，也在好好生活',
        subtitle: '林知雨的个人小站 · 一些文章、摄影与随笔'
    },
    {
        id: 'noon',
        image: '/portal/banner/noon-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 22%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 30%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 26%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 34%, var(--bgColor1)))'
        },
        title: '文章',
        subtitle: '长文与短札，记录思考的来路与去向'
    },
    {
        id: 'forest-note',
        image: '/portal/banner/forest-note-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 26%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 20%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 30%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 24%, var(--bgColor1)))'
        },
        title: '向光而行',
        subtitle: '在林间慢下来，听见生活的回声'
    },
    {
        id: 'dusk',
        image: '/portal/banner/dusk-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor9) 24%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 20%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor9) 28%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 24%, var(--bgColor1)))'
        },
        title: '摄影',
        subtitle: '光与影的片段，生活被看见的瞬间'
    },
    {
        id: 'sakura-stop',
        image: '/portal/banner/sakura-stop-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor) 24%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 22%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor) 28%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 26%, var(--bgColor1)))'
        },
        title: '春日停靠',
        subtitle: '把短暂的季节，留在镜头和记忆里'
    },
    {
        id: 'harbor-dusk',
        image: '/portal/banner/harbor-dusk-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor9) 22%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 24%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor9) 26%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 28%, var(--bgColor1)))'
        },
        title: '暮色靠岸',
        subtitle: '桥、海面，以及还没有写完的句子'
    },
    {
        id: 'night',
        image: '/portal/banner/night-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor) 20%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 26%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor) 24%, var(--bgColor1)), color-mix(in srgb, var(--pcolor8) 30%, var(--bgColor1)))'
        },
        title: '随笔',
        subtitle: '日记式的碎片，天气与心情一同记下'
    },
    {
        id: 'coastline',
        image: '/portal/banner/coastline-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 28%, var(--bgColor1)), color-mix(in srgb, var(--pcolor9) 20%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 32%, var(--bgColor1)), color-mix(in srgb, var(--pcolor9) 24%, var(--bgColor1)))'
        },
        title: '去看看海',
        subtitle: '让远方替日常留一点空白'
    },
    {
        id: 'end',
        image: '/portal/banner/end-1920.webp',
        gradient: {
            light: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 24%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 22%, var(--bgColor1)))',
            dark: 'linear-gradient(135deg, color-mix(in srgb, var(--pcolor8) 28%, var(--bgColor1)), color-mix(in srgb, var(--pcolor) 26%, var(--bgColor1)))'
        },
        title: '林知雨',
        subtitle: '欢迎来到我的小站'
    }
];

interface StoredState {
    index: number;
    updatedAt: number;
}

function readState(): StoredState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { index: 0, updatedAt: Date.now() };
        const parsed = JSON.parse(raw) as StoredState;
        if (typeof parsed.index !== 'number' || typeof parsed.updatedAt !== 'number') {
            return { index: 0, updatedAt: Date.now() };
        }
        return parsed;
    } catch {
        return { index: 0, updatedAt: Date.now() };
    }
}

function writeState(index: number) {
    const state: StoredState = { index, updatedAt: Date.now() };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage 不可用时静默降级
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
}

// 从已存储时间戳派生当前 index（切页后继续轮播，不重置）
export function deriveCurrentIndex(): number {
    const { index, updatedAt } = readState();
    const elapsed = Date.now() - updatedAt;
    const advanced = Math.floor(elapsed / INTERVAL_MS);
    return (index + advanced) % BANNER_SLIDES.length;
}

// 订阅轮播变化（跨页共享），返回取消函数
export function subscribeBanner(cb: (index: number) => void): () => void {
    const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail as StoredState;
        if (detail && typeof detail.index === 'number') cb(detail.index);
    };
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) cb(deriveCurrentIndex());
    });
    return () => window.removeEventListener(EVENT_NAME, handler);
}

// 单一共享 interval：所有页面共用一个计时器，切页不重置不冻结
let timerId: number | null = null;
let subscriberCount = 0;

export function startBannerRotation(onTick: (index: number) => void): () => void {
    subscriberCount++;
    // 首次订阅时启动 interval
    if (timerId === null) {
        const tick = () => {
            const current = deriveCurrentIndex();
            const next = (current + 1) % BANNER_SLIDES.length;
            writeState(next);
            onTick(next);
        };
        timerId = window.setInterval(tick, INTERVAL_MS);
    }
    // 立即同步一次当前状态
    onTick(deriveCurrentIndex());

    return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        if (subscriberCount === 0 && timerId !== null) {
            window.clearInterval(timerId);
            timerId = null;
        }
    };
}

export function getSlide(index: number): BannerSlide {
    return BANNER_SLIDES[((index % BANNER_SLIDES.length) + BANNER_SLIDES.length) % BANNER_SLIDES.length];
}
