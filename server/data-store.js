// 登録データのファイル保存
// ・ブラウザの中だけでなくファイルにも保存し、OneDrive 等で同期して複数のパソコンで同じデータを使えるようにする
// ・別のパソコンで先に保存されていた場合は、バージョン番号の食い違いで検知してブラウザ側で合わせ直させる
import { promises as fs } from 'node:fs';
import path from 'node:path';
import express from 'express';

const RENAME_RETRIES = 5;
// 上書き前の内容を残しておく世代数
const BACKUP_KEEP = 30;
const COLLECTIONS = ['companies', 'episodes', 'records'];

function countItems(data) {
  return COLLECTIONS.reduce((sum, key) => sum + (Array.isArray(data?.[key]) ? data[key].length : 0), 0);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDataRouter(root) {
  const dir = process.env.AIDE_DATA_DIR ? path.resolve(process.env.AIDE_DATA_DIR) : path.join(root, 'data');
  const file = path.join(dir, 'aide-data.json');
  const router = express.Router();
  // 面接記録が増えても保存できるよう、他の API より大きめの上限にする
  router.use(express.json({ limit: '20mb' }));

  async function readSaved() {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  // 書きかけのファイルが同期されないよう、一時ファイルに書いてから置き換える
  // OneDrive が同期中にファイルをつかんでいると置き換えに失敗するため、少し待って再試行する
  async function writeSaved(content) {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(content, null, 2), 'utf8');
    for (let i = 0; ; i++) {
      try {
        await fs.rename(tmp, file);
        return;
      } catch (error) {
        if (i >= RENAME_RETRIES || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        await wait(200 * (i + 1));
      }
    }
  }

  // 上書きする前の内容を data/backups/ に残す（設定画面のインポートでそのまま読み込める形式）
  async function backup(saved) {
    const backupDir = path.join(dir, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = (saved.savedAt ?? new Date().toISOString()).replace(/[:.]/g, '-');
    const content = { app: 'aide', version: 1, exportedAt: saved.savedAt, data: saved.data };
    await fs.writeFile(path.join(backupDir, `aide-data-v${saved.version}-${stamp}.json`), JSON.stringify(content), 'utf8');
    const names = (await fs.readdir(backupDir)).filter((n) => n.startsWith('aide-data-v')).sort();
    const old = names.slice(0, Math.max(0, names.length - BACKUP_KEEP));
    await Promise.all(old.map((n) => fs.unlink(path.join(backupDir, n)).catch(() => {})));
  }

  router.get('/', async (_req, res) => {
    try {
      const saved = await readSaved();
      res.json({ file, version: saved?.version ?? 0, savedAt: saved?.savedAt ?? null, data: saved?.data ?? null });
    } catch {
      res.status(500).json({ error: `データファイルを読み込めませんでした。ファイルが壊れていないか確認してください（${file}）` });
    }
  });

  // 保存が重なって途中の内容が混ざらないよう、1件ずつ順番に処理する
  let queue = Promise.resolve();

  router.put('/', (req, res) => {
    queue = queue.then(async () => {
      const { baseVersion, data } = req.body ?? {};
      if (!data || typeof data !== 'object') {
        res.status(400).json({ error: '保存するデータがありません。' });
        return;
      }
      try {
        const saved = await readSaved();
        const current = saved?.version ?? 0;
        // ブラウザが読み込んだ後に、別のパソコンの保存が同期されてきた場合
        if (current !== baseVersion) {
          res.status(409).json({ file, version: current, savedAt: saved?.savedAt ?? null, data: saved?.data ?? null });
          return;
        }
        // 中身のあるファイルを空のデータで上書きしようとした場合は、事故とみなして止める
        if (countItems(saved?.data) >= 2 && countItems(data) === 0) {
          res.status(422).json({
            error: '保存されているデータを空のデータで上書きしようとしたため、保存を止めました。画面を再読み込みしてください。',
          });
          return;
        }
        const next = { app: 'aide', version: current + 1, savedAt: new Date().toISOString(), data };
        if (saved?.data) await backup(saved).catch(() => {});
        await writeSaved(next);
        res.json({ version: next.version, savedAt: next.savedAt });
      } catch {
        res.status(500).json({ error: `データファイルに保存できませんでした（${file}）` });
      }
    });
  });

  return { router, file };
}
