let previousTop3Keys = [];
let audioCtx = null;
let isAudioEnabled = false;

// 画面タッチ・クリック時に音声を有効化
function enableAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isAudioEnabled = true;
  const overlay = document.getElementById('audio-enable-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Web Audio API による合成電子音ファンファーレ
function playFanfareSound() {
  if (!isAudioEnabled) return;
  try {
    const now = audioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.35);
    });
  } catch (e) {
    console.error("Audio error:", e);
  }
}

function checkTop3Update(ranking) {
  const currentTop3 = ranking.slice(0, 3).map(item => `${item.account_id}_${item.score}`);
  if (previousTop3Keys.length > 0) {
    const changed = currentTop3.some((key, i) => key !== previousTop3Keys[i]);
    if (changed) {
      playFanfareSound();
    }
  }
  previousTop3Keys = currentTop3;
}

async function fetchMonitorData() {
  try {
    const res = await fetch(`${CONFIG.GAS_API_URL}?day=total`);
    const data = await res.json();
    if (data && data.ranking) {
      checkTop3Update(data.ranking);
      renderMonitor(data.ranking);
    }
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

function renderMonitor(ranking) {
  const container = document.getElementById('monitor-ranking');
  if (ranking.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 40px; color: var(--text-sub);">現在集計中...</p>';
    return;
  }

  container.innerHTML = ranking.map((item, index) => {
    const rank = index + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    return `
      <div class="monitor-card ${rankClass}">
        <div class="card-left">
          <span class="rank-badge">${rank}</span>
          <span class="nickname">${escapeHtml(item.nickname)}</span>
          ${item.is_new ? '<span class="new-badge">NEW</span>' : ''}
        </div>
        <div class="score">${Number(item.score).toLocaleString()} pt</div>
      </div>
    `;
  }).join('');
}

// 自動スクロール処理
function startAutoScroll() {
  const board = document.getElementById('monitor-ranking');
  setInterval(() => {
    if (board.scrollHeight > board.clientHeight) {
      if (board.scrollTop + board.clientHeight >= board.scrollHeight - 5) {
        board.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        board.scrollBy({ top: 120, behavior: 'smooth' });
      }
    }
  }, 3500);
}

document.addEventListener('DOMContentLoaded', () => {
  fetchMonitorData();
  setInterval(fetchMonitorData, CONFIG.AUTO_REFRESH_INTERVAL || 5000);
  startAutoScroll();
});