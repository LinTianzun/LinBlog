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
            <yk-button
              type="secondary"
              size="s"
              :loading="diffingId === version.id"
              @click="openDiff(version.id)"
            >
              对比当前
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

  <yk-modal
    :model-value="diffOpen"
    :title="
      diffVersion
        ? `版本 #${diffVersion.version.revision} 与当前对比`
        : '版本对比'
    "
    size="l"
    :show-footer="false"
    content-height="min(680px, calc(100vh - 160px))"
    @update:model-value="handleDiffClose"
  >
    <div v-if="diffingId" class="collection-version-state">
      <yk-spinner size="m" />
      <yk-text type="secondary">正在比较版本差异...</yk-text>
    </div>

    <div v-else-if="diffError" class="collection-version-state">
      <yk-empty description="版本对比失败">
        <yk-text type="secondary">{{ diffError }}</yk-text>
        <yk-button
          v-if="diffTargetId"
          type="secondary"
          @click="openDiff(diffTargetId)"
        >
          重新对比
        </yk-button>
      </yk-empty>
    </div>

    <div v-else-if="diffVersion" class="collection-diff">
      <div class="collection-diff-head">
        <div>
          <p class="collection-diff-kicker">从历史版本到当前系列</p>
          <h2>#{{ diffVersion.version.revision }} → 当前</h2>
          <p>
            历史版本「{{ diffVersion.version.name || "未命名系列" }}」 ·
            {{ diffVersion.version.operatorName }} ·
            {{ formatWorkflowTime(diffVersion.version.createdAt) }}
          </p>
        </div>
        <div class="collection-diff-summary">
          <span v-if="diffVersion.summary.metaCount">
            信息 {{ diffVersion.summary.metaCount }} 项
          </span>
          <span v-if="diffVersion.summary.added" class="is-added">
            新增 {{ diffVersion.summary.added }}
          </span>
          <span v-if="diffVersion.summary.removed" class="is-removed">
            移除 {{ diffVersion.summary.removed }}
          </span>
          <span v-if="diffVersion.summary.moved" class="is-moved">
            移动 {{ diffVersion.summary.moved }}
          </span>
          <span v-if="!diffVersion.summary.hasChanges" class="is-clean">
            完全一致
          </span>
        </div>
      </div>

      <div v-if="!diffVersion.summary.hasChanges" class="collection-diff-empty">
        <yk-empty description="这个版本与当前系列一致">
          <yk-text type="secondary">没有需要恢复或同步的差异。</yk-text>
        </yk-empty>
      </div>

      <template v-else>
        <section v-if="diffVersion.metaChanges.length" class="collection-diff-section">
          <header>
            <h3>系列信息</h3>
            <p>历史版本 → 当前系列</p>
          </header>
          <ul class="collection-diff-meta-list">
            <li v-for="change in diffVersion.metaChanges" :key="change.field">
              <span class="collection-diff-field">{{ change.label }}</span>
              <span class="collection-diff-value is-before" :title="change.before">
                <template v-if="change.field === 'cover'">
                  <span class="collection-diff-cover" :class="{ 'is-empty': !change.before }">
                    <img v-if="change.before" :src="change.before" alt="" />
                    <em v-else>空</em>
                  </span>
                </template>
                <template v-else>{{ displayDiffValue(change.before) }}</template>
              </span>
              <span class="collection-diff-arrow" aria-hidden="true">→</span>
              <span class="collection-diff-value is-after" :title="change.after">
                <template v-if="change.field === 'cover'">
                  <span class="collection-diff-cover" :class="{ 'is-empty': !change.after }">
                    <img v-if="change.after" :src="change.after" alt="" />
                    <em v-else>空</em>
                  </span>
                </template>
                <template v-else>{{ displayDiffValue(change.after) }}</template>
              </span>
            </li>
          </ul>
        </section>

        <section v-if="diffVersion.articleChanges.length" class="collection-diff-section">
          <header>
            <h3>文章顺序</h3>
            <p>
              当前 {{ diffVersion.current.articleCount }} 篇 ·
              {{ diffVersion.summary.unchanged }} 篇位置未变
            </p>
          </header>
          <ul class="collection-diff-article-list">
            <li
              v-for="change in diffVersion.articleChanges"
              :key="`${change.kind}-${change.id}`"
              :class="`is-${change.kind}`"
            >
              <yk-tag
                shape="round"
                size="s"
                :color="articleChangeColor(change.kind)"
              >
                {{ articleChangeLabel(change.kind) }}
              </yk-tag>
              <span class="collection-diff-article-copy">
                <strong>{{ change.title }}</strong>
                <small>
                  {{ articlePositionLabel(change) }}
                  <template v-if="change.subsetName"> · {{ change.subsetName }}</template>
                  <template v-if="change.state"> · {{ articleStateLabel(change.state) }}</template>
                  <template v-if="change.missing"> · 文章已被彻底删除</template>
                </small>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </yk-modal>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import {
  getCollectionVersion,
  getCollectionVersionDiff,
  getCollectionVersions,
  restoreCollectionVersion,
  type CollectionVersionDetail,
  type CollectionVersionDiff,
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
const diffOpen = ref(false);
const diffingId = ref(0);
const diffTargetId = ref(0);
const diffVersion = ref<CollectionVersionDiff | null>(null);
const diffError = ref("");

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

async function openDiff(versionId: number): Promise<void> {
  if (!props.collectionId || diffingId.value) return;
  diffOpen.value = true;
  diffTargetId.value = versionId;
  diffingId.value = versionId;
  diffVersion.value = null;
  diffError.value = "";

  try {
    const result = await getCollectionVersionDiff(props.collectionId, versionId);
    if (result.code !== 200 || !result.data) {
      throw new Error(result.message || "版本对比失败");
    }
    diffVersion.value = result.data;
  } catch (error) {
    diffError.value = describeError(error);
  } finally {
    diffingId.value = 0;
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

function handleDiffClose(value: boolean): void {
  if (value) return;
  diffOpen.value = false;
  diffVersion.value = null;
  diffError.value = "";
  diffTargetId.value = 0;
}

function displayDiffValue(value: string): string {
  const text = String(value || "").trim();
  return text || "空";
}

function articleChangeLabel(kind: string): string {
  if (kind === "added") return "新增";
  if (kind === "removed") return "移除";
  return "移动";
}

function articleChangeColor(kind: string): string | undefined {
  if (kind === "added") return "#2f8f67";
  if (kind === "removed") return "#c75b5b";
  if (kind === "moved") return "#d0842a";
  return undefined;
}

function articlePositionLabel(change: {
  kind: string;
  fromPosition: number | null;
  toPosition: number | null;
}): string {
  if (change.kind === "added") return `新增于第 ${change.toPosition} 篇`;
  if (change.kind === "removed") return `原第 ${change.fromPosition} 篇，当前已移除`;
  return `第 ${change.fromPosition} 篇 → 第 ${change.toPosition} 篇`;
}

function articleStateLabel(state: string): string {
  if (state === "published") return "已发布";
  if (state === "draft") return "草稿";
  if (state === "rejected") return "已驳回";
  return "未发布";
}

watch(
  () => [props.open, props.collectionId] as const,
  ([open, collectionId]) => {
    if (open && collectionId) {
      previewVersion.value = null;
      diffOpen.value = false;
      diffVersion.value = null;
      diffError.value = "";
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

.collection-diff {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.collection-diff-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  border: 1px solid var(--gray1);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--pcolor1) 32%, transparent), transparent 62%),
    var(--bgColor1);
}

.collection-diff-kicker {
  margin: 0;
  color: var(--pcolor);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.collection-diff-head h2 {
  margin: 6px 0 0;
  color: var(--gray);
  font-size: 22px;
}

.collection-diff-head p:last-child {
  margin: 6px 0 0;
  color: var(--gray6);
  font-size: 12px;
}

.collection-diff-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
  max-width: 48%;
}

.collection-diff-summary span {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--bgColor2);
  color: var(--gray5);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.collection-diff-summary .is-added {
  background: color-mix(in srgb, #2f8f67 14%, transparent);
  color: #2f8f67;
}

.collection-diff-summary .is-removed {
  background: color-mix(in srgb, #c75b5b 14%, transparent);
  color: #c75b5b;
}

.collection-diff-summary .is-moved {
  background: color-mix(in srgb, #d0842a 16%, transparent);
  color: #b46d19;
}

.collection-diff-summary .is-clean {
  background: color-mix(in srgb, #2f8f67 12%, transparent);
  color: #2f8f67;
}

.collection-diff-empty {
  display: grid;
  min-height: 240px;
  place-items: center;
}

.collection-diff-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.collection-diff-section > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.collection-diff-section h3 {
  margin: 0;
  color: var(--gray);
  font-size: 14px;
}

.collection-diff-section header p {
  margin: 0;
  color: var(--gray6);
  font-size: 12px;
}

.collection-diff-meta-list,
.collection-diff-article-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.collection-diff-meta-list li {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 22px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--gray1);
  border-radius: 12px;
  background: var(--bgColor1);
}

.collection-diff-field {
  color: var(--gray6);
  font-size: 12px;
  font-weight: 600;
}

.collection-diff-value {
  min-width: 0;
  padding: 6px 9px;
  border-radius: 8px;
  color: var(--gray5);
  font-size: 12px;
  line-height: 1.55;
}

.collection-diff-value.is-before {
  background: color-mix(in srgb, #c75b5b 8%, transparent);
}

.collection-diff-value.is-after {
  background: color-mix(in srgb, #2f8f67 9%, transparent);
}

.collection-diff-arrow {
  color: var(--gray4);
  font-size: 14px;
  text-align: center;
}

.collection-diff-cover {
  display: inline-grid;
  width: 58px;
  height: 38px;
  overflow: hidden;
  place-items: center;
  border-radius: 7px;
  background: var(--bgColor2);
}

.collection-diff-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.collection-diff-cover em {
  color: var(--gray6);
  font-size: 11px;
  font-style: normal;
}

.collection-diff-article-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--gray1);
  border-radius: 12px;
  background: var(--bgColor1);
}

.collection-diff-article-list li.is-added {
  border-left: 3px solid #2f8f67;
}

.collection-diff-article-list li.is-removed {
  border-left: 3px solid #c75b5b;
}

.collection-diff-article-list li.is-moved {
  border-left: 3px solid #d0842a;
}

.collection-diff-article-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.collection-diff-article-copy strong {
  overflow: hidden;
  color: var(--gray);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collection-diff-article-copy small {
  color: var(--gray6);
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 640px) {
  .collection-version-card {
    flex-direction: column;
  }

  .collection-version-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .collection-diff-head {
    flex-direction: column;
  }

  .collection-diff-summary {
    justify-content: flex-start;
    max-width: none;
  }

  .collection-diff-meta-list li {
    grid-template-columns: 68px minmax(0, 1fr);
  }

  .collection-diff-arrow {
    display: none;
  }

  .collection-diff-value.is-after {
    grid-column: 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .collection-version-card {
    transition: none;
  }
}
</style>
