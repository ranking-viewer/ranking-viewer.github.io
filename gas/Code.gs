// システム初期設定（初回のみ手動実行または自動セットアップ）
function setupSystemProperties() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) {
    props.setProperty('ADMIN_PASSWORD', 'admin1234'); // 初期パスワード
  }
  if (!props.getProperty('ONE_TIME_KEY')) {
    props.setProperty('ONE_TIME_KEY', 'EVENT2026');   // 初期ワンタイムキー
  }
  if (!props.getProperty('NG_WORDS')) {
    props.setProperty('NG_WORDS', 'NG,不適切,悪口');   // 初期NGワード
  }
  if (!props.getProperty('ADMIN_TOKEN')) {
    props.setProperty('ADMIN_TOKEN', 'token_' + Utilities.getUuid());
  }
}

function doGet(e) {
  setupSystemProperties();
  const params = e.parameter;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return createJsonResponse({ ranking: [], all_data: [] });
  }

  const rows = data.slice(1);
  const props = PropertiesService.getScriptProperties();

  // 管理者モード処理
  if (params.mode === 'admin') {
    if (params.token !== props.getProperty('ADMIN_TOKEN')) {
      return createJsonResponse({ status: 'error', message: 'Unauthorized' });
    }

    const allData = rows.map((r, i) => ({
      row_id: i + 2,
      timestamp: Utilities.formatDate(new Date(r[0]), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
      account_id: String(r[1]),
      nickname: String(r[2]),
      score: Number(r[3]),
      event_day: String(r[4]),
      is_visible: r[5] === 1 || r[5] === true || r[5] === "1"
    }));

    return createJsonResponse({
      status: 'success',
      all_data: allData,
      settings: {
        one_time_key: props.getProperty('ONE_TIME_KEY'),
        ng_words: props.getProperty('NG_WORDS')
      }
    });
  }

  // 一般公開・モニターデータ取得処理
  const day = params.day || 'total';
  let filtered = rows.filter(r => (r[5] === 1 || r[5] === true || r[5] === "1"));

  if (day === 'day1') filtered = filtered.filter(r => String(r[4]) === '1');
  if (day === 'day2') filtered = filtered.filter(r => String(r[4]) === '2');

  const rankingMap = {};
  filtered.forEach(r => {
    const accId = String(r[1]);
    const nickname = String(r[2]);
    const score = Number(r[3]) || 0;
    const isNew = r[6] === 1 || r[6] === true || r[6] === "1";

    if (!rankingMap[accId]) {
      rankingMap[accId] = { account_id: accId, nickname: nickname, score: 0, is_new: isNew };
    }
    rankingMap[accId].score += score;
  });

  const ranking = Object.values(rankingMap).sort((a, b) => b.score - a.score);
  return createJsonResponse({ ranking: ranking });
}

function doPost(e) {
  setupSystemProperties();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10秒のロック取得待機
  } catch (err) {
    return createJsonResponse({ status: 'error', message: 'Server Busy' });
  }

  try {
    const contents = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // ログイン認証
    if (contents.action === 'login') {
      if (contents.password === props.getProperty('ADMIN_PASSWORD')) {
        return createJsonResponse({ status: 'success', token: props.getProperty('ADMIN_TOKEN') });
      }
      return createJsonResponse({ status: 'error', message: 'Invalid Password' });
    }

    // ワンタイムキー検証
    if (contents.action === 'verify_key') {
      if (contents.key === props.getProperty('ONE_TIME_KEY')) {
        return createJsonResponse({ status: 'success' });
      }
      return createJsonResponse({ status: 'error', message: 'Invalid Key' });
    }

    // 管理者設定保存
    if (contents.action === 'save_settings') {
      if (contents.token === props.getProperty('ADMIN_TOKEN')) {
        if (contents.one_time_key !== undefined) props.setProperty('ONE_TIME_KEY', contents.one_time_key);
        if (contents.ng_words !== undefined) props.setProperty('NG_WORDS', contents.ng_words);
        return createJsonResponse({ status: 'success' });
      }
    }

    // 表示/非表示切り替え
    if (contents.action === 'toggle_visible') {
      if (contents.token === props.getProperty('ADMIN_TOKEN')) {
        sheet.getRange(contents.row_id, 6).setValue(contents.is_visible ? 1 : 0);
        return createJsonResponse({ status: 'success' });
      }
    }

    // スコア登録（司会用入力フォームからの送信）
    if (contents.nickname !== undefined && contents.score !== undefined) {
      const nickname = String(contents.nickname).trim();
      const score = Number(contents.score);
      if (!nickname || isNaN(score)) {
        return createJsonResponse({ status: 'error', message: 'Invalid input' });
      }
      const eventDay = contents.day === 'day2' ? '2' : '1';
      sheet.appendRow([
        new Date(),      // A: timestamp
        nickname,        // B: account_id（同名なら合算される）
        nickname,        // C: nickname
        score,           // D: score
        eventDay,        // E: event_day
        1,               // F: is_visible
        1                // G: is_new
      ]);
      return createJsonResponse({ status: 'success' });
    }

    return createJsonResponse({ status: 'error', message: 'Unknown Action' });
  } finally {
    lock.releaseLock();
  }
}

// Google フォーム連動送信トリガー (排他制御・連番補正・NGワードフィルター付き)
function onFormSubmit(e) {
  setupSystemProperties();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return;
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const rowData = sheet.getRange(lastRow, 1, 1, 4).getValues()[0];
    const timestamp = new Date(rowData[0]);
    let nickname = String(rowData[2]).trim();

    // 1. NGワードチェック & 伏字変換
    const props = PropertiesService.getScriptProperties();
    const ngWords = (props.getProperty('NG_WORDS') || '').split(',').map(w => w.trim()).filter(Boolean);
    let isNgDetected = false;

    ngWords.forEach(ng => {
      if (ng && nickname.includes(ng)) {
        isNgDetected = true;
        nickname = nickname.replace(new RegExp(ng, 'g'), '***');
      }
    });

    // 2. ニックネーム重複連番補正（「たろう」「たろう2」）
    const existingNicknames = sheet.getRange(2, 3, lastRow - 2, 1).getValues().map(r => String(r[0]));
    if (existingNicknames.includes(nickname)) {
      let count = 2;
      while (existingNicknames.includes(`${nickname}${count}`)) {
        count++;
      }
      nickname = `${nickname}${count}`;
    }

    // 3. 日程判定 (例: 2026-10-02以降はDay 2)
    const day2Start = new Date('2026-10-04T00:00:00');
    const eventDay = timestamp >= day2Start ? 2 : 1;

    // スプレッドシートへ書き戻し
    sheet.getRange(lastRow, 3).setValue(nickname);                      // C列: 補正済ニックネーム
    sheet.getRange(lastRow, 5).setValue(eventDay);                      // E列: event_day
    sheet.getRange(lastRow, 6).setValue(isNgDetected ? 0 : 1);         // F列: is_visible (NG検出時は自動非表示)
    sheet.getRange(lastRow, 7).setValue(1);                             // G列: is_new
  } finally {
    lock.releaseLock();
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}