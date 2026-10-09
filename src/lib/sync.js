// サーバーのデータファイルとの同期
// ・ブラウザの localStorage はすぐに表示するための控えとして残し、正本はサーバーのファイルとする
// ・ファイルは OneDrive 等で同期されるため、別のパソコンで保存された内容が届くことがある
// ・ファイルの内容で置き換えることはせず、必ずこのブラウザのデータと合わせる（mergeData）
//   空のブラウザ（別のブラウザ・プレビュー等）で開いても、既存のデータを消さないため
import { watch } from 'vue';
import { store, DEFAULT_SETTINGS } from './store.js';
import { mergeData, COLLECTIONS } from './merge-data.js';
// 入力が落ち着いてから保存する
const SAVE_DELAY_MS = 600;
// このブラウザで最後に同期したバージョンと、そのファイルの保存日時・未保存の変更があるか
const VERSION_KEY = 'aide:syncVersion';
const SYNCED_AT_KEY = 'aide:syncedAt';
const DIRTY_KEY = 'aide:syncDirty';

const state = {
  enabled: false,
  version: 0,
  lastJson: '',
  timer: null,
  saving: false,
  again: false,
};

// localStorage が使えない環境でも落ちないように包む
function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 控えの記録に失敗しても同期自体は続ける
  }
}

function setDirty(dirty) {
  writeLocal(DIRTY_KEY, dirty ? '1' : null);
}

// ファイルのどのバージョンまで取り込んだか（savedAt は削除の判定に使う）
function setSynced(version, savedAt) {
  state.version = version;
  writeLocal(VERSION_KEY, String(version));
  if (savedAt) writeLocal(SYNCED_AT_KEY, savedAt);
}

function snapshot() {
  return {
    companies: store.companies,
    episodes: store.episodes,
    records: store.records,
    settings: store.settings,
  };
}

// Vue のリアクティブなデータは structuredClone で複製できないため、JSON を通して複製する
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyData(data) {
  for (const key of COLLECTIONS) store[key] = clone(data[key] ?? []);
  store.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
}

// 合わせた結果がファイルの内容と同じか（同じなら保存し直さない）
function signature(data) {
  const parts = COLLECTIONS.map((key) =>
    (data[key] ?? [])
      .map((item) => `${item.id}@${item.updatedAt}`)
      .sort()
      .join(','),
  );
  return `${parts.join('|')}|${JSON.stringify({ ...DEFAULT_SETTINGS, ...(data.settings ?? {}) })}`;
}

// ファイルの内容を取り込む。このブラウザのデータと合わせ、違いがあれば保存し直す
function absorb(saved, localData) {
  const merged = mergeData(saved.data, localData, readLocal(SYNCED_AT_KEY));
  applyData(merged);
  setSynced(saved.version, saved.savedAt);
  store.sync.savedAt = saved.savedAt;
  state.lastJson = signature(merged) === signature(saved.data) ? JSON.stringify(snapshot()) : '';
}

function scheduleSave(delay = SAVE_DELAY_MS) {
  clearTimeout(state.timer);
  state.timer = setTimeout(save, delay);
}

async function save() {
  if (!state.enabled) return;
  if (state.saving) {
    state.again = true;
    return;
  }
  const json = JSON.stringify(snapshot());
  if (json === state.lastJson) {
    setDirty(false);
    return;
  }
  state.saving = true;
  try {
    let res;
    try {
      res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: `{"baseVersion":${state.version},"data":${json}}`,
      });
    } catch {
      throw new Error('サーバーに接続できないため、ファイルに保存できていません。npm run dev で起動しているか確認してください（このブラウザの中には保存されています）。');
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      // 別のパソコンの保存が先に届いていたので、合わせてから保存し直す
      absorb(body, JSON.parse(json));
      state.again = true;
    } else if (!res.ok) {
      throw new Error(body.error || `ファイルに保存できませんでした（${res.status}）`);
    } else {
      state.lastJson = json;
      setSynced(body.version, body.savedAt);
      setDirty(false);
      store.sync.savedAt = body.savedAt;
      store.sync.error = '';
    }
  } catch (error) {
    store.sync.error = error.message;
  } finally {
    state.saving = false;
    if (state.again) {
      state.again = false;
      scheduleSave(0);
    }
  }
}

async function fetchSaved() {
  const res = await fetch('/api/data');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `データファイルを読み込めませんでした（${res.status}）`);
  return body;
}

// 起動時：ファイルの内容を読み込み、このブラウザの控えと合わせる
async function load() {
  let saved;
  try {
    saved = await fetchSaved();
  } catch (error) {
    store.sync.error = `${error.message} いまはこのブラウザの中だけに保存しています。`;
    return;
  }
  store.sync.file = saved.file;
  store.sync.savedAt = saved.savedAt;
  if (saved.data) {
    absorb(saved, clone(snapshot()));
  } else {
    // ファイルがまだない：このブラウザのデータでファイルを作る
    state.lastJson = '';
    state.version = 0;
  }
  state.enabled = true;
  store.sync.error = '';
  scheduleSave(0);
}

// 画面に戻ってきたとき：別のパソコンで更新されていれば取り込む
async function pull() {
  if (!state.enabled || state.saving) return;
  try {
    const saved = await fetchSaved();
    if (saved.data && saved.version !== state.version) {
      absorb(saved, clone(snapshot()));
      if (!state.lastJson) scheduleSave(0);
    }
    store.sync.error = '';
  } catch (error) {
    store.sync.error = error.message;
  }
}

export function startSync() {
  // データが変わったら、未保存の印を付けてから少し待って保存する（起動時の読み込み前の変更も失わないため）
  watch(
    () => [store.companies, store.episodes, store.records, store.settings],
    () => {
      setDirty(true);
      scheduleSave();
    },
    { deep: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
  });
  window.addEventListener('focus', pull);
  load();
}
