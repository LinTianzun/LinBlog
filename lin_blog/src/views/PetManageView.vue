<template>
    <yk-space dir="vertical" size="xl" class="admin-page pet-manage-page">
        <top-title name="宠物管理" description="照顾桌宠的成长，并调整全站展示与行为" :is-search="false" />

        <div class="pet-manage-grid">
            <main class="pet-manage-main">
                <section class="pet-hero">
                    <span class="pet-hero-orbit pet-hero-orbit-a" aria-hidden="true" />
                    <span class="pet-hero-orbit pet-hero-orbit-b" aria-hidden="true" />

                    <div class="pet-hero-main">
                        <div class="pet-hero-avatar" aria-hidden="true">
                            <IconHeartFill />
                        </div>
                        <div class="pet-hero-copy">
                            <span class="pet-hero-kicker">MY COMPANION</span>
                            <h1>{{ displayPetName }}</h1>
                            <p>
                                {{ petTitle }} · 已连续陪伴 {{ petVitals.streakDays }} 天 ·
                                累计互动 {{ petVitals.totalInteractions }} 次
                            </p>
                            <div class="pet-hero-tags">
                                <span>称号 {{ petTitle }}</span>
                                <span>心情 {{ vitalsMoodLabel(petVitals) }}</span>
                                <span>亲密度 Lv.{{ vitalsIntimacyLevel(petVitals) }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="pet-hero-actions">
                        <yk-button type="primary" :disabled="feedCooldownLeft > 0"
                            @click="feedFromSettings()">
                            {{ selectedFood.icon }} 喂一口
                        </yk-button>
                        <span v-if="feedCooldownLeft > 0" class="pet-feed-cooldown">
                            冷却中 {{ feedCooldownSeconds }}s
                        </span>
                        <span v-else-if="!canEditPet">站点展示与行为仅管理员可修改</span>
                    </div>
                </section>

                <section class="pet-card">
                    <header class="pet-card-head">
                        <div>
                            <h2>我的宠物</h2>
                            <p>名字与养成状态会跟随账号跨设备同步</p>
                            <p v-if="petSyncState === 'pending'" class="pet-sync-note">
                                {{ petSyncHint }}
                            </p>
                        </div>
                        <div class="pet-card-badges">
                            <span class="pet-sync-chip" :class="`is-${petSyncState}`"
                                role="status" aria-live="polite" :title="petSyncHint">
                                <span class="pet-sync-dot" aria-hidden="true" />
                                {{ petSyncLabel }}
                            </span>
                            <button v-if="petSyncState === 'pending'" type="button"
                                class="pet-sync-retry" @click="retryPetSync">
                                重试
                            </button>
                            <span class="pet-level-pill">Lv.{{ vitalsIntimacyLevel(petVitals) }}</span>
                        </div>
                    </header>

                    <div class="pet-name-row">
                        <div class="pet-name-copy">
                            <strong>桌宠名字</strong>
                            <span>会出现在问候和状态气泡里，留空则默认叫「小 Lin」。</span>
                        </div>
                        <label class="pet-name-field">
                            <input :value="petNameDraft" maxlength="16" placeholder="小 Lin"
                                aria-label="桌宠名字" @input="onPetNameInput"
                                @change="savePetName" @keyup.enter="savePetName" />
                        </label>
                    </div>

                    <div class="pet-stat-grid">
                        <div class="pet-stat">
                            <div class="pet-stat-head">
                                <span>心情</span>
                                <strong>{{ petVitals.mood }}</strong>
                            </div>
                            <span class="pet-stat-track is-mood">
                                <span :style="{ width: `${petVitals.mood}%` }" />
                            </span>
                        </div>
                        <div class="pet-stat">
                            <div class="pet-stat-head">
                                <span>饱腹</span>
                                <strong>{{ petVitals.satiety }}</strong>
                            </div>
                            <span class="pet-stat-track is-satiety">
                                <span :style="{ width: `${petVitals.satiety}%` }" />
                            </span>
                        </div>
                        <div class="pet-stat">
                            <div class="pet-stat-head">
                                <span>亲密度</span>
                                <strong>{{ petVitals.intimacy }}</strong>
                            </div>
                            <span class="pet-stat-track is-intimacy">
                                <span :style="{ width: `${petVitals.intimacy}%` }" />
                            </span>
                        </div>
                    </div>

                    <div class="pet-snack-shelf">
                        <div class="pet-snack-head">
                            <div>
                                <strong>零食柜</strong>
                                <span>不同零食的饱腹、心情和亲密度加成不同，每 60 秒可以喂一次。</span>
                            </div>
                            <span class="pet-snack-current">
                                已选 {{ selectedFood.icon }} {{ selectedFood.name }}
                            </span>
                        </div>
                        <div class="pet-snack-grid">
                            <button v-for="food in PET_FOODS" :key="food.id" type="button"
                                class="pet-snack-card"
                                :class="{ 'is-selected': food.id === selectedFoodId }"
                                :disabled="feedCooldownLeft > 0" @click="feedFromSettings(food.id)">
                                <span class="pet-snack-icon" aria-hidden="true">{{ food.icon }}</span>
                                <span class="pet-snack-copy">
                                    <span class="pet-snack-title">
                                        <strong>{{ food.name }}</strong>
                                        <small>{{ food.tag }}</small>
                                    </span>
                                    <span class="pet-snack-desc">{{ food.description }}</span>
                                    <span class="pet-snack-stats">
                                        饱腹 +{{ food.satiety }} · 心情 +{{ food.mood }} · 亲密 +{{
                                            food.intimacy }}
                                    </span>
                                </span>
                            </button>
                        </div>
                    </div>

                    <div class="pet-next-row">
                        <div class="pet-next-copy">
                            <span>下一个目标</span>
                            <strong v-if="petMilestone">
                                {{ petMilestone.label }} {{ petMilestone.target
                                }}{{ petMilestone.kind === 'streak' ? ' 天' : ' 次' }}
                            </strong>
                            <strong v-else>所有陪伴目标都完成啦</strong>
                            <small v-if="petMilestone">
                                还差 {{ petMilestone.remaining }}{{ petMilestone.kind === 'streak' ? ' 天' : ' 次' }}
                            </small>
                            <small v-else>它已经很习惯有你在身边了。</small>
                        </div>
                        <div v-if="petMilestone" class="pet-next-progress" aria-hidden="true">
                            <span
                                :style="{ width: `${petMilestonePercent(petMilestone.current, petMilestone.target)}%` }" />
                        </div>
                    </div>

                    <div class="pet-reset-row">
                        <div class="pet-reset-copy">
                            <strong>重新养一只</strong>
                            <span>清空名字、成长进度、成就和今日任务；其他设备会同步这次重置。</span>
                        </div>
                        <yk-button type="secondary" status="danger" @click="resetPetGrowth">
                            重新养一只
                        </yk-button>
                    </div>
                </section>

                <section class="pet-card pet-tasks-card">
                    <header class="pet-card-head">
                        <div>
                            <h2>今日小任务</h2>
                            <p>每天 0 点刷新，完成奖励只发放一次。</p>
                        </div>
                        <span class="pet-task-count">
                            {{ completedDailyTaskCount }}/{{ petDailyTasks.length }}
                        </span>
                    </header>

                    <div class="pet-task-list">
                        <article v-for="task in petDailyTasks" :key="task.key" class="pet-task"
                            :class="{ 'is-done': task.done }">
                            <div class="pet-task-top">
                                <span class="pet-task-icon" aria-hidden="true">{{ task.icon }}</span>
                                <span class="pet-task-state" :class="{ 'is-done': task.done }">
                                    {{ task.done ? '已完成' : '进行中' }}
                                </span>
                            </div>
                            <strong>{{ task.label }}</strong>
                            <p>{{ task.description }}</p>
                            <span class="pet-task-reward">
                                心情 +{{ task.reward.mood }} · 亲密度 +{{ task.reward.intimacy }}
                            </span>
                        </article>
                    </div>
                </section>

                <section class="pet-card">
                    <header class="pet-card-head">
                        <div>
                            <h2>成长足迹</h2>
                            <p>
                                已解锁 {{ unlockedAchievementCount }} 个成就，达成后即使进度回落也会保留
                                <template v-if="newAchievementCount"> · {{ newAchievementCount }} 个新成就</template>
                            </p>
                        </div>
                    </header>

                    <div class="pet-achievement-groups">
                        <div v-for="group in petMilestones" :key="group.label" class="pet-achievement-group">
                            <div class="pet-achievement-head">
                                <span>{{ group.label }}</span>
                                <small>
                                    {{ group.items.filter(item => item.achieved).length }}/{{ group.items.length }}
                                </small>
                            </div>
                            <div class="pet-milestone-list">
                                <div v-for="item in group.items" :key="`${item.kind}-${item.target}`"
                                    class="pet-milestone" :class="{ 'is-achieved': item.achieved }">
                                    <span class="pet-milestone-target">
                                        {{ item.target }}{{ item.kind === 'streak' ? '天' : '次' }}
                                    </span>
                                    <span class="pet-milestone-track">
                                        <span
                                            :style="{ width: `${petMilestonePercent(item.current, item.target)}%` }" />
                                    </span>
                                    <span class="pet-milestone-state">
                                        <span v-if="item.isNew" class="pet-milestone-new">新</span>
                                        {{ item.achieved ? '已解锁' : `${item.current}/${item.target}` }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="pet-card">
                    <header class="pet-card-head">
                        <div>
                            <h2>展示与外观</h2>
                            <p>控制桌宠是否出现、显示在哪里，以及看起来有多大</p>
                        </div>
                        <span v-if="!canEditPet" class="pet-readonly-note">只读</span>
                    </header>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>显示桌面宠物</strong>
                            <p>关闭后门户与后台都不再显示；重新打开即恢复。</p>
                        </div>
                        <yk-switch v-model="petSettings.desktopPetEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>显示范围</strong>
                            <p>选择桌宠出现在门户、后台，还是两边都出现。</p>
                        </div>
                        <div class="pet-choice-group" aria-label="桌宠显示范围">
                            <button v-for="option in scopeOptions" :key="option.value" type="button"
                                class="pet-choice" :class="{ 'is-active': petSettings.petScope === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petScope = option.value">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>大小</strong>
                            <p>移动端会自动按比例缩小。</p>
                        </div>
                        <div class="pet-choice-group" aria-label="桌宠大小">
                            <button v-for="option in sizeOptions" :key="option.value" type="button"
                                class="pet-choice" :class="{ 'is-active': petSettings.petSize === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petSize = option.value">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>尺寸微调</strong>
                            <p>在大小档位基础上继续缩放，最大可以拉到 200%。</p>
                        </div>
                        <div class="pet-range">
                            <input v-model.number="petSettings.petScale" type="range" min="60" max="200"
                                step="5" :disabled="!canEditPet" aria-label="桌宠尺寸缩放百分比" />
                            <span>{{ petSettings.petScale }}%</span>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>不透明度</strong>
                            <p>不想太抢眼时可以调低，最低可设到 40%。</p>
                        </div>
                        <div class="pet-range">
                            <input v-model.number="petSettings.petOpacity" type="range" min="40" max="100"
                                step="5" :disabled="!canEditPet" aria-label="桌宠不透明度百分比" />
                            <span>{{ petSettings.petOpacity }}%</span>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>默认停靠角落</strong>
                            <p>「回到原位」和首次出现时的位置，门户与后台共用。</p>
                        </div>
                        <div class="pet-choice-group" aria-label="桌宠默认停靠角落">
                            <button v-for="option in cornerOptions" :key="option.value" type="button"
                                class="pet-choice" :class="{ 'is-active': petSettings.petHomeCorner === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petHomeCorner = option.value">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>
                </section>

                <section class="pet-card">
                    <header class="pet-card-head">
                        <div>
                            <h2>行为</h2>
                            <p>调整它的活跃程度、气泡与自主行动</p>
                        </div>
                        <span v-if="!canEditPet" class="pet-readonly-note">只读</span>
                    </header>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>活泼程度</strong>
                            <p>影响随机动作与碎碎念频率：安静更少打扰，活泼更爱折腾。</p>
                        </div>
                        <div class="pet-choice-group" aria-label="桌宠活泼程度">
                            <button v-for="option in activityOptions" :key="option.value" type="button"
                                class="pet-choice" :class="{ 'is-active': petSettings.petActivity === option.value }"
                                :disabled="!canEditPet" @click="petSettings.petActivity = option.value">
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>气泡与碎碎念</strong>
                            <p>关闭后不再弹对话气泡，也不会随机自言自语。</p>
                        </div>
                        <yk-switch v-model="petSettings.petBubbleEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>允许自主漫游</strong>
                            <p>关闭后宠物不再四处走动，只做原地动作。</p>
                        </div>
                        <yk-switch v-model="petSettings.petRoamingEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>允许拖拽甩抛</strong>
                            <p>关闭后点击仍会回应，但不能拖动或甩出宠物。</p>
                        </div>
                        <yk-switch v-model="petSettings.petDragEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>

                    <div class="pet-row">
                        <div class="pet-row-copy">
                            <strong>无操作自动入睡</strong>
                            <p>三分钟没有互动就自己睡一觉，点击或拖拽会把它叫醒。</p>
                        </div>
                        <yk-switch v-model="petSettings.petAutoSleepEnabled" :checked-value="true"
                            :unchecked-value="false" :disabled="!canEditPet" />
                    </div>
                </section>
            </main>

            <aside class="pet-manage-side">
                <section class="pet-home-card">
                    <header class="pet-home-head">
                        <div>
                            <span class="pet-home-kicker">PET HOME</span>
                            <h2>{{ displayPetName }} 的小院</h2>
                            <p>在这个页面，它会在小屋和院子里活动。</p>
                        </div>
                        <span class="pet-home-status">
                            <span aria-hidden="true" />在家
                        </span>
                    </header>

                    <div class="pet-home-room" data-pet-home-zone>
                        <div class="pet-home-interior" aria-hidden="true">
                            <span class="pet-home-window">
                                <span class="pet-home-moon" />
                                <span class="pet-home-star pet-home-star-a" />
                                <span class="pet-home-star pet-home-star-b" />
                            </span>
                            <span class="pet-home-curtain pet-home-curtain-left" />
                            <span class="pet-home-curtain pet-home-curtain-right" />
                            <span class="pet-home-shelf">
                                <i />
                                <i />
                                <i />
                            </span>
                            <span class="pet-home-picture">♥</span>
                            <span class="pet-home-clock" />
                            <span class="pet-home-door" />
                            <span class="pet-home-plant">🪴</span>
                            <span class="pet-home-rug" />
                            <span class="pet-home-cushion" />
                            <span class="pet-home-bowl">🥣</span>
                        </div>

                        <div class="pet-home-yard">
                            <span class="pet-home-sun" aria-hidden="true" />
                            <span class="pet-home-cloud pet-home-cloud-a" aria-hidden="true" />
                            <span class="pet-home-cloud pet-home-cloud-b" aria-hidden="true" />
                            <span class="pet-home-hill pet-home-hill-a" aria-hidden="true" />
                            <span class="pet-home-hill pet-home-hill-b" aria-hidden="true" />
                            <span class="pet-home-fence" aria-hidden="true" />
                            <span class="pet-home-path" aria-hidden="true" />
                            <span class="pet-home-tree" aria-hidden="true">
                                <i class="pet-home-tree-trunk" />
                                <i class="pet-home-tree-canopy" />
                            </span>
                            <button type="button" class="pet-home-coop"
                                :class="{ 'is-ready': chicken.eggReady || chicken.manureReady }"
                                :aria-label="chickenLabel" :title="chickenLabel"
                                data-homestead-target="coop" @click="collectChicken">
                                <i class="pet-home-coop-wall" aria-hidden="true" />
                                <i class="pet-home-coop-roof" aria-hidden="true" />
                                <i class="pet-home-coop-door" aria-hidden="true" />
                                <b class="pet-home-chicken" aria-hidden="true">🐔</b>
                                <b v-if="chicken.eggReady" class="pet-home-yard-badge is-egg"
                                    aria-hidden="true">🥚</b>
                                <b v-if="chicken.manureReady" class="pet-home-yard-badge is-manure"
                                    aria-hidden="true">💩</b>
                            </button>
                            <button type="button" class="pet-home-pasture"
                                :class="{ 'is-ready': cow.milkReady || cow.manureReady }"
                                :aria-label="cowLabel" :title="cowLabel"
                                data-homestead-target="cow" @click="collectCow">
                                <b aria-hidden="true">🐄</b>
                                <b v-if="cow.milkReady" class="pet-home-yard-badge is-milk"
                                    aria-hidden="true">🥛</b>
                                <b v-if="cow.manureReady" class="pet-home-yard-badge is-manure"
                                    aria-hidden="true">💩</b>
                            </button>
                            <div class="pet-home-plots">
                                <button v-for="plot in homesteadPlots" :key="plot.index" type="button"
                                    class="pet-home-plot"
                                    :class="{ 'is-ready': plot.ripe, 'is-watered': plot.watered, 'is-empty': !plot.cropId }"
                                    :aria-label="plot.label" :title="plot.label"
                                    :data-homestead-target="`plot-${plot.index}`"
                                    @click="handlePlotClick(plot.index)">
                                    <template v-if="plot.cropId">
                                        <b v-for="leaf in 3" :key="leaf"
                                            :style="plotGrowthStyle(plot.progress)" aria-hidden="true" />
                                        <b v-if="plot.ripe" class="pet-home-plot-crop"
                                            aria-hidden="true">{{ plot.icon }}</b>
                                        <i v-if="plot.watered && !plot.ripe"
                                            class="pet-home-plot-water" aria-hidden="true">💧</i>
                                    </template>
                                    <span v-else class="pet-home-plot-empty" aria-hidden="true">+</span>
                                </button>
                            </div>
                            <button type="button" class="pet-home-pond"
                                :class="{ 'is-ready': pondReady }" :aria-label="pondLabel"
                                :title="pondLabel" data-homestead-target="pond"
                                @click="handlePondClick">
                                <i class="pet-home-pond-ripple pet-home-pond-ripple-a" aria-hidden="true" />
                                <i class="pet-home-pond-ripple pet-home-pond-ripple-b" aria-hidden="true" />
                                <b class="pet-home-reeds" aria-hidden="true">🌾</b>
                                <b v-if="pondReady" class="pet-home-yard-badge is-fish"
                                    aria-hidden="true">🐟</b>
                            </button>
                            <span class="pet-home-sign" aria-hidden="true">小院</span>
                        </div>

                        <span class="pet-home-room-note">活动范围 · 拖动也不会离开小院</span>
                    </div>

                    <div class="pet-homestead-tools">
                        <div class="pet-homestead-seeds" role="group" aria-label="选择种子">
                            <button v-for="crop in HOMESTEAD_CROPS" :key="crop.id" type="button"
                                class="pet-homestead-seed"
                                :class="{ 'is-active': selectedSeedId === crop.id }"
                                :aria-pressed="selectedSeedId === crop.id"
                                :title="`${crop.name}，${formatHomesteadDuration(crop.growMs)}成熟`"
                                @click="selectSeed(crop.id)">
                                <span aria-hidden="true">{{ crop.icon }}</span>
                                <small>{{ crop.name }}</small>
                            </button>
                        </div>
                        <button type="button" class="pet-homestead-tend" :disabled="homesteadTendCount === 0"
                            :title="homesteadTendCount ? '浇水、收获、收取产物并钓鱼' : '小院暂时没有需要忙的'"
                            @click="tendHomesteadNow">
                            <span aria-hidden="true">🧺</span>一键照料
                            <b v-if="homesteadTendCount" class="pet-homestead-tend-count">
                                {{ homesteadTendCount }}
                            </b>
                        </button>
                    </div>

                    <div class="pet-homestead-store" role="status" aria-live="polite">
                        <span class="pet-homestead-store-label">仓库</span>
                        <template v-if="inventoryChips.length">
                            <span v-for="item in inventoryChips" :key="item.id" class="pet-homestead-item">
                                <span aria-hidden="true">{{ item.icon }}</span>{{ item.name }} ×{{ item.count }}
                            </span>
                        </template>
                        <span v-else class="pet-homestead-store-empty">
                            空空如也，点菜地播种或去鸡舍看看
                        </span>
                    </div>

                    <div class="pet-homestead-auto">
                        <div class="pet-homestead-auto-copy">
                            <strong>自动帮忙</strong>
                            <span>{{ autoHelpStatus }}</span>
                        </div>
                        <div class="pet-homestead-auto-actions">
                            <button type="button" class="pet-homestead-auto-now"
                                :disabled="!homestead.autoHelp.enabled"
                                title="让它现在就去小院忙一轮"
                                @click="requestAutoHelp">
                                <span aria-hidden="true">🐾</span>去帮忙
                            </button>
                            <yk-switch v-model="autoHelpEnabled" :checked-value="true"
                                :unchecked-value="false" aria-label="自动帮忙" />
                        </div>
                    </div>

                    <div class="pet-home-actions">
                        <button type="button" :disabled="feedCooldownLeft > 0"
                            :title="feedCooldownLeft > 0 ? '刚喂过，稍后再试' : '喂一口'"
                            @click="feedFromSettings()">
                            <span>{{ selectedFood.icon }}</span>喂一口
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('home')">
                            <span>🏠</span>回到小院
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('speak')">
                            <span>💬</span>说句话
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('sleep')">
                            <span>🌙</span>睡一觉
                        </button>
                        <button type="button" :disabled="!petSettings.desktopPetEnabled"
                            @click="sendDesktopPetCommand('wake')">
                            <span>☀️</span>叫醒它
                        </button>
                    </div>

                    <div class="pet-home-footer">
                        <button type="button" :disabled="!canEditPet" @click="resetPetSettings">
                            恢复默认展示
                        </button>
                        <button type="button" @click="go('/setting')">
                            本机偏好设置 →
                        </button>
                    </div>
                </section>
            </aside>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSiteSettings, updateSiteSettings } from '../api/site'
import {
    DEFAULT_DESKTOP_PET_SETTINGS,
    broadcastDesktopPetSettings,
    getDesktopPetSettings,
    normalizeDesktopPetSettings,
    sendDesktopPetCommand,
    setDesktopPetSettings,
    type DesktopPetSettings,
} from '../utils/desktopPet'
import {
    PET_FOODS,
    getPetFood,
    getSelectedPetFoodId,
    onSelectedPetFoodChange,
    setSelectedPetFoodId,
    type PetFoodId,
} from '../utils/desktopPetFood'
import { emitPetReaction, onPetReaction } from '../utils/desktopPetScene'
import {
    PET_FEED_COOLDOWN_MS,
    PET_DAILY_TASK_DEFINITIONS,
    applyFeeding,
    getPetVitals,
    recordDailyTask,
    resetPetVitals,
    setPetVitals,
    vitalsCompanionTitle,
    vitalsIntimacyLevel,
    vitalsMilestoneWall,
    vitalsMoodLabel,
    vitalsNextMilestone,
    type PetVitals,
} from '../utils/desktopPetVitals'
import {
    HOMESTEAD_ANIMALS,
    HOMESTEAD_ANIMAL_IDS,
    HOMESTEAD_CROPS,
    HOMESTEAD_ITEMS,
    animalStatusText,
    collectAnimal,
    fertilizePlot,
    fishPond,
    formatHomesteadDuration,
    getHomesteadCrop,
    getHomesteadState,
    harvestPlot,
    isAnimalManureReady,
    isAnimalProduceReady,
    isPlotRipe,
    isPondReady,
    plantCrop,
    plotProgress,
    plotRemainingMs,
    plotStatusText,
    pondStatusText,
    resetHomesteadState,
    setHomesteadState,
    tendHomestead,
    waterPlot,
    type HomesteadAnimalId,
    type HomesteadCropId,
    type HomesteadState,
} from '../utils/desktopPetHomestead'
import {
    flushPetSyncQueue,
    getPetSyncStatus,
    mergeRemotePetVitals,
    onPetSyncStatusChange,
    refreshPetSyncStatus,
    syncPetVitalsToServer,
    type PetSyncState,
    type PetSyncStatus,
} from '../utils/desktopPetSync'
import {
    HOMESTEAD_AUTO_HELP_EVENT,
    autoHelpStatusText,
    type HomesteadAutoHelpEventDetail,
} from '../utils/desktopPetAutoHelp'
import { useSessionStore } from '../store/session.ts'
import { IconHeartFill } from '@yike-design/ui/es/components/svg-icon'

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

const canEditPet = computed(() => session.can('permission.edit'))
const petSettings = reactive<DesktopPetSettings>({ ...getDesktopPetSettings() })
const petVitals = ref<PetVitals>(getPetVitals())
const homestead = ref<HomesteadState>(getHomesteadState())
const selectedSeedId = ref<HomesteadCropId>('radish')
const selectedSeed = computed(
    () => getHomesteadCrop(selectedSeedId.value) || HOMESTEAD_CROPS[0]
)
const selectedFoodId = ref<PetFoodId>(getSelectedPetFoodId())
const selectedFood = computed(() => getPetFood(selectedFoodId.value))
const nowTick = ref(Date.now())
const feedCooldownLeft = computed(() =>
    Math.max(
        0,
        petVitals.value.lastFedAt + PET_FEED_COOLDOWN_MS - nowTick.value
    )
)
const feedCooldownSeconds = computed(() =>
    Math.ceil(feedCooldownLeft.value / 1000)
)
let feedClockTimer: number | undefined
let unsubscribeFood: (() => void) | undefined
const petSync = ref<PetSyncStatus>(getPetSyncStatus())
const PET_SYNC_LABELS: Record<PetSyncState, string> = {
    local: '仅本机',
    syncing: '同步中',
    synced: '已同步',
    pending: '待重试',
}
const petSyncState = computed(() => petSync.value.state)
const petSyncLabel = computed(() => PET_SYNC_LABELS[petSyncState.value])
const petSyncHint = computed(() => {
    const current = petSync.value
    if (current.state === 'local') return '未登录时养成进度只保存在当前设备'
    if (current.state === 'syncing') return '正在把最新养成进度保存到云端'
    if (current.state === 'pending') {
        return current.lastError || '这次同步没有成功，稍后会自动重试'
    }
    if (current.lastSyncedAt) {
        const time = new Date(current.lastSyncedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        })
        return `上次同步 ${time}`
    }
    return '养成进度已与云端一致'
})
const retryPetSync = () => {
    void flushPetSyncQueue()
}
const petTitle = computed(() => vitalsCompanionTitle(petVitals.value))
const petMilestone = computed(() => vitalsNextMilestone(petVitals.value))
const petMilestones = computed(() => vitalsMilestoneWall(petVitals.value))
const petDailyTasks = computed(() =>
    PET_DAILY_TASK_DEFINITIONS.map((task) => ({
        ...task,
        done: petVitals.value.dailyTasks.progress[task.key] >= 1,
    }))
)
const completedDailyTaskCount = computed(
    () => petDailyTasks.value.filter((task) => task.done).length
)
const unlockedAchievementCount = computed(() =>
    petMilestones.value.reduce(
        (total, group) =>
            total + group.items.filter((item) => item.unlocked).length,
        0
    )
)
const newAchievementCount = computed(() =>
    petMilestones.value.reduce(
        (total, group) =>
            total + group.items.filter((item) => item.isNew).length,
        0
    )
)
const displayPetName = computed(() => petVitals.value.name || '小 Lin')

