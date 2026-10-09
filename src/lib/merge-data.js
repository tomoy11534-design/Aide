// 2か所のデータ（ファイルとブラウザ）を合わせる処理（画面に依存しないので単体で確かめられる）

export const COLLECTIONS = ['companies', 'episodes', 'records'];

function time(value) {
  return value ? new Date(value).getTime() : 0;
}

/**
 * ファイルの内容（remote）とこのブラウザの内容（local）を合わせる
 * ・両方にある：更新日時が新しい方を残す
 * ・片方にしかない：前回の同期（syncedAt）より後に作成・更新されたものは残す。
 *   前回の同期より前からあったのに片方にないものは、もう片方で削除されたとみなして消す
 * ・一度も同期していない（syncedAt なし）ときは、どちらか一方にしかないものもすべて残す
 */
export function mergeData(remote, local, syncedAt) {
  const since = time(syncedAt);
  const keep = (item) => !since || time(item.updatedAt) > since;
  const result = {};
  for (const key of COLLECTIONS) {
    const remoteMap = new Map((remote[key] ?? []).map((item) => [item.id, item]));
    const localMap = new Map((local[key] ?? []).map((item) => [item.id, item]));
    const merged = [];
    for (const item of remote[key] ?? []) {
      const other = localMap.get(item.id);
      if (other) merged.push(time(other.updatedAt) > time(item.updatedAt) ? other : item);
      else if (keep(item)) merged.push(item);
    }
    for (const item of local[key] ?? []) {
      if (!remoteMap.has(item.id) && keep(item)) merged.push(item);
    }
    result[key] = merged;
  }
  result.settings = { ...(remote.settings ?? {}), ...(local.settings ?? {}) };
  return result;
}
