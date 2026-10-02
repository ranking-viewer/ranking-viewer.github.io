// --- 状態管理・グローバル変数 ---
// 当日が1日目か2日目かを自動判定（2026/10/03 0:00 JST以降は2日目）
function detectTodayDay() {
  try {
    const now = new Date();
    const start = new Date('2026-10-03T00:00:00+09:00');
    return now >= start ? 'day2' : 'day1';
  } catch (e) {
    return 'day2';
  }
}

let currentTab = detectTodayDay();

// データキャッシュ（メモリ上）
let day1DataCache = [];
let day2DataCache = [];
let totalDataCache = [];

// ページ送り・交互表示管理
let currentPage = 0;
let autoPageTimer = null;
let day2ToggleState = 'day2'; // 'day2' または 'total'
const PAGE_ROTATE_INTERVAL = (typeof CONFIG !== 'undefined' && CONFIG.PAGE_ROTATE_INTERVAL) || 6000;

// --- 追加機能の状態 ---
let prevPositions = {};       // 前回の順位 { account_id: index }
let searchQuery = '';
let displayCount = 10;        // 10 / 20 / 'all'
let freezeMode = false;
let podiumMode = false;
let prevTop1Key = null;
let nextRefreshAt = Date.now() + 15000;
let qrTargetViewer = true;
let themeIdx = 0;
const THEMES = ['', 'theme-festa', 'theme-dark'];

// 日本時間の12時以降かどうか判定
function isAfterJst12PM() {
  try {
    const now = new Date();
    const options = { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false };
    const hourStr = new Intl.DateTimeFormat('ja-JP', options).format(now);
    const hour = parseInt(hourStr, 10);
    return hour >= 12;
  } catch (e) {
    return new Date().getHours() >= 12;
  }
}

// 1. HTMLエスケープ（XSS対策）
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 2. 時計更新機能
function updateClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${hours}:${minutes}:${seconds}`;
}

// 3. ローカルストレージ（閲覧キャッシュ）制御
function loadLocalCache(key) {
  try {
    const data = localStorage.getItem(`topscore_cache_${key}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('キャッシュ読み込み失敗:', e);
    return null;
  }
}

function saveLocalCache(key, data) {
  try {
    localStorage.setItem(`topscore_cache_${key}`, JSON.stringify(data));
  } catch (e) {
    console.error('キャッシュ保存失敗:', e);
  }
}

// 4. 初期化 & タイマー起動
document.addEventListener('DOMContentLoaded', () => {
  // キャッシュから初期データを即時読み込み（画面のチラつき防止）
  day1DataCache = loadLocalCache('day1') || [];
  day2DataCache = loadLocalCache('day2') || [];
  totalDataCache = loadLocalCache('total') || [];

  // キャッシュデータがあればまず描画
  renderCurrentPage();

   const interval = (typeof CONFIG !== 'undefined' && CONFIG.AUTO_REFRESH_INTERVAL) || 15000;
   setInterval(() => {
     if (freezeMode || document.hidden) return;
     fetchViewerData(currentTab, false);
   }, interval);

   // QRコード生成
  setupQRCode();

   // 検索・件数・各種ボタンのイベント登録
  initToolbar();

   // 1秒ごとのカウントダウン表示
  setInterval(updateNextRefreshLabel, 1000);

  // 最新データを取得
  fetchViewerData(currentTab);

  // 6秒ローテーションタイマー起動
  startPageRotation();

  // 時計更新タイマー起動
  updateClock();
  setInterval(updateClock, 1000);
});

// メニューの外側（画面のどこか）をクリックしたときにメニューを閉じる
document.addEventListener('click', (event) => {
  const nav = document.getElementById('nav-menu');
  const menuBtn = document.querySelector('.menu-btn');
  if (nav && nav.classList.contains('active')) {
    if (!nav.contains(event.target) && !menuBtn.contains(event.target)) {
      nav.classList.remove('active');
    }
  }
});