const homesteadPlots = computed(() =>
    homestead.value.plots.map((plot, index) => {
        const crop = getHomesteadCrop(plot.cropId)
        return {
            index,
            cropId: plot.cropId,
            icon: crop?.icon || '',
            ripe: isPlotRipe(plot, nowTick.value),
            watered: plot.wateredAt > 0,
            fertilized: plot.fertilizedAt > 0,
            canFertilize:
                Boolean(plot.cropId) &&
                Boolean(plot.wateredAt) &&
                !plot.fertilizedAt &&
                !isPlotRipe(plot, nowTick.value) &&
                homestead.value.inventory.fertilizer > 0,
            progress: plotProgress(plot, nowTick.value),
            label: `第 ${index + 1} 块菜地：${plotStatusText(
                plot,
                nowTick.value
            )}${
                Boolean(plot.cropId) &&
                Boolean(plot.wateredAt) &&
                !plot.fertilizedAt &&
                !isPlotRipe(plot, nowTick.value) &&
                homestead.value.inventory.fertilizer > 0
                    ? '，点击施肥'
                    : ''
            }`,
        }
    })
)

const chicken = computed(() => {
    const definition = HOMESTEAD_ANIMALS.chicken
    const animal = homestead.value.animals.chicken
    return {
        ...definition,
        eggReady: isAnimalProduceReady(animal, definition, nowTick.value),
        manureReady: isAnimalManureReady(animal, definition, nowTick.value),
    }
})

