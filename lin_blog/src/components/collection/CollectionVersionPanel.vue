<template>
  <yk-modal
    :model-value="open"
    title="系列版本历史"
    size="l"
    :show-footer="false"
    content-height="min(680px, calc(100vh - 160px))"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="collection-version-panel">
      <div class="collection-version-head">
        <div>
          <p class="collection-version-title">每次保存都会留下快照</p>
          <p class="collection-version-hint">
            保存名称、说明、封面和文章顺序后自动记录；回滚会生成一个新版本，不会覆盖历史。
          </p>
        </div>
        <yk-button type="secondary" size="s" :loading="loading" @click="loadVersions(1)">
          刷新
        </yk-button>
      </div>

      <div v-if="loading" class="collection-version-state">
        <yk-spinner size="m" />
        <yk-text type="secondary">正在读取版本...</yk-text>
      </div>

      <div v-else-if="errorMessage" class="collection-version-state">
        <yk-empty description="版本历史加载失败">
          <yk-text type="secondary">{{ errorMessage }}</yk-text>
          <yk-button type="secondary" @click="loadVersions(page)">重新加载</yk-button>
        </yk-empty>
      </div>

      <div v-else-if="versions.length === 0" class="collection-version-state">
        <yk-empty description="还没有版本记录">
          <yk-text type="secondary">保存一次系列后，这里会出现可恢复的快照。</yk-text>
        </yk-empty>
      </div>

      <div v-else class="collection-version-list">
        <article
          v-for="version in versions"
          :key="version.id"
          class="collection-version-card"
        >
          <div class="collection-version-card-main">
            <div class="collection-version-card-meta">
              <yk-tag
                shape="round"
                size="s"
                :color="version.source === 'rollback' ? '#d0842a' : undefined"
              >
                {{ sourceLabel(version.source) }}
              </yk-tag>
              <span class="collection-version-revision">#{{ version.revision }}</span>
              <time>{{ formatWorkflowTime(version.createdAt) }}</time>
              <span class="collection-version-operator">{{ version.operatorName }}</span>
            </div>
            <h3 class="collection-version-name">{{ version.name || "未命名系列" }}</h3>
            <p class="collection-version-meta">
              {{ version.articleCount }} 篇文章
              <span v-if="version.articleTitles.length">
                · {{ version.articleTitles.join(" / ") }}<template v-if="version.articleCount > version.articleTitles.length"> 等</template>
              </span>
            </p>
            <p v-if="version.description" class="collection-version-description">
              {{ version.description }}
            </p>
          </div>
          <yk-space size="s" class="collection-version-actions">
            <yk-button
              type="secondary"
              size="s"
              :loading="previewingId === version.id"
              @click="openVersion(version.id)"
            >
              查看
            </yk-button>
            <yk-popconfirm
              placement="bottomRight"
              trigger="click"
              title="恢复这个版本？"
              content="会立即覆盖当前系列内容和文章顺序，并生成一条新的回滚记录"
              @confirm="restore(version.id)"
            >
              <yk-button size="s" :loading="restoringId === version.id" :disabled="restoringId !== 0">
                恢复
              </yk-button>
            </yk-popconfirm>
          </yk-space>
        </article>

        <div class="collection-version-pagination">
          <AdminPager
            v-model:page="page"
            :page-size="pageSize"
            :total="total"
            :disabled="loading"
            @change="handlePageChange"
          />
        </div>
      </div>
    </div>
  </yk-modal>

  <yk-modal
    :model-value="previewVersion !== null"
    :title="previewVersion ? `版本 #${previewVersion.revision}` : '版本预览'"
    size="m"
    :show-footer="false"
    content-height="min(620px, calc(100vh - 160px))"
    @update:model-value="handlePreviewClose"
  >
    <div v-if="previewVersion" class="collection-version-preview">
      <div class="collection-version-preview-head">
        <h2>{{ previewVersion.name }}</h2>
        <p>
          {{ sourceLabel(previewVersion.source) }} ·
          {{ formatWorkflowTime(previewVersion.createdAt) }} ·
          {{ previewVersion.articles.length }} 篇文章
        </p>
        <p v-if="previewVersion.description" class="collection-version-preview-desc">
          {{ previewVersion.description }}
        </p>
      </div>

      <ol v-if="previewVersion.articles.length" class="collection-version-preview-list">
        <li v-for="(article, index) in previewVersion.articles" :key="`${article.id}-${index}`">
          <span class="collection-version-preview-index">
            {{ String(index + 1).padStart(2, "0") }}
          </span>
          <span class="collection-version-preview-copy">
            <strong>{{ article.title }}</strong>
            <small v-if="article.missing">这篇文章已被彻底删除，回滚时会跳过</small>
            <small v-else>
              {{ article.subsetName || "未分类" }} ·
              {{ article.state === "published" ? "已发布" : "未发布" }}
            </small>
          </span>
        </li>
      </ol>
      <yk-empty v-else description="这个版本没有文章" />
    </div>
  </yk-modal>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import {
  getCollectionVersion,
  getCollectionVersions,
  restoreCollectionVersion,
  type CollectionVersionDetail,
  type CollectionVersionSummary,
} from "../../api/collection";
import { formatWorkflowTime } from "../../utils/articleWorkflow";
import AdminPager from "../common/AdminPager.vue";

