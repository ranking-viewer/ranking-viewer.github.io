// --- 状態管理・グローバル変数 ---
let currentTab = 'total';

// データを保持するキャッシュ
let day1DataCache = [];
let day2DataCache = [];
let totalDataCache = [];

// ページ送り・交互表示管理
let currentPage = 0;
let autoPageTimer = null;
let day2ToggleState = 'day2'; // 'day2' または 'total'
const PAGE_ROTATE_INTERVAL = 6000; // ページ切り替え間隔（6秒）

// 日本時間の12時以降かどうか判定
function isAfterJst12PM() {
  const now = new Date();
  const jstString = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  const jstHour = new Date(jstString).getHours();
  return jstHour >= 12;
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

// 2. 画面高さに合わせて1画面あたりの件数を自動計算
function calculatePageSize() {
  const container = document.getElementById('viewer-ranking');
  if (!container) return 8;

  const availableHeight = window.innerHeight - container.getBoundingClientRect().top - 100;
  const cardHeight = 85; 
  const calculatedSize = Math.floor(availableHeight / cardHeight);
  return Math.max(3, calculatedSize);
}

// 画面リサイズ時に再描画
window.addEventListener('resize', () => {
  renderCurrentPage();
});

// 3. 時計の更新
function updateClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${hours}:${minutes}:${seconds}`;
}

// 4. 初期化 & タイマー起動
document.addEventListener('DOMContentLoaded', () => {
  fetchViewerData('total');

  // 15秒ごとにバックグラウンドで最新データを取得
  setInterval(() => fetchViewerData(currentTab, false), (typeof CONFIG !== 'undefined' && CONFIG.AUTO_REFRESH_INTERVAL) || 15000);

  // 6秒ローテーションタイマー起動
  startPageRotation();

  // 時計更新タイマー起動（1秒ごと）
  updateClock();
  setInterval(updateClock, 1000);
});

// 自動タイマー制御（ページ送り ＆ 2日目交互切り替え）
function startPageRotation() {
  if (autoPageTimer) clearInterval(autoPageTimer);
  
  autoPageTimer = setInterval(() => {
    const isAfter12 = isAfterJst12PM();

    if (currentTab === 'day2' && !isAfter12) {
      // 2日目で12時前の場合は、「2日目」と「2日合計」を交互に切り替え
      day2ToggleState = (day2ToggleState === 'day2') ? 'total' : 'day2';
      currentPage = 0;
      renderCurrentPage();
    } else {
      // 通常のページ送り処理
      const currentData = getCurrentTargetData();
      const pageSize = calculatePageSize();
      if (currentData.length > pageSize) {
        const maxPages = Math.ceil(currentData.length / pageSize);
        currentPage = (currentPage + 1) % maxPages;
        renderCurrentPage();
      }
    }
  }, PAGE_ROTATE_INTERVAL);
}

// 現在のタブ・状況に応じたデータ配列を取得
function getCurrentTargetData() {
  if (currentTab === 'day1') return day1DataCache;
  if (currentTab === 'total') return totalDataCache;

  // day2 タブの処理
  if (isAfterJst12PM()) {
    // 12時以降は合計固定
    return totalDataCache;
  } else {
    // 12時前は交互
    return day2ToggleState === 'day2' ? day2DataCache : totalDataCache;
  }
}

// 現在の表示タイトルラベルを取得
function getCurrentLabel() {
  if (currentTab === 'day1') return '【 1日目 ランキング 】';
  if (currentTab === 'total') return '【 2日合計 ランキング 】';

  // day2 タブの場合
  if (isAfterJst12PM()) {
    return '【 2日合計 ランキング (12時以降固定) 】';
  } else {
    return day2ToggleState === 'day2' ? '【 2日目 ランキング 】' : '【 2日合計 ランキング 】';
  }
}

// ハンバーガーメニュー開閉
function toggleMenu() {
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.toggle('active');
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
  toggleMenu();
}

// モーダル制御
function openInfoModal() {
  const modal = document.getElementById('info-modal');
  if (modal) modal.classList.add('active');
  toggleMenu();
}

function closeInfoModal() {
  const modal = document.getElementById('info-modal');
  if (modal) modal.classList.remove('active');
}

// データ取得処理（API経由）
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
        fetch(`${CONFIG.GAS_API_URL}?day=day2`),
        fetch(`${CONFIG.GAS_API_URL}?day=total`)
      ]);

      const dataDay2 = await resDay2.json();
      const dataTotal = await resTotal.json();

      day2DataCache = dataDay2.ranking || [];
      totalDataCache = dataTotal.ranking || [];
    } else {
      const res = await fetch(`${CONFIG.GAS_API_URL}?day=${category}`);
      const data = await res.json();
      if (category === 'day1') day1DataCache = data.ranking || [];
      if (category === 'total') totalDataCache = data.ranking || [];
    }

    renderCurrentPage();
  } catch (e) {
    console.error('Fetch detail error:', e);
    renderCurrentPage();
  }
}

// ランキングレンダリング描画
function renderCurrentPage() {
  const container = document.getElementById('viewer-ranking');
  if (!container) return;

  const currentData = getCurrentTargetData();
  const currentLabel = getCurrentLabel();

  if (!currentData || currentData.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; font-weight:700; color:var(--text-sub); margin-bottom:12px;">${currentLabel}</div>
      <p style="text-align:center; padding: 40px; color: var(--text-sub);">まだ記録がありません</p>
    `;
    return;
  }

  const pageSize = calculatePageSize();
  const maxPages = Math.ceil(currentData.length / pageSize);

  if (currentPage >= maxPages) currentPage = 0;

  const startIndex = currentPage * pageSize;
  const pageItems = currentData.slice(startIndex, startIndex + pageSize);

  let headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.95rem; font-weight:800; color:var(--text-sub); margin-bottom:10px; padding:0 4px;">
      <span>${currentLabel}</span>
      <span>${maxPages > 1 ? `PAGE ${currentPage + 1} /${maxPages} ` : ''}（全 ${currentData.length} 人）</span>
    </div>
  `;

  const cardsHtml = pageItems.map((item, index) => {
    const rank = startIndex + index + 1;
    let rankClass = '';
    let crown = '';

    if (rank === 1) { rankClass = 'rank-1'; crown = '👑 '; }
    else if (rank === 2) { rankClass = 'rank-2'; crown = '🥈 '; }
    else if (rank === 3) { rankClass = 'rank-3'; crown = '🥉 '; }

    // 10分以内の新規投稿判定（NEWバッジ）
    const newBadge = item.is_new ? '<span style="background:#ef4444; color:white; font-size:0.75rem; font-weight:bold; padding:2px 8px; border-radius:10px; margin-left:8px; vertical-align:middle;">NEW</span>' : '';

    return `
      <div class="viewer-card ${rankClass}">
        <div style="display:flex; align-items:center; gap:16px;">
          <span class="rank-badge">${rank}</span>
          <span style="font-weight:800; font-size:1.15rem;">${crown}${escapeHtml(item.nickname)}${newBadge}</span>
        </div>
        <span class="score-text">${Number(item.score).toLocaleString()} <span style="font-size:0.9rem;">点</span></span>
      </div>
    `;
  }).join('');

  container.innerHTML = headerHtml + cardsHtml;
}

// カテゴリ切り替え（タブクリック時）
function switchCategory(category, el) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  fetchViewerData(category, true);
}

// PWA サービスワーカー登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW error:', err));
  });
}// --- 状態管理・グローバル変数 ---
let currentTab = 'total';

// データを保持するキャッシュ
let day1DataCache = [];
let day2DataCache = [];
let totalDataCache = [];

// ページ送り・交互表示管理
let currentPage = 0;
let autoPageTimer = null;
let day2ToggleState = 'day2'; // 'day2' または 'total'
const PAGE_ROTATE_INTERVAL = 6000; // ページ切り替え間隔（6秒）

// 日本時間の12時以降かどうか判定
function isAfterJst12PM() {
  const now = new Date();
  const jstString = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  const jstHour = new Date(jstString).getHours();
  return jstHour >= 12;
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

// 2. 画面高さに合わせて1画面あたりの件数を自動計算
function calculatePageSize() {
  const container = document.getElementById('viewer-ranking');
  if (!container) return 8;

  const availableHeight = window.innerHeight - container.getBoundingClientRect().top - 100;
  const cardHeight = 85; 
  const calculatedSize = Math.floor(availableHeight / cardHeight);
  return Math.max(3, calculatedSize);
}

// 画面リサイズ時に再描画
window.addEventListener('resize', () => {
  renderCurrentPage();
});

// 3. 時計の更新
function updateClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${hours}:${minutes}:${seconds}`;
}