const cow = computed(() => {
    const definition = HOMESTEAD_ANIMALS.cow
    const animal = homestead.value.animals.cow
    return {
        ...definition,
        milkReady: isAnimalProduceReady(animal, definition, nowTick.value),
        manureReady: isAnimalManureReady(animal, definition, nowTick.value),
    }
})

const chickenLabel = computed(
    () => `鸡舍：${animalStatusText(homestead.value, 'chicken', nowTick.value)}`
)
const cowLabel = computed(
    () => `奶牛：${animalStatusText(homestead.value, 'cow', nowTick.value)}`
)
const pondReady = computed(() => isPondReady(homestead.value, nowTick.value))
const pondLabel = computed(
    () => `鱼塘：${pondStatusText(homestead.value, nowTick.value)}`
)

const inventoryChips = computed(() =>
    HOMESTEAD_ITEMS.filter(
        (item) => homestead.value.inventory[item.id] > 0
    ).map((item) => ({
        ...item,
        count: homestead.value.inventory[item.id],
    }))
)

const homesteadTendCount = computed(() => {
    let count = 0
    let fertilizable = 0
    for (const plot of homestead.value.plots) {
        if (isPlotRipe(plot, nowTick.value)) count++
        else if (plot.cropId && !plot.wateredAt) count++
        else if (plot.cropId && !plot.fertilizedAt) fertilizable++
    }
    count += Math.min(fertilizable, homestead.value.inventory.fertilizer)
    for (const id of HOMESTEAD_ANIMAL_IDS) {
        const definition = HOMESTEAD_ANIMALS[id]
        const animal = homestead.value.animals[id]
        if (isAnimalProduceReady(animal, definition, nowTick.value)) count++
        if (isAnimalManureReady(animal, definition, nowTick.value)) count++
    }
    if (isPondReady(homestead.value, nowTick.value)) count++
    return count
})

const autoHelpEnabled = computed({
    get: () => homestead.value.autoHelp.enabled,
    set: (enabled: boolean) => {
        if (enabled === homestead.value.autoHelp.enabled) return
        homestead.value = setHomesteadState({
            ...homestead.value,
            autoHelp: { ...homestead.value.autoHelp, enabled },
            updatedAt: Date.now(),
        })
        proxy?.$message?.({
            type: 'primary',
            message: enabled
                ? '自动帮忙已开启，它闲下来会自己去小院干活'
                : '自动帮忙已关闭，小院交给你亲手打理',
        })
    },
})

