<template>
    <yk-modal :model-value="open" title="版本历史" size="l" :show-footer="false"
        content-height="min(680px, calc(100vh - 160px))" @update:model-value="emit('update:open', $event)">
        <div class="version-panel">
            <div class="version-panel-head">
                <div>
                    <p class="version-panel-title">每次保存都会留下快照</p>
                    <p class="version-panel-hint">保留最近 50 个版本。回滚会生成新的工作稿，不会覆盖历史。</p>
                </div>
                <yk-button type="secondary" size="s" :loading="loading" @click="loadVersions(1)">
                    刷新
                </yk-button>
            </div>

            <div v-if="loading" class="version-panel-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在读取版本...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="version-panel-state">
                <yk-empty description="版本历史加载失败">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-button type="secondary" @click="loadVersions(page)">重新加载</yk-button>
                </yk-empty>
            </div>

            <div v-else-if="versions.length === 0" class="version-panel-state">
                <yk-empty description="还没有版本记录">
                    <yk-text type="secondary">继续编辑或点击保存后，这里会出现可恢复的快照。</yk-text>
                </yk-empty>
            </div>

            <div v-else class="version-list">
                <article v-for="version in versions" :key="version.id" class="version-card"
                    :class="{ current: version.id === currentVersionId }">
                    <div class="version-card-main">
                        <div class="version-card-kicker">
                            <yk-tag shape="round" size="s"
                                :color="version.source === 'publish' || version.source === 'scheduled' ? '#1f9d63' : undefined">
                                {{ versionSourceLabel(version.source) }}
                            </yk-tag>
                            <span class="version-card-revision">#{{ version.revision }}</span>
                            <time>{{ formatWorkflowTime(version.createdAt) }}</time>
                        </div>
                        <h3 class="version-card-title">{{ version.title || "未命名版本" }}</h3>
                        <p class="version-card-meta">
                            {{ versionMetaText(version) }}
                            <span v-if="version.label">· {{ version.label }}</span>
                        </p>
                    </div>
                    <yk-space size="s" class="version-card-actions">
                        <yk-button type="secondary" size="s" :loading="previewingId === version.id"
                            @click="openVersion(version.id)">
                            查看
                        </yk-button>
                        <yk-popconfirm placement="bottomRight" trigger="click" title="恢复这个版本？"
                            content="将生成新的工作稿，发布前不会影响线上内容" @confirm="restore(version.id)">
                            <yk-button size="s" :loading="restoringId === version.id"
                                :disabled="restoringId !== 0">
                                恢复
                            </yk-button>
                        </yk-popconfirm>
                    </yk-space>
                </article>

                <div class="version-pagination">
                    <AdminPager v-model:page="page" :page-size="pageSize" :total="total"
                        :disabled="loading" @change="handlePageChange" />
                </div>
            </div>
        </div>
    </yk-modal>

    <yk-modal :model-value="previewVersion !== null" :title="previewVersion?.title || '版本预览'" size="l"
        :show-footer="false" content-height="calc(100vh - 160px)"
        @update:model-value="handlePreviewClose">
        <div v-if="previewVersion" class="version-preview">
            <div class="version-preview-meta">
                <span>版本 #{{ previewVersion.revision }}</span>
                <span>{{ versionSourceLabel(previewVersion.source) }}</span>
                <span>{{ formatWorkflowTime(previewVersion.createdAt) }}</span>
            </div>
            <h2 class="version-preview-title">{{ previewVersion.title }}</h2>
            <p v-if="previewVersion.introduce" class="version-preview-introduce">
                {{ previewVersion.introduce }}
            </p>
            <div v-if="isGallery" class="version-preview-gallery">
                <img v-for="(photo, index) in previewPhotos" :key="`${photo}-${index}`" :src="photo"
                    :alt="`预览图 ${index + 1}`" loading="lazy" />
            </div>
            <div v-else class="version-preview-content" v-html="previewHtml"></div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import DOMPurify from "dompurify";
import type {
  ArticleVersionDetail,
  ArticleVersionSummary,
} from "../../api/article";
import {
  getArticleVersion,
  getArticleVersions,
  parseGalleryContent,
  restoreArticleVersion,
  type ArticleClassify,
} from "../../api/article";
import { formatWorkflowTime, versionSourceLabel } from "../../utils/articleWorkflow";
import { optimizeRichContentImages } from "../../utils/imageOptimization";
import AdminPager from "../common/AdminPager.vue";

const props = defineProps<{
  open: boolean;
  articleId: number | null;
  classify?: ArticleClassify;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  restored: [revision: number];
}>();

const versions = ref<ArticleVersionSummary[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref("");
const previewingId = ref(0);
const previewVersion = ref<ArticleVersionDetail | null>(null);
const restoringId = ref(0);
const currentVersionId = ref<number | null>(null);

const isGallery = computed(() => props.classify === "image");

const previewPhotos = computed(() =>
  parseGalleryContent(previewVersion.value?.content)
);

function versionMetaText(version: ArticleVersionSummary): string {
  if (isGallery.value) {
    return `${version.mediaCount ?? 0} 张图片`;
  }
  return `${version.contentLength} 字正文`;
}

const previewHtml = computed(() =>
  optimizeRichContentImages(
    DOMPurify.sanitize(previewVersion.value?.content || "", {
      USE_PROFILES: { html: true },
    })
  )
);

function describeError(error: unknown): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ||
    (error instanceof Error ? error.message : "") ||
    "版本历史加载失败，请稍后重试"
  );
}