// 自動タイマー制御（ページ送り ＆ 2日目交互切り替え）
function startPageRotation() {
  if (autoPageTimer) clearInterval(autoPageTimer);
  
  autoPageTimer = setInterval(() => {
    if (freezeMode) return;
    const currentData = getCurrentTargetData();
    const subPerPage = 3; // 4位以下の小表示は1ページ3件
    if (currentData.length > 3) {
      const remainingCount = currentData.length - 3;
      const maxSubPages = Math.ceil(remainingCount / subPerPage);
      if (maxSubPages > 1) {
        currentPage = (currentPage + 1) % maxSubPages;
        renderCurrentPage();
      }
    }
  }, PAGE_ROTATE_INTERVAL);
}

// 現在の日付に応じたデータ配列を取得（1日目は1日目の結果、2日目は2日目の結果）
function getCurrentTargetData() {
  return detectTodayDay() === 'day1' ? day1DataCache : day2DataCache;
}

// 現在の表示タイトルラベルを取得
function getCurrentLabel() {
  return detectTodayDay() === 'day1' ? '【 1日目 ランキング 】' : '【 2日目 ランキング 】';
}

// ハンバーガーメニュー開閉
function toggleMenu() {
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.toggle('active');
}

function closeMenu() {
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.remove('active');
}