const autoHelpStatus = computed(() => {
    if (!petSettings.desktopPetEnabled) {
        return '桌宠已隐藏，打开后才能自己去干活'
    }
    if (petSettings.petScope === 'portal') {
        return '当前只在门户显示，后台小院不会自动帮忙'
    }
    if (!petSettings.petRoamingEnabled) {
        return '需要开启「允许自主漫游」才能自己去干活'
    }
    return autoHelpStatusText(homestead.value, nowTick.value)
})

const requestAutoHelp = () => {
    if (!homestead.value.autoHelp.enabled) return
    if (!petSettings.desktopPetEnabled) {
        proxy?.$message?.({
            type: 'warning',
            message: '桌宠当前已隐藏，打开后才能去小院帮忙',
        })
        return
    }
    sendDesktopPetCommand('homestead')
    proxy?.$message?.({
        type: 'primary',
        message: '小 Lin 去小院看看有什么要忙的',
    })
}

const plotGrowthStyle = (progress: number) => ({
    transform: `scaleY(${0.38 + progress * 0.62})`,
    transformOrigin: 'bottom center',
})

const petMilestonePercent = (current: number, target: number) =>
    Math.min(100, Math.round((current / target) * 100))

const petNameDraft = ref(petVitals.value.name)
let petNameEditing = false
const onPetNameInput = (event: Event) => {
    petNameEditing = true
    petNameDraft.value = (event.target as HTMLInputElement).value
}

const savePetName = () => {
    petNameEditing = false
    const name = petNameDraft.value.trim().replace(/\s+/g, ' ').slice(0, 16)
    petNameDraft.value = name
    if (name === petVitals.value.name) return
    petVitals.value = { ...petVitals.value, name, updatedAt: Date.now() }
    setPetVitals(petVitals.value)
    emitPetReaction('vitals-updated')
    void syncPetVitalsToServer(petVitals.value)
    proxy?.$message?.({
        type: 'success',
        message: name ? `以后就叫它「${name}」啦` : '已改回默认名字',
    })
}

watch(
    () => petVitals.value.name,
    (name) => {
        if (!petNameEditing) petNameDraft.value = name
    }
)

const selectSeed = (id: HomesteadCropId) => {
    selectedSeedId.value = id
}

const commitHomestead = (next: HomesteadState) => {
    homestead.value = setHomesteadState(next)
}

const handlePlotClick = (index: number) => {
    const plot = homestead.value.plots[index]
    const crop = getHomesteadCrop(plot?.cropId)
    const now = Date.now()
    if (!plot || !crop) {
        const seed = selectedSeed.value
        const next = plantCrop(homestead.value, index, seed.id, now)
        if (next === homestead.value) return
        commitHomestead(next)
        proxy?.$message?.({
            type: 'success',
            message: `种下了${seed.name}，${formatHomesteadDuration(seed.growMs)}后成熟`,
        })
        return
    }
    if (isPlotRipe(plot, now)) {
        const result = harvestPlot(homestead.value, index, now)
        if (!result.changed) return
        commitHomestead(result.state)
        proxy?.$message?.({
            type: 'success',
            message: `收获了 ${result.amount} 个${crop.name}`,
        })
        return
    }
    if (!plot.wateredAt) {
        const next = waterPlot(homestead.value, index, now)
        if (next === homestead.value) return
        commitHomestead(next)
        proxy?.$message?.({
            type: 'success',
            message: `给${crop.name}浇了水，成熟时间缩短 20%`,
        })
        return
    }
    if (!plot.fertilizedAt && homestead.value.inventory.fertilizer > 0) {
        const next = fertilizePlot(homestead.value, index, now)
        if (next === homestead.value) return
        commitHomestead(next)
        proxy?.$message?.({
            type: 'success',
            message: `给${crop.name}施了肥，成熟时间再缩短 20%`,
        })
        return
    }
    proxy?.$message?.({
        type: 'primary',
        message: `${crop.name}还要 ${formatHomesteadDuration(
            plotRemainingMs(plot, now)
        )} 才能收获${plot.fertilizedAt ? '' : '，攒到肥料后还能再快一点'}`,
    })
}

const collectHomesteadAnimal = (animalId: HomesteadAnimalId) => {
    const now = Date.now()
    const result = collectAnimal(homestead.value, animalId, now)
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message: animalStatusText(homestead.value, animalId, now),
        })
        return
    }
    commitHomestead(result.state)
    const summary = result.items
        .map((item) => `${item.item.icon}${item.item.name}`)
        .join('、')
    proxy?.$message?.({
        type: 'success',
        message: `收起了 ${summary}`,
    })
}

const collectChicken = () => {
    collectHomesteadAnimal('chicken')
}

const collectCow = () => {
    collectHomesteadAnimal('cow')
}

const handlePondClick = () => {
    const now = Date.now()
    const result = fishPond(homestead.value, now)
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message: pondStatusText(homestead.value, now),
        })
        return
    }
    commitHomestead(result.state)
    proxy?.$message?.({
        type: 'success',
        message: '钓到一条鱼，已经放进仓库',
    })
}

const tendHomesteadNow = () => {
    const now = Date.now()
    const result = tendHomestead(homestead.value, now)
    if (!result.changed) {
        proxy?.$message?.({
            type: 'primary',
            message: '小院现在很安稳，没有需要忙的',
        })
        return
    }
    commitHomestead(result.state)
    const parts: string[] = []
    if (result.watered) parts.push(`浇了 ${result.watered} 块地`)
    if (result.fertilized) parts.push(`施了 ${result.fertilized} 块地`)
    if (result.harvested) parts.push(`收了 ${result.harvested} 块地`)
    if (result.collected.length) {
        const count = result.collected.reduce(
            (total, item) => total + item.count,
            0
        )
        parts.push(`收起了 ${count} 份产物`)
    }
    if (result.fished) parts.push('钓到一条鱼')
    proxy?.$message?.({
        type: 'success',
        message: `小院忙完了：${parts.join('，')}`,
    })
}

const feedFromSettings = (foodId: PetFoodId = selectedFoodId.value) => {
    const food = getPetFood(foodId)
    setSelectedPetFoodId(food.id)
    selectedFoodId.value = food.id
    const result = applyFeeding(petVitals.value, Date.now(), food.id)
    let next = result.vitals
    let taskCompleted = false
    if (result.effect === 'ok') {
        const task = recordDailyTask(next, 'feed')
        next = task.vitals
        taskCompleted = task.completedNow
    }
    petVitals.value = next
    setPetVitals(petVitals.value)
    emitPetReaction('vitals-updated', {
        message: `${result.vitals.name || '小 Lin'} 的养成状态有更新`,
    })
    void syncPetVitalsToServer(petVitals.value)
    if (result.effect === 'ok') {
        proxy?.$message?.({
            type: 'success',
            message: taskCompleted
                ? `${food.name}喂饱啦，今日任务完成，奖励已到账`
                : `${food.name}喂饱啦，心情也变好了`,
        })
    } else if (result.effect === 'full') {
        proxy?.$message?.({
            type: 'warning',
            message: `它已经吃得很饱了，${food.name}先留着吧`,
        })
    } else {
        proxy?.$message?.({
            type: 'primary',
            message: `刚喂过，等 ${feedCooldownSeconds.value}s 再试吧`,
        })
    }
}

const resetPetGrowth = () => {
    if (!window.confirm('重新养一只会清空名字、等级、成就、每日任务和小院进度。确认继续吗？')) {
        return
    }
    const next = resetPetVitals(petVitals.value)
    petVitals.value = next
    petNameDraft.value = next.name
    setPetVitals(next)
    homestead.value = resetHomesteadState()
    selectedSeedId.value = 'radish'
    emitPetReaction('vitals-updated', {
        message: '宠物成长已重置',
    })
    void syncPetVitalsToServer(next)
    proxy?.$message?.({
        type: 'success',
        message: '已经重新开始，新的陪伴从今天算起，小院也整理好了',
    })
}

const sizeOptions = [
    { value: 'small' as const, label: '小' },
    { value: 'medium' as const, label: '中' },
    { value: 'large' as const, label: '大' },
]
const activityOptions = [
    { value: 'quiet' as const, label: '安静' },
    { value: 'normal' as const, label: '正常' },
    { value: 'lively' as const, label: '活泼' },
]
const scopeOptions = [
    { value: 'all' as const, label: '全站' },
    { value: 'portal' as const, label: '仅门户' },
    { value: 'admin' as const, label: '仅后台' },
]
const cornerOptions = [
    { value: 'right' as const, label: '右下' },
    { value: 'left' as const, label: '左下' },
]

const snapshotPetSettings = (): DesktopPetSettings => ({ ...petSettings })
const isSamePetSettings = (a: DesktopPetSettings, b: DesktopPetSettings) =>
    a.desktopPetEnabled === b.desktopPetEnabled &&
    a.petSize === b.petSize &&
    a.petScale === b.petScale &&
    a.petActivity === b.petActivity &&
    a.petRoamingEnabled === b.petRoamingEnabled &&
    a.petDragEnabled === b.petDragEnabled &&
    a.petBubbleEnabled === b.petBubbleEnabled &&
    a.petOpacity === b.petOpacity &&
    a.petAutoSleepEnabled === b.petAutoSleepEnabled &&
    a.petHomeCorner === b.petHomeCorner &&
    a.petScope === b.petScope

let lastSavedPetSettings: DesktopPetSettings = { ...petSettings }
let petSaveTimer: number | undefined
let petSaving = false
let petRevision = 0

const flushPetSettings = async () => {
    if (petSaving) return
    const payload = snapshotPetSettings()
    if (isSamePetSettings(payload, lastSavedPetSettings)) return
    const revision = petRevision
    petSaving = true
    try {
        const res = await updateSiteSettings(payload)
        if (res?.code !== 200) throw new Error(res?.message || '保存失败')
        lastSavedPetSettings = payload
        setDesktopPetSettings(payload)
        proxy?.$message?.({ type: 'success', message: '桌宠设置已保存' })
        emitPetReaction('settings-saved', {
            message: '桌宠设置已保存',
            actionPath: '/petManage',
            actionLabel: '去宠物管理',
        })
    } catch {
        if (petRevision === revision) {
            Object.assign(petSettings, lastSavedPetSettings)
            broadcastDesktopPetSettings(lastSavedPetSettings)
        }
        proxy?.$message?.({ type: 'error', message: '桌宠设置保存失败，请稍后重试' })
    } finally {
        petSaving = false
        if (
            petRevision !== revision &&
            !isSamePetSettings(snapshotPetSettings(), lastSavedPetSettings)
        ) {
            window.clearTimeout(petSaveTimer)
            petSaveTimer = window.setTimeout(() => void flushPetSettings(), 120)
        }
    }
}

