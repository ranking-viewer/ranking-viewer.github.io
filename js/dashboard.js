// /admin ダッシュボード用スクリプト

document.addEventListener('DOMContentLoaded', () => {
  const role = sessionStorage.getItem('auth_role');
  const token = sessionStorage.getItem('auth_token');
  if (role === 'admin' && token) {
    loadAdminData();
  } else {
    const overlay = document.getElementById('admin-login-overlay');
    if (overlay) overlay.style.display = 'flex';
  }
});

// 管理者ログイン（GAS側で認証してトークンを取得）
async function adminLogin() {
  const input = document.getElementById('admin-login-password');
  const err = document.getElementById('admin-login-error');
  const password = input ? input.value : '';
  try {
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', password: password })
    });
    const data = await res.json();
    if (data.status === 'success' && data.token) {
      sessionStorage.setItem('auth_token', data.token);
      sessionStorage.setItem('auth_role', 'admin');
      const overlay = document.getElementById('admin-login-overlay');
      if (overlay) overlay.style.display = 'none';
      loadAdminData();
    } else {
      if (err) { err.style.display = 'block'; err.textContent = 'パスワードが違います'; }
    }
  } catch (e) {
    if (err) { err.style.display = 'block'; err.textContent = '通信エラー。再度お試しください'; }
  }
}

// 管理データ読み込み
async function loadAdminData() {
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(`${CONFIG.GAS_API_URL}?mode=admin&token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message);

    renderAdminTable(data.all_data || []);

    if (data.settings) {
      const keyEl = document.getElementById('one-time-key-setting');
      const ngEl = document.getElementById('ng-words-setting');
      if (keyEl) keyEl.value = data.settings.one_time_key || '';
      if (ngEl) ngEl.value = data.settings.ng_words || '';
    }
  } catch (e) {
    console.error('管理データ取得失敗:', e);
    alert('管理データの取得に失敗しました。再ログインしてください。');
    sessionStorage.clear();
    location.reload();
  }
}

function renderAdminTable(rows) {
  const tbody = document.getElementById('admin-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:12px;">データがありません</td></tr>';
    return;
  }
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 12px;">${escapeHtml(r.timestamp)}</td>
      <td style="padding: 12px;">${escapeHtml(r.account_id)}</td>
      <td style="padding: 12px;">${escapeHtml(r.nickname)}</td>
      <td style="padding: 12px;">${Number(r.score).toLocaleString()}</td>
      <td style="padding: 12px;">${r.event_day === '2' ? '2日目' : '1日目'}</td>
      <td style="padding: 12px;">
        <button class="btn" onclick="toggleVisibility(${r.row_id}, ${!r.is_visible})">
          ${r.is_visible ? '非表示にする' : '表示する'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleVisibility(rowId, isVisible) {
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'toggle_visible', token, row_id: rowId, is_visible: isVisible })
    });
    const data = await res.json();
    if (data.status === 'success') {
      loadAdminData();
    } else {
      alert('切り替えに失敗しました');
    }
  } catch (e) {
    alert('通信エラー');
  }
}

async function saveSettings() {
  const keyEl = document.getElementById('one-time-key-setting');
  const ngEl = document.getElementById('ng-words-setting');
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_settings',
        token,
        one_time_key: keyEl ? keyEl.value : undefined,
        ng_words: ngEl ? ngEl.value : undefined
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert('設定を保存しました');
      await loadAdminData(); // 保存された値を再読み込みして確認
    } else {
      alert('保存に失敗しました: ' + (data.message || '不明なエラー'));
    }
  } catch (e) {
    alert('通信エラー: ' + e.message);
  }
}
