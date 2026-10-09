<script setup>
import { computed } from 'vue';
import { touch, episodeCategories } from '../lib/store.js';

const props = defineProps({ episode: { type: Object, required: true } });
const emit = defineEmits(['remove']);

function set(field, value) {
  props.episode[field] = value;
  touch(props.episode);
}

// タグは読点・カンマ・空白区切りで入力する
function setTags(value) {
  set(
    'tags',
    value
      .split(/[、,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

const categories = computed(episodeCategories);

function confirmRemove() {
  if (confirm(`「${props.episode.title}」を削除しますか？`)) emit('remove');
}
</script>

<template>
  <div class="card editor">
    <label class="field">
      <span>タイトル（本番中に一目で思い出せる短い名前）</span>
      <input class="input" :value="episode.title" placeholder="例：学園祭の来場者数を1.5倍にした話" @input="set('title', $event.target.value)" />
    </label>
    <!-- 入力中に一覧の並びが動かないよう、確定時（@change）に保存する -->
    <label class="field">
      <span>分類（一覧をこの名前ごとにまとめます。既存の分類は候補から選べます）</span>
      <input
        class="input"
        list="episode-categories"
        :value="episode.category ?? ''"
        placeholder="例：AI駆動開発"
        @change="set('category', $event.target.value.trim())"
      />
      <datalist id="episode-categories">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
    </label>
    <label class="field">
      <span>タグ（読点・スペース区切り）</span>
      <input
        class="input"
        :value="episode.tags.join('、')"
        placeholder="例：リーダーシップ、課題解決、チームワーク"
        @change="setTags($event.target.value)"
      />
    </label>
    <label class="field">
      <span>本文（状況・課題・行動・結果）</span>
      <textarea class="textarea" rows="10" :value="episode.body" @input="set('body', $event.target.value)" />
    </label>
    <div class="actions">
      <span class="muted small">{{ episode.body.length }} 字</span>
      <button class="btn btn-danger" @click="confirmRemove">このエピソードを削除</button>
    </div>
  </div>
</template>

<style scoped>
.editor { display: grid; gap: 12px; }
.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