watch(
    petSettings,
    () => {
        if (!canEditPet.value) {
            Object.assign(petSettings, lastSavedPetSettings)
            return
        }
        if (isSamePetSettings(snapshotPetSettings(), lastSavedPetSettings)) return
        petRevision++
        broadcastDesktopPetSettings(snapshotPetSettings())
        window.clearTimeout(petSaveTimer)
        petSaveTimer = window.setTimeout(() => void flushPetSettings(), 350)
    },
    { deep: true }
)

const resetPetSettings = () => {
    if (!canEditPet.value) return
    if (!window.confirm('恢复默认桌宠设置？当前尺寸、范围与行为会重置。')) return
    Object.assign(petSettings, { ...DEFAULT_DESKTOP_PET_SETTINGS })
    proxy?.$message?.({ type: 'primary', message: '已恢复默认设置，正在保存' })
}

const go = (path: string) => {
    router.push(path)
}

let unsubscribeReaction: (() => void) | undefined
let unsubscribeSync: (() => void) | undefined

const onHomesteadAutoHelp = (event: Event) => {
    const detail = (event as CustomEvent<HomesteadAutoHelpEventDetail>).detail
    homestead.value = detail?.state || getHomesteadState()
}

onMounted(() => {
    homestead.value = getHomesteadState()
    window.addEventListener(HOMESTEAD_AUTO_HELP_EVENT, onHomesteadAutoHelp)
    unsubscribeFood = onSelectedPetFoodChange((id) => {
        selectedFoodId.value = id
    })
    feedClockTimer = window.setInterval(() => {
        nowTick.value = Date.now()
    }, 1000)
    petSync.value = refreshPetSyncStatus()
    unsubscribeSync = onPetSyncStatusChange((next) => {
        petSync.value = next
    })
    unsubscribeReaction = onPetReaction((payload) => {
        if (payload.kind === 'vitals-updated') {
            petVitals.value = getPetVitals()
        }
    })
    void mergeRemotePetVitals(petVitals.value).then((merged) => {
        petVitals.value = merged
        setPetVitals(merged)
    })
})

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
    }
})

onUnmounted(() => {
    window.removeEventListener(HOMESTEAD_AUTO_HELP_EVENT, onHomesteadAutoHelp)
    unsubscribeFood?.()
    unsubscribeReaction?.()
    unsubscribeSync?.()
    window.clearInterval(feedClockTimer)
    window.clearTimeout(petSaveTimer)
})
</script>

<style lang="less" scoped>
.pet-manage-page {
    width: 100%;
}

.pet-hero {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    overflow: hidden;
    padding: 28px 30px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 24px;
    background:
        radial-gradient(circle at 6% 12%, color-mix(in srgb, var(--pcolor) 22%, transparent), transparent 32%),
        radial-gradient(circle at 88% 8%, color-mix(in srgb, var(--scolor, #1fb4a2) 16%, transparent), transparent 28%),
        linear-gradient(120deg,
            color-mix(in srgb, var(--pcolor) 9%, var(--admin-surface, var(--bgColor1))),
            var(--admin-surface, var(--bgColor1)) 58%,
            color-mix(in srgb, var(--scolor, #1fb4a2) 8%, var(--admin-surface, var(--bgColor1))));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.pet-hero-orbit {
    position: absolute;
    border: 1px solid color-mix(in srgb, var(--pcolor) 18%, transparent);
    border-radius: 50%;
    pointer-events: none;
}

.pet-hero-orbit-a {
    top: -88px;
    right: 18%;
    width: 210px;
    height: 210px;
}

.pet-hero-orbit-b {
    right: -54px;
    bottom: -100px;
    width: 260px;
    height: 260px;
    border-color: color-mix(in srgb, var(--scolor, #1fb4a2) 16%, transparent);
}

.pet-hero-main {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 18px;
}

.pet-hero-avatar {
    display: grid;
    width: 78px;
    height: 78px;
    flex: none;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 24px;
    color: #fff;
    background: linear-gradient(135deg, var(--pcolor), var(--pcolor8) 60%, var(--scolor, #1fb4a2));
    box-shadow:
        0 14px 32px color-mix(in srgb, var(--pcolor) 30%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.34);

    .yk-icon {
        width: 32px;
        height: 32px;
    }
}

.pet-hero-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;

    h1 {
        margin: 0;
        overflow: hidden;
        color: var(--admin-text, var(--gray));
        font-size: 27px;
        font-weight: 760;
        letter-spacing: -0.02em;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    p {
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 13px;
    }
}

.pet-hero-kicker {
    color: var(--pcolor);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.16em;
}

.pet-hero-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 3px;

    span {
        padding: 4px 10px;
        border: 1px solid color-mix(in srgb, var(--pcolor) 18%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--pcolor) 6%, transparent);
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
    }
}

.pet-hero-actions {
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;

    > span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
    }
}

.pet-manage-grid {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) minmax(460px, 0.88fr);
    align-items: start;
    gap: 20px;
}

.pet-manage-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.pet-manage-side {
    min-width: 0;
    position: sticky;
    top: 88px;
    align-self: start;
}

.pet-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 22px 24px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 20px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.pet-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 16px;

    h2 {
        margin: 0;
        color: var(--admin-text, var(--gray));
        font-size: 16px;
        font-weight: 700;
    }

    p {
        margin: 4px 0 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-card-badges {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
}

.pet-sync-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;

    .pet-sync-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
    }

    &.is-synced {
        border-color: color-mix(in srgb, #1f8f63 26%, var(--admin-line, var(--gray1)));
        background: color-mix(in srgb, #1f8f63 8%, var(--bgColor2));
        color: #1f8f63;
    }

    &.is-syncing {
        border-color: color-mix(in srgb, var(--pcolor) 24%, var(--admin-line, var(--gray1)));
        background: var(--pcolor1);
        color: var(--pcolor);

        .pet-sync-dot {
            animation: pet-sync-pulse 1s ease-in-out infinite;
        }
    }

    &.is-pending {
        border-color: color-mix(in srgb, #b3701a 28%, var(--admin-line, var(--gray1)));
        background: color-mix(in srgb, #b3701a 9%, var(--bgColor2));
        color: #b3701a;
    }
}

.pet-sync-retry {
    padding: 0;
    border: 0;
    background: none;
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
    text-decoration: underline;
    cursor: pointer;
}

.pet-card-head .pet-sync-note {
    color: #b3701a;
}

@keyframes pet-sync-pulse {
    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.35;
    }
}

.pet-level-pill,
.pet-readonly-note {
    flex: none;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
}

.pet-readonly-note {
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
}

.pet-name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 15px 16px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--bgColor2);
}

.pet-name-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-name-field {
    flex: none;

    input {
        width: 210px;
        height: 38px;
        box-sizing: border-box;
        padding: 0 12px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 10px;
        outline: none;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--admin-text, var(--gray));
        font: inherit;
        font-size: 13px;
        transition: border-color 0.18s ease, box-shadow 0.18s ease;

        &:focus {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px var(--pcolor2);
        }
    }
}

.pet-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 16px;
}

.pet-stat {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 13px 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 13px;
    background: var(--bgColor2);
}

.pet-stat-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 16px;
        font-variant-numeric: tabular-nums;
    }
}

.pet-stat-track {
    display: block;
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gray6) 14%, transparent);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
        transition: width 0.24s ease;
    }

    &.is-mood span {
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
    }

    &.is-satiety span {
        background: linear-gradient(90deg, var(--scolor, #1fb4a2), #65d3a0);
    }

    &.is-intimacy span {
        background: linear-gradient(90deg, #f06fa9, #ff9a7a);
    }
}

.pet-snack-shelf {
    margin-top: 16px;
    padding: 14px 15px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--bgColor2);
}

.pet-snack-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    > div {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        line-height: 1.5;
    }
}

.pet-snack-head .pet-snack-current {
    flex: none;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
}

.pet-snack-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
    margin-top: 10px;
}

.pet-snack-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--admin-surface, var(--bgColor1));
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        transform 0.18s ease;

    &:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--pcolor) 36%, var(--admin-line, var(--gray1)));
        transform: translateY(-1px);
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }

    &.is-selected {
        border-color: var(--pcolor);
        background: color-mix(in srgb, var(--pcolor) 6%, var(--admin-surface, var(--bgColor1)));
        box-shadow: 0 0 0 2px var(--pcolor2);
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }
}

.pet-snack-icon {
    font-size: 24px;
    line-height: 1;
}

.pet-snack-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.pet-snack-title {
    display: flex;
    align-items: baseline;
    gap: 6px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 12px;
    }

    small {
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: var(--pcolor);
        font-size: 9px;
    }
}

.pet-snack-desc {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    line-height: 1.45;
}

.pet-snack-stats {
    color: var(--pcolor);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}

.pet-feed-cooldown {
    color: #b3701a;
    font-size: 11px;
}

.pet-next-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    margin-top: 16px;
    padding: 15px 16px;
    border-radius: 14px;
    background:
        linear-gradient(120deg, var(--pcolor1), transparent 68%),
        var(--bgColor2);
}

.pet-next-copy {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 2px 9px;

    > span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        letter-spacing: 0.04em;
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 15px;
    }

    small {
        grid-column: 1 / -1;
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
    }
}

.pet-next-progress {
    width: 180px;
    height: 8px;
    flex: none;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pcolor) 12%, transparent);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
        transition: width 0.24s ease;
    }
}

.pet-reset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-top: 14px;
    padding: 13px 15px;
    border: 1px dashed color-mix(in srgb, #e05454 32%, var(--admin-line, var(--gray1)));
    border-radius: 13px;
    background: color-mix(in srgb, #e05454 4%, var(--bgColor2));

    :deep(.yk-button) {
        flex: none;
    }
}

.pet-reset-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 12px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        line-height: 1.5;
    }
}

.pet-task-count {
    flex: none;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pcolor) 10%, transparent);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
}

