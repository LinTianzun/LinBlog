// yike-design 的 yk-modal 只负责视觉与显隐，不提供对话框语义、焦点圈定和
// 关闭按钮键盘操作。这里在 DOM 层统一增强，避免逐个业务弹窗重复改造。

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalRecord {
    active: boolean
    opener: HTMLElement | null
}

const records = new WeakMap<HTMLElement, ModalRecord>()
const openStack: HTMLElement[] = []
const observedWrappers = new WeakSet<HTMLElement>()
let observer: MutationObserver | null = null
let titleSeq = 0

function isVisible(el: HTMLElement): boolean {
    const style = getComputedStyle(el)
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && el.getClientRects().length > 0
}

function focusableItems(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => isVisible(el) && !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true')
}

function isModalOpen(root: HTMLElement): boolean {
    const wrapper = root.closest<HTMLElement>('.yk-modal__modal')
    return Boolean(wrapper && isVisible(wrapper) && isVisible(root))
}

function lockBackground(locked: boolean): void {
    const app = document.getElementById('app')
    if (!app) return
    if (locked) {
        app.setAttribute('inert', '')
    } else {
        app.removeAttribute('inert')
    }
}

function focusInitial(root: HTMLElement): void {
    const autofocus = root.querySelector<HTMLElement>('[autofocus]')
    const items = focusableItems(root)
    const target = autofocus
        ?? items.find(el => !el.closest('.yk-modal__close'))
        ?? items[0]
        ?? root
    target.focus({ preventScroll: true })
}

function closeRecord(root: HTMLElement, restoreFocus = true): void {
    const record = records.get(root)
    if (!record?.active) return
    record.active = false

    const index = openStack.lastIndexOf(root)
    if (index >= 0) openStack.splice(index, 1)

    const next = openStack[openStack.length - 1]
    if (next) {
        const opener = record.opener
        record.opener = null
        if (opener?.isConnected && next.contains(opener) && !opener.closest('[inert]')) {
            opener.focus({ preventScroll: true })
        } else {
            focusInitial(next)
        }
        return
    }

    lockBackground(false)
    const opener = record.opener
    record.opener = null
    if (restoreFocus && opener?.isConnected && !opener.closest('[inert]')) {
        opener.focus({ preventScroll: true })
    }
}

function openRecord(root: HTMLElement): void {
    const record = records.get(root)
    if (!record || record.active) return
    record.active = true
    record.opener = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    openStack.push(root)
    lockBackground(true)
    focusInitial(root)
}

function enhanceModal(root: HTMLElement): void {
    const wrapper = root.closest<HTMLElement>('.yk-modal__modal')
    if (wrapper && !observedWrappers.has(wrapper)) {
        observedWrappers.add(wrapper)
        // 只观察弹窗容器的显隐，不监听整页 class/style 变化
        new MutationObserver(() => enhanceModal(root)).observe(wrapper, {
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden'],
        })
    }

    let record = records.get(root)
    if (!record) {
        const title = root.querySelector<HTMLElement>('.yk-modal__title')
        if (title && !title.id) title.id = `yk-modal-title-${++titleSeq}`

        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-modal', 'true')
        root.tabIndex = -1
        if (title?.id) {
            root.setAttribute('aria-labelledby', title.id)
        } else {
            root.setAttribute('aria-label', '对话框')
        }

        const close = root.querySelector<HTMLElement>('.yk-modal__close')
        if (close) {
            close.setAttribute('role', 'button')
            close.setAttribute('tabindex', '0')
            close.setAttribute('aria-label', '关闭弹窗')
            close.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                close.click()
            })
        }

        record = { active: false, opener: null }
        records.set(root, record)
    }

    if (isModalOpen(root)) {
        openRecord(root)
    } else {
        closeRecord(root)
    }
}

function scanModals(): void {
    document.querySelectorAll<HTMLElement>('.yk-modal__main').forEach(enhanceModal)
}

function scanAddedNodes(recordsList: MutationRecord[]): void {
    for (const root of [...openStack]) {
        if (!root.isConnected) closeRecord(root, false)
    }

    for (const record of recordsList) {
        for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            if (node.matches('.yk-modal__main')) {
                enhanceModal(node as HTMLElement)
                continue
            }
            node.querySelectorAll<HTMLElement>('.yk-modal__main').forEach(enhanceModal)
        }
    }
}

function trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !openStack.length) return
    const root = openStack[openStack.length - 1]
    const items = focusableItems(root)

    if (!items.length) {
        event.preventDefault()
        root.focus({ preventScroll: true })
        return
    }

    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (!active || active === root || !root.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
    }
    if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
    }
}

export function installModalA11y(): void {
    if (observer) return
    observer = new MutationObserver(scanAddedNodes)
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    })
    document.addEventListener('keydown', trapFocus, true)
    scanModals()
}
