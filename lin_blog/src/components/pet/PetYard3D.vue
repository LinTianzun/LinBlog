<template>
    <div ref="hostRef" class="pet-yard3d" aria-hidden="true"
        :class="[`is-weather-${weather.id}`, `is-phase-${dayPhase.id}`]">
        <canvas ref="canvasRef" class="pet-yard3d-canvas" />
        <span class="pet-yard3d-sky" aria-hidden="true" />
        <span v-if="weather.id === 'rainy'" class="pet-yard3d-rain"
            aria-hidden="true" />
        <span v-else-if="weather.id === 'windy'"
            class="pet-yard3d-leaves" aria-hidden="true" />
        <span v-if="bubbleText" class="pet-yard3d-bubble" :style="bubbleStyle">
            {{ bubbleText }}
        </span>
    </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
    Group,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    Scene,
    Sprite,
    Texture,
    WebGLRenderer,
} from 'three'
import type {
    HomesteadDayPhaseDefinition,
    HomesteadWeatherDefinition,
} from '../../utils/desktopPetHomestead'
import barrelUrl from '../../assets/farm/pixel/barrel.png'
import bushUrl from '../../assets/farm/pixel/bush.png'
import crateUrl from '../../assets/farm/pixel/crate.png'
import fenceStripUrl from '../../assets/farm/pixel/fence-strip.png'
import fishUrl from '../../assets/farm/pixel/fish.png'
import flowerUrl from '../../assets/farm/pixel/flower.png'
import hayUrl from '../../assets/farm/pixel/hay.png'
import chickenUrl from '../../assets/farm/pixel/chicken.png'
import cowUrl from '../../assets/farm/pixel/cow.png'
import houseUrl from '../../assets/farm/pixel/house.png'
import lilyUrl from '../../assets/farm/pixel/lily.png'
import milkCanUrl from '../../assets/farm/pixel/milk-can.png'
import petCatUrl from '../../assets/farm/pixel/pet-cat.png'
import reedsUrl from '../../assets/farm/pixel/reeds.png'
import rockUrl from '../../assets/farm/pixel/rock.png'
import scarecrowUrl from '../../assets/farm/pixel/scarecrow.png'
import sheepUrl from '../../assets/farm/pixel/sheep.png'
import troughUrl from '../../assets/farm/pixel/trough.png'
import treeOakUrl from '../../assets/farm/pixel/tree-oak.png'
import treeUrl from '../../assets/farm/pixel/tree.png'
import wateringCanUrl from '../../assets/farm/pixel/watering-can.png'

type PetYardTab = 'grow' | 'raise' | 'fish'

interface PctPoint {
    x: number
    y: number
}

interface SpriteSpec {
    src: string
    x: number
    y: number
    w: number
    flip?: boolean
    opacity?: number
    anim?: 'hop' | 'graze' | 'sway' | 'drift'
}

interface PatchSpec {
    kind: 'soil' | 'pond' | 'pasture' | 'path' | 'plank' | 'sand' | 'horizon'
    left: number
    top: number
    width: number
    height: number
}

interface ZoneSpec {
    patches: PatchSpec[]
    sprites: SpriteSpec[]
    tint: number
    petStart: PctPoint
}

const props = defineProps<{
    tab: PetYardTab
    plotCount: number
    plotColumns: number
    weather: HomesteadWeatherDefinition
    dayPhase: HomesteadDayPhaseDefinition
    chickenReady: boolean
    cowReady: boolean
    pondReady: boolean
}>()

const emit = defineEmits<{ (e: 'ready'): void; (e: 'unavailable'): void }>()

const hostRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const bubbleText = ref('')
const bubblePos = ref<PctPoint>({ x: 50, y: 40 })
const bubbleStyle = computed(() => ({
    left: `${bubblePos.value.x}%`,
    top: `${bubblePos.value.y}%`,
}))

let THREE: typeof import('three') | null = null
let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: OrthographicCamera | null = null
let clock: import('three').Clock | null = null
let raycaster: import('three').Raycaster | null = null
let zoneGroup: Group | null = null
let petSprite: Sprite | null = null
let petShadow: Mesh | null = null
let petDirection = 1
let petBaseWidth = 3
let petHeight = 3
let petWalkPhase = 0
let petActionTimer = 0
let bubbleTimer = 0
let running = false
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let buildToken = 0
let groundMaterial: MeshBasicMaterial | null = null
let fishSprite: Sprite | null = null
let fishClock = 0
let animatedSprites: Array<{
    sprite: Sprite
    anim: NonNullable<SpriteSpec['anim']>
    phase: number
    baseX: number
    baseY: number
}> = []
let petPct: PctPoint = { x: 50, y: 60 }
let petGoal: PctPoint | null = null
let nextAmbientIn = 2.2
let readyNotified = false
let atmosphereOverlay: import('three').Mesh | null = null
const AMBIENT_LINES = [
    '今天也要好好干活～',
    '这里的风真舒服。',
    '菜园闻起来香香的。',
    '我看看有没有收获。',
    '鸡窝那边好像有动静。',
    '池塘今天很热闹。',
]

const PHASE_COLORS = {
    morning: 0xfff2cf,
    day: 0xffffff,
    evening: 0xffbd94,
    night: 0x516a97,
} as const

const textureCache = new Map<string, Texture>()
const imageCache = new Map<string, Promise<HTMLImageElement>>()
const clonedTextures: Texture[] = []

const SPRITE_ASPECT = new Map<string, number>([
    [houseUrl, 2],
    [fenceStripUrl, 20 / 72],
    [fishUrl, 10 / 14],
])

const VIEW_HEIGHT = 26
const PET_WIDTH_PCT = 8.4
const PLOT_GRID = {
    left: 16,
    top: 46,
    width: 68,
    height: 34,
    gap: 5,
}

const ZONE_TINTS: Record<PetYardTab, number> = {
    grow: 0xffffff,
    raise: 0xe6c56a,
    fish: 0xbcd9d0,
}

const pctBasis = {
    origin: { x: 0, z: 0 },
    ux: { x: 1, z: 0 },
    uy: { x: 0, z: 1 },
}