.pet-task-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.pet-task {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 7px;
    padding: 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 14px;
    background: var(--bgColor2);
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;

    &.is-done {
        border-color: color-mix(in srgb, var(--pcolor) 30%, transparent);
        background:
            linear-gradient(140deg, color-mix(in srgb, var(--pcolor) 9%, transparent), transparent 70%),
            var(--bgColor2);
    }

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    p {
        min-height: 36px;
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-task-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.pet-task-icon {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 10px;
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    font-size: 18px;
}

.pet-task-state {
    flex: none;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--bgColor1);
    color: var(--admin-muted, var(--gray6));
    font-size: 10px;
    font-weight: 600;

    &.is-done {
        background: color-mix(in srgb, var(--pcolor) 12%, transparent);
        color: var(--pcolor);
    }
}

.pet-task-reward {
    margin-top: auto;
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 600;
}

.pet-achievement-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
}

.pet-achievement-group {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.pet-achievement-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--admin-text, var(--gray));
    font-size: 12px;
    font-weight: 650;

    small {
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        font-variant-numeric: tabular-nums;
    }
}

.pet-milestone-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.pet-milestone {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 10px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    font-variant-numeric: tabular-nums;

    &.is-achieved {
        border-color: color-mix(in srgb, var(--pcolor) 30%, transparent);
        background: color-mix(in srgb, var(--pcolor) 7%, var(--bgColor2));
        color: var(--pcolor);
    }
}

.pet-milestone-target {
    font-weight: 650;
}

.pet-milestone-track {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gray6) 16%, transparent);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--pcolor), var(--pcolor8));
        transition: width 0.24s ease;
    }
}

.pet-milestone-state {
    text-align: right;
}

.pet-milestone-new {
    display: inline-block;
    margin-right: 4px;
    padding: 0 5px;
    border-radius: 999px;
    background: #ff4d6d;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 15px;
    vertical-align: 1px;
}

.pet-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 15px 0;

    & + & {
        border-top: 1px solid var(--admin-line, var(--gray1));
    }
}

.pet-row-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }

    p {
        margin: 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.55;
    }
}

.pet-choice-group {
    display: inline-flex;
    flex: none;
    flex-wrap: wrap;
    gap: 3px;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
}

.pet-choice {
    padding: 6px 13px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;

    &.is-active {
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        box-shadow: 0 4px 12px var(--pcolor3);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
}

.pet-range {
    display: flex;
    width: 260px;
    flex: none;
    align-items: center;
    gap: 12px;

    input[type='range'] {
        width: 200px;
        accent-color: var(--pcolor);
        cursor: pointer;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
    }

    span {
        min-width: 42px;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        text-align: right;
    }
}

.pet-home-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
    padding: 16px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 24px;
    background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--pcolor) 12%, transparent), transparent 34%),
        linear-gradient(160deg, var(--admin-surface, var(--bgColor1)), var(--bgColor2));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.pet-home-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;

    h2 {
        margin: 2px 0 0;
        color: var(--admin-text, var(--gray));
        font-size: 18px;
        font-weight: 730;
    }

    p {
        margin: 5px 0 0;
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
        line-height: 1.5;
    }
}

.pet-home-kicker {
    color: var(--pcolor);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.18em;
}

.pet-home-status {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid color-mix(in srgb, var(--scolor, #1fb4a2) 24%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--scolor, #1fb4a2) 8%, transparent);
    color: var(--scolor, #1fb4a2);
    font-size: 11px;
    font-weight: 650;

    > span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
    }
}

.pet-home-room {
    position: relative;
    isolation: isolate;
    min-height: clamp(450px, 46vh, 580px);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, #8f6a4e 16%, var(--admin-line, var(--gray1)));
    border-radius: 20px;
    background: #dff0c9;
    box-shadow:
        inset 0 0 0 5px rgba(255, 255, 255, 0.34),
        inset 0 -18px 34px rgba(65, 91, 48, 0.12);
}

.pet-home-interior {
    position: absolute;
    z-index: 3;
    top: 0;
    bottom: 0;
    left: 0;
    width: 46%;
    overflow: hidden;
    background:
        linear-gradient(180deg,
            #fdf8f1 0%,
            #fbf3e8 56%,
            transparent 56%),
        linear-gradient(180deg,
            transparent 56%,
            #e6c4a2 56%,
            #d3a97e 100%);
    box-shadow:
        6px 0 0 #f7e9d8,
        12px 0 26px rgba(77, 61, 44, 0.16);

    &::before {
        position: absolute;
        inset: 0 0 44%;
        content: '';
        opacity: 0.4;
        background-image:
            radial-gradient(circle,
                color-mix(in srgb, var(--pcolor) 24%, transparent) 1px,
                transparent 1.4px);
        background-size: 22px 22px;
        pointer-events: none;
    }

    &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 44%;
        content: '';
        opacity: 0.32;
        background:
            repeating-linear-gradient(90deg,
                transparent 0 47px,
                rgba(104, 64, 36, 0.2) 47px 48px);
        pointer-events: none;
    }
}

.pet-home-yard {
    position: absolute;
    z-index: 1;
    inset: 0 0 0 46%;
    overflow: hidden;
    background:
        radial-gradient(circle at 82% 12%, rgba(255, 244, 188, 0.78), transparent 22%),
        linear-gradient(180deg,
            #dff0ff 0%,
            #eef8ff 38%,
            #f6fbef 46%,
            #cfe8a8 46%,
            #b9dc8c 100%);
}

.pet-home-yard :where(button) {
    border: 0;
    padding: 0;
    color: inherit;
    background: none;
    font: inherit;
    cursor: pointer;
    appearance: none;
}

.pet-home-yard :where(button):focus-visible {
    z-index: 6;
    outline: 3px solid color-mix(in srgb, var(--pcolor) 72%, white);
    outline-offset: 3px;
}

.pet-home-sun {
    position: absolute;
    top: 8%;
    right: 12%;
    width: 13%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 34%, #fffbe0, #ffe27a 64%, #ffd45f 100%);
    box-shadow:
        0 0 0 8px rgba(255, 226, 122, 0.16),
        0 0 30px rgba(255, 226, 122, 0.52);
    animation: pet-yard-sun 7s ease-in-out infinite;
}

.pet-home-cloud {
    position: absolute;
    height: 4.5%;
    min-height: 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.86);
    animation: pet-yard-cloud 26s ease-in-out infinite alternate;

    &::before,
    &::after {
        position: absolute;
        bottom: 38%;
        content: '';
        border-radius: 50%;
        background: inherit;
    }

    &::before {
        left: 16%;
        width: 38%;
        aspect-ratio: 1;
    }

    &::after {
        right: 14%;
        width: 52%;
        aspect-ratio: 1;
    }
}

.pet-home-cloud-a {
    top: 15%;
    left: 7%;
    width: 34%;
}

.pet-home-cloud-b {
    top: 27%;
    right: 10%;
    width: 24%;
    opacity: 0.68;
    animation-duration: 32s;
}

.pet-home-hill {
    position: absolute;
    bottom: 48%;
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
}

.pet-home-hill-a {
    left: -14%;
    width: 80%;
    height: 17%;
    background: #c6e1ab;
}

.pet-home-hill-b {
    right: -18%;
    width: 74%;
    height: 13%;
    background: #b5d795;
}

.pet-home-fence {
    position: absolute;
    top: 47%;
    right: 0;
    left: 0;
    height: 7%;
    opacity: 0.92;
    background:
        repeating-linear-gradient(90deg,
            #fffaf0 0 6px,
            transparent 6px 18px);

    &::before,
    &::after {
        position: absolute;
        right: 0;
        left: 0;
        height: 2px;
        content: '';
        background: rgba(255, 250, 240, 0.86);
    }

    &::before {
        top: 30%;
    }

    &::after {
        top: 68%;
    }
}

.pet-home-path {
    position: absolute;
    bottom: 3%;
    left: 3%;
    width: 34%;
    height: 31%;
    opacity: 0.9;
    background:
        radial-gradient(ellipse 19% 7% at 18% 92%, #f1e5cf 98%, transparent 100%),
        radial-gradient(ellipse 16% 6% at 40% 74%, #f6ecda 98%, transparent 100%),
        radial-gradient(ellipse 17% 6% at 56% 56%, #eee1ca 98%, transparent 100%),
        radial-gradient(ellipse 14% 5% at 72% 38%, #f6ecda 98%, transparent 100%);
}

.pet-home-tree {
    position: absolute;
    top: 26%;
    right: 2%;
    width: 24%;
    height: 23%;
}

.pet-home-tree-trunk {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 12%;
    height: 45%;
    transform: translateX(-50%);
    border-radius: 4px 4px 0 0;
    background: linear-gradient(90deg, #9a6b48, #7d5235);
}

.pet-home-tree-canopy {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 76%;
    border-radius: 50% 50% 44% 44%;
    background:
        radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.3), transparent 38%),
        linear-gradient(145deg, #b9e08c, #7fbe62 68%, #69a84f);
    box-shadow: inset -8px -8px 0 rgba(62, 107, 44, 0.16);
    transform-origin: 50% 100%;
    animation: pet-yard-sway 8s ease-in-out infinite;
}

.pet-home-coop {
    position: absolute;
    z-index: 2;
    top: 46%;
    right: 4%;
    width: 29%;
    height: 12%;
    transition: filter 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-1px);
    }

    &.is-ready {
        filter: drop-shadow(0 0 8px rgba(255, 205, 90, 0.78));
    }
}

.pet-home-coop-wall {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 72%;
    border-radius: 5px 5px 3px 3px;
    background: linear-gradient(180deg, #f8ddc8, #e8b894);
    box-shadow: inset 0 -6px 0 rgba(150, 91, 54, 0.12);
}

.pet-home-coop-roof {
    position: absolute;
    z-index: 1;
    top: 0;
    left: 2%;
    width: 96%;
    height: 42%;
    background: linear-gradient(180deg, #e39b78, #cc7c5c);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    filter: drop-shadow(0 3px 3px rgba(109, 60, 40, 0.16));
}

.pet-home-coop-door {
    position: absolute;
    z-index: 2;
    bottom: 0;
    left: 38%;
    width: 24%;
    height: 52%;
    border-radius: 50% 50% 0 0;
    background: #8a5a3b;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.14);
}

.pet-home-chicken {
    position: absolute;
    z-index: 3;
    right: -12%;
    bottom: -12%;
    font-size: 24px;
    font-weight: 400;
    filter: drop-shadow(0 4px 5px rgba(70, 49, 30, 0.16));
}

.pet-home-yard-badge {
    position: absolute;
    z-index: 4;
    display: grid;
    min-width: 22px;
    height: 22px;
    padding: 0 4px;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    font-size: 13px;
    font-weight: 400;
    line-height: 1;
    box-shadow: 0 4px 10px rgba(59, 42, 28, 0.2);
    animation: pet-yard-bob 2.4s ease-in-out infinite;
    pointer-events: none;
}

.pet-home-coop .is-egg {
    top: -18%;
    right: -8%;
}

.pet-home-coop .is-manure {
    top: 30%;
    right: -18%;
    font-size: 12px;
    animation-delay: 0.4s;
}

.pet-home-pasture .is-milk {
    top: -22%;
    right: -10%;
}

.pet-home-pasture .is-manure {
    top: 34%;
    right: -16%;
    font-size: 12px;
    animation-delay: 0.4s;
}

.pet-home-pond .is-fish {
    top: -10%;
    right: 6%;
}

.pet-home-pasture {
    position: absolute;
    z-index: 1;
    top: 64%;
    right: 50%;
    display: grid;
    width: 18%;
    height: 8%;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 14px;
    background:
        linear-gradient(180deg,
            rgba(202, 232, 166, 0.72),
            rgba(169, 209, 128, 0.58));
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.14),
        inset 0 0 12px rgba(96, 143, 65, 0.14);
    transition: filter 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-1px);
    }

    &.is-ready {
        filter: drop-shadow(0 0 8px rgba(255, 205, 90, 0.78));
    }

    &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 28%;
        content: '';
        border-radius: 0 0 12px 12px;
        background:
            repeating-linear-gradient(90deg,
                rgba(255, 255, 255, 0.72) 0 3px,
                transparent 3px 10px);
    }

    > b:not(.pet-home-yard-badge) {
        position: relative;
        z-index: 1;
        font-size: 22px;
        font-weight: 400;
        filter: drop-shadow(0 3px 4px rgba(70, 49, 30, 0.18));
    }
}

.pet-home-plots {
    position: absolute;
    right: 4%;
    top: 60%;
    display: grid;
    width: 46%;
    height: 20%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6%;
}

.pet-home-plot {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: space-evenly;
    overflow: hidden;
    padding: 8% 6% 7%;
    border-radius: 12px;
    background:
        repeating-linear-gradient(180deg,
            #8a5c3b 0 6px,
            #7c5033 6px 12px);
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.12),
        0 5px 10px rgba(70, 49, 30, 0.16);
    transition: transform 0.18s ease, box-shadow 0.18s ease;

    &:hover {
        transform: translateY(-2px);
    }

    &.is-empty {
        background:
            repeating-linear-gradient(180deg,
                #946542 0 6px,
                #855638 6px 12px);
    }

    &.is-ready {
        animation: pet-plot-ready 1.8s ease-in-out infinite;
    }

    &::before {
        position: absolute;
        inset: 0;
        content: '';
        border-radius: inherit;
        background: radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.18), transparent 62%);
    }

    b:not(.pet-home-plot-crop) {
        position: relative;
        width: 15%;
        height: 34%;
        border-radius: 999px 999px 4px 4px;
        background: linear-gradient(180deg, #7ec25e, #4e9a42);
        box-shadow: inset -2px 0 0 rgba(255, 255, 255, 0.16);
        transform-origin: bottom center;

        &::before,
        &::after {
            position: absolute;
            top: 18%;
            width: 74%;
            height: 42%;
            content: '';
            border-radius: 50%;
            background: #8ed06a;
        }

        &::before {
            left: -46%;
            transform: rotate(-26deg);
        }

        &::after {
            right: -46%;
            transform: rotate(26deg);
        }
    }

    b:nth-child(2) {
        height: 47%;
    }

    b:nth-child(3) {
        height: 29%;
    }
}

.pet-home-plot-crop {
    position: absolute;
    top: 3%;
    right: 4%;
    z-index: 2;
    font-size: 18px;
    font-weight: 400;
    line-height: 1;
    filter: drop-shadow(0 3px 4px rgba(70, 49, 30, 0.2));
    animation: pet-yard-bob 2.4s ease-in-out infinite;
    pointer-events: none;
}

.pet-home-plot-water {
    position: absolute;
    top: 4%;
    left: 4%;
    z-index: 2;
    font-size: 10px;
    font-style: normal;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgba(52, 106, 135, 0.22));
    pointer-events: none;
}

.pet-home-plot-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.56);
    font-size: 20px;
    font-weight: 300;
    line-height: 1;
    pointer-events: none;
}