// 4. 初期化 & タイマー起動
document.addEventListener('DOMContentLoaded', () => {
  fetchViewerData('total');

  // 15秒ごとにバックグラウンドで最新データを取得
  setInterval(() => fetchViewerData(currentTab, false), (typeof CONFIG !== 'undefined' && CONFIG.AUTO_REFRESH_INTERVAL) || 15000);

  // 6秒ローテーションタイマー起動
  startPageRotation();

  // 時計更新タイマー起動（1秒ごと）
  updateClock();
  setInterval(updateClock, 1000);
});

// 自動タイマー制御（ページ送り ＆ 2日目交互切り替え）
function startPageRotation() {
  if (autoPageTimer) clearInterval(autoPageTimer);
  
  autoPageTimer = setInterval(() => {
    const isAfter12 = isAfterJst12PM();

    if (currentTab === 'day2' && !isAfter12) {
      // 2日目で12時前の場合は、「2日目」と「2日合計」を交互に切り替え
      day2ToggleState = (day2ToggleState === 'day2') ? 'total' : 'day2';
      currentPage = 0;
      renderCurrentPage();
    } else {
      // 通常のページ送り処理
      const currentData = getCurrentTargetData();
      const pageSize = calculatePageSize();
      if (currentData.length > pageSize) {
        const maxPages = Math.ceil(currentData.length / pageSize);
        currentPage = (currentPage + 1) % maxPages;
        renderCurrentPage();
      }
    }
  }, PAGE_ROTATE_INTERVAL);
}

