// 初期化チェック：すでに認証済みであればパスワード画面を隠す
document.addEventListener('DOMContentLoaded', () => {
  checkSavedAuth();
});

function checkSavedAuth() {
  const isAuthed = localStorage.getItem('topscore_admin_authed');
  const authModal = document.getElementById('auth-modal');
  
  if (isAuthed === 'true') {
    if (authModal) authModal.style.display = 'none';
  } else {
    if (authModal) authModal.style.display = 'flex';
  }
}

// パスワード判定処理
function checkPassword() {
  const inputEl = document.getElementById('auth-password-input');
  const errorEl = document.getElementById('auth-error-text');
  const authModal = document.getElementById('auth-modal');
  
  const enteredPass = inputEl ? inputEl.value : '';
  const correctPass = (typeof CONFIG !== 'undefined' && CONFIG.ADMIN_PASSWORD) ? CONFIG.ADMIN_PASSWORD : 'topscore2026';

  if (enteredPass === correctPass) {
    localStorage.setItem('topscore_admin_authed', 'true');
    if (errorEl) errorEl.style.display = 'none';
    if (authModal) authModal.style.display = 'none';
    if (inputEl) inputEl.value = '';
  } else {
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = 'パスワードが違います';
    }
  }
}

// ログアウト（認証情報の消去）
function logoutAdmin() {
  localStorage.removeItem('topscore_admin_authed');
  checkSavedAuth();
}

// スコア送信処理
async function handleScoreSubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('submit-btn');
  const statusEl = document.getElementById('status-message');
  
  const day = document.getElementById('day-select').value;
  const nickname = document.getElementById('nickname-input').value.trim();
  const score = document.getElementById('score-input').value;

  if (!nickname || !score) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '送信中...';
  statusEl.style.display = 'none';

  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.GAS_API_URL) {
      throw new Error('CONFIG.GAS_API_URL が定義されていません');
    }

    const payload = {
      day: day,
      nickname: nickname,
      score: parseInt(score, 10),
      timestamp: new Date().toISOString()
    };

    const response = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (result && result.status === 'error') {
      throw new Error(result.message || 'サーバーエラー');
    }

    statusEl.className = 'status-msg success';
    statusEl.textContent = '🎉 スコアが正常に反映されました！';
    statusEl.style.display = 'block';

    // フォームリセット
    document.getElementById('nickname-input').value = '';
    document.getElementById('score-input').value = '';

  } catch (err) {
    console.error('送信エラー:', err);
    statusEl.className = 'status-msg error';
    statusEl.textContent = '❌ 送信に失敗しました。通信環境を確認してください。';
    statusEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'スコアを送信・反映';
  }
}