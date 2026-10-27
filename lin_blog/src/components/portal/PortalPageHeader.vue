<template>
    <header class="page-head portal-reveal">
        <div class="head-meta">
            <span class="head-index">{{ index }}</span>
            <span class="head-kicker">{{ kicker }}</span>
            <span class="head-rule" aria-hidden="true" />
            <span class="head-issue">{{ issue }}</span>
        </div>

        <div class="head-main">
            <div class="head-copy">
                <h1 class="head-title">
                    {{ title }}<span class="head-dot">.</span>
                </h1>
                <p class="head-lead">{{ description }}</p>
            </div>

            <aside class="head-aside" aria-label="栏目索引">
                <span class="aside-label">{{ asideLabel }}</span>
                <strong class="aside-value">{{ asideValue }}</strong>
                <span class="aside-note">{{ asideNote }}</span>
            </aside>
        </div>

        <div v-if="$slots.default" class="head-tools">
            <slot />
        </div>
    </header>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
    index: string
    kicker: string
    title: string
    description: string
    issue?: string
    asideLabel: string
    asideValue: string
    asideNote: string
}>(), {
    issue: 'PERSONAL JOURNAL / LIN'
})
</script>

<style lang="less" scoped>
.page-head {
    position: relative;
    padding: clamp(52px, 7vw, 84px) 0 30px;
    border-bottom: 1px solid var(--portal-line-soft);
}

.head-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.head-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--portal-surface-border);
    border-radius: 50%;
    background: var(--portal-surface);
    color: var(--portal-accent-strong);
    font-family: var(--portal-serif);
    font-size: 13px;
    letter-spacing: 0;
    box-shadow: var(--portal-shadow-soft);
}

.head-kicker {
    color: var(--portal-accent-strong);
}

.head-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, var(--portal-line-soft), transparent);
}

.head-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    gap: clamp(32px, 7vw, 96px);
    align-items: end;
    padding-top: 30px;
}

.head-copy {
    min-width: 0;
}

.head-title {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: clamp(52px, 7.5vw, 92px);
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.04em;
    color: var(--portal-text-primary);
}

.head-dot {
    color: var(--portal-accent);
}

.head-lead {
    max-width: 58ch;
    margin: 22px 0 0;
    font-size: 16px;
    line-height: 1.9;
    color: var(--portal-text-secondary);
}

.head-aside {
    position: relative;
    display: flex;
    min-height: 154px;
    flex-direction: column;
    justify-content: flex-end;
    gap: 8px;
    overflow: hidden;
    padding: 22px 24px;
    border: 1px solid var(--portal-surface-border);
    border-radius: var(--portal-radius-card);
    background:
        radial-gradient(circle at 100% 0%, var(--portal-accent-soft), transparent 52%),
        var(--portal-surface);
    box-shadow: var(--portal-shadow-soft);
    backdrop-filter: blur(var(--portal-blur-glass));
    -webkit-backdrop-filter: blur(var(--portal-blur-glass));

    &::before {
        content: '';
        position: absolute;
        top: 18px;
        right: 20px;
        width: 42px;
        height: 1px;
        background: var(--portal-accent);
        box-shadow: 0 6px 0 var(--portal-line-soft), 0 12px 0 var(--portal-line-soft);
    }
}

.aside-label {
    color: var(--portal-text-tertiary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.15em;
}

.aside-value {
    max-width: 11ch;
    font-family: var(--portal-serif);
    font-size: 25px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--portal-text-primary);
}

.aside-note {
    color: var(--portal-text-secondary);
    font-size: 12px;
    line-height: 1.7;
}

.head-tools {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 34px;
}

@media (max-width: 900px) {
    .head-main {
        grid-template-columns: 1fr;
        gap: 26px;
        align-items: start;
    }

    .head-aside {
        min-height: 0;
        max-width: 360px;
        padding: 18px 20px;
    }

    .aside-value {
        font-size: 21px;
    }
}

@media (max-width: 560px) {
    .page-head {
        padding-top: 40px;
    }

    .head-meta {
        gap: 10px;
    }

    .head-issue {
        display: none;
    }

    .head-main {
        padding-top: 24px;
    }

    .head-title {
        font-size: 48px;
    }

    .head-lead {
        margin-top: 16px;
        font-size: 14px;
    }

    .head-aside {
        display: none;
    }

    .head-tools {
        margin-top: 26px;
    }
}
</style>
