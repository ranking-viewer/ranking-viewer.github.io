// HTMLエスケープ（XSS対策）
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'`]/g, function(s) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#x60;'
    }[s];
  });
}

// 認証・セッション管理 (ローカルテスト用)
const Auth = {
  getToken() {
    return sessionStorage.getItem('auth_token');
  },

  getRole() {
    return sessionStorage.getItem('auth_role');
  },

  // 管理者ログイン（パスワード: admin123 で通過）
  async loginAdmin(password) {
    if (password === 'admin123') {
      sessionStorage.setItem('auth_token', 'local_admin_token');
      sessionStorage.setItem('auth_role', 'admin');
      return true;
    }
    return false;
  },

  // ワンタイムキー検証（キー: 1234 で通過）
  async verifyOneTimeKey(key) {
    if (key === '1234') {
      sessionStorage.setItem('auth_token', 'local_viewer_token');
      sessionStorage.setItem('auth_role', 'viewer');
      return true;
    }
    return false;
  },

  logout() {
    sessionStorage.clear();
    window.location.href = '/index.html';
  },

  checkGuard(requireAdmin = false) {
    const role = this.getRole();
    if (!role) {
      window.location.href = '/index.html';
    } else if (requireAdmin && role !== 'admin') {
      window.location.href = '/viewer/index.html';
    }
  }
};