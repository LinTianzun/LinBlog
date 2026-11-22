<template>
  <PortalLayout active-path="/portal">
    <section class="newsletter-status portal-glass">
      <span class="block-kicker">NEWSLETTER</span>
      <h1 class="newsletter-status-title">{{ copy.title }}</h1>
      <p class="newsletter-status-desc">{{ copy.description }}</p>
      <RouterLink class="newsletter-status-link" to="/portal">回到首页</RouterLink>
    </section>
  </PortalLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PortalLayout from '../components/portal/PortalLayout.vue'
import { applyPortalSeo } from '../utils/portalSeo'

type Status = 'confirmed' | 'unsubscribed' | 'invalid' | 'error'

const copyMap: Record<Status, { title: string; description: string }> = {
  confirmed: {
    title: '订阅确认成功',
    description: '谢谢你愿意读这封长信。之后有新文章、摄影与随笔时，会整理成一封邮件发给你。',
  },
  unsubscribed: {
    title: '已取消订阅',
    description: '之后不会再收到邮件。如果哪天想重新订阅，随时回到首页底部。',
  },
  invalid: {
    title: '链接已失效',
    description: '确认或退订链接可能已经使用过、过期或被新链接替代。可以回到首页重新订阅。',
  },
  error: {
    title: '操作没有完成',
    description: '服务暂时出了点问题，请稍后重试。',
  },
}

const route = useRoute()

const status = computed<Status>(() => {
  const value = String(route.query.status || 'invalid')
  return value in copyMap ? (value as Status) : 'invalid'
})

const copy = computed(() => copyMap[status.value])

onMounted(() => {
  applyPortalSeo({
    title: copy.value.title,
    description: copy.value.description,
    url: new URL('/portal/newsletter', window.location.origin).toString(),
    robots: 'noindex,nofollow',
  })
})
</script>

<style lang="less" scoped>
.newsletter-status {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
  max-width: 640px;
  margin: 64px auto 0;
  padding: 40px 36px;
}

.newsletter-status-title {
  margin: 0;
  font-family: var(--portal-serif);
  font-size: 32px;
  font-weight: 600;
}

.newsletter-status-desc {
  margin: 0;
  color: var(--portal-text-secondary);
  font-size: 14px;
  line-height: 1.9;
}

.newsletter-status-link {
  margin-top: 6px;
  color: var(--portal-accent);
  font-size: 13px;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
