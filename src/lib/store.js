// アプリ全体のデータ（localStorage に自動保存する）
import { reactive, watch } from 'vue';

const PREFIX = 'aide:';
export const STORAGE_KEYS = ['companies', 'episodes', 'records', 'settings'];
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

// categoryOrder：エピソードの分類の表示順（分類名の配列）
export const DEFAULT_SETTINGS = { theme: 'system', fontScale: 'normal', categoryOrder: [] };

// localStorage が使えない環境（プライベートブラウズ等）でも落ちないように包む
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    store.saveError = '';
  } catch {
    store.saveError = 'ブラウザへの保存に失敗しました。容量不足の可能性があります。設定画面からエクスポートし、古い面接記録を削除してください。';
  }
}

export const store = reactive({
  companies: read('companies', []),
  episodes: read('episodes', []),
  records: read('records', []),
  settings: { ...DEFAULT_SETTINGS, ...read('settings', {}) },
  saveError: '',
});

for (const key of STORAGE_KEYS) {
  watch(() => store[key], (value) => write(key, value), { deep: true });
}

// 保存容量の使用量（UTF-16 のため1文字2バイトで概算）
export function storageUsage() {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    return { bytes: 0, ratio: 0 };
  }
  return { bytes, ratio: bytes / STORAGE_LIMIT_BYTES };
}

// ---- 共通ユーティリティ ----
export function newId() {
  return crypto.randomUUID();
}

export function now() {
  return new Date().toISOString();
}

// 新しいデータに ID と作成・更新日時を付ける
export function stamp(data) {
  const time = now();
  return { id: newId(), createdAt: time, updatedAt: time, ...data };
}

export function touch(item) {
  item.updatedAt = now();
}

export function findCompany(id) {
  return store.companies.find((c) => c.id === id) ?? null;
}

// エピソードを分類ごとにまとめる
// 並び順：設定で決めた順 → 順番未設定の分類は五十音順 → 未分類は最後
export function groupEpisodes(episodes) {
  const groups = new Map();
  for (const e of episodes) {
    const name = e.category?.trim() ?? '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(e);
  }
  const order = store.settings.categoryOrder ?? [];
  const rank = (name) => {
    const i = order.indexOf(name);
    return i < 0 ? Infinity : i;
  };
  return [...groups.entries()]
    .map(([name, list]) => ({ name, episodes: list }))
    .sort((a, b) => {
      if (!a.name) return 1;
      if (!b.name) return -1;
      // 両方とも順番未設定なら差が NaN になり、五十音順で比べる
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'ja');
    });
}

// 分類の表示順を1つ上（delta = -1）または下（delta = 1）に動かす
export function moveCategory(name, delta) {
  const names = episodeCategories();
  const i = names.indexOf(name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= names.length) return;
  [names[i], names[j]] = [names[j], names[i]];
  store.settings.categoryOrder = names;
}

// 登録済みの分類名の一覧（入力候補に使う）
export function episodeCategories() {
  return groupEpisodes(store.episodes)
    .map((g) => g.name)
    .filter(Boolean);
}
