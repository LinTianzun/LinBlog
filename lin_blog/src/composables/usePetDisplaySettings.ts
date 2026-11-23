import { getCurrentInstance, onMounted, onUnmounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSiteSettings, updateSiteSettings } from '../api/site'
import {
    DEFAULT_DESKTOP_PET_SETTINGS,
    broadcastDesktopPetSettings,
    getDesktopPetSettings,
    normalizeDesktopPetSettings,
    setDesktopPetSettings,
    sendDesktopPetCommand,
    type DesktopPetSettings,
} from '../utils/desktopPet'

const SETTINGS_KEYS: (keyof DesktopPetSettings)[] = [
    'desktopPetEnabled',
    'petSize',
    'petScale',
    'petActivity',
    'petRoamingEnabled',
    'petDragEnabled',
    'petBubbleEnabled',
    'petOpacity',
    'petAutoSleepEnabled',
    'petHomeCorner',
    'petScope',
]

/**
 * 宠物管理页的桌宠展示设置：
 * - 本地先读取缓存，挂载后与服务端对齐；
 * - 用户修改后广播给桌面宠物并节流保存，失败回滚到上一次已保存值；
 * - 只有持有 pet.manage 的账号才能写，只读账号的改动会被丢弃。
 */
export function usePetDisplaySettings(options: {
    canEdit: () => boolean
    notify?: (payload: { type: 'primary' | 'success' | 'warning' | 'error'; message: string }) => void
    onSaved?: () => void
}) {
    const proxy = getCurrentInstance()?.proxy
    const router = useRouter()
    const notify = options.notify || ((payload) => proxy?.$message?.(payload))

    const petSettings = reactive<DesktopPetSettings>({ ...getDesktopPetSettings() })
    let lastSavedPetSettings: DesktopPetSettings = { ...petSettings }
    // 服务端设置尚未读回前不启动变更监听，避免把「本地缓存 → 服务端值」
    // 的首次同步误判为用户修改并重新写库；同步完成后 isReady 才会置真。
    let isReady = false
    let saveTimer: number | undefined
    let saving = false
    let revision = 0

    const snapshot = (): DesktopPetSettings => ({ ...petSettings })

    const isSameSettings = (a: DesktopPetSettings, b: DesktopPetSettings) =>
        SETTINGS_KEYS.every((key) => a[key] === b[key])

    const flush = async () => {
        if (saving) return
        const payload = snapshot()
        if (isSameSettings(payload, lastSavedPetSettings)) return
        const savedRevision = revision
        saving = true
        try {
            const res = await updateSiteSettings(payload)
            if (res?.code !== 200) throw new Error(res?.message || '保存失败')
            lastSavedPetSettings = payload
            setDesktopPetSettings(payload)
            notify({ type: 'success', message: '桌宠设置已保存' })
            options.onSaved?.()
        } catch {
            if (revision === savedRevision) {
                Object.assign(petSettings, lastSavedPetSettings)
                broadcastDesktopPetSettings(lastSavedPetSettings)
            }
            notify({ type: 'error', message: '桌宠设置保存失败，请稍后重试' })
        } finally {
            saving = false
            if (
                revision !== savedRevision &&
                !isSameSettings(snapshot(), lastSavedPetSettings)
            ) {
                window.clearTimeout(saveTimer)
                saveTimer = window.setTimeout(() => void flush(), 120)
            }
        }
    }

    watch(
        petSettings,
        () => {
            if (!isReady) return
            if (!options.canEdit()) {
                Object.assign(petSettings, lastSavedPetSettings)
                return
            }
            if (isSameSettings(snapshot(), lastSavedPetSettings)) return
            revision++
            broadcastDesktopPetSettings(snapshot())
            window.clearTimeout(saveTimer)
            saveTimer = window.setTimeout(() => void flush(), 350)
        },
        { deep: true }
    )

    const resetSettings = () => {
        if (!options.canEdit()) return
        if (!window.confirm('恢复默认桌宠设置？当前尺寸、范围与行为会重置。')) return
        Object.assign(petSettings, { ...DEFAULT_DESKTOP_PET_SETTINGS })
        notify({ type: 'primary', message: '已恢复默认设置，正在保存' })
    }

    const go = (path: string) => {
        router.push(path)
    }

    onMounted(async () => {
        try {
            const res = await getSiteSettings()
            if (res?.code === 200 && res.data) {
                const next = normalizeDesktopPetSettings(res.data)
                lastSavedPetSettings = { ...next }
                Object.assign(petSettings, next)
                setDesktopPetSettings(next)
            }
        } catch {
            // 读取失败时沿用本机缓存，表单仍可继续使用
        } finally {
            // 服务端值已在 watch 启动前落地，直接作为最后一次已保存值
            lastSavedPetSettings = snapshot()
            isReady = true
        }
    })

    onUnmounted(() => {
        window.clearTimeout(saveTimer)
    })

    return {
        petSettings,
        resetSettings,
        sendDesktopPetCommand,
        go,
    }
}
