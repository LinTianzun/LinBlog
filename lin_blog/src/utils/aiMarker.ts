import { ref } from "vue";

// 作者在编辑器里采用过的 AI 环节。
// 只在「采用」动作发生时记录，作者忽略建议不会留下标记。
export type AiFeature = "suggest" | "writing" | "cover" | "gallery" | "image-alt";

const usedFeatures = ref<AiFeature[]>([]);

/**
 * 记录一次 AI 采用动作。
 */
export function markAiFeature(feature: AiFeature): void {
  if (!usedFeatures.value.includes(feature)) {
    usedFeatures.value = [...usedFeatures.value, feature];
  }
}

/**
 * 当前编辑会话用过的 AI 环节，保存内容时随请求带上。
 */
export function getAiFeatures(): AiFeature[] {
  return [...usedFeatures.value];
}

/**
 * 清空标记：切换内容或保存成功后重新开始统计。
 */
export function resetAiFeatures(): void {
  usedFeatures.value = [];
}

/**
 * AI 环节的中文标签，后台列表与提示文案共用一套口径。
 */
export function aiFeatureLabel(feature: string): string {
  const labels: Record<string, string> = {
    suggest: "AI 建议",
    writing: "AI 写作",
    cover: "AI 封面",
    gallery: "AI 策展",
    "image-alt": "AI 图片描述",
  };
  return labels[feature] || feature;
}