.pet-home-pond {
    position: absolute;
    right: 4%;
    bottom: 4%;
    width: 46%;
    height: 14%;
    overflow: hidden;
    border-radius: 50%;
    background:
        radial-gradient(ellipse at 50% 38%,
            #c9eef7 0 42%,
            #98dcec 43% 70%,
            #75c4de 71% 100%);
    box-shadow:
        inset 0 6px 12px rgba(255, 255, 255, 0.38),
        0 6px 14px rgba(58, 123, 140, 0.18);
    transition: filter 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-1px);
    }

    &.is-ready {
        filter: drop-shadow(0 0 8px rgba(255, 205, 90, 0.72));
    }
}

.pet-home-pond-ripple {
    position: absolute;
    border: 1.5px solid rgba(255, 255, 255, 0.56);
    border-radius: 50%;
    animation: pet-yard-ripple 4.8s ease-in-out infinite;
}

.pet-home-pond-ripple-a {
    top: 24%;
    left: 18%;
    width: 34%;
    height: 26%;
}

.pet-home-pond-ripple-b {
    right: 14%;
    bottom: 20%;
    width: 24%;
    height: 20%;
    animation-delay: 1.6s;
}

.pet-home-reeds {
    position: absolute;
    right: 4%;
    bottom: 6%;
    font-size: 22px;
    font-weight: 400;
    filter: drop-shadow(0 3px 4px rgba(58, 123, 140, 0.2));
}

.pet-home-sign {
    position: absolute;
    bottom: 44%;
    left: 4%;
    padding: 4px 8px;
    border: 2px solid #a97852;
    border-radius: 4px;
    background: #f7e6cf;
    box-shadow: 0 4px 8px rgba(70, 49, 30, 0.14);
    color: #8a5a3b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    transform: rotate(-3deg);
}

@keyframes pet-yard-sun {
    0%,
    100% {
        transform: scale(1);
        filter: brightness(1);
    }

    50% {
        transform: scale(1.05);
        filter: brightness(1.06);
    }
}

@keyframes pet-yard-cloud {
    from {
        transform: translateX(-4%);
    }

    to {
        transform: translateX(5%);
    }
}

@keyframes pet-yard-sway {
    0%,
    100% {
        transform: rotate(-1.5deg);
    }

    50% {
        transform: rotate(1.5deg);
    }
}

@keyframes pet-yard-ripple {
    0%,
    100% {
        opacity: 0.4;
        transform: scale(0.92);
    }

    50% {
        opacity: 0.9;
        transform: scale(1.06);
    }
}

@keyframes pet-yard-bob {
    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-3px);
    }
}

@keyframes pet-plot-ready {
    0%,
    100% {
        box-shadow:
            inset 0 0 0 2px rgba(255, 255, 255, 0.2),
            0 0 0 1px rgba(255, 215, 120, 0.35),
            0 5px 12px rgba(70, 49, 30, 0.18);
    }

    50% {
        box-shadow:
            inset 0 0 0 2px rgba(255, 255, 255, 0.3),
            0 0 0 3px rgba(255, 215, 120, 0.5),
            0 0 18px rgba(255, 205, 90, 0.52);
    }
}

.pet-home-window {
    position: absolute;
    top: 8%;
    left: 50%;
    width: 52%;
    aspect-ratio: 4 / 3;
    transform: translateX(-50%);
    overflow: hidden;
    border: 6px solid rgba(255, 255, 255, 0.9);
    border-radius: 48% 48% 10px 10px;
    background: linear-gradient(180deg, #182e62, #4366a5 62%, #8cb0d8);
    box-shadow:
        0 10px 24px rgba(48, 73, 121, 0.16),
        inset 0 0 0 1px rgba(26, 46, 96, 0.12);

    &::before,
    &::after {
        position: absolute;
        content: '';
        background: rgba(255, 255, 255, 0.62);
    }

    &::before {
        top: 0;
        bottom: 0;
        left: 50%;
        width: 3px;
        transform: translateX(-50%);
    }

    &::after {
        top: 50%;
        right: 0;
        left: 0;
        height: 3px;
        transform: translateY(-50%);
    }
}

.pet-home-moon {
    position: absolute;
    top: 17%;
    right: 15%;
    width: 15%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff2b0;
    box-shadow: 0 0 18px rgba(255, 242, 176, 0.72);
}

.pet-home-star {
    position: absolute;
    width: 5%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.7);
}

.pet-home-star-a {
    top: 26%;
    left: 18%;
}

.pet-home-star-b {
    top: 50%;
    left: 29%;
}

