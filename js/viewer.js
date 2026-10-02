// --- 状態管理・グローバル変数 ---
let currentTab = 'total';

// データキャッシュ（メモリ上）
let day1DataCache = [];
let day2DataCache = [];
let totalDataCache = [];

// ページ送り・交互表示管理
let currentPage = 0;
let autoPageTimer = null;
let day2ToggleState = 'day2'; // 'day2' または 'total'
const PAGE_ROTATE_INTERVAL = (typeof CONFIG !== 'undefined' && CONFIG.PAGE_ROTATE_INTERVAL) || 6000;

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

  // 最新データを取得
  fetchViewerData('total');

  // 15秒ごとにバックグラウンドで最新データを取得
  setInterval(() => fetchViewerData(currentTab, false), (typeof CONFIG !== 'undefined' && CONFIG.AUTO_REFRESH_INTERVAL) || 15000);

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
    const isAfter12 = isAfterJst12PM();

    if (currentTab === 'day2' && !isAfter12) {
      day2ToggleState = (day2ToggleState === 'day2') ? 'total' : 'day2';
      currentPage = 0;
      renderCurrentPage();
    } else {
      const currentData = getCurrentTargetData();
      const pageSize = 7; // ポディウム1〜3位固定 + 下部4〜7位（4枠）スライド
      if (currentData.length > 3) {
        const remainingCount = currentData.length - 3;
        const maxSubPages = Math.ceil(remainingCount / 4);
        if (maxSubPages > 1) {
          currentPage = (currentPage + 1) % maxSubPages;
          renderCurrentPage();
        }
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
        fetch(`${CONFIG.GAS_API_URL}?day=day2`),
        fetch(`${CONFIG.GAS_API_URL}?day=total`)
      ]);

      const dataDay2 = await resDay2.json();
      const dataTotal = await resTotal.json();

      day2DataCache = extractRankingArray(dataDay2);
      totalDataCache = extractRankingArray(dataTotal);

      saveLocalCache('day2', day2DataCache);
      saveLocalCache('total', totalDataCache);
    } else {
      const res = await fetch(`${CONFIG.GAS_API_URL}?day=${category}`);
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
  } catch (e) {
    console.error('Fetch Error:', e);
    renderCurrentPage();
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

  const top1 = currentData[0];
  const top2 = currentData[1];
  const top3 = currentData[2];
  const restItems = currentData.slice(3);

  // 下部グリッドのスライドページ計算
  const subItemsPerPage = 4;
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

  // 1. 【1位カード (ドカンと巨大表示)】
  if (top1) {
    const newBadge = top1.is_new ? '<span style="background:#ef4444; color:white; font-size:0.8rem; font-weight:bold; padding:2px 8px; border-radius:10px; margin-left:8px;">NEW</span>' : '';
    html += `
      <div class="podium-rank-1">
        <div style="display:flex; align-items:center; gap:16px;">
          <span class="rank-badge-large">👑 1位</span>
          <div>
            <div style="font-size:0.85rem; color:#b45309; font-weight:800;">CURRENT TOP</div>
            <div class="name-large">${escapeHtml(top1.nickname || top1.name)}${newBadge}</div>
          </div>
        </div>
        <div class="score-large">${Number(top1.score || 0).toLocaleString()} <span style="font-size:1.1rem;">点</span></div>
      </div>
    `;
  }

  // 2. 【2位・3位カード (2列表示)】
  if (top2 || top3) {
    html += `<div class="podium-sub-container">`;
    if (top2) {
      const newBadge = top2.is_new ? '<span style="background:#ef4444; color:white; font-size:0.7rem; font-weight:bold; padding:2px 6px; border-radius:8px; margin-left:4px;">NEW</span>' : '';
      html += `
        <div class="podium-rank-2">
          <div>
            <span style="font-size:0.8rem; font-weight:800; color:#475569;">🥈 2位</span>
            <div style="font-size:1.15rem; font-weight:800;">${escapeHtml(top2.nickname || top2.name)}${newBadge}</div>
          </div>
          <div style="font-size:1.3rem; font-weight:800; color:#334155;">${Number(top2.score || 0).toLocaleString()}点</div>
        </div>
      `;
    }
    if (top3) {
      const newBadge = top3.is_new ? '<span style="background:#ef4444; color:white; font-size:0.7rem; font-weight:bold; padding:2px 6px; border-radius:8px; margin-left:4px;">NEW</span>' : '';
      html += `
        <div class="podium-rank-3">
          <div>
            <span style="font-size:0.8rem; font-weight:800; color:#c2410c;">🥉 3位</span>
            <div style="font-size:1.15rem; font-weight:800;">${escapeHtml(top3.nickname || top3.name)}${newBadge}</div>
          </div>
          <div style="font-size:1.3rem; font-weight:800; color:#c2410c;">${Number(top3.score || 0).toLocaleString()}点</div>
        </div>
      `;
    }
    html += `</div>`;
  }

  // 3. 【4位〜7位... (グリッド＋自動スライド表示)】
  if (currentSubItems.length > 0) {
    html += `<div class="podium-grid-container" style="margin-top:12px;">`;
    currentSubItems.forEach((item, idx) => {
      const rankNum = 4 + subStartIndex + idx;
      const newBadge = item.is_new ? '<span style="background:#ef4444; color:white; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:6px; margin-left:4px;">NEW</span>' : '';
      html += `
        <div class="viewer-card">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="rank-badge">${rankNum}</span>
            <span style="font-weight:700; font-size:1rem;">${escapeHtml(item.nickname || item.name)}${newBadge}</span>
          </div>
          <span class="score-text" style="font-size:1.1rem;">${Number(item.score || 0).toLocaleString()}点</span>
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

// PWA サービスワーカー登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err));
  });
}