// フルスクリーン切り替え
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      setTimeout(renderCurrentPage, 200);
    }).catch(err => {
      console.error(`全画面表示エラー: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().then(() => {
        setTimeout(renderCurrentPage, 200);
      });
    }
  }
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.remove('active');
}

// 情報モーダル制御
function openInfoModal() {
  const modal = document.getElementById('info-modal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.remove('active');
}

function closeInfoModal() {
  const modal = document.getElementById('info-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// 画像拡大モーダル制御
function openImageModal(src) {
  const modal = document.getElementById('image-modal');
  const img = document.getElementById('enlarged-image');
  if (modal && img) {
    img.src = src;
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function closeImageModal() {
  const modal = document.getElementById('image-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// タイムアウト付きfetch（通信が遅い・繋がらない場合に備える）
function fetchWithTimeout(url, timeoutMs) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
  ]);
}

// レスポンスデータから配列を抽出する関数
function extractRankingArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.ranking)) return data.ranking;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

// データ取得処理（API経由 ＆ ローカルキャッシュ保存）
async function fetchViewerData(category, resetPage = true) {
  currentTab = category;
  if (resetPage) {
    currentPage = 0;
    day2ToggleState = 'day2';
  }

  const container = document.getElementById('viewer-ranking');
  if (!container) return;

  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.GAS_API_URL) {
      throw new Error('CONFIG.GAS_API_URL が未定義です');
    }

    if (category === 'day2') {
      const [resDay2, resTotal] = await Promise.all([
        fetchWithTimeout(`${CONFIG.GAS_API_URL}?day=day2`, 10000),
        fetchWithTimeout(`${CONFIG.GAS_API_URL}?day=total`, 10000)
      ]);

      const dataDay2 = await resDay2.json();
      const dataTotal = await resTotal.json();

      day2DataCache = extractRankingArray(dataDay2);
      totalDataCache = extractRankingArray(dataTotal);

      saveLocalCache('day2', day2DataCache);
      saveLocalCache('total', totalDataCache);
    } else {
      const res = await fetchWithTimeout(`${CONFIG.GAS_API_URL}?day=${category}`, 10000);
      const data = await res.json();
      const list = extractRankingArray(data);
      
      if (category === 'day1') {
        day1DataCache = list;
        saveLocalCache('day1', day1DataCache);
      }
      if (category === 'total') {
        totalDataCache = list;
        saveLocalCache('total', totalDataCache);
      }
    }

    renderCurrentPage();

    // 更新成功
    lastFetchSucceeded();
  } catch (e) {
    console.error('Fetch Error:', e);
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'block';
    renderCurrentPage();
  }
}

function lastFetchSucceeded() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'none';
  const el = document.getElementById('last-updated');
  if (el) el.textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');
  const interval = (typeof CONFIG !== 'undefined' && CONFIG.AUTO_REFRESH_INTERVAL) || 15000;
  nextRefreshAt = Date.now() + interval;

  // 1位が入れ替わったら紙吹雪
  const data = getCurrentTargetData();
  if (data && data.length > 0) {
    const topKey = data[0].account_id || data[0].nickname || data[0].name;
    if (prevTop1Key !== null && topKey !== prevTop1Key) {
      launchConfetti();
    }
    prevTop1Key = topKey;
  }
}

// 次の更新までのカウントダウン表示
function updateNextRefreshLabel() {
  const el = document.getElementById('next-refresh');
  if (!el) return;
  if (freezeMode) {
    el.textContent = '⏸ 更新停止中';
    return;
  }
  const sec = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  el.textContent = `次の更新まで 約${sec}秒`;
}

// 紙吹雪エフェクト（1位更新時）
function launchConfetti() {
  const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#a855f7', '#ec4899'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    piece.style.width = (6 + Math.random() * 6) + 'px';
    piece.style.height = (10 + Math.random() * 8) + 'px';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3000);
  }
}

// ランキング描画（手書きメモ準拠：ポディウム/スライド構築）
function renderCurrentPage() {
  const container = document.getElementById('viewer-ranking');
  if (!container) return;

  const currentData = getCurrentTargetData();
  const currentLabel = getCurrentLabel();

  if (!currentData || currentData.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; font-weight:800; color:var(--text-sub); margin-bottom:12px;">${currentLabel}</div>
      <p style="text-align:center; padding: 60px; color: var(--text-sub); font-size:1.1rem; font-weight:700;">現在ランキングデータを読み込み中、または記録がありません</p>
    `;
    return;
  }

  // 同じスコアは同じ順位として扱う（タイ計算）
  const ranks = [];
  const rankMap = {};
  currentData.forEach((item, i) => {
    let r;
    if (i > 0 && Number(item.score || 0) === Number(currentData[i - 1].score || 0)) {
      r = ranks[i - 1];
    } else {
      r = i + 1;
    }
    ranks.push(r);
    rankMap[item.account_id || item.nickname || item.name] = r;
  });

  // 前回順位との差分（▲▼表示＆ハイライト用）
  const diffMap = {};
  currentData.forEach((item, i) => {
    const key = item.account_id || item.nickname || item.name;
    if (prevPositions[key] !== undefined) {
      diffMap[key] = prevPositions[key] - i; // 正=順位アップ
    }
  });
  // 今回の順位を保存（次回比較用）
  const newPositions = {};
  currentData.forEach((item, i) => {
    newPositions[item.account_id || item.nickname || item.name] = i;
  });
  prevPositions = newPositions;

  function diffBadge(key) {
    const d = diffMap[key];
    if (!d) return '';
    return d > 0
      ? `<span class="diff-up">▲${d}</span>`
      : `<span class="diff-down">▼${Math.abs(d)}</span>`;
  }
  function diffClass(key) {
    const d = diffMap[key];
    if (!d) return '';
    return d > 0 ? ' rank-up' : ' rank-down';
  }

  // 検索・件数絞り込み
  let displayData = currentData;
  if (searchQuery) {
    displayData = displayData.filter(it => (it.nickname || it.name || '').includes(searchQuery));
  }
  if (displayCount !== 'all') {
    displayData = displayData.slice(0, displayCount);
  }

  const top1 = displayData[0];
  const top2 = displayData[1];
  const top3 = displayData[2];
  const restItems = podiumMode ? [] : displayData.slice(3);

  // 下部グリッドのスライドページ計算
  const subItemsPerPage = 3; // 3の下に4,5,6位を小さく表示
  const maxSubPages = Math.max(1, Math.ceil(restItems.length / subItemsPerPage));
  if (currentPage >= maxSubPages) currentPage = 0;

  const subStartIndex = currentPage * subItemsPerPage;
  const currentSubItems = restItems.slice(subStartIndex, subStartIndex + subItemsPerPage);

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:1rem; font-weight:800; color:var(--text-sub); margin-bottom:10px; padding:0 4px;">
      <span>${currentLabel}</span>
      <span>${maxSubPages > 1 ? `SLIDE ${currentPage + 1} /${maxSubPages} ` : ''}（全 ${currentData.length} 人）</span>
    </div>
  `;

  // 1. 【1〜3位：行表示】
  [top1, top2, top3].forEach((item, idx) => {
    if (!item) return;
    const rankNum = idx + 1;
    const key = item.account_id || item.nickname || item.name;
    const myRank = rankMap[key];
    const medal = myRank === 1 ? '👑' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🏅';
    html += `
      <div class="rank-row rank-row-${rankNum}${diffClass(key)}">
        <span class="rank-row-badge">${medal} ${myRank}位</span>
        <span class="rank-row-name">${escapeHtml(item.nickname || item.name)} ${diffBadge(key)}</span>
        <span class="rank-row-score">${Number(item.score || 0).toLocaleString()}点</span>
      </div>
    `;
  });

  // 2. 【4〜6位...：3の下に小さく表示】
  if (currentSubItems.length > 0) {
    html += `<div class="sub-rank-grid" style="margin-top:12px;">`;
    currentSubItems.forEach((item, idx) => {
      const key = item.account_id || item.nickname || item.name;
      const rankNum = rankMap[key];
      html += `
        <div class="sub-rank-card${diffClass(key)}">
          <div style="display:flex; align-items:center; gap:8px; min-width:0;">
            <span class="sub-rank-badge">${rankNum}</span>
            <span style="font-weight:700; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.nickname || item.name)} ${diffBadge(key)}</span>
          </div>
          <span style="font-weight:800; font-size:1rem; color:var(--primary-color); white-space:nowrap;">${Number(item.score || 0).toLocaleString()}点</span>
        </div>
      `;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

// カテゴリ切り替え（タブクリック時）
function switchCategory(category, el) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  fetchViewerData(category, true);
}

// --- 追加機能 ---
function initToolbar() {
  const search = document.getElementById('search-input');
  if (search) search.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    currentPage = 0;
    renderCurrentPage();
  });

  const countSel = document.getElementById('count-select');
  if (countSel) countSel.addEventListener('change', (e) => {
    displayCount = e.target.value === 'all' ? 'all' : Number(e.target.value);
    currentPage = 0;
    renderCurrentPage();
  });

  const freezeBtn = document.getElementById('freeze-btn');
  if (!freezeBtn && !document.getElementById('podium-btn')) {
    // ボタンが無い（お客さん向け index）場合は設定の同期で制御
  }

  // コントロールページからの設定を読み込み・反映
  loadStoredSettings();
  setInterval(syncFromStorage, 1000);
}

// コントロールページ（control.html）で設定された表示モードを反映
function loadStoredSettings() {
  try {
    freezeMode = localStorage.getItem('topscore_freeze') === '1';
    podiumMode = localStorage.getItem('topscore_podium') === '1';
    qrTargetViewer = localStorage.getItem('topscore_qr') !== 'form';
    const large = localStorage.getItem('topscore_large') === '1';
    document.body.classList.toggle('monitor-large', large);
    const theme = localStorage.getItem('topscore_theme') || '';
    document.body.classList.remove('theme-festa', 'theme-dark');
    if (theme) document.body.classList.add(theme);
    const fb = document.getElementById('freeze-banner');
    if (fb) fb.style.display = freezeMode ? 'block' : 'none';
    const fr = document.getElementById('viewer-ranking');
    if (fr) fr.classList.toggle('frozen', freezeMode);
    setupQRCode();
  } catch (e) { console.error(e); }
}

let lastSettingsString = '';
function syncFromStorage() {
  const s = ['topscore_freeze','topscore_podium','topscore_qr','topscore_large','topscore_theme']
    .map(k => localStorage.getItem(k)).join('|');
  if (s !== lastSettingsString) {
    lastSettingsString = s;
    loadStoredSettings();
    renderCurrentPage();
  }
}

// QRコード生成（表示対象を切り替え可能）
function setupQRCode() {
  const qrEl = document.getElementById('qr-code');
  if (!qrEl) return;
  let targetUrl;
  if (qrTargetViewer) {
    targetUrl = window.location.href.split('#')[0];
  } else {
    targetUrl = (typeof CONFIG !== 'undefined' && CONFIG.GOOGLE_FORM_BASE_URL)
      ? CONFIG.GOOGLE_FORM_BASE_URL.split('&entry.')[0]
      : window.location.href;
  }
  qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`;
  const cap = document.getElementById('qr-caption');
  if (cap) cap.textContent = qrTargetViewer ? 'スマートフォンでスキャン' : 'スコア登録フォームへ';
}

// CSVエクスポート（現在表示中のランキング）
function exportCSV() {
  const data = getCurrentTargetData();
  if (!data || data.length === 0) { alert('データがありません'); return; }
  const lines = ['順位,ニックネーム,スコア'];
  let lastScore = null, lastRank = 0;
  data.forEach((item, i) => {
    const score = Number(item.score || 0);
    const rank = (i > 0 && score === lastScore) ? lastRank : i + 1;
    lastScore = score; lastRank = rank;
    const name = String(item.nickname || item.name || '').replace(/"/g, '""');
    lines.push(`${rank},"${name}",${score}`);
  });
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ranking_${currentTab}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- BGM（無料・外部ファイル不要の WebAudio 生成音） ---
// ブラウザの自動再生制限対策として、最初のクリック/タッチで小さく再生開始
document.addEventListener('pointerdown', function startOnFirstTouch() {
  if (!bgmOn && localStorage.getItem('topscore_bgm') !== 'off') startBGM();
  document.removeEventListener('pointerdown', startOnFirstTouch);
});

let bgmOn = false;
let bgmCtx = null;
let bgmGain = null;
let bgmTimer = null;

// --- BGM（フォルダ内の音楽ファイルをループ再生。無ければWebAudio生成音） ---
let bgmAudio = null;

function startFileBGM() {
  try {
    if (!bgmAudio) {
      bgmAudio = new Audio('music/bgm.mp3');
      bgmAudio.loop = true;      // ループ再生
      bgmAudio.volume = 0.15;    // 小さめ音量
    }
    const p = bgmAudio.play();
    if (p && p.catch) {
      p.catch(() => { bgmAudio = null; startWebAudioBGM(); });
    }
    bgmOn = true;
    const bgmBtn = document.getElementById('bgm-btn');
    if (bgmBtn) bgmBtn.textContent = '🎵 BGM OFF';
  } catch (e) {
    startWebAudioBGM();
  }
}

function startBGM() {
  startFileBGM();
}

function stopFileBGM() {
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  }
}

function startWebAudioBGM() {
  const bgmBtn = document.getElementById('bgm-btn');
  try {
    if (!bgmCtx) {
      bgmCtx = new (window.AudioContext || window.webkitAudioContext)();
      bgmGain = bgmCtx.createGain();
      bgmGain.gain.value = 0.04; // 小さめ音量
      bgmGain.connect(bgmCtx.destination);
    }
    bgmCtx.resume();
    const notes = [523, 659, 784, 659, 880, 784, 659, 523]; // C長調の簡単メロディ
    let i = 0;
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = setInterval(() => {
      const osc = bgmCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = notes[i % notes.length];
      osc.connect(bgmGain);
      osc.start();
      osc.stop(bgmCtx.currentTime + 0.25);
      i++;
    }, 280);
    bgmOn = true;
    if (bgmBtn) bgmBtn.textContent = '🎵 BGM OFF';
  } catch (e) {
    console.error('BGM error:', e);
  }
}

function stopBGM() {
  const bgmBtn = document.getElementById('bgm-btn');
  stopFileBGM();
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
  bgmOn = false;
  if (bgmBtn) bgmBtn.textContent = '🎵 BGM ON';
}

// PWA サービスワーカー登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err));
  });
}