<template>
    <yk-modal :model-value="open" title="工作稿冲突对比" size="l" :show-footer="false"
        content-height="min(640px, calc(100vh - 160px))"
        @update:model-value="emit('update:open', $event)">
        <div class="conflict-compare">
            <div class="conflict-compare-banner">
                <p class="conflict-compare-banner-title">
                    <template v-if="report">
                        其他窗口保存了修订 #{{ report.remoteRevision }}<template
                            v-if="remoteSavedAtText">（{{ remoteSavedAtText }}）</template>，
                        本窗口的修改尚未落库。
                    </template>
                    <template v-else>工作稿冲突</template>
                </p>
                <p v-if="report" class="conflict-compare-banner-hint">
                    {{ hint }}
                </p>
            </div>

            <div v-if="loading" class="conflict-compare-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在读取对方的工作稿...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="conflict-compare-state">
                <yk-empty description="无法读取对方的工作稿">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-button type="secondary" @click="emit('retry')">重试</yk-button>
                </yk-empty>
            </div>

            <template v-else-if="report">
                <div v-if="report.fields.length" class="conflict-compare-fields">
                    <div v-for="row in report.fields" :key="row.key" class="conflict-compare-field"
                        :class="{ 'is-conflict': row.conflict }">
                        <div class="conflict-compare-field-head">
                            <span class="conflict-compare-field-label">{{ row.label }}</span>
                            <yk-tag v-if="row.conflict" color="#d84a3a" shape="round" size="s">
                                双方都修改
                            </yk-tag>
                            <span v-else-if="row.remoteChanged" class="conflict-compare-field-note">
                                仅对方修改
                            </span>
                            <span v-else class="conflict-compare-field-note">仅本窗口修改</span>
                        </div>
                        <div class="conflict-compare-field-grid">
                            <div class="conflict-compare-cell">
                                <span class="conflict-compare-cell-tag">本窗口</span>
                                <p class="conflict-compare-cell-text">{{ row.localPreview }}</p>
                            </div>
                            <div class="conflict-compare-cell">
                                <span class="conflict-compare-cell-tag">对方</span>
                                <p class="conflict-compare-cell-text">{{ row.remotePreview }}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="diffSides.length" class="conflict-compare-diffs">
                    <section v-for="side in diffSides" :key="side.key" class="conflict-compare-diff">
                        <p class="conflict-compare-diff-title">{{ side.title }}</p>
                        <div class="conflict-compare-diff-lines">
                            <p v-for="(line, index) in side.lines" :key="index"
                                :class="`is-${line.type}`">
                                <span>{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
                                {{ line.text }}
                            </p>
                        </div>
                    </section>
                </div>

                <div v-if="photoGroups.length" class="conflict-compare-photos">
                    <div v-for="group in photoGroups" :key="group.key" class="conflict-compare-photo-group">
                        <p class="conflict-compare-photo-title">
                            {{ group.title }}（{{ group.photos.length }} 张）
                        </p>
                        <div class="conflict-compare-photo-list">
                            <img v-for="(photo, index) in group.photos" :key="`${photo}-${index}`"
                                :src="photo" :alt="`${group.label}图片 ${index + 1}`" loading="lazy" />
                        </div>
                    </div>
                </div>
            </template>

            <div class="conflict-compare-actions">
                <yk-button type="secondary" @click="emit('update:open', false)">取消</yk-button>
                <yk-button type="secondary" :loading="adopting" @click="emit('adopt')">
                    采用对方版本
                </yk-button>
                <yk-button :loading="keeping" @click="emit('keep')">保留我的修改并覆盖</yk-button>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { ConflictReport } from '../../utils/conflictCompare'
import { formatWorkflowTime } from '../../utils/articleWorkflow'

const props = defineProps<{
    open: boolean
    loading: boolean
    errorMessage: string
    report: ConflictReport | null
    classify: 'article' | 'image'
    adopting: boolean
    keeping: boolean
}>()

const emit = defineEmits<{
    (event: 'update:open', value: boolean): void
    (event: 'retry'): void
    (event: 'adopt'): void
    (event: 'keep'): void
}>()

const remoteSavedAtText = computed(() =>
    props.report?.remoteSavedAt ? formatWorkflowTime(props.report.remoteSavedAt) : ''
)

const hint = computed(() => {
    if (!props.report) return ''
    if (props.report.hasConflict) {
        return '对比下方的差异后选择：采用对方版本会放弃本窗口未保存的修改；保留我的修改会以本窗口内容覆盖对方（以当前修订号提交，若对方再次先保存仍会提示冲突）。'
    }
    if (props.report.onlyRemoteChanged) {
        return '本窗口没有新的修改，采用对方版本即可继续编辑。'
    }
    if (props.report.onlyLocalChanged) {
        return '只有本窗口有修改，保留我的修改即可正常保存。'
    }
    return '双方改动没有直接冲突，选择任一侧都可以继续。'
})

const diffSides = computed(() => {
    const report = props.report
    if (!report || report.classify !== 'article') return []
    return [
        { key: 'remote', title: '对方的正文改动（相对共同基线）', lines: report.contentDiff.remote },
        { key: 'local', title: '本窗口的正文改动（相对共同基线）', lines: report.contentDiff.local },
    ].filter(side => side.lines.some(line => line.type !== 'same'))
})

const photoGroups = computed(() => {
    const report = props.report
    if (!report || report.classify !== 'image') return []
    return [
        { key: 'added', title: '对方新增', label: '新增', photos: report.photos.added },
        { key: 'removed', title: '对方删除', label: '删除', photos: report.photos.removed },
    ].filter(group => group.photos.length > 0)
})
</script>

<style lang="less" scoped>
.conflict-compare {
    display: flex;
    flex-direction: column;
    gap: @space-l;
}

.conflict-compare-banner {
    padding: @space-m @space-l;
    border: 1px solid color-mix(in srgb, var(--pcolor) 22%, transparent);
    border-radius: @radius-s;
    background: color-mix(in srgb, var(--pcolor2) 38%, transparent);

    &-title {
        margin: 0;
        font-weight: 600;
        color: @font-color-l;
    }

    &-hint {
        margin: 6px 0 0;
        color: @font-color-s;
        font-size: @size-s;
        line-height: 1.7;
    }
}

.conflict-compare-state {
    min-height: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: @space-m;
}

.conflict-compare-fields {
    display: flex;
    flex-direction: column;
    gap: @space-m;
}

.conflict-compare-field {
    border: 1px solid @line-color-s;
    border-radius: @radius-s;
    padding: @space-m;

    &.is-conflict {
        border-color: color-mix(in srgb, #d84a3a 45%, transparent);
    }

    &-head {
        display: flex;
        align-items: center;
        gap: @space-s;
        margin-bottom: @space-s;
    }

    &-label {
        font-weight: 600;
        color: @font-color-l;
    }

    &-note {
        color: @font-color-s;
        font-size: @size-s;
    }
}

.conflict-compare-field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: @space-m;
}

.conflict-compare-cell {
    min-width: 0;
    border-radius: @radius-s;
    background: @bg-color-s;
    padding: 8px 10px;

    &-tag {
        display: inline-block;
        margin-bottom: 4px;
        color: @font-color-s;
        font-size: @size-s;
    }

    &-text {
        margin: 0;
        color: @font-color-m;
        font-size: @size-s;
        line-height: 1.6;
        word-break: break-word;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
}

.conflict-compare-diffs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: @space-m;
}

.conflict-compare-diff {
    min-width: 0;

    &-title {
        margin: 0 0 @space-s;
        font-size: @size-s;
        color: @font-color-s;
    }

    &-lines {
        max-height: 220px;
        overflow-y: auto;
        border: 1px solid @line-color-s;
        border-radius: @radius-s;
        padding: @space-s;
        background: @bg-color-s;

        p {
            margin: 2px 0;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: @size-s;
            line-height: 1.6;
            word-break: break-word;

            span {
                display: inline-block;
                width: 14px;
                user-select: none;
            }

            &.is-added {
                background: color-mix(in srgb, var(--scolor, #1f9d63) 14%, transparent);
                color: @font-color-m;
            }

            &.is-removed {
                background: color-mix(in srgb, #d84a3a 12%, transparent);
                color: @font-color-m;
                text-decoration: line-through;
                text-decoration-color: color-mix(in srgb, #d84a3a 55%, transparent);
            }

            &.is-same {
                color: @font-color-s;
            }
        }
    }
}

.conflict-compare-photos {
    display: flex;
    flex-direction: column;
    gap: @space-m;
}

.conflict-compare-photo-title {
    margin: 0 0 @space-s;
    font-size: @size-s;
    color: @font-color-s;
}

.conflict-compare-photo-list {
    display: flex;
    flex-wrap: wrap;
    gap: @space-s;

    img {
        width: 88px;
        height: 88px;
        object-fit: cover;
        border-radius: 8px;
        background: @bg-color-s;
    }
}

.conflict-compare-actions {
    display: flex;
    justify-content: flex-end;
    gap: @space-m;
    padding-top: @space-m;
    border-top: 1px solid @line-color-s;
}

@media (max-width: 760px) {
    .conflict-compare-field-grid,
    .conflict-compare-diffs {
        grid-template-columns: 1fr;
    }
}
</style>
