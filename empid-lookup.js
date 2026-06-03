(function () {
  'use strict';

  var CACHE_KEY    = 'empid_mapping_cache';
  var ROLE_KEY     = 'empid_captured_role';
  var USER_KEY     = 'empid_captured_user';

  // ── Intercept _firestoreLogin to capture role at login time ──────────────
  // app.js is obfuscated — we can't rely on its localStorage key names.
  // Instead we wrap _firestoreLogin (defined in firebase.js) the moment it
  // becomes available, so we store the role ourselves under a known key.
  function hookLogin() {
    if (window._firestoreLogin && !window._firestoreLogin._empHooked) {
      var orig = window._firestoreLogin;
      window._firestoreLogin = async function (u, p) {
        var result = await orig(u, p);
        if (result && result.status === 'ok' && result.user) {
          localStorage.setItem(ROLE_KEY, (result.user.role || '').toLowerCase().trim());
          localStorage.setItem(USER_KEY, (result.user.username || '').toUpperCase().trim());
          // Re-inject the toolbar button now that we know the role
          setTimeout(injectTitlebarUI, 300);
        }
        return result;
      };
      window._firestoreLogin._empHooked = true;
    }
  }
  // Try immediately and also after a short delay (firebase.js may load after us)
  hookLogin();
  setTimeout(hookLogin, 500);
  setTimeout(hookLogin, 1500);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getCachedMapping() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function setCachedMapping(map) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  }

  function isAdmin() {
    // Primary: role captured at login via our _firestoreLogin hook
    var role = (localStorage.getItem(ROLE_KEY) || '').toLowerCase().trim();
    var user = (localStorage.getItem(USER_KEY) || '').toUpperCase().trim();
    if (role === 'admin' || role === 'owner' || role === 'full' || role === 'superadmin' || role === 'super' || role === 'manager') return true;
    // Fallback: legacy nesto_role key (in case it is set by some builds)
    var legacyRole = (localStorage.getItem('nesto_role') || '').toLowerCase().trim();
    if (legacyRole === 'admin' || legacyRole === 'owner' || legacyRole === 'full') return true;
    // Fallback: username-based (NESTOADMIN or any *ADMIN username)
    if (user === 'NESTOADMIN' || user.endsWith('ADMIN')) return true;
    var legacyUser = (localStorage.getItem('nesto_logged_in') || '').toUpperCase().trim();
    if (legacyUser === 'NESTOADMIN' || legacyUser.endsWith('ADMIN')) return true;
    return false;
  }

  // Live mapping kept in memory after load
  var _liveMapping = null;

  function getMapping() {
    return _liveMapping || getCachedMapping();
  }

  // ── Firestore load/save (via window fns injected by firebase.js) ─────────

  function firestoreReady() {
    return typeof window._firestoreLoadEmpMapping === 'function' &&
           typeof window._firestoreSaveEmpMapping === 'function';
  }

  function waitForFirestore(cb, retries) {
    retries = retries === undefined ? 20 : retries;
    if (firestoreReady()) { cb(); return; }
    if (retries <= 0) { cb(); return; }
    setTimeout(function () { waitForFirestore(cb, retries - 1); }, 300);
  }

  function loadFromFirestore(onDone) {
    waitForFirestore(function () {
      if (!firestoreReady()) { onDone(getCachedMapping(), 0, false); return; }
      window._firestoreLoadEmpMapping().then(function (result) {
        if (result.ok && result.count > 0) {
          _liveMapping = result.mapping;
          setCachedMapping(result.mapping);
          onDone(result.mapping, result.count, true);
        } else {
          // Fall back to local cache
          var cached = getCachedMapping();
          _liveMapping = cached;
          onDone(cached, Object.keys(cached).length, false);
        }
      }).catch(function () {
        var cached = getCachedMapping();
        _liveMapping = cached;
        onDone(cached, Object.keys(cached).length, false);
      });
    });
  }

  function saveToFirestore(mapping, onResult) {
    waitForFirestore(function () {
      if (!firestoreReady()) { onResult({ ok: false, error: 'Firebase not ready' }); return; }
      window._firestoreSaveEmpMapping(mapping).then(function (r) { onResult(r); })
        .catch(function (e) { onResult({ ok: false, error: String(e) }); });
    });
  }

  // ── Badge ────────────────────────────────────────────────────────────────

  function updateBadge(count, fromCloud) {
    var badge = document.getElementById('empIdBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = (fromCloud ? '☁️' : '💾') + ' ' + count + ' EMP IDs';
      badge.style.display = 'flex';
      badge.style.background = 'rgba(16,185,129,.15)';
      badge.style.borderColor = 'rgba(16,185,129,.5)';
      badge.style.color = '#6ee7b7';
    } else {
      badge.textContent = '⚠️ No EMP IDs';
      badge.style.display = 'flex';
      badge.style.background = 'rgba(245,158,11,.1)';
      badge.style.borderColor = 'rgba(245,158,11,.4)';
      badge.style.color = '#fcd34d';
    }
  }

  // ── Excel parsing ────────────────────────────────────────────────────────

  function parseExcelMapping(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = new Uint8Array(e.target.result);
          var wb = XLSX.read(data, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          if (rows.length < 2) { reject('Excel file is empty or has no data rows.'); return; }

          var headers = rows[0].map(function (h) { return String(h || '').toLowerCase().replace(/[\s_\-\.]/g, ''); });
          var personCodeCol = -1;
          var empIdCol = -1;

          headers.forEach(function (h, i) {
            if ((h.includes('person') && h.includes('code')) || h === 'personcode') {
              if (personCodeCol === -1) personCodeCol = i;
            }
            if (h === 'empid' || h === 'employeeid' || h === 'empno' || h === 'employeeno' ||
                h === 'staffid' || h === 'staffno' || (h.startsWith('emp') && h.includes('id'))) {
              if (empIdCol === -1) empIdCol = i;
            }
          });

          if (personCodeCol === -1 || empIdCol === -1) {
            for (var i = 1; i < Math.min(rows.length, 5); i++) {
              rows[i].forEach(function (cell, ci) {
                if (/^\d{14}$/.test(String(cell || '').trim()) && personCodeCol === -1) personCodeCol = ci;
              });
            }
            if (personCodeCol !== -1 && empIdCol === -1) empIdCol = personCodeCol === 0 ? 1 : 0;
          }

          if (personCodeCol === -1 || empIdCol === -1) {
            reject('Could not find "Person Code" and "EMP ID" columns.\n\nColumn headers found: ' + rows[0].join(', ') + '\n\nExpected headers like "Person Code" and "EMP ID" or "Employee ID".');
            return;
          }

          var mapping = {};
          var count = 0;
          for (var r = 1; r < rows.length; r++) {
            var row = rows[r];
            var personCode = String(row[personCodeCol] || '').trim();
            var empId = String(row[empIdCol] || '').trim();
            if (personCode && empId) { mapping[personCode] = empId; count++; }
          }

          if (count === 0) { reject('No valid Person Code \u2194 EMP ID pairs found.'); return; }
          resolve({ mapping: mapping, count: count });
        } catch (err) {
          reject('Failed to parse Excel: ' + (err.message || err));
        }
      };
      reader.onerror = function () { reject('Failed to read file.'); };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Admin Panel ───────────────────────────────────────────────────────────

  function showAdminPanel() {
    var existing = document.getElementById('empIdAdminPanel');
    if (existing) { existing.remove(); return; }

    var mapping = getMapping();
    var count = Object.keys(mapping).length;

    var panel = document.createElement('div');
    panel.id = 'empIdAdminPanel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:\'Space Grotesk\',sans-serif;';

    panel.innerHTML =
      '<div style="background:#0f1a2e;border:1px solid rgba(14,165,233,.45);border-radius:16px;padding:32px 36px;width:460px;max-width:95vw;box-shadow:0 24px 70px rgba(0,0,0,.85);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;">' +
          '<div style="font-size:17px;font-weight:800;color:#fff;">&#x1F512; Admin — EMP ID Cloud Mapping</div>' +
          '<button id="empIdAdminClose" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#aaa;width:30px;height:30px;border-radius:7px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;">&#x2715;</button>' +
        '</div>' +

        '<div id="empIdAdminMsg" style="display:none;margin-bottom:16px;padding:11px 14px;border-radius:9px;font-size:13px;font-weight:600;white-space:pre-line;line-height:1.6;"></div>' +

        '<div style="background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.18);border-radius:10px;padding:16px;margin-bottom:22px;">' +
          '<div style="font-size:11px;color:#7dd3fc;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;">&#x2601;&#xFE0F; Cloud Mapping Status</div>' +
          '<div style="font-size:14px;color:#e2e8f0;">' +
            (count > 0
              ? '<strong style="color:#10b981;">' + count + '</strong> Person Code &harr; EMP ID pairs in Firestore'
              : '<span style="color:#f59e0b;">&#x26A0; No mapping uploaded yet</span>') +
          '</div>' +
          '<div style="font-size:11px;color:#4a5568;margin-top:6px;">Shared with all users who log in</div>' +
        '</div>' +

        '<div style="margin-bottom:22px;">' +
          '<div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Upload New Mapping</div>' +
          '<div style="font-size:12px;color:#4a5568;margin-bottom:12px;line-height:1.7;">' +
            'Your Excel must contain these two columns:<br>' +
            '<div style="display:inline-flex;gap:8px;margin:8px 0;flex-wrap:wrap;">' +
              '<span style="background:rgba(14,165,233,.12);border:1px solid rgba(14,165,233,.3);border-radius:5px;padding:3px 10px;color:#7dd3fc;font-weight:700;font-size:12px;font-family:monospace;">Person Code</span>' +
              '<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:5px;padding:3px 10px;color:#6ee7b7;font-weight:700;font-size:12px;font-family:monospace;">Emp. Id</span>' +
            '</div><br>' +
            'Extra columns (No, Name, Profession, etc.) are ignored automatically.<br>' +
            'Uploading will <strong style="color:#f59e0b;">replace</strong> the existing cloud mapping.' +
          '</div>' +
          '<label id="empIdDropLabel" style="display:flex;flex-direction:column;align-items:center;gap:8px;border:2px dashed rgba(14,165,233,.3);border-radius:10px;padding:22px;cursor:pointer;transition:all .2s;background:rgba(14,165,233,.03);">' +
            '<span style="font-size:32px;">&#x1F4E5;</span>' +
            '<span style="font-size:13px;color:#7dd3fc;font-weight:600;">Click to select .xlsx / .xls file</span>' +
            '<span style="font-size:11px;color:#4a5568;">Will be saved to Firestore &amp; shared with all users</span>' +
            '<input type="file" accept=".xlsx,.xls" id="empIdFileInput" style="display:none">' +
          '</label>' +
        '</div>' +

        (count > 0
          ? '<button id="empIdClearBtn" style="width:100%;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:14px;transition:all .2s;">&#x1F5D1; Clear Cloud Mapping (removes for all users)</button>'
          : '') +

        '<div style="font-size:11px;color:#374151;text-align:center;line-height:1.7;margin-top:4px;">' +
          '&#x1F510; Only admins can upload. All users see the same EMP IDs automatically.' +
        '</div>' +
      '</div>';

    document.body.appendChild(panel);

    document.getElementById('empIdAdminClose').onclick = function () { panel.remove(); };
    panel.addEventListener('click', function (e) { if (e.target === panel) panel.remove(); });

    var lbl = document.getElementById('empIdDropLabel');
    lbl.addEventListener('mouseenter', function () { lbl.style.borderColor = 'rgba(14,165,233,.7)'; lbl.style.background = 'rgba(14,165,233,.07)'; });
    lbl.addEventListener('mouseleave', function () { lbl.style.borderColor = 'rgba(14,165,233,.3)'; lbl.style.background = 'rgba(14,165,233,.03)'; });

    document.getElementById('empIdFileInput').onchange = function () { handleFile(this); };

    var clearBtn = document.getElementById('empIdClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('mouseenter', function () { clearBtn.style.background = 'rgba(239,68,68,.28)'; });
      clearBtn.addEventListener('mouseleave', function () { clearBtn.style.background = 'rgba(239,68,68,.12)'; });
      clearBtn.onclick = function () { confirmClearMapping(); };
    }
  }

  function confirmClearMapping() {
    var panel = document.getElementById('empIdAdminPanel');
    if (panel) panel.remove();
    var msg = document.getElementById('empIdAdminMsg');

    // Re-open with confirmation state
    showAdminPanel();
    var newPanel = document.getElementById('empIdAdminPanel');
    var newMsg = newPanel && newPanel.querySelector('#empIdAdminMsg');
    if (!newMsg) return;

    // Show confirm prompt
    newMsg.style.display = 'block';
    newMsg.style.background = 'rgba(239,68,68,.1)';
    newMsg.style.border = '1px solid rgba(239,68,68,.3)';
    newMsg.style.color = '#fca5a5';
    newMsg.innerHTML =
      '&#x26A0;&#xFE0F; This will remove the EMP ID mapping for <strong>all users</strong>.<br>' +
      '<button onclick="window._empIdDoClear()" style="margin-top:8px;background:rgba(239,68,68,.3);border:1px solid rgba(239,68,68,.5);color:#fff;border-radius:6px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer;">Confirm Clear</button>' +
      '&nbsp;<button onclick="document.getElementById(\'empIdAdminPanel\').remove()" style="margin-top:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#aaa;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;">Cancel</button>';
  }

  window._empIdDoClear = function () {
    var panel = document.getElementById('empIdAdminPanel');
    if (panel) panel.remove();

    _liveMapping = {};
    setCachedMapping({});
    updateBadge(0, true);
    applyEmpIdsToTable();

    saveToFirestore({}, function (r) {
      if (r.ok) {
        toast && toast('✅ Cloud mapping cleared. All users will see no EMP IDs.', '');
      } else {
        toast && toast('⚠️ Cleared locally but Firestore save failed: ' + r.error, 'warn');
      }
      showAdminPanel();
    });
  };

  function handleFile(input) {
    var file = input.files[0];
    if (!file) return;

    var msg = document.getElementById('empIdAdminMsg');
    if (!msg) return;
    showMsg(msg, 'info', '\u23F3 Reading Excel file\u2026');

    parseExcelMapping(file).then(function (result) {
      showMsg(msg, 'info', '\u2601\uFE0F Saving ' + result.count + ' pairs to Firestore\u2026');
      // Save locally first
      _liveMapping = result.mapping;
      setCachedMapping(result.mapping);

      saveToFirestore(result.mapping, function (r) {
        if (r.ok) {
          updateBadge(result.count, true);
          applyEmpIdsToTable();
          showMsg(msg, 'success',
            '\u2705 ' + result.count + ' EMP ID pairs saved to Firestore!\n' +
            'All users will automatically see EMP IDs when they extract data.');
          setTimeout(function () {
            var panel = document.getElementById('empIdAdminPanel');
            if (panel) { panel.remove(); showAdminPanel(); }
          }, 2000);
        } else {
          showMsg(msg, 'warn',
            '\u26A0\uFE0F Saved locally but Firestore upload failed:\n' + r.error + '\n\nOther users will not see the mapping until it is re-uploaded.');
          updateBadge(result.count, false);
          applyEmpIdsToTable();
        }
      });
    }).catch(function (err) {
      showMsg(msg, 'error', '\u274C ' + err);
    });
  }

  function showMsg(el, type, text) {
    if (!el) return;
    var styles = {
      info:    'rgba(14,165,233,.08)',  'info-b':    'rgba(14,165,233,.2)',  'info-c':    '#7dd3fc',
      success: 'rgba(16,185,129,.1)',   'success-b': 'rgba(16,185,129,.25)', 'success-c': '#6ee7b7',
      warn:    'rgba(245,158,11,.1)',   'warn-b':    'rgba(245,158,11,.3)',  'warn-c':    '#fcd34d',
      error:   'rgba(239,68,68,.1)',    'error-b':   'rgba(239,68,68,.25)', 'error-c':   '#fca5a5'
    };
    el.style.display = 'block';
    el.style.background = styles[type];
    el.style.border = '1px solid ' + styles[type + '-b'];
    el.style.color = styles[type + '-c'];
    el.textContent = text;
  }

  // ── Table injection ───────────────────────────────────────────────────────

  function injectHeader() {
    var hdrRow = document.querySelector('#sw table thead tr.hdr');
    if (!hdrRow || document.getElementById('th-empId')) return;

    // Insert EMP. ID as 2nd column (after #)
    var th = document.createElement('th');
    th.id = 'th-empId';
    th.textContent = 'EMP. ID';
    th.style.cssText = 'background:#142030;color:#7dd3fc;font-weight:800;white-space:nowrap;text-align:center;font-size:12px;letter-spacing:.3px;border-left:2px solid rgba(14,165,233,.3);cursor:default;';
    th.title = 'Employee ID — loaded from cloud mapping';
    var ths = hdrRow.querySelectorAll('th');
    if (ths.length > 1) hdrRow.insertBefore(th, ths[1]);
    else hdrRow.appendChild(th);

    // Do NOT touch the filter row — app.js uses its cell count internally
  }

  function filterByEmpId(value) {
    document.querySelectorAll('#tbody tr').forEach(function (row) {
      var cell = row.querySelector('td[data-empid]');
      if (!cell) return;
      if (!value) { row.style.display = ''; return; }
      row.style.display = (cell.dataset.empid || '').toLowerCase().includes(value.toLowerCase()) ? '' : 'none';
    });
  }

  function applyEmpIdsToTable() {
    var mapping = getMapping();
    document.querySelectorAll('#tbody tr').forEach(function (row) { applyEmpIdToRow(row, mapping); });
  }

  function applyEmpIdToRow(row, mapping) {
    if (!mapping) mapping = getMapping();

    var empIdCell = row.querySelector('td[data-empid]');
    if (!empIdCell) {
      empIdCell = document.createElement('td');
      empIdCell.setAttribute('data-empid', '');
      empIdCell.style.cssText = 'font-size:12px;font-family:monospace;text-align:center;border-left:2px solid rgba(14,165,233,.15);';
      // Insert as 2nd cell (after # column)
      var tds = row.querySelectorAll('td');
      if (tds.length > 1) row.insertBefore(empIdCell, tds[1]);
      else row.appendChild(empIdCell);
    }

    // Find 14-digit person code in the row
    var personCode = '';
    row.querySelectorAll('td').forEach(function (cell) {
      if (!personCode) {
        var txt = (cell.textContent || '').trim();
        if (/^\d{14}$/.test(txt)) personCode = txt;
      }
    });

    var empId = personCode ? (mapping[personCode] || '') : '';
    empIdCell.dataset.empid = empId;

    if (empId) {
      empIdCell.textContent = empId;
      empIdCell.style.color = '#10b981';
      empIdCell.style.fontWeight = '700';
      empIdCell.style.background = '';
      empIdCell.title = '';
    } else if (personCode) {
      empIdCell.textContent = '\u26A0 MISSING';
      empIdCell.style.color = '#ef4444';
      empIdCell.style.fontWeight = '700';
      empIdCell.style.background = 'rgba(239,68,68,.08)';
      empIdCell.title = 'Person Code ' + personCode + ' not found in EMP ID mapping';
    } else {
      empIdCell.textContent = '';
      empIdCell.style.color = '';
      empIdCell.style.fontWeight = 'normal';
      empIdCell.style.background = '';
      empIdCell.title = '';
    }
  }

  function watchTable() {
    var tbody = document.getElementById('tbody');
    if (!tbody) return;

    var observer = new MutationObserver(function (mutations) {
      injectHeader();
      var mapping = getMapping();
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.tagName === 'TR') applyEmpIdToRow(node, mapping);
        });
      });
    });

    observer.observe(tbody, { childList: true });
    injectHeader();
    applyEmpIdsToTable();
  }

  // ── Generic EMP ID injection for any table (used by WPS section) ──────────

  function rowHasPersonCode(row) {
    var found = false;
    row.querySelectorAll('td').forEach(function (cell) {
      if (/^\d{14}$/.test((cell.textContent || '').trim())) found = true;
    });
    return found;
  }

  function injectHeaderForTable(table) {
    if (!table || table._empIdHdrDone) return;
    var thead = table.querySelector('thead');
    if (!thead) return;
    var hdrRow = thead.querySelector('tr.hdr') || thead.querySelector('tr');
    if (!hdrRow || hdrRow.querySelector('th[data-empid-th]')) return;
    var ths = hdrRow.querySelectorAll('th');
    if (ths.length < 2) return;

    var th = document.createElement('th');
    th.setAttribute('data-empid-th', '1');
    th.textContent = 'EMP. ID';
    th.style.cssText = 'background:#142030;color:#7dd3fc;font-weight:800;white-space:nowrap;text-align:center;font-size:12px;letter-spacing:.3px;border-left:2px solid rgba(14,165,233,.3);cursor:default;';
    th.title = 'Employee ID — from cloud mapping';
    // Insert as 2nd column (after first TH)
    hdrRow.insertBefore(th, ths[1]);

    // Do NOT touch the filter row — app.js uses its cell count internally

    table._empIdHdrDone = true;
  }

  function setupEmpIdForTbody(tbody) {
    if (!tbody || tbody._empIdWatched) return;
    tbody._empIdWatched = true;

    var table = tbody.closest ? tbody.closest('table') : tbody.parentNode;
    var mapping = getMapping();

    // Apply to existing rows (if any have person codes)
    var rows = tbody.querySelectorAll('tr');
    var confirmed = false;
    rows.forEach(function (row) {
      if (rowHasPersonCode(row)) confirmed = true;
    });
    if (confirmed && table) injectHeaderForTable(table);
    rows.forEach(function (row) { applyEmpIdToRow(row, mapping); });

    // Watch for new rows
    var observer = new MutationObserver(function (mutations) {
      var map = getMapping();
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1 || node.tagName !== 'TR') return;
          if (rowHasPersonCode(node) && table) injectHeaderForTable(table);
          applyEmpIdToRow(node, map);
        });
      });
    });
    observer.observe(tbody, { childList: true });
  }

  function watchWpsSection() {
    var wpsSection = document.getElementById('wpsSection');
    if (!wpsSection) return;

    function scanForTbodies() {
      wpsSection.querySelectorAll('tbody').forEach(function (tb) { setupEmpIdForTbody(tb); });
    }

    scanForTbodies(); // handle anything already there

    var observer = new MutationObserver(function () { scanForTbodies(); });
    observer.observe(wpsSection, { childList: true, subtree: true });
  }

  // ── Titlebar injection ────────────────────────────────────────────────────

  function injectTitlebarUI() {
    var wbtns = document.querySelector('.titlebar .wbtns');
    if (!wbtns) return;

    // Admin-only: badge + upload button
    if (isAdmin()) {
      if (!document.getElementById('empIdBadge')) {
        var badge = document.createElement('div');
        badge.id = 'empIdBadge';
        badge.style.cssText = 'display:none;align-items:center;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.5);border-radius:4px;padding:0 10px;height:24px;font-size:10px;color:#6ee7b7;font-weight:700;margin-right:4px;white-space:nowrap;cursor:default;';
        badge.title = 'EMP ID mapping status (admin only)';
        wbtns.insertBefore(badge, wbtns.firstChild);
      }
      if (!document.getElementById('empIdAdminBtn')) {
        var btn = document.createElement('button');
        btn.id = 'empIdAdminBtn';
        btn.textContent = '\uD83D\uDD27 EMP ID';
        btn.title = 'Admin: Upload EMP ID \u2194 Person Code mapping to cloud';
        btn.style.cssText = 'background:rgba(14,165,233,.18);border:1px solid rgba(14,165,233,.4);color:#7dd3fc;padding:0 12px;height:24px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;margin-right:4px;';
        btn.addEventListener('mouseenter', function () { btn.style.background = 'rgba(14,165,233,.38)'; });
        btn.addEventListener('mouseleave', function () { btn.style.background = 'rgba(14,165,233,.18)'; });
        btn.onclick = showAdminPanel;
        wbtns.insertBefore(btn, wbtns.firstChild);
      }
    }
    // Regular users: no badge, no button — EMP IDs silently appear in the table after extraction
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  // ── Excel export hook ────────────────────────────────────────────────────

  function injectEmpIdIntoWorkbook(wb) {
    var mapping = getMapping();
    if (!mapping) return;

    wb.SheetNames.forEach(function (sheetName) {
      var ws = wb.Sheets[sheetName];
      if (!ws || !ws['!ref']) return;

      var range = XLSX.utils.decode_range(ws['!ref']);
      var minR = range.s.r, maxR = range.e.r;
      var minC = range.s.c, maxC = range.e.c;

      // Find Person Code column in header row
      var personCodeCol = -1;
      for (var c = minC; c <= maxC; c++) {
        var hCell = ws[XLSX.utils.encode_cell({ r: minR, c: c })];
        if (hCell && hCell.v) {
          var h = String(hCell.v).toLowerCase().replace(/[\s_\-]/g, '');
          if (h.includes('person') && h.includes('code')) { personCodeCol = c; break; }
        }
      }

      // Insert new column at position 1 (after # which is col 0)
      var insertAt = minC + 1;

      // Shift all columns >= insertAt one step to the right (right-to-left to avoid overwrite)
      for (var r = minR; r <= maxR; r++) {
        for (var col = maxC; col >= insertAt; col--) {
          var src = XLSX.utils.encode_cell({ r: r, c: col });
          var dst = XLSX.utils.encode_cell({ r: r, c: col + 1 });
          if (ws[src]) { ws[dst] = ws[src]; delete ws[src]; }
          else { delete ws[dst]; }
        }
      }

      // Extend range by 1 column
      range.e.c = maxC + 1;
      ws['!ref'] = XLSX.utils.encode_range(range);

      // Extend !cols if present
      if (ws['!cols'] && Array.isArray(ws['!cols'])) {
        ws['!cols'].splice(insertAt, 0, { wch: 13 });
      }

      // Write header cell
      ws[XLSX.utils.encode_cell({ r: minR, c: insertAt })] = {
        v: 'EMP. ID', t: 's',
        s: { font: { bold: true, color: { rgb: '7dd3fc' } }, fill: { patternType: 'solid', fgColor: { rgb: '142030' } } }
      };

      // Person Code column is now at personCodeCol + 1 (shifted right)
      var shiftedPC = personCodeCol >= insertAt ? personCodeCol + 1 : personCodeCol;

      // Write EMP ID data rows
      for (var dr = minR + 1; dr <= maxR; dr++) {
        var empId = '';
        var isMissing = false;
        if (shiftedPC >= 0) {
          var pcCell = ws[XLSX.utils.encode_cell({ r: dr, c: shiftedPC })];
          var pc = pcCell ? String(pcCell.v || '').trim() : '';
          if (pc) {
            empId = mapping[pc] || '';
            isMissing = !empId;
          }
        }
        ws[XLSX.utils.encode_cell({ r: dr, c: insertAt })] = isMissing
          ? { v: 'MISSING', t: 's', s: { font: { bold: true, color: { rgb: 'ef4444' } }, fill: { patternType: 'solid', fgColor: { rgb: 'fee2e2' } } } }
          : { v: empId, t: 's', s: empId ? { font: { bold: true, color: { rgb: '10b981' } } } : {} };
      }
    });
  }

  function setupXlsxHook() {
    if (typeof XLSX === 'undefined' || !XLSX.writeFile) return;
    if (XLSX._empIdHooked) return;
    var _orig = XLSX.writeFile;
    XLSX.writeFile = function (wb, name, opts) {
      try { injectEmpIdIntoWorkbook(wb); } catch (e) { /* never break export */ }
      return _orig.call(XLSX, wb, name, opts);
    };
    XLSX._empIdHooked = true;
  }

  function onAppVisible() {
    injectTitlebarUI();
    watchTable();
    watchWpsSection();
    setupXlsxHook();

    // Load mapping from Firestore cloud (works for all users)
    loadFromFirestore(function (mapping, count, fromCloud) {
      _liveMapping = mapping;
      updateBadge(count, fromCloud);
      if (count > 0) applyEmpIdsToTable();
    });
  }

  function init() {
    var _done = false;
    function trySetup() {
      if (_done) return;
      // Fire as soon as the main toolbar (.wbtns) exists in the DOM
      if (document.querySelector('.titlebar .wbtns')) {
        _done = true;
        onAppVisible();
        return;
      }
      setTimeout(trySetup, 400);
    }
    trySetup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
