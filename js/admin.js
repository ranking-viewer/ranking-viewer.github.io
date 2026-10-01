async function loadAdminDashboard() {
  Auth.checkGuard(true);
  const token = Auth.getToken();

  try {
    const res = await fetch(`${CONFIG.GAS_API_URL}?mode=admin&token=${token}`);
    const data = await res.json();

    if (data.status === 'error') {
      alert('セッションが切れました');
      Auth.logout();
      return;
    }

    renderAdminTable(data.all_data || []);
    if (data.settings) {
      document.getElementById('one-time-key-setting').value = data.settings.one_time_key || '';
      document.getElementById('ng-words-setting').value = data.settings.ng_words || '';
    }
  } catch (e) {
    alert('データ通信エラー');
  }
}

function renderAdminTable(list) {
  const tbody = document.getElementById('admin-table-body');
  tbody.innerHTML = list.map(item => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 10px;">${escapeHtml(item.timestamp)}</td>
      <td style="padding: 10px;">${escapeHtml(item.account_id)}</td>
      <td style="padding: 10px;">${escapeHtml(item.nickname)}</td>
      <td style="padding: 10px; font-weight:bold;">${item.score}</td>
      <td style="padding: 10px;">Day ${item.event_day}</td>
      <td style="padding: 10px;">
        <button class="btn" style="padding:4px 10px; font-size:0.8rem; background:${item.is_visible ? '#ef4444' : '#22c55e'};"
          onclick="toggleRowVisible(${item.row_id}, ${!item.is_visible})">
          ${item.is_visible ? '非表示' : '表示'}
        </button>
      </td>
    </tr>
  `).join('');
}

async function toggleRowVisible(rowId, setVisible) {
  const token = Auth.getToken();
  await fetch(CONFIG.GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'toggle_visible', token: token, row_id: rowId, is_visible: setVisible })
  });
  loadAdminDashboard();
}

async function saveSettings() {
  const token = Auth.getToken();
  const key = document.getElementById('one-time-key-setting').value;
  const ngWords = document.getElementById('ng-words-setting').value;

  const res = await fetch(CONFIG.GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'save_settings', token: token, one_time_key: key, ng_words: ngWords })
  });
  const data = await res.json();
  if (data.status === 'success') {
    alert('設定を保存しました');
  } else {
    alert('保存に失敗しました');
  }
}

document.addEventListener('DOMContentLoaded', loadAdminDashboard);