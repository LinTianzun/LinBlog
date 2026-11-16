<template>
    <div ref="hostRef" class="pet-yard3d" aria-hidden="true">
        <canvas ref="canvasRef" class="pet-yard3d-canvas" />
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
import barrelUrl from '../../assets/farm/pixel/barrel.png'
import bushUrl from '../../assets/farm/pixel/bush.png'
import crateUrl from '../../assets/farm/pixel/crate.png'
import fenceStripUrl from '../../assets/farm/pixel/fence-strip.png'
import fishUrl from '../../assets/farm/pixel/fish.png'
import flowerUrl from '../../assets/farm/pixel/flower.png'
import grassUrl from '../../assets/farm/pixel/grass.png'
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
    kind: 'soil' | 'water' | 'pasture' | 'path' | 'plank' | 'sand'
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
let waterTexture: Texture | null = null
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
const AMBIENT_LINES = [
    '今天也要好好干活～',
    '这里的风真舒服。',
    '菜园闻起来香香的。',
    '我看看有没有收获。',
    '鸡窝那边好像有动静。',
    '池塘今天很热闹。',
]

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
    gap: 6,
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
    const key = 'soil-patch'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(64, (ctx) => {
        const colors = ['#8c5235', '#855035', '#946041', '#7e4a30']
        for (let row = 0; row < 2; row += 1) {
            for (let col = 0; col < 2; col += 1) {
                ctx.fillStyle = colors[(row * 2 + col) % colors.length]
                ctx.fillRect(col * 32, row * 32, 32, 32)
                ctx.fillStyle = 'rgba(58, 38, 26, 0.18)'
                ctx.fillRect(col * 32, row * 32 + 30, 32, 2)
            }
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildWaterTexture(): Texture {
    const key = 'water-patch'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(48, (ctx, size) => {
        ctx.fillStyle = '#58b6d4'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#7fd2e8'
        for (let y = 2; y < size; y += 8) {
            for (let x = 0; x < size; x += 12) {
                ctx.fillRect(x + ((y / 8) % 2) * 5, y, 7, 2)
            }
        }
        ctx.fillStyle = '#9fe6f5'
        for (let y = 5; y < size; y += 10) {
            ctx.fillRect(6 + (y % 10), y, 4, 1)
        }
        ctx.fillStyle = '#3f9cbb'
        for (let y = 6; y < size; y += 9) {
            ctx.fillRect(18 + (y % 12), y, 9, 2)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildPastureTexture(): Texture {
    const key = 'pasture-patch'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(32, (ctx, size) => {
        ctx.fillStyle = '#b7d47a'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#a3c964'
        for (let i = 0; i < 10; i += 1) {
            ctx.fillRect((i * 11) % size, (i * 7) % size, 2, 3)
        }
        ctx.fillStyle = '#d3eaa0'
        for (let i = 0; i < 8; i += 1) {
            ctx.fillRect((i * 13 + 5) % size, (i * 9 + 3) % size, 3, 1)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildPathTexture(): Texture {
    const key = 'path-patch'
    const cached = textureCache.get(key)
    if (cached) return cached
    const texture = makeCanvasTexture(32, (ctx, size) => {
        ctx.fillStyle = '#d8b98a'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#c9a878'
        for (let i = 0; i < 14; i += 1) {
            ctx.fillRect((i * 9) % size, (i * 13) % size, 2, 2)
        }
        ctx.fillStyle = '#efd8b0'
        for (let i = 0; i < 6; i += 1) {
            ctx.fillRect((i * 15 + 4) % size, (i * 5 + 2) % size, 1, 1)
        }
    })
    textureCache.set(key, texture)
    return texture
}

function buildPlankTexture(): Texture {
    const key = 'plank-patch'
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
    const key = 'sand-patch'
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
            : patch.kind === 'water'
              ? buildWaterTexture()
              : patch.kind === 'pasture'
                ? buildPastureTexture()
                : patch.kind === 'path'
                  ? buildPathTexture()
                  : patch.kind === 'sand'
                    ? buildSandTexture()
                    : buildPlankTexture()
    const map = texture.clone()
    clonedTextures.push(map)
    map.needsUpdate = true
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    const repeatScale =
        patch.kind === 'water' ? 6 : patch.kind === 'plank' ? 3 : 5
    map.repeat.set(
        Math.max(1, (patch.width / repeatScale) | 0),
        Math.max(1, (patch.height / repeatScale) | 0)
    )
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
        transparent: patch.kind === 'water',
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = -900
    if (patch.kind === 'water') waterTexture = map
    return mesh
}

function buildZone(tab: PetYardTab): ZoneSpec {
    if (tab === 'grow') {
        const beds: PatchSpec[] = plotRects().map((rect) => ({
            kind: 'soil',
            left: rect.left + 1.1,
            top: rect.top + 1.1,
            width: Math.max(4, rect.width - 2.2),
            height: Math.max(4, rect.height - 2.2),
        }))
        return {
            tint: ZONE_TINTS.grow,
            petStart: { x: 50, y: 86 },
            patches: [
                { kind: 'path', left: 18, top: 82, width: 64, height: 10 },
                ...beds,
            ],
            sprites: [
                { src: houseUrl, x: 2, y: 30, w: 13.5 },
                { src: treeOakUrl, x: 86, y: 22, w: 8.5, anim: 'sway' },
                { src: treeUrl, x: 14, y: 22, w: 7.5, anim: 'sway' },
                { src: bushUrl, x: 22, y: 28, w: 4.5, anim: 'sway' },
                { src: bushUrl, x: 72, y: 30, w: 4.5, anim: 'sway' },
                { src: flowerUrl, x: 8, y: 42, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 12, y: 50, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 86, y: 46, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 90, y: 56, w: 3, anim: 'sway' },
                { src: scarecrowUrl, x: 90, y: 78, w: 6.5 },
                { src: wateringCanUrl, x: 12, y: 76, w: 4.5 },
                { src: crateUrl, x: 16, y: 90, w: 4.5 },
                { src: hayUrl, x: 84, y: 94, w: 5.5 },
                { src: barrelUrl, x: 90, y: 90, w: 4.5 },
                { src: fenceStripUrl, x: 14, y: 96, w: 74 },
            ],
        }
    }
    if (tab === 'raise') {
        return {
            tint: ZONE_TINTS.raise,
            petStart: { x: 50, y: 86 },
            patches: [
                { kind: 'sand', left: 54, top: 14, width: 38, height: 30 },
                { kind: 'path', left: 18, top: 82, width: 64, height: 10 },
                { kind: 'pasture', left: 9, top: 52, width: 37, height: 33 },
            ],
            sprites: [
                { src: houseUrl, x: 2, y: 30, w: 13.5 },
                { src: chickenUrl, x: 60, y: 29, w: 3.6, anim: 'hop' },
                { src: chickenUrl, x: 67, y: 35, w: 3.3, flip: true, anim: 'hop' },
                { src: chickenUrl, x: 73, y: 25, w: 3.5, anim: 'graze' },
                { src: hayUrl, x: 60, y: 40, w: 6 },
                { src: hayUrl, x: 68, y: 37, w: 5 },
                { src: milkCanUrl, x: 79, y: 40, w: 4.2 },
                { src: crateUrl, x: 88, y: 34, w: 4.5 },
                { src: chickenUrl, x: 84, y: 41, w: 3.6, anim: 'hop' },
                { src: cowUrl, x: 17, y: 63, w: 6.5, anim: 'graze' },
                { src: sheepUrl, x: 32, y: 66, w: 5, anim: 'hop' },
                { src: troughUrl, x: 40, y: 79, w: 4.8 },
                { src: treeOakUrl, x: 86, y: 22, w: 8.5, anim: 'sway' },
                { src: treeUrl, x: 14, y: 22, w: 7.5, anim: 'sway' },
                { src: bushUrl, x: 22, y: 28, w: 4.5, anim: 'sway' },
                { src: bushUrl, x: 80, y: 84, w: 4.5, anim: 'sway' },
                { src: flowerUrl, x: 8, y: 42, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 12, y: 50, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 86, y: 46, w: 3, anim: 'sway' },
                { src: flowerUrl, x: 90, y: 56, w: 3, anim: 'sway' },
                { src: rockUrl, x: 8, y: 88, w: 5 },
                { src: rockUrl, x: 88, y: 88, w: 4.5 },
                { src: fenceStripUrl, x: 10, y: 83, w: 34 },
                { src: fenceStripUrl, x: 45, y: 79, w: 8, flip: true },
            ],
        }
    }
    return {
        tint: ZONE_TINTS.fish,
        petStart: { x: 50, y: 86 },
        patches: [
            { kind: 'path', left: 18, top: 82, width: 64, height: 10 },
            { kind: 'sand', left: 12, top: 42, width: 76, height: 46 },
            { kind: 'water', left: 21, top: 49, width: 58, height: 34 },
            { kind: 'plank', left: 45, top: 49, width: 13, height: 9 },
        ],
        sprites: [
            { src: houseUrl, x: 2, y: 30, w: 13.5 },
            { src: treeOakUrl, x: 86, y: 22, w: 8.5, anim: 'sway' },
            { src: treeUrl, x: 14, y: 22, w: 7.5, anim: 'sway' },
            { src: bushUrl, x: 22, y: 28, w: 4.5, anim: 'sway' },
            { src: bushUrl, x: 36, y: 84, w: 4.5, anim: 'sway' },
            { src: flowerUrl, x: 8, y: 42, w: 3, anim: 'sway' },
            { src: flowerUrl, x: 12, y: 50, w: 3, anim: 'sway' },
            { src: flowerUrl, x: 92, y: 54, w: 3, anim: 'sway' },
            { src: reedsUrl, x: 23, y: 52, w: 4.2, anim: 'sway' },
            { src: reedsUrl, x: 26, y: 80, w: 4.2, anim: 'sway' },
            { src: reedsUrl, x: 76, y: 80, w: 4, anim: 'sway' },
            { src: reedsUrl, x: 78, y: 52, w: 4, anim: 'sway' },
            { src: lilyUrl, x: 52, y: 62, w: 4.2, anim: 'drift' },
            { src: lilyUrl, x: 64, y: 70, w: 4, anim: 'drift' },
            { src: lilyUrl, x: 70, y: 58, w: 3.8, anim: 'drift' },
            { src: lilyUrl, x: 58, y: 76, w: 4, anim: 'drift' },
            { src: rockUrl, x: 86, y: 46, w: 4.5 },
            { src: rockUrl, x: 18, y: 78, w: 5 },
        ],
    }
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
    waterTexture = null
    fishSprite = null
    zoneGroup = new THREE.Group()
    scene.add(zoneGroup)

    for (const patch of spec.patches) zoneGroup.add(patchMesh(patch))
    for (const spriteSpec of spec.sprites) zoneGroup.add(spriteFromSpec(spriteSpec))
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
        return [...plotWaypoints(), { x: 26, y: 87 }, { x: 72, y: 87 }]
    }
    if (props.tab === 'raise') {
        return [
            { x: 73, y: 29 },
            { x: 27, y: 69 },
            { x: 41, y: 86 },
            { x: 50, y: 87 },
        ]
    }
    return [
        { x: 50, y: 66 },
        { x: 66, y: 78 },
        { x: 44, y: 86 },
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
        const step = 22 * dt
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
            nextAmbientIn = 2.4 + Math.random() * 2.6
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
    if (waterTexture) {
        waterTexture.offset.x = (elapsed * 0.025) % 1
        waterTexture.offset.y = (elapsed * 0.012) % 1
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
        map: makeTexture(grassUrl),
        depthTest: false,
        depthWrite: false,
    })
    const grassMap = groundMaterial.map
    if (grassMap) {
        grassMap.repeat.set(70, 70)
    }
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
    () => [props.plotCount, props.plotColumns],
    () => {
        void rebuildZone()
    }
)

watch(
    () => props.chickenReady,
    (ready) => {
        if (ready) reactToReady('chicken', { x: 73, y: 29 })
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
        if (ready) reactToReady('pond', { x: 50, y: 66 })
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
    petSprite = null
    petShadow = null
    waterTexture = null
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

@media (prefers-reduced-motion: reduce) {
    .pet-yard3d-bubble {
        transition: none;
    }
}
</style>