async function loadVersions(nextPage = page.value): Promise<void> {
  if (!props.articleId) return;
  page.value = Math.max(1, Number(nextPage) || 1);
  loading.value = true;
  errorMessage.value = "";

  try {
    const result = await getArticleVersions(props.articleId, {
      page: page.value,
      pageSize: pageSize.value,
    });
    if (result.code !== 200 || !result.data) {
      throw new Error(result.message || "版本历史加载失败");
    }
    versions.value = result.data.list;
    total.value = result.data.total;
    if (page.value === 1 && versions.value.length > 0) {
      currentVersionId.value = versions.value[0].id;
    }
  } catch (error) {
    errorMessage.value = describeError(error);
    versions.value = [];
  } finally {
    loading.value = false;
  }
}

async function openVersion(versionId: number): Promise<void> {
  if (!props.articleId || previewingId.value) return;
  previewingId.value = versionId;
  try {
    const result = await getArticleVersion(props.articleId, versionId);
    if (result.code !== 200 || !result.data) {
      throw new Error(result.message || "版本详情加载失败");
    }
    previewVersion.value = result.data;
  } catch (error) {
    errorMessage.value = describeError(error);
  } finally {
    previewingId.value = 0;
  }
}

async function restore(versionId: number): Promise<void> {
  if (!props.articleId || restoringId.value) return;
  restoringId.value = versionId;
  try {
    const result = await restoreArticleVersion(props.articleId, versionId);
    if (result.code !== 200 || !result.data) {
      throw new Error(result.message || "版本恢复失败");
    }
    emit("restored", result.data.revision);
    await loadVersions(1);
  } catch (error) {
    errorMessage.value = describeError(error);
  } finally {
    restoringId.value = 0;
  }
}

function handlePreviewClose(value: boolean): void {
  if (!value) previewVersion.value = null;
}

function handlePageChange(payload: { page: number; pageSize: number }): void {
    pageSize.value = payload.pageSize;
    void loadVersions(payload.page);
}

watch(
  () => props.open,
  (open) => {
    if (open) void loadVersions(1);
  },
  { immediate: true }
);
</script>

<style lang="less" scoped>
.version-panel {
    min-height: 240px;
}

.version-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: @space-l;
    padding-bottom: @space-l;
    border-bottom: 1px solid var(--admin-line, @line-color-s);
}

.version-panel-title {
    margin: 0;
    font-size: @size-m;
    font-weight: 600;
    color: @font-color-l;
}

.version-panel-hint {
    margin: 4px 0 0;
    font-size: @size-s;
    color: @font-color-s;
}

.version-panel-state {
    min-height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: @space-m;
}

.version-list {
    display: flex;
    flex-direction: column;
    gap: @space-m;
    padding-top: @space-l;
}

.version-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: @space-l;
    padding: @space-l;
    border: 1px solid var(--admin-line, @line-color-s);
    border-radius: var(--admin-radius, 14px);
    background: var(--admin-surface, @bg-color-l);
    transition: border-color 160ms ease, box-shadow 160ms ease;

    &:hover {
        border-color: var(--pcolor3);
        box-shadow: var(--admin-shadow-sm, @shadow-s);
    }

    &.current {
        border-color: var(--pcolor3);
        background: color-mix(in srgb, var(--pcolor2) 32%, var(--admin-surface, @bg-color-l));
    }
}

.version-card-main {
    min-width: 0;
}

.version-card-kicker {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: @font-color-s;
}

.version-card-revision {
    font-weight: 600;
    color: @font-color-m;
}

.version-card-title {
    margin: 8px 0 0;
    overflow: hidden;
    font-size: @size-m;
    font-weight: 600;
    line-height: 1.45;
    color: @font-color-l;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.version-card-meta {
    margin: 4px 0 0;
    font-size: @size-s;
    color: @font-color-s;
}

.version-card-actions {
    flex: none;
}

.version-pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: @space-m;
}

.version-preview-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: @size-s;
    color: @font-color-s;
}

.version-preview-title {
    margin: @space-m 0 0;
    font-size: 28px;
    line-height: 1.35;
    color: @font-color-l;
}

.version-preview-introduce {
    margin: @space-m 0 @space-xl;
    padding-bottom: @space-l;
    border-bottom: 1px solid var(--admin-line, @line-color-s);
    color: @font-color-m;
    line-height: 1.8;
}

.version-preview-content {
    line-height: 1.9;
    color: @font-color-l;
    word-break: break-word;

    :deep(img) {
        display: block;
        max-width: 100%;
        height: auto;
        margin: @space-l auto;
        border-radius: @radius-s;
    }

    :deep(pre) {
        padding: @space-m;
        overflow-x: auto;
        border-radius: @radius-s;
        background: @bg-color-s;
    }

    :deep(blockquote) {
        margin: @space-l 0;
        padding-left: @space-m;
        border-left: 3px solid @pcolor;
        color: @font-color-m;
    }
}

.version-preview-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;

    img {
        width: 100%;
        height: 160px;
        object-fit: cover;
        border-radius: var(--admin-radius, 12px);
        background: var(--admin-surface-soft, @bg-color-s);
    }
}

@media (max-width: 640px) {
    .version-card {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>