function loadImage(url: string): Promise<HTMLImageElement> {
    const cached = imageCache.get(url)
    if (cached) return cached
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`image failed: ${url}`))
        image.src = url
    })
    imageCache.set(url, promise)
    return promise
}

function makeTexture(url: string): Texture {
    if (!THREE) throw new Error('three not ready')
    const cached = textureCache.get(url)
    if (cached) return cached
    const texture = new THREE.TextureLoader().load(url)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    textureCache.set(url, texture)
    return texture
}

function makeCanvasTexture(
    size: number,
    draw: (ctx: CanvasRenderingContext2D, size: number) => void
): Texture {
    if (!THREE) throw new Error('three not ready')
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.imageSmoothingEnabled = false
    draw(ctx, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    return texture
}

function buildSoilTexture(): Texture {
    const key = 'soil-patch-v4'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(96, (ctx, size) => {
        ctx.fillStyle = '#7a4527'
        ctx.fillRect(0, 0, size, size)
        let seed = 23
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
        for (let y = 3; y < size; y += 12) {
            ctx.fillStyle = 'rgba(58, 33, 18, 0.38)'
            ctx.fillRect(0, y, size, 2)
            ctx.fillStyle = 'rgba(196, 140, 92, 0.16)'
            ctx.fillRect(0, y + 2, size, 1)
        }
        for (let y = 5; y < size; y += 13) {
            for (let x = 0; x < size; x += 11) {
                if (rand() < 0.45) continue
                ctx.fillStyle = rand() < 0.55 ? '#8a5130' : '#65391f'
                const width = 4 + rand() * 7
                ctx.fillRect(x + rand() * 5, y + rand() * 3, width, 3)
            }
        }
        const tones = ['#734025', '#8c5433', '#7c462a', '#965c39', '#5f351d']
        for (let i = 0; i < 70; i += 1) {
            const w = 2 + rand() * 7
            const h = 1 + rand() * 3
            ctx.fillStyle = tones[(rand() * tones.length) | 0]
            ctx.fillRect(rand() * size, rand() * size, w, h)
        }
        ctx.fillStyle = 'rgba(56, 34, 22, 0.26)'
        for (let i = 0; i < 22; i += 1) {
            ctx.fillRect(rand() * size, rand() * size, 4 + rand() * 6, 2 + rand() * 2)
        }
        ctx.fillStyle = 'rgba(214, 158, 104, 0.28)'
        for (let i = 0; i < 26; i += 1) {
            ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 3, 1)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildGroundTexture(): Texture {
    const key = 'yard-ground'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(128, (ctx, size) => {
        ctx.fillStyle = '#7cc465'
        ctx.fillRect(0, 0, size, size)
        const tones = ['#71b957', '#86cf6c', '#6cb353', '#8ed470', '#75bd5c']
        let seed = 7
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
        for (let i = 0; i < 190; i += 1) {
            const w = 2 + rand() * 6
            const h = 1 + rand() * 4
            ctx.fillStyle = tones[(rand() * tones.length) | 0]
            ctx.fillRect(rand() * size, rand() * size, w, h)
        }
        ctx.fillStyle = 'rgba(52, 108, 40, 0.14)'
        for (let i = 0; i < 26; i += 1) {
            ctx.fillRect(rand() * size, rand() * size, 3 + rand() * 8, 2 + rand() * 3)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildHorizonTexture(): Texture {
    const key = 'yard-horizon'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(64, (ctx, size) => {
        const bands = [
            'rgba(146, 196, 106, 0)',
            'rgba(128, 184, 96, 0.1)',
            'rgba(104, 164, 82, 0.22)',
            'rgba(82, 144, 70, 0.36)',
            'rgba(64, 124, 60, 0.5)',
        ]
        const bandHeight = size / bands.length
        bands.forEach((color, index) => {
            ctx.fillStyle = color
            ctx.fillRect(0, index * bandHeight, size, bandHeight)
        })
    })
    textureCache.set(key, texture)
    return texture
}

function applyAtmosphere() {
    if (!THREE || !scene || !groundMaterial) return
    if (!atmosphereOverlay) {
        const geometry = new THREE.PlaneGeometry(220, 220)
        geometry.rotateX(-Math.PI / 2)
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        })
        atmosphereOverlay = new THREE.Mesh(geometry, material)
        atmosphereOverlay.position.y = 0.02
        atmosphereOverlay.renderOrder = -900
        scene.add(atmosphereOverlay)
    }
    const material = atmosphereOverlay.material as import('three').MeshBasicMaterial
    material.color.setHex(PHASE_COLORS[props.dayPhase.id])
    material.opacity =
        props.dayPhase.id === 'night' ? 0.46
        : props.dayPhase.id === 'evening' ? 0.19
        : props.dayPhase.id === 'morning' ? 0.12
        : 0
    if (props.weather.id === 'cloudy' && props.dayPhase.id === 'day') {
        material.opacity = Math.max(material.opacity, 0.08)
    }
}

function buildPondTexture(): Texture {
    const key = 'yard-pond'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(256, (ctx, size) => {
        const points: Array<[number, number]> = []
        const segments = 28
        for (let i = 0; i < segments; i += 1) {
            const angle = (i / segments) * Math.PI * 2
            const wobble =
                1 +
                Math.sin(angle * 2 + 1.2) * 0.09 +
                Math.cos(angle * 3 + 0.4) * 0.07 +
                Math.sin(angle * 5 + 2.1) * 0.035
            points.push([
                size / 2 + Math.cos(angle) * 96 * wobble,
                size / 2 + Math.sin(angle) * 66 * wobble,
            ])
        }
        ctx.beginPath()
        points.forEach(([x, y], index) => {
            const next = points[(index + 1) % points.length]
            const midX = (x + next[0]) / 2
            const midY = (y + next[1]) / 2
            if (index === 0) ctx.moveTo(midX, midY)
            else ctx.quadraticCurveTo(x, y, midX, midY)
        })
        ctx.closePath()
        ctx.strokeStyle = '#e3d1a5'
        ctx.lineWidth = 14
        ctx.stroke()
        ctx.fillStyle = '#4fb0cd'
        ctx.fill()
        ctx.strokeStyle = 'rgba(96, 66, 44, 0.4)'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.save()
        ctx.clip()
        ctx.fillStyle = 'rgba(214, 240, 250, 0.2)'
        ctx.beginPath()
        ctx.ellipse(size / 2 - 24, size / 2 - 30, 78, 34, -0.12, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#7fd2e8'
        for (let y = 10; y < size; y += 16) {
            for (let x = 0; x < size; x += 26) {
                ctx.fillRect(x + ((y / 16) % 2) * 11, y, 16, 4)
            }
        }
        ctx.fillStyle = '#9fe6f5'
        for (let y = 20; y < size; y += 22) {
            ctx.fillRect(14 + (y % 18), y, 10, 2)
        }
        ctx.fillStyle = 'rgba(46, 122, 148, 0.34)'
        for (let y = 30; y < size; y += 19) {
            ctx.fillRect(30 + (y % 26), y, 12, 2)
        }
        ctx.restore()
    })
    textureCache.set(key, texture)
    return texture
}

function buildPatchEdgeTexture(
    variant: 'base' | 'bed' = 'base'
): Texture {
    const key = `patch-edge-${variant}`
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(128, (ctx, size) => {
        if (variant === 'bed') {
            ctx.save()
            ctx.shadowColor = 'rgba(40, 26, 16, 0.45)'
            ctx.shadowBlur = 8
            ctx.shadowOffsetY = 2
            ctx.strokeStyle = '#6a4028'
            ctx.lineWidth = 5
            ctx.beginPath()
            ctx.roundRect(6, 6, size - 12, size - 12, 10)
            ctx.stroke()
            ctx.restore()
            ctx.strokeStyle = 'rgba(206, 144, 92, 0.45)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(12, 12, size - 24, size - 24, 7)
            ctx.stroke()
            return
        }
        const radius = 18
        ctx.save()
        ctx.shadowColor = 'rgba(46, 34, 24, 0.32)'
        ctx.shadowBlur = 10
        ctx.strokeStyle = 'rgba(58, 40, 28, 0.28)'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.roundRect(6, 6, size - 12, size - 12, radius)
        ctx.stroke()
        ctx.restore()
    })
    textureCache.set(key, texture)
    return texture
}

function buildPastureTexture(): Texture {
    const key = 'pasture-patch-v2'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(128, (ctx, size) => {
        ctx.fillStyle = '#8ac565'
        ctx.fillRect(0, 0, size, size)
        for (let y = 0; y < size; y += 32) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
            ctx.fillRect(0, y, size, 16)
            ctx.fillStyle = 'rgba(52, 104, 38, 0.07)'
            ctx.fillRect(0, y + 16, size, 16)
        }
        const tones = ['#79ba53', '#9bd273', '#6fb14a', '#a6da7d']
        let seed = 41
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
        for (let i = 0; i < 150; i += 1) {
            ctx.fillStyle = tones[(rand() * tones.length) | 0]
            ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 5, 1 + rand() * 3)
        }
        ctx.fillStyle = 'rgba(52, 106, 38, 0.2)'
        for (let i = 0; i < 26; i += 1) {
            ctx.fillRect(rand() * size, rand() * size, 4 + rand() * 9, 2 + rand() * 3)
        }
        ctx.fillStyle = 'rgba(232, 246, 196, 0.5)'
        for (let i = 0; i < 16; i += 1) {
            ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildPathTexture(): Texture {
    const key = 'path-patch-v2'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(64, (ctx, size) => {
        ctx.fillStyle = '#d8b98a'
        ctx.fillRect(0, 0, size, size)
        const tones = ['#c9a878', '#e0c396', '#bfa072']
        let seed = 59
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
        for (let i = 0; i < 90; i += 1) {
            ctx.fillStyle = tones[(rand() * tones.length) | 0]
            ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 4, 1 + rand() * 3)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildPlankTexture(): Texture {
    const key = 'plank-patch-v2'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(32, (ctx, size) => {
        ctx.fillStyle = '#c98d56'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#8a5a3b'
        for (let y = 7; y < size; y += 8) {
            ctx.fillRect(0, y, size, 2)
        }
        ctx.fillStyle = '#e0a86c'
        for (let y = 1; y < size; y += 8) {
            ctx.fillRect(3, y, size - 6, 1)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildSandTexture(): Texture {
    const key = 'sand-patch-v2'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(32, (ctx, size) => {
        ctx.fillStyle = '#e6d3a8'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#d9c193'
        for (let i = 0; i < 16; i += 1) {
            ctx.fillRect((i * 7) % size, (i * 11) % size, 2, 2)
        }
        ctx.fillStyle = '#f4e6c4'
        for (let i = 0; i < 8; i += 1) {
            ctx.fillRect((i * 13 + 3) % size, (i * 5 + 1) % size, 1, 1)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function pctToGround(x: number, y: number) {
    if (!THREE) return { x: 0, z: 0 }
    const bx = pctBasis.ux
    const by = pctBasis.uy
    return {
        x: pctBasis.origin.x + (x - 50) * bx.x + (y - 50) * by.x,
        z: pctBasis.origin.z + (x - 50) * bx.z + (y - 50) * by.z,
    }
}

function refreshBasis() {
    if (!THREE || !camera) return
    const three = THREE
    if (!raycaster) raycaster = new three.Raycaster()
    const plane = new three.Plane(new three.Vector3(0, 1, 0), 0)

    const hit = (x: number, y: number) => {
        const ndc = new three.Vector2((x / 100) * 2 - 1, -((y / 100) * 2 - 1))
        raycaster!.setFromCamera(ndc, camera!)
        const point = new three.Vector3()
        raycaster!.ray.intersectPlane(plane, point)
        return point
    }

    const origin = hit(50, 50)
    const ux = hit(51, 50).sub(origin)
    const uy = hit(50, 51).sub(origin)
    pctBasis.origin = { x: origin.x, z: origin.z }
    pctBasis.ux = { x: ux.x, z: ux.z }
    pctBasis.uy = { x: uy.x, z: uy.z }
}

function spriteFromSpec(spec: SpriteSpec): Sprite {
    if (!THREE) throw new Error('three not ready')
    const material = new THREE.SpriteMaterial({
        map: makeTexture(spec.src),
        transparent: true,
        alphaTest: 0.06,
        depthTest: false,
        depthWrite: false,
    })
    material.opacity = spec.opacity ?? 1
    const sprite = new THREE.Sprite(material)
    const image = material.map?.image as HTMLImageElement | undefined
    const aspect =
        SPRITE_ASPECT.get(spec.src) ??
        (image && image.width ? image.height / image.width : 1)
    const world = pctToGround(spec.x, spec.y)
    const width = (spec.w / 100) * VIEW_HEIGHT * getAspect()
    const height = width * aspect
    sprite.scale.set(spec.flip ? -width : width, height, 1)
    sprite.position.set(world.x, height / 2 + 0.04, world.z)
    sprite.renderOrder = Math.round(spec.y * 10)
    if (spec.anim) sprite.userData.anim = spec.anim
    return sprite
}

let aspectRatio = 1
function getAspect() {
    return aspectRatio
}

function patchMesh(patch: PatchSpec): Mesh {
    if (!THREE) throw new Error('three not ready')
    const texture =
        patch.kind === 'soil'
            ? buildSoilTexture()
            : patch.kind === 'pond'
              ? buildPondTexture()
              : patch.kind === 'pasture'
                ? buildPastureTexture()
                : patch.kind === 'path'
                  ? buildPathTexture()
                  : patch.kind === 'sand'
                    ? buildSandTexture()
                    : patch.kind === 'plank'
                      ? buildPlankTexture()
                      : buildHorizonTexture()
    const map = texture.clone()
    clonedTextures.push(map)
    map.needsUpdate = true
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    if (patch.kind === 'pond' || patch.kind === 'horizon') {
        map.repeat.set(1, 1)
    } else {
        const repeatScale = patch.kind === 'plank' ? 3 : 5
        map.repeat.set(
            Math.max(1, (patch.width / repeatScale) | 0),
            Math.max(1, (patch.height / repeatScale) | 0)
        )
    }
    const geometry = new THREE.BufferGeometry()
    const tl = pctToGround(patch.left, patch.top)
    const tr = pctToGround(patch.left + patch.width, patch.top)
    const br = pctToGround(patch.left + patch.width, patch.top + patch.height)
    const bl = pctToGround(patch.left, patch.top + patch.height)
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
            [
                tl.x, 0.02, tl.z,
                tr.x, 0.02, tr.z,
                br.x, 0.02, br.z,
                bl.x, 0.02, bl.z,
            ],
            3
        )
    )
    geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
    )
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.computeVertexNormals()
    const material = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder =
        patch.kind === 'pond'
            ? -920
            : patch.kind === 'plank'
              ? -915
              : patch.kind === 'horizon'
                ? -940
                : patch.kind === 'soil'
                  ? -910
                  : -925
    return mesh
}

const HORIZON_PATCH: PatchSpec = {
    kind: 'horizon',
    left: 0,
    top: 0,
    width: 100,
    height: 22,
}

let horizonSprites: SpriteSpec[] | null = null
function horizonTreeLine(): SpriteSpec[] {
    if (horizonSprites) return horizonSprites
    horizonSprites = [
        { src: treeUrl, x: 4, y: 7, w: 6.5, anim: 'sway', opacity: 0.97 },
        { src: treeOakUrl, x: 11, y: 5, w: 8, anim: 'sway' },
        { src: treeUrl, x: 19, y: 9, w: 5.5, anim: 'sway', opacity: 0.95 },
        { src: treeUrl, x: 27, y: 6, w: 7.5, anim: 'sway' },
        { src: treeOakUrl, x: 36, y: 9, w: 6.5, anim: 'sway', opacity: 0.96 },
        { src: treeUrl, x: 45, y: 5, w: 8.5, anim: 'sway' },
        { src: treeUrl, x: 54, y: 8, w: 6, anim: 'sway', opacity: 0.95 },
        { src: treeOakUrl, x: 63, y: 5, w: 8, anim: 'sway' },
        { src: treeUrl, x: 72, y: 9, w: 5.5, anim: 'sway', opacity: 0.96 },
        { src: treeUrl, x: 80, y: 6, w: 7.5, anim: 'sway' },
        { src: treeOakUrl, x: 89, y: 8, w: 6.5, anim: 'sway', opacity: 0.95 },
        { src: treeUrl, x: 95, y: 6, w: 6, anim: 'sway' },
    ]
    return horizonSprites
}

function fenceRow(centerX: number, y: number, segments: number, segWidth = 13) {
    const total = segments * segWidth
    const start = centerX - total / 2 + segWidth / 2
    return Array.from({ length: segments }, (_, index) => ({
        src: fenceStripUrl,
        x: start + index * segWidth,
        y,
        w: segWidth,
    }))
}

function buildZone(tab: PetYardTab): ZoneSpec {
    const horizon = horizonTreeLine()
    if (tab === 'grow') {
        const beds: PatchSpec[] = plotRects().map((rect) => ({
            kind: 'soil',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        }))
        return {
            tint: ZONE_TINTS.grow,
            petStart: { x: 50, y: 88 },
            patches: [
                HORIZON_PATCH,
                { kind: 'path', left: 18, top: 84, width: 64, height: 9 },
                ...beds,
            ],
            sprites: [
                ...horizon,
                { src: houseUrl, x: 5.5, y: 27, w: 13.5 },
                ...fenceRow(50, 45.2, 5, 13.6),
                { src: bushUrl, x: 24, y: 28, w: 4.5, anim: 'sway' },
                { src: bushUrl, x: 72, y: 29, w: 4.5, anim: 'sway' },
                { src: bushUrl, x: 79, y: 32, w: 4, anim: 'sway' },
                { src: scarecrowUrl, x: 86, y: 41, w: 6.5 },
                { src: flowerUrl, x: 7, y: 46, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 11, y: 54, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 90, y: 50, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 93, y: 58, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 13, y: 79, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 88, y: 79, w: 3, anim: 'sway' },
                { src: wateringCanUrl, x: 33, y: 90, w: 4.5 },
                { src: crateUrl, x: 8, y: 93, w: 4.5 },
                { src: barrelUrl, x: 14, y: 92, w: 4.5 },
                { src: hayUrl, x: 82, y: 93, w: 5.5 },
                ...fenceRow(50, 97, 4, 15),
            ],
        }
    }
    if (tab === 'raise') {
        return {
            tint: ZONE_TINTS.raise,
            petStart: { x: 50, y: 88 },
            patches: [
                HORIZON_PATCH,
                { kind: 'sand', left: 58, top: 14, width: 33, height: 28 },
                { kind: 'pasture', left: 9, top: 52, width: 37, height: 30 },
                { kind: 'path', left: 18, top: 84, width: 64, height: 9 },
            ],
            sprites: [
                ...horizon,
                { src: houseUrl, x: 5.5, y: 27, w: 13.5 },
                { src: hayUrl, x: 63, y: 26, w: 5.5 },
                { src: hayUrl, x: 71, y: 24, w: 5 },
                { src: milkCanUrl, x: 86, y: 30, w: 4.2 },
                { src: crateUrl, x: 90, y: 38, w: 4.5 },
                { src: chickenUrl, x: 62, y: 34, w: 3.6, anim: 'hop' },
                { src: chickenUrl, x: 69, y: 38, w: 3.3, flip: true, anim: 'hop' },
                { src: chickenUrl, x: 75, y: 33, w: 3.5, anim: 'graze' },
                { src: chickenUrl, x: 84, y: 39, w: 3.6, anim: 'hop' },
                { src: cowUrl, x: 18, y: 68, w: 6.5, anim: 'graze' },
                { src: sheepUrl, x: 31, y: 63, w: 5, anim: 'hop' },
                { src: sheepUrl, x: 25, y: 77, w: 4.6, flip: true, anim: 'graze' },
                { src: troughUrl, x: 40, y: 80, w: 4.8 },
                { src: hayUrl, x: 36, y: 71, w: 4.5 },
                { src: bushUrl, x: 22, y: 28, w: 4.5, anim: 'sway' },
                { src: bushUrl, x: 47, y: 46, w: 4, anim: 'sway' },
                { src: flowerUrl, x: 7, y: 46, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 50, y: 42, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 93, y: 54, w: 3, anim: 'sway' },
                { src: rockUrl, x: 8, y: 90, w: 5 },
                { src: rockUrl, x: 84, y: 91, w: 4.5 },
                ...fenceRow(50, 97, 4, 15),
                ...fenceRow(27.5, 51.4, 3, 12.33),
                ...fenceRow(27.5, 82.6, 3, 12.33),
            ],
        }
    }
    return {
        tint: ZONE_TINTS.fish,
        petStart: { x: 50, y: 88 },
        patches: [
            HORIZON_PATCH,
            { kind: 'sand', left: 14, top: 40, width: 72, height: 50 },
            { kind: 'pond', left: 16, top: 44, width: 68, height: 46 },
            { kind: 'plank', left: 43, top: 78, width: 14, height: 10 },
        ],
        sprites: [
            ...horizon,
            { src: houseUrl, x: 5.5, y: 27, w: 13.5 },
            { src: bushUrl, x: 40, y: 37, w: 4, anim: 'sway' },
            { src: flowerUrl, x: 8, y: 47, w: 3, anim: 'sway' },
            { src: flowerUrl, x: 92, y: 55, w: 3, anim: 'sway' },
            { src: reedsUrl, x: 20, y: 51, w: 4.2, anim: 'sway' },
            { src: reedsUrl, x: 24, y: 82, w: 4.2, anim: 'sway' },
            { src: reedsUrl, x: 77, y: 82, w: 4, anim: 'sway' },
            { src: reedsUrl, x: 79, y: 51, w: 4, anim: 'sway' },
            { src: lilyUrl, x: 44, y: 58, w: 4.2, anim: 'drift' },
            { src: lilyUrl, x: 62, y: 68, w: 4, anim: 'drift' },
            { src: lilyUrl, x: 68, y: 56, w: 3.8, anim: 'drift' },
            { src: lilyUrl, x: 54, y: 72, w: 4, anim: 'drift' },
            { src: rockUrl, x: 88, y: 44, w: 4.5 },
            { src: rockUrl, x: 18, y: 84, w: 5 },
            { src: crateUrl, x: 10, y: 93, w: 4.5 },
            { src: barrelUrl, x: 16, y: 92, w: 4.5 },
        ],
    }
}

function patchEdgeMesh(patch: PatchSpec): Mesh | null {
    if (!THREE) return null
    if (!['soil', 'pasture', 'path', 'sand'].includes(patch.kind)) {
        return null
    }
    const variant = patch.kind === 'soil' ? 'bed' : 'base'
    const map = buildPatchEdgeTexture(variant).clone()
    clonedTextures.push(map)
    map.needsUpdate = true
    map.repeat.set(1, 1)
    const geometry = new THREE.BufferGeometry()
    const pad = patch.kind === 'soil' ? 0.5 : 1.2
    const left = patch.left - pad
    const top = patch.top - pad
    const width = patch.width + pad * 2
    const height = patch.height + pad * 2
    const tl = pctToGround(left, top)
    const tr = pctToGround(left + width, top)
    const br = pctToGround(left + width, top + height)
    const bl = pctToGround(left, top + height)
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
            [
                tl.x, 0.03, tl.z,
                tr.x, 0.03, tr.z,
                br.x, 0.03, br.z,
                bl.x, 0.03, bl.z,
            ],
            3
        )
    )
    geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
    )
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    const material = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = patch.kind === 'soil' ? -908 : -923
    return mesh
}

function spriteShadow(spec: SpriteSpec): Mesh | null {
    if (!THREE || spec.anim === 'drift') return null
    const geometry = new THREE.CircleGeometry(0.5, 20)
    geometry.rotateX(-Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
        map: createShadowTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
    })
    material.opacity = (spec.opacity ?? 1) * 0.8
    const mesh = new THREE.Mesh(geometry, material)
    const world = pctToGround(spec.x, spec.y + 1.2)
    const width = (spec.w / 100) * VIEW_HEIGHT * getAspect()
    mesh.position.set(world.x, 0.025, world.z)
    mesh.scale.set(width * 0.95, width * 0.5, 1)
    mesh.renderOrder = Math.round(spec.y * 10) - 2
    return mesh
}
function disposeGroup(group: Group | null) {
    if (!group) return
    group.traverse((child) => {
        const hasMaterial = child as unknown as {
            material?: { dispose?: () => void } | Array<{ dispose?: () => void }>
        }
        const material = hasMaterial.material
        if (Array.isArray(material)) {
            material.forEach((item) => item.dispose?.())
        } else {
            material?.dispose?.()
        }
        const hasGeometry = child as unknown as {
            geometry?: { dispose?: () => void }
        }
        hasGeometry.geometry?.dispose?.()
    })
    group.clear()
}

async function rebuildZone() {
    if (!THREE || !scene) return
    const token = ++buildToken
    const spec = buildZone(props.tab)
    await Promise.all([
        loadImage(houseUrl),
        loadImage(petCatUrl),
        loadImage(fenceStripUrl),
    ]).catch(() => undefined)
    if (token !== buildToken || !scene || !THREE) return

    if (zoneGroup) {
        scene.remove(zoneGroup)
        disposeGroup(zoneGroup)
    }
    clonedTextures.forEach((texture) => texture.dispose())
    clonedTextures.length = 0
    fishSprite = null
    zoneGroup = new THREE.Group()
    scene.add(zoneGroup)

    for (const patch of spec.patches) {
        zoneGroup.add(patchMesh(patch))
        const edge = patchEdgeMesh(patch)
        if (edge) zoneGroup.add(edge)
    }
    for (const spriteSpec of spec.sprites) {
        const shadow = spriteShadow(spriteSpec)
        if (shadow) zoneGroup.add(shadow)
        zoneGroup.add(spriteFromSpec(spriteSpec))
    }
    animatedSprites = []
    for (const child of zoneGroup.children) {
        const userData = (child as Sprite).userData as {
            anim?: SpriteSpec['anim']
        }
        if (!userData.anim) continue
        animatedSprites.push({
            sprite: child as Sprite,
            anim: userData.anim,
            phase: Math.random() * Math.PI * 2,
            baseX: (child as Sprite).position.x,
            baseY: (child as Sprite).position.y,
        })
    }
    if (groundMaterial) groundMaterial.color.setHex(spec.tint)
    applyAtmosphere()

    if (props.tab === 'fish') {
        const fish = spriteFromSpec({
            src: fishUrl,
            x: 62,
            y: 64,
            w: 4,
        })
        fishSprite = fish
        fish.visible = false
        zoneGroup.add(fish)
    }

    petPct = { ...spec.petStart }
    petGoal = null
    nextAmbientIn = 2.2
    petWalkPhase = 0
    petActionTimer = 0
    if (petSprite) updatePetTransform(0, 0)

    if (!readyNotified) {
        readyNotified = true
        emit('ready')
    }
}

function updatePetTransform(dt: number, elapsed: number) {
    if (!petSprite || !petShadow || !THREE) return
    const ground = pctToGround(petPct.x, petPct.y)
    const walking = Boolean(petGoal)
    const bob = walking
        ? Math.abs(Math.sin(petWalkPhase)) * petHeight * 0.12
        : Math.sin(elapsed * 2.1) * petHeight * 0.02
    const hop =
        petActionTimer > 0
            ? Math.abs(Math.sin((1.1 - petActionTimer) * 7)) * petHeight * 0.16
            : 0
    petSprite.position.set(ground.x, petHeight / 2 + 0.05 + bob + hop, ground.z)
    petSprite.scale.set(petDirection * petBaseWidth, petHeight, 1)
    petSprite.renderOrder = Math.round(petPct.y * 10) + 1

    petShadow.position.set(ground.x, 0.03, ground.z)
    const shadowScale = petBaseWidth * (walking ? 0.62 : 0.56)
    petShadow.scale.set(shadowScale, shadowScale, 1)
    petShadow.renderOrder = Math.round(petPct.y * 10)

    if (bubbleText.value && camera) {
        const anchor = new THREE.Vector3(ground.x, petHeight * 0.95, ground.z)
        anchor.project(camera)
        bubblePos.value = {
            x: (anchor.x * 0.5 + 0.5) * 100,
            y: (-anchor.y * 0.5 + 0.5) * 100,
        }
    }
    void dt
}

function plotRects() {
    const cols = Math.max(1, props.plotColumns)
    const rows = Math.max(1, Math.ceil(props.plotCount / cols))
    const gapX = (PLOT_GRID.width * PLOT_GRID.gap) / 100
    const gapY = (PLOT_GRID.height * PLOT_GRID.gap) / 100
    const cellWidth = (PLOT_GRID.width - (cols - 1) * gapX) / cols
    const cellHeight = (PLOT_GRID.height - (rows - 1) * gapY) / rows
    const rects: Array<{
        left: number
        top: number
        width: number
        height: number
    }> = []
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col
            if (index >= props.plotCount) break
            rects.push({
                left: PLOT_GRID.left + col * (cellWidth + gapX),
                top: PLOT_GRID.top + row * (cellHeight + gapY),
                width: cellWidth,
                height: cellHeight,
            })
        }
    }
    return rects
}

function plotWaypoints(): PctPoint[] {
    const rects = plotRects()
    return rects.map((rect) => ({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    }))
}

function waypointsForZone(): PctPoint[] {
    if (props.tab === 'grow') {
        return [...plotWaypoints(), { x: 26, y: 88 }, { x: 72, y: 88 }]
    }
    if (props.tab === 'raise') {
        return [
            { x: 74, y: 31 },
            { x: 27, y: 69 },
            { x: 31, y: 63 },
            { x: 50, y: 88 },
        ]
    }
    return [
        { x: 50, y: 82 },
        { x: 26, y: 80 },
        { x: 74, y: 80 },
        { x: 50, y: 89 },
    ]
}

function walkTo(point: PctPoint) {
    petGoal = { ...point }
}

function chooseAmbientGoal() {
    const points = waypointsForZone()
    if (!points.length) return
    const next = points[(Math.random() * points.length) | 0]
    walkTo(next)
    if (Math.random() < 0.45) {
        showBubble(AMBIENT_LINES[(Math.random() * AMBIENT_LINES.length) | 0])
    }
}

function showBubble(text: string, duration = 2.6) {
    bubbleText.value = text
    bubbleTimer = duration
}

function updatePet(dt: number, elapsed: number) {
    if (!petSprite) return
    if (bubbleTimer > 0) {
        bubbleTimer -= dt
        if (bubbleTimer <= 0) bubbleText.value = ''
    }
    if (petGoal) {
        const dx = petGoal.x - petPct.x
        const dy = petGoal.y - petPct.y
        const distance = Math.hypot(dx, dy)
        const step = (props.dayPhase.id === 'night' ? 14 : 22) * dt
        if (distance <= step) {
            petPct = { ...petGoal }
            petGoal = null
            petActionTimer = 1.1
        } else {
            petPct.x += (dx / distance) * step
            petPct.y += (dy / distance) * step
            if (Math.abs(dx) > 0.3) petDirection = dx < 0 ? -1 : 1
            petWalkPhase += dt * 9
        }
    } else {
        petActionTimer = Math.max(0, petActionTimer - dt)
        nextAmbientIn -= dt
        if (petActionTimer <= 0 && nextAmbientIn <= 0) {
            chooseAmbientGoal()
            nextAmbientIn =
                props.dayPhase.id === 'night'
                    ? 4.6 + Math.random() * 3.8
                    : 2.4 + Math.random() * 2.6
        }
    }
    updatePetTransform(dt, elapsed)
}

function reactToReady(kind: 'plot' | 'chicken' | 'cow' | 'pond', point: PctPoint) {
    if (!readyNotified) return
    walkTo(point)
    const messages: Record<typeof kind, string> = {
        plot: '有菜可以收啦！',
        chicken: '鸡窝里有东西！',
        cow: '去看看奶牛～',
        pond: '鱼好像上钩了！',
    }
    showBubble(messages[kind], 3)
}

function updateWater(elapsed: number) {
    for (const item of animatedSprites) {
        const { sprite, anim, phase, baseX, baseY } = item
        if (anim === 'sway') {
            sprite.material.rotation = Math.sin(elapsed * 1.3 + phase) * 0.06
        } else if (anim === 'hop') {
            sprite.position.y =
                baseY + Math.abs(Math.sin(elapsed * 3.4 + phase)) * 0.22
        } else if (anim === 'graze') {
            sprite.material.rotation =
                Math.max(0, Math.sin(elapsed * 1.6 + phase)) * 0.12
        } else if (anim === 'drift') {
            sprite.material.rotation = Math.sin(elapsed * 0.9 + phase) * 0.1
            sprite.position.x = baseX + Math.sin(elapsed * 0.4 + phase) * 0.12
        }
    }
    if (fishSprite) {
        fishClock -= 1 / 60
        const cycle = elapsed % 6
        if (cycle < 1.1) {
            fishSprite.visible = true
            const local = cycle / 1.1
            const ground = pctToGround(62, 64)
            fishSprite.position.set(
                ground.x,
                0.4 + Math.sin(local * Math.PI) * 2.2,
                ground.z
            )
            fishSprite.scale.x = (4 / 100) * VIEW_HEIGHT * aspectRatio * (1 - local * 0.2)
            fishSprite.scale.y = fishSprite.scale.x * 0.62
            fishSprite.renderOrder = 900
        } else {
            fishSprite.visible = false
        }
        void fishClock
    }
}

function createShadowTexture(): Texture {
    const key = 'pet-shadow'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(32, (ctx, size) => {
        const gradient = ctx.createRadialGradient(
            size / 2,
            size / 2,
            1,
            size / 2,
            size / 2,
            size / 2
        )
        gradient.addColorStop(0, 'rgba(40, 30, 24, 0.34)')
        gradient.addColorStop(0.7, 'rgba(40, 30, 24, 0.16)')
        gradient.addColorStop(1, 'rgba(40, 30, 24, 0)')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, size, size)
    })
    textureCache.set(key, texture)
    return texture
}

function createPet() {
    if (!THREE || !scene) return
    const material = new THREE.SpriteMaterial({
        map: makeTexture(petCatUrl),
        transparent: true,
        alphaTest: 0.06,
        depthTest: false,
        depthWrite: false,
    })
    petSprite = new THREE.Sprite(material)
    petBaseWidth = (PET_WIDTH_PCT / 100) * VIEW_HEIGHT * aspectRatio
    petHeight = petBaseWidth
    petSprite.scale.set(petBaseWidth, petHeight, 1)
    scene.add(petSprite)

    const shadowGeometry = new THREE.CircleGeometry(0.5, 24)
    shadowGeometry.rotateX(-Math.PI / 2)
    const shadowMaterial = new THREE.MeshBasicMaterial({
        map: createShadowTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
    })
    petShadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
    scene.add(petShadow)
}

function setupScene() {
    if (!THREE || !canvasRef.value || !hostRef.value) return
    renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.value,
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    camera.position.set(0, 15, 15)
    camera.lookAt(0, 1.2, 0)
    clock = new THREE.Clock()

    groundMaterial = new THREE.MeshBasicMaterial({
        map: buildGroundTexture(),
        depthTest: false,
        depthWrite: false,
    })
    const grassMap = groundMaterial.map
    if (grassMap) {
        grassMap.repeat.set(34, 34)
    }
    applyAtmosphere()
    const groundGeometry = new THREE.PlaneGeometry(220, 220)
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.name = 'pet-yard-ground'
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    ground.renderOrder = -1000
    scene.add(ground)

    createPet()
    resize()
    void rebuildZone()
    running = true
    animate()
}

function resize() {
    if (!renderer || !camera || !hostRef.value || !THREE) return
    const width = Math.max(1, hostRef.value.clientWidth)
    const height = Math.max(1, hostRef.value.clientHeight)
    aspectRatio = width / height
    const halfHeight = VIEW_HEIGHT / 2
    camera.left = -halfHeight * aspectRatio
    camera.right = halfHeight * aspectRatio
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    refreshBasis()
    if (petSprite) {
        petBaseWidth = (PET_WIDTH_PCT / 100) * VIEW_HEIGHT * aspectRatio
        petHeight = petBaseWidth
    }
    void rebuildZone()
}

function animate() {
    if (!running || !renderer || !scene || !camera || !clock) return
    frameId = requestAnimationFrame(animate)
    const dt = Math.min(clock.getDelta(), 0.05)
    const elapsed = clock.elapsedTime
    updatePet(dt, elapsed)
    updateWater(elapsed)
    renderer.render(scene, camera)
}

watch(
    () => props.tab,
    () => {
        bubbleText.value = ''
        bubbleTimer = 0
        void rebuildZone()
    }
)

watch(
    () => [props.weather.id, props.dayPhase.id],
    () => applyAtmosphere()
)

watch(
    () => [props.plotCount, props.plotColumns],
    () => {
        void rebuildZone()
    }
)

watch(
    () => props.chickenReady,
    (ready) => {
        if (ready) reactToReady('chicken', { x: 74, y: 31 })
    }
)

watch(
    () => props.cowReady,
    (ready) => {
        if (ready) reactToReady('cow', { x: 27, y: 69 })
    }
)

watch(
    () => props.pondReady,
    (ready) => {
        if (ready) reactToReady('pond', { x: 50, y: 82 })
    }
)

onMounted(async () => {
    try {
        THREE = await import('three')
    } catch {
        emit('unavailable')
        return
    }
    try {
        setupScene()
        resizeObserver = new ResizeObserver(() => resize())
        if (hostRef.value) resizeObserver.observe(hostRef.value)
    } catch {
        emit('unavailable')
    }
})

onBeforeUnmount(() => {
    running = false
    if (frameId) cancelAnimationFrame(frameId)
    if (resizeObserver) resizeObserver.disconnect()
    if (zoneGroup && scene) {
        scene.remove(zoneGroup)
        disposeGroup(zoneGroup)
    }
    if (renderer) {
        renderer.dispose()
        renderer = null
    }
    scene = null
    camera = null
    atmosphereOverlay = null
    petSprite = null
    petShadow = null
    groundMaterial = null
})
</script>

<style lang="less" scoped>
.pet-yard3d {
    position: absolute;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
}

.pet-yard3d-canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
}

.pet-yard3d-bubble {
    position: absolute;
    z-index: 5;
    max-width: 150px;
    padding: 5px 9px;
    transform: translate(-50%, -100%);
    border: 2px solid #3c2b2f;
    border-radius: 10px;
    background: #fffaf0;
    box-shadow: 3px 3px 0 rgba(60, 43, 47, 0.22);
    color: #5f3d30;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.35;
    white-space: nowrap;
    pointer-events: none;

    &::after {
        position: absolute;
        bottom: -8px;
        left: 50%;
        width: 0;
        height: 0;
        content: '';
        transform: translateX(-50%);
        border-top: 6px solid #3c2b2f;
        border-right: 5px solid transparent;
        border-left: 5px solid transparent;
    }
}

.pet-yard3d-sky {
    position: absolute;
    z-index: 1;
    inset: 0;
    pointer-events: none;
    transition: background 0.8s ease;
}

.is-weather-sunny.is-phase-morning .pet-yard3d-sky {
    background: linear-gradient(180deg, rgba(255, 209, 150, 0.17), rgba(255, 236, 194, 0.02) 52%);
}

.is-weather-sunny.is-phase-evening .pet-yard3d-sky {
    background: linear-gradient(180deg, rgba(252, 134, 92, 0.22), rgba(255, 198, 126, 0.03) 55%);
}

.is-weather-cloudy .pet-yard3d-sky {
    background: linear-gradient(180deg, rgba(164, 184, 200, 0.19), rgba(220, 230, 236, 0.02) 58%);
}

.is-weather-rainy .pet-yard3d-sky,
.is-weather-rainy.is-phase-day .pet-yard3d-sky {
    background: linear-gradient(180deg, rgba(95, 122, 146, 0.31), rgba(140, 168, 190, 0.05) 56%);
}

.is-weather-windy .pet-yard3d-sky {
    background: linear-gradient(180deg, rgba(166, 214, 199, 0.14), rgba(224, 242, 228, 0.01) 56%);
}

.is-phase-night .pet-yard3d-sky {
    background:
        radial-gradient(circle at 24% 14%, rgba(255, 250, 216, 0.2), transparent 20%),
        linear-gradient(180deg, rgba(29, 42, 81, 0.52), rgba(48, 62, 105, 0.09) 64%);
}

.pet-yard3d-rain {
    position: absolute;
    z-index: 2;
    inset: -10%;
    background-image:
        linear-gradient(113deg, rgba(224, 244, 255, 0.34) 0 1px, transparent 1px 18px),
        linear-gradient(117deg, rgba(198, 225, 242, 0.24) 0 1px, transparent 1px 27px);
    animation: pet-yard-rain 0.5s linear infinite;
    opacity: 0.58;
    pointer-events: none;
}

.pet-yard3d-leaves {
    position: absolute;
    z-index: 2;
    inset: 0;
    background-image:
        radial-gradient(4px 3px at 12% 24%, #e9b968 40%, transparent 42%),
        radial-gradient(3px 2px at 42% 52%, #d7a45a 40%, transparent 42%),
        radial-gradient(4px 3px at 70% 32%, #e8c273 40%, transparent 42%),
        radial-gradient(3px 2px at 84% 66%, #d19a51 40%, transparent 42%);
    animation: pet-yard-leaves 4.6s linear infinite;
    opacity: 0.56;
    pointer-events: none;
}

@keyframes pet-yard-rain {
    to {
        transform: translate3d(-3%, 10%, 0);
    }
}

@keyframes pet-yard-leaves {
    to {
        transform: translate3d(-28%, 9%, 0) rotate(38deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .pet-yard3d-bubble {
        transition: none;
    }
    .pet-yard3d-rain,
    .pet-yard3d-leaves {
        animation: none;
    }
}
</style>
