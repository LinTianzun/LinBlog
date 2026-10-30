// 门户轮播共享状态：localStorage + 时间戳 + CustomEvent + 单一 interval
// 借鉴 EdgeOne 竞赛 prompt 的同步机制：切页不重置不冻结，跨页共享 index。
// LinBlog 无远程 banner 资源，按 prompt fallback 规则用主题色生成柔和占位。

export interface BannerSlide {
    id: string;
    // 占位用主题色渐变（明暗双态），不写死色值
    gradient: { light: string; dark: string };
    // 站内的 WebP 资产，按 -1920 命名，960 为窄屏候选
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

const bannerWidthPattern = /-(\d+)\.webp$/i

// 把 -1920.webp 换成指定宽度的资产；拿不到宽度时原样返回。
// 资源是构建期的静态文件而非 /api/uploads，所以不能走 optimizedImageUrl。
export function bannerSrc(image: string, width = 1920): string {
    return image.replace(bannerWidthPattern, `-${width}.webp`)
}

export function bannerSrcset(image: string): string {
    return [960, 1920].map(width => `${bannerSrc(image, width)} ${width}w`).join(', ')
}

// 首屏 Hero 唯一的 LCP 候选：只预加载当前这张（而非全部 9 张），
// 其余幻灯片轮播时由浏览器按 srcset/sizes 自行挑选。
export function preloadBannerSlide(image: string): void {
    if (typeof document === 'undefined') return
    const href = bannerSrc(image, 1920)
    const existing = document.head.querySelector<HTMLLinkElement>(
        'link[data-portal-banner-preload]'
    )
    if (existing?.dataset.portalBannerPreload === href) return

    existing?.remove()
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = href
    link.type = 'image/webp'
    link.setAttribute('imagesrcset', bannerSrcset(image))
    link.setAttribute('imagesizes', '100vw')
    link.setAttribute('fetchpriority', 'high')
    link.dataset.portalBannerPreload = href
    document.head.appendChild(link)
}

// 只挂载当前 / 下一张：幻灯片是铺满视口的绝对定位层，
// 隐藏的 7 张仍在可视区域内，浏览器会无视 loading=lazy 全部拉取（实测多下约 1.4MB）。
// 当前 + 下一张足以覆盖 6 秒切换间隔与淡入动画。
export function shouldRenderSlide(index: number, current: number, total: number): boolean {
    if (total <= 2) return true
    const normalized = ((current % total) + total) % total
    const distance = (index - normalized + total) % total
    return distance === 0 || distance === 1 || distance === total - 1
}