// 現在のタブ・状況に応じたデータ配列を取得
function getCurrentTargetData() {
  if (currentTab === 'day1') return day1DataCache;
  if (currentTab === 'total') return totalDataCache;

  // day2 タブの処理
  if (isAfterJst12PM()) {
    // 12時以降は合計固定
    return totalDataCache;
  } else {
    // 12時前は交互
    return day2ToggleState === 'day2' ? day2DataCache : totalDataCache;
  }
}

// 現在の表示タイトルラベルを取得
function getCurrentLabel() {
  if (currentTab === 'day1') return '【 1日目 ランキング 】';
  if (currentTab === 'total') return '【 2日合計 ランキング 】';

  // day2 タブの場合
  if (isAfterJst12PM()) {
    return '【 2日合計 ランキング (12時以降固定) 】';
  } else {
    return day2ToggleState === 'day2' ? '【 2日目 ランキング 】' : '【 2日合計 ランキング 】';
  }
}

// ハンバーガーメニュー開閉
function toggleMenu() {
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.toggle('active');
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
  toggleMenu();
}

// モーダル制御
function openInfoModal() {
  const modal = document.getElementById('info-modal');
  if (modal) modal.classList.add('active');
  toggleMenu();
}

function closeInfoModal() {
  const modal = document.getElementById('info-modal');
  if (modal) modal.classList.remove('active');
}

// データ取得処理（API経由）
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
        fetch(`${CONFIG.GAS_API_URL}?day=day2`),
        fetch(`${CONFIG.GAS_API_URL}?day=total`)
      ]);

      const dataDay2 = await resDay2.json();
      const dataTotal = await resTotal.json();

      day2DataCache = dataDay2.ranking || [];
      totalDataCache = dataTotal.ranking || [];
    } else {
      const res = await fetch(`${CONFIG.GAS_API_URL}?day=${category}`);
      const data = await res.json();
      if (category === 'day1') day1DataCache = data.ranking || [];
      if (category === 'total') totalDataCache = data.ranking || [];
    }

    renderCurrentPage();
  } catch (e) {
    console.error('Fetch detail error:', e);
    renderCurrentPage();
  }
}

// ランキングレンダリング描画
function renderCurrentPage() {
  const container = document.getElementById('viewer-ranking');
  if (!container) return;

  const currentData = getCurrentTargetData();
  const currentLabel = getCurrentLabel();

  if (!currentData || currentData.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; font-weight:700; color:var(--text-sub); margin-bottom:12px;">${currentLabel}</div>
      <p style="text-align:center; padding: 40px; color: var(--text-sub);">まだ記録がありません</p>
    `;
    return;
  }

  const pageSize = calculatePageSize();
  const maxPages = Math.ceil(currentData.length / pageSize);

  if (currentPage >= maxPages) currentPage = 0;

  const startIndex = currentPage * pageSize;
  const pageItems = currentData.slice(startIndex, startIndex + pageSize);

  let headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.95rem; font-weight:800; color:var(--text-sub); margin-bottom:10px; padding:0 4px;">
      <span>${currentLabel}</span>
      <span>${maxPages > 1 ? `PAGE ${currentPage + 1} /${maxPages} ` : ''}（全 ${currentData.length} 人）</span>
    </div>
  `;

  const cardsHtml = pageItems.map((item, index) => {
    const rank = startIndex + index + 1;
    let rankClass = '';
    let crown = '';

    if (rank === 1) { rankClass = 'rank-1'; crown = '👑 '; }
    else if (rank === 2) { rankClass = 'rank-2'; crown = '🥈 '; }
    else if (rank === 3) { rankClass = 'rank-3'; crown = '🥉 '; }

    // 10分以内の新規投稿判定（NEWバッジ）
    const newBadge = item.is_new ? '<span style="background:#ef4444; color:white; font-size:0.75rem; font-weight:bold; padding:2px 8px; border-radius:10px; margin-left:8px; vertical-align:middle;">NEW</span>' : '';

    return `
      <div class="viewer-card ${rankClass}">
        <div style="display:flex; align-items:center; gap:16px;">
          <span class="rank-badge">${rank}</span>
          <span style="font-weight:800; font-size:1.15rem;">${crown}${escapeHtml(item.nickname)}${newBadge}</span>
        </div>
        <span class="score-text">${Number(item.score).toLocaleString()} <span style="font-size:0.9rem;">点</span></span>
      </div>
    `;
  }).join('');

  container.innerHTML = headerHtml + cardsHtml;
}

// カテゴリ切り替え（タブクリック時）
function switchCategory(category, el) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  fetchViewerData(category, true);
}

// PWA サービスワーカー登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW error:', err));
  });
}