const props = defineProps<{
  open: boolean;
  collectionId: number | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  restored: [revision: number];
}>();

const versions = ref<CollectionVersionSummary[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref("");
const previewingId = ref(0);
const previewVersion = ref<CollectionVersionDetail | null>(null);
const restoringId = ref(0);

function sourceLabel(source: string): string {
  return source === "rollback" ? "回滚" : "保存";
}

function describeError(error: unknown): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ||
    (error instanceof Error ? error.message : "") ||
    "版本历史加载失败，请稍后重试"
  );
}

async function loadVersions(nextPage = page.value): Promise<void> {
  if (!props.collectionId) return;
  page.value = Math.max(1, Number(nextPage) || 1);
  loading.value = true;
  errorMessage.value = "";

  try {
    const result = await getCollectionVersions(props.collectionId, {
      page: page.value,
      pageSize: pageSize.value,
    });
    if (result.code !== 200 || !result.data) {
      throw new Error(result.message || "版本历史加载失败");
    }
    versions.value = result.data.list;
    total.value = result.data.total;
  } catch (error) {
    errorMessage.value = describeError(error);
    versions.value = [];
  } finally {
    loading.value = false;
  }
}

async function openVersion(versionId: number): Promise<void> {
  if (!props.collectionId || previewingId.value) return;
  previewingId.value = versionId;
  try {
    const result = await getCollectionVersion(props.collectionId, versionId);
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
  if (!props.collectionId || restoringId.value) return;
  restoringId.value = versionId;
  try {
    const result = await restoreCollectionVersion(props.collectionId, versionId);
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

function handlePageChange({ page: nextPage }: { page: number; pageSize: number }): void {
  void loadVersions(nextPage);
}

function handlePreviewClose(value: boolean): void {
  if (!value) previewVersion.value = null;
}

watch(
  () => [props.open, props.collectionId] as const,
  ([open, collectionId]) => {
    if (open && collectionId) {
      previewVersion.value = null;
      void loadVersions(1);
    }
  },
  { immediate: true }
);
</script>

<style lang="less" scoped>
.collection-version-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.collection-version-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.collection-version-title {
  margin: 0;
  color: var(--gray);
  font-size: 15px;
  font-weight: 700;
}

.collection-version-hint {
  margin: 6px 0 0;
  color: var(--gray6);
  font-size: 12px;
  line-height: 1.7;
}

.collection-version-state {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 260px;
}

.collection-version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.collection-version-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--gray1);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bgColor1) 94%, var(--pcolor1));
}

.collection-version-card-main {
  min-width: 0;
}

.collection-version-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--gray6);
  font-size: 12px;
}

.collection-version-revision {
  color: var(--pcolor);
  font-weight: 700;
}

.collection-version-operator {
  color: var(--gray5);
}

.collection-version-name {
  margin: 8px 0 0;
  color: var(--gray);
  font-size: 15px;
}

.collection-version-meta {
  margin: 6px 0 0;
  color: var(--gray6);
  font-size: 12px;
  line-height: 1.6;
}

.collection-version-description {
  margin: 6px 0 0;
  color: var(--gray5);
  font-size: 12px;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.collection-version-actions {
  flex-shrink: 0;
}

.collection-version-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.collection-version-preview-head h2 {
  margin: 0;
  color: var(--gray);
  font-size: 18px;
}

.collection-version-preview-head p {
  margin: 6px 0 0;
  color: var(--gray6);
  font-size: 12px;
}

.collection-version-preview-desc {
  line-height: 1.7;
}

.collection-version-preview-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.collection-version-preview-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--gray1);
  border-radius: 12px;
}

.collection-version-preview-index {
  color: var(--pcolor);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.collection-version-preview-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.collection-version-preview-copy strong {
  color: var(--gray);
  font-size: 13px;
}

.collection-version-preview-copy small {
  color: var(--gray6);
  font-size: 12px;
}

@media (max-width: 640px) {
  .collection-version-card {
    flex-direction: column;
  }

  .collection-version-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .collection-version-card {
    transition: none;
  }
}
</style>