.pet-home-curtain {
    position: absolute;
    top: 6%;
    z-index: 1;
    width: 18%;
    height: 23%;
    border-radius: 14px 10px 26px 12px;
    background:
        repeating-linear-gradient(90deg,
            rgba(255, 255, 255, 0.9) 0 9px,
            color-mix(in srgb, var(--pcolor) 18%, #e3edff) 9px 16px);
    opacity: 0.86;
    box-shadow: 0 10px 20px rgba(71, 96, 143, 0.1);
}

.pet-home-curtain-left {
    left: 4%;
    transform: rotate(4deg);
    transform-origin: top right;
}

.pet-home-curtain-right {
    right: 4%;
    transform: rotate(-4deg) scaleX(-1);
    transform-origin: top left;
}

.pet-home-shelf {
    position: absolute;
    top: 29%;
    left: 7%;
    width: 27%;
    height: 8px;
    border-radius: 4px;
    background: #a97852;
    box-shadow: 0 5px 0 rgba(126, 82, 50, 0.16);

    i {
        position: absolute;
        bottom: 9px;
        width: 14%;
        border-radius: 3px 3px 0 0;
        background: var(--pcolor);
    }

    i:nth-child(1) {
        left: 12%;
        height: 26px;
        opacity: 0.68;
    }

    i:nth-child(2) {
        left: 31%;
        height: 20px;
        background: var(--scolor, #1fb4a2);
        opacity: 0.65;
    }

    i:nth-child(3) {
        left: 50%;
        height: 29px;
        background: #e9976e;
        opacity: 0.8;
    }
}

.pet-home-picture {
    position: absolute;
    top: 10%;
    right: 5%;
    display: grid;
    width: 16%;
    aspect-ratio: 1;
    place-items: center;
    border: 4px solid #fff8ef;
    border-radius: 12px;
    background: color-mix(in srgb, var(--pcolor) 16%, #fff);
    box-shadow: 0 7px 14px rgba(101, 70, 44, 0.12);
    color: var(--pcolor);
    font-size: 15px;
}

.pet-home-clock {
    position: absolute;
    top: 37%;
    left: 8%;
    width: 14%;
    aspect-ratio: 1;
    border: 3px solid #fff8ef;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #fffdf8, #f0e2ce);
    box-shadow: 0 6px 12px rgba(101, 70, 44, 0.12);

    &::before,
    &::after {
        position: absolute;
        bottom: 50%;
        left: 50%;
        content: '';
        border-radius: 2px;
        background: #8a6a4f;
        transform-origin: bottom center;
    }

    &::before {
        width: 2px;
        height: 28%;
        transform: translateX(-50%) rotate(42deg);
    }

    &::after {
        width: 2px;
        height: 20%;
        transform: translateX(-50%) rotate(-68deg);
    }
}

.pet-home-door {
    position: absolute;
    right: 1%;
    bottom: 44%;
    width: 24%;
    height: 26%;
    border-radius: 46% 46% 4px 4px / 24% 24% 4px 4px;
    background: linear-gradient(100deg, #b9855d, #9a6b48 60%, #845a3c);
    box-shadow:
        inset 0 0 0 3px #f6e6d2,
        inset 0 0 0 5px rgba(120, 76, 47, 0.22),
        0 8px 16px rgba(83, 54, 34, 0.18);

    &::before {
        position: absolute;
        inset: 12% 18% 10%;
        content: '';
        border: 2px solid rgba(255, 240, 220, 0.34);
        border-radius: 40% 40% 3px 3px / 18% 18% 3px 3px;
    }

    &::after {
        position: absolute;
        right: 18%;
        bottom: 30%;
        width: 9%;
        aspect-ratio: 1;
        content: '';
        border-radius: 50%;
        background: #f4d58c;
        box-shadow: 0 0 0 2px rgba(120, 76, 47, 0.24);
    }
}

.pet-home-plant {
    position: absolute;
    right: 5%;
    bottom: 10%;
    z-index: 1;
    font-size: 36px;
    filter: drop-shadow(0 8px 10px rgba(62, 84, 50, 0.16));
    transform: rotate(-4deg);
}

.pet-home-rug {
    position: absolute;
    bottom: 3.5%;
    left: 50%;
    width: 82%;
    height: 10%;
    min-height: 44px;
    transform: translateX(-50%);
    border-radius: 50%;
    background:
        radial-gradient(ellipse, transparent 42%, rgba(255, 255, 255, 0.52) 43% 48%, transparent 49%),
        repeating-linear-gradient(90deg, #eab8a4 0 18px, #e7aa93 18px 36px);
    box-shadow: 0 8px 18px rgba(99, 58, 33, 0.16);
    opacity: 0.9;
}

.pet-home-cushion {
    position: absolute;
    bottom: 8%;
    left: 9%;
    width: 24%;
    height: 6%;
    min-height: 26px;
    border-radius: 18px 18px 14px 14px;
    background: linear-gradient(145deg, #e8f0ff, #bfd1ee);
    box-shadow: 0 7px 12px rgba(69, 91, 130, 0.14);
    transform: rotate(-4deg);
}

.pet-home-bowl {
    position: absolute;
    right: 8%;
    bottom: 5%;
    z-index: 1;
    font-size: 28px;
    filter: drop-shadow(0 5px 7px rgba(82, 49, 27, 0.18));
}

.pet-home-room-note {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 5;
    padding: 5px 9px;
    border: 1px solid rgba(255, 255, 255, 0.56);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.48);
    color: rgba(56, 74, 105, 0.72);
    font-size: 10px;
    backdrop-filter: blur(5px);
    pointer-events: none;
}

.pet-homestead-tools {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pet-homestead-seeds {
    display: flex;
    flex: 1;
    min-width: 0;
    gap: 4px;
    overflow-x: auto;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--bgColor2);
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.pet-homestead-seed {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;

    span {
        font-size: 14px;
    }

    small {
        font-size: 10px;
    }

    &.is-active {
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        box-shadow: 0 4px 10px var(--pcolor3);
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
}

.pet-homestead-tend {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 5px;
    min-height: 38px;
    padding: 0 11px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 6px 14px var(--pcolor3);
    transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease;

    span {
        font-size: 14px;
    }

    &:hover:not(:disabled) {
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        box-shadow: none;
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
}

.pet-homestead-tend-count {
    position: absolute;
    top: -6px;
    right: -6px;
    display: grid;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    place-items: center;
    border-radius: 999px;
    background: #ffb44d;
    color: #5a3200;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 2px 6px rgba(90, 50, 0, 0.18);
}

.pet-homestead-store {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    overflow-x: auto;
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
    scrollbar-width: thin;
}

.pet-homestead-store-label {
    flex: none;
    color: var(--admin-text, var(--gray));
    font-weight: 650;
}

.pet-homestead-item {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    padding: 3px 7px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--admin-surface, var(--bgColor1));
    white-space: nowrap;

    span {
        font-size: 12px;
    }
}

.pet-homestead-store-empty {
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
}

.pet-homestead-auto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    border: 1px dashed color-mix(in srgb, var(--pcolor) 26%, var(--admin-line, var(--gray1)));
    border-radius: 12px;
    background: color-mix(in srgb, var(--pcolor) 5%, var(--admin-surface, var(--bgColor1)));
}

.pet-homestead-auto-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 11px;
        font-weight: 650;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 10px;
        line-height: 1.45;
    }
}

.pet-homestead-auto-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 7px;
}

.pet-homestead-auto-now {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 30px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--pcolor) 28%, var(--admin-line, var(--gray1)));
    border-radius: 9px;
    background: var(--admin-surface, var(--bgColor1));
    color: var(--pcolor);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.18s ease, transform 0.18s ease;

    span {
        font-size: 13px;
    }

    &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--pcolor) 10%, var(--admin-surface, var(--bgColor1)));
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    &:focus-visible {
        outline: 2px solid var(--pcolor);
        outline-offset: 2px;
    }
}

.pet-home-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    button {
        display: flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 8px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 12px;
        background: var(--admin-surface, var(--bgColor1));
        color: var(--admin-text, var(--gray));
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;

        span {
            font-size: 15px;
        }

        &:first-child {
            border-color: transparent;
            background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
            color: #fff;
            box-shadow: 0 8px 18px var(--pcolor3);
        }

        &:last-child:nth-child(odd) {
            grid-column: 1 / -1;
        }

        &:hover:not(:disabled) {
            transform: translateY(-1px);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
    }
}

.pet-home-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 1px;

    button {
        padding: 0;
        border: none;
        background: transparent;
        color: var(--admin-muted, var(--gray6));
        font: inherit;
        font-size: 11px;
        cursor: pointer;
        transition: color 0.18s ease;

        &:hover:not(:disabled) {
            color: var(--pcolor);
        }

        &:last-child {
            color: var(--pcolor);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
    }
}

@media (max-width: 1420px) {
    .pet-manage-grid {
        grid-template-columns: minmax(0, 1fr) minmax(420px, 0.78fr);
    }
}

@media (max-height: 940px) and (min-width: 1181px) {
    .pet-manage-side {
        position: static;
    }
}

@media (max-width: 1180px) {
    .pet-manage-grid {
        grid-template-columns: 1fr;
    }

    .pet-manage-side {
        position: static;
        order: -1;
    }

    .pet-home-room {
        min-height: 500px;
    }
}

@media (max-width: 760px) {
    .pet-hero {
        align-items: flex-start;
        flex-direction: column;
        padding: 22px 20px;
    }

    .pet-hero-actions {
        width: 100%;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    .pet-card {
        padding: 18px 16px;
    }

    .pet-card-badges {
        justify-content: flex-start;
    }

    .pet-snack-head {
        flex-direction: column;
        align-items: flex-start;
    }

    .pet-snack-grid {
        grid-template-columns: 1fr;
    }

    .pet-name-row,
    .pet-row,
    .pet-next-row,
    .pet-reset-row {
        align-items: stretch;
        flex-direction: column;
        gap: 12px;
    }

    .pet-name-field input {
        width: 100%;
    }

    .pet-stat-grid,
    .pet-task-list,
    .pet-achievement-groups {
        grid-template-columns: 1fr;
    }

    .pet-home-room {
        min-height: 460px;
    }

    .pet-home-room-note {
        display: none;
    }

    .pet-home-interior {
        width: 48%;
    }

    .pet-home-yard {
        left: 48%;
    }

    .pet-home-window {
        border-width: 4px;
    }

    .pet-home-curtain {
        width: 16%;
        height: 21%;
    }

    .pet-home-shelf i:nth-child(1) {
        height: 18px;
    }

    .pet-home-shelf i:nth-child(2) {
        height: 14px;
    }

    .pet-home-shelf i:nth-child(3) {
        height: 21px;
    }

    .pet-home-picture {
        border-width: 3px;
        font-size: 11px;
    }

    .pet-home-plant {
        font-size: 28px;
    }

    .pet-home-bowl {
        font-size: 22px;
    }

    .pet-home-chicken {
        font-size: 18px;
    }

    .pet-home-pasture b {
        font-size: 16px;
    }

    .pet-home-reeds {
        font-size: 16px;
    }

    .pet-home-sign {
        display: none;
    }

    .pet-homestead-seed {
        padding: 5px 7px;

        small {
            display: none;
        }
    }

    .pet-homestead-tend {
        padding: 0 9px;
    }

    .pet-home-yard-badge {
        min-width: 19px;
        height: 19px;
        font-size: 11px;
    }

    .pet-home-plot-crop {
        font-size: 15px;
    }

    .pet-next-progress,
    .pet-range {
        width: 100%;
    }

    .pet-range input[type='range'] {
        width: auto;
        flex: 1;
    }

    .pet-choice-group {
        align-self: flex-start;
    }
}

@media (prefers-reduced-motion: reduce) {
    .pet-stat-track span,
    .pet-milestone-track span,
    .pet-next-progress span,
    .pet-home-sun,
    .pet-home-cloud,
    .pet-home-tree-canopy,
    .pet-home-pond-ripple,
    .pet-home-plot,
    .pet-home-plot.is-ready,
    .pet-home-plot-crop,
    .pet-home-yard-badge {
        animation: none;
        transition: none;
    }

    .pet-home-coop:hover,
    .pet-home-pasture:hover,
    .pet-home-pond:hover,
    .pet-home-plot:hover {
        transform: none;
    }
}
</style>
