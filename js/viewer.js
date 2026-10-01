// --- 状態管理・グローバル変数 ---
let currentTab = 'total';

// データキャッシュ
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

// 2. 画面高さに合わせて1画面あたりの件数を自動計算
function calculatePageSize() {
  const container = document.getElementById('viewer-ranking');
  if (!container) return 8;

  const rect = container.getBoundingClientRect();
  const topPos = rect.top > 0 ? rect.top : 150;
  const availableHeight = window.innerHeight - topPos - 110;
  const cardHeight = 82; 
  const calculatedSize = Math.floor(availableHeight / cardHeight);
  
  if (isNaN(calculatedSize) || calculatedSize < 3) return 5;
  return calculatedSize;
}

// 画面リサイズ時に再描画
window.addEventListener('resize', () => {
  renderCurrentPage();
});

// 3. 時計更新機能
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

  // 時計更新タイマー起動
  updateClock();
  setInterval(updateClock, 1000);
});

// 自動タイマー制御（ページ送り ＆ 2日目交互切り替え）
function startPageRotation() {
  if (autoPageTimer) clearInterval(autoPageTimer);
  
  autoPageTimer = setInterval(() => {
    const isAfter12 = isAfterJst12PM();

    if (currentTab === 'day2' && !isAfter12) {
      day2ToggleState = (day2ToggleState === 'day2') ? 'total' : 'day2';
      currentPage = 0;
      renderCurrentPage();
    } else {
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

  if (isAfterJst12PM()) {
    return totalDataCache;
  } else {
    return day2ToggleState === 'day2' ? day2DataCache : totalDataCache;
  }
}

// 現在の表示タイトルラベルを取得
function getCurrentLabel() {
  if (currentTab === 'day1') return '【 1日目 ランキング 】';
  if (currentTab === 'total') return '【 2日合計 ランキング 】';

  if (isAfterJst12PM()) {
    return '【 2日合計 ランキング (12時以降) 】';
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

// レスポンスデータから配列を抽出する万能関数
function extractRankingArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.ranking)) return data.ranking;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
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

      day2DataCache = extractRankingArray(dataDay2);
      totalDataCache = extractRankingArray(dataTotal);
    } else {
      const res = await fetch(`${CONFIG.GAS_API_URL}?day=${category}`);
      const data = await res.json();
      const list = extractRankingArray(data);
      
      if (category === 'day1') day1DataCache = list;
      if (category === 'total') totalDataCache = list;
    }

    renderCurrentPage();
  } catch (e) {
    console.error('Fetch Error:', e);
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
      <p style="text-align:center; padding: 40px; color: var(--text-sub);">現在ランキングデータを読み込み中、または記録がありません</p>
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

    const newBadge = item.is_new ? '<span style="background:#ef4444; color:white; font-size:0.75rem; font-weight:bold; padding:2px 8px; border-radius:10px; margin-left:8px; vertical-align:middle;">NEW</span>' : '';

    return `
      <div class="viewer-card ${rankClass}">
        <div style="display:flex; align-items:center; gap:16px;">
          <span class="rank-badge">${rank}</span>
          <span style="font-weight:800; font-size:1.15rem;">${crown}${escapeHtml(item.nickname || item.name)}${newBadge}</span>
        </div>
        <span class="score-text">${Number(item.score || 0).toLocaleString()} <span style="font-size:0.9rem;">点</span></span>
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
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err));
  });
}