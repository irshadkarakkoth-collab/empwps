/**
 * EMPWPSCTR — Emp. ID Patch v2 (Server Edition)
 * ─────────────────────────────────────────────────
 * Loads Emp. ID mappings from the local server API
 * instead of Firebase. Everything else is identical.
 */
(function () {
  'use strict';

  var CACHE = 'empIdMapCache_v2';
  var TTL   = 10 * 60 * 1000; // 10 minutes

  window.empIdMap = {};

  async function loadMap() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
      if (c.ts && Date.now() - c.ts < TTL && c.data) {
        window.empIdMap = c.data;
        console.log('[EmpID-Server] ✅ Loaded ' + Object.keys(c.data).length + ' entries from cache');
        return;
      }
    } catch (e) {}

    try {
      var r = await fetch('https://f18d820d-cc6b-4d8f-bc63-b4c382def94e-00-1xvxg4vkwk67q.pike.replit.dev/api/emp-mapping');
      if (!r.ok) { console.warn('[EmpID-Server] ❌ HTTP error:', r.status); return; }
      var j = await r.json();
      if (!j.ok) { console.warn('[EmpID-Server] ❌ API error'); return; }
      window.empIdMap = j.data || {};
      var count = Object.keys(window.empIdMap).length;
      console.log('[EmpID-Server] ✅ Loaded ' + count + ' entries from server');
      if (count === 0) {
        console.warn('[EmpID-Server] ⚠️ Map is empty — upload data via /admin2.html');
      } else {
        console.log('[EmpID-Server] Sample keys:', Object.keys(window.empIdMap).slice(0, 3));
      }
      try { sessionStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), data: window.empIdMap })); } catch(e) {}
    } catch (err) {
      console.warn('[EmpID-Server] ❌ Load failed:', err);
      setTimeout(loadMap, 5000);
    }
  }

  window.getEmpId = function (pc) {
    return window.empIdMap[String(pc || '').trim()] || '';
  };

  window.checkEmpId = function (pc) {
    var result = window.getEmpId(pc);
    console.log('[EmpID-Server] checkEmpId("' + pc + '") =', result || '(not found)');
    console.log('[EmpID-Server] Total entries:', Object.keys(window.empIdMap).length);
  };

  window.reloadEmpIdMap = async function () {
    try { sessionStorage.removeItem(CACHE); } catch (e) {}
    window.empIdMap = {};
    await loadMap();
    processAllExistingRows();
  };

  function captureWpsPctMap() {
    var map = {};
    try {
      var sec = document.getElementById('wpsSection');
      if (!sec) return map;
      var tbl = sec.querySelector('table');
      if (!tbl) return map;
      var hdrRow = tbl.querySelector('thead tr');
      if (!hdrRow) return map;
      var hdrCells = hdrRow.querySelectorAll('th,td');
      var pcColIdx = -1, pctColIdx = -1;
      hdrCells.forEach(function (th, i) {
        var txt = th.textContent.trim();
        if (pcColIdx  === -1 && /person.?code/i.test(txt)) pcColIdx  = i;
        if (pctColIdx === -1 && txt === '%')                pctColIdx = i;
      });
      if (pcColIdx === -1 || pctColIdx === -1) return map;
      var tbody = tbl.querySelector('tbody');
      if (!tbody) return map;
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var tds = tr.querySelectorAll('td');
        var pc  = tds[pcColIdx]  ? tds[pcColIdx].textContent.trim()  : '';
        var pct = tds[pctColIdx] ? tds[pctColIdx].textContent.trim() : '';
        if (pc && pct) map[pc] = pct;
      });
    } catch (e) {}
    return map;
  }

  function patchXlsx() {
    if (typeof XLSX === 'undefined') { setTimeout(patchXlsx, 300); return; }

    var _origJson = XLSX.utils.json_to_sheet;
    XLSX.utils.json_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 0 && data[0]) {
          var keys   = Object.keys(data[0]);
          var pcKey  = keys.find(function (k) { return /person.?code/i.test(k); });
          var pctKey = keys.find(function (k) { return k.trim() === '%'; });
          if (pcKey) {
            var wpsPctMap = pctKey ? captureWpsPctMap() : {};
            if (opts && Array.isArray(opts.header)) {
              opts = Object.assign({}, opts);
              opts.header = [opts.header[0], 'Emp. ID'].concat(opts.header.slice(1));
            }
            data = data.map(function (row) {
              var out = {}, done = false;
              var pc    = String(row[pcKey] || '').trim();
              var empId = window.getEmpId(pc);
              Object.keys(row).forEach(function (k) {
                if (k === pctKey && wpsPctMap[pc]) { out[k] = wpsPctMap[pc]; }
                else { out[k] = row[k]; }
                if (!done) { out['Emp. ID'] = empId || '—'; done = true; }
              });
              return out;
            });
          }
        }
      } catch (e) {}
      return _origJson.call(this, data, opts);
    };

    var _origAoa = XLSX.utils.aoa_to_sheet;
    XLSX.utils.aoa_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
          var header = data[0];
          var pcIdx = -1, pctIdx = -1;
          for (var i = 0; i < header.length; i++) {
            var h = String(header[i] || '');
            if (pcIdx  === -1 && /person.?code/i.test(h)) pcIdx  = i;
            if (pctIdx === -1 && h.trim() === '%')         pctIdx = i;
          }
          var wpsPctMap = (pcIdx !== -1 && pctIdx !== -1) ? captureWpsPctMap() : {};
          if (pcIdx !== -1) {
            data = data.map(function (row, rowIdx) {
              if (!Array.isArray(row)) return row;
              var out = row.slice();
              if (rowIdx === 0) {
                out.splice(1, 0, 'Emp. ID');
              } else {
                var pc    = String(row[pcIdx] || '').trim();
                var empId = window.getEmpId(pc);
                out.splice(1, 0, empId || '—');
                if (pctIdx !== -1 && wpsPctMap[pc]) out[pctIdx + 1] = wpsPctMap[pc];
              }
              return out;
            });
          }
        }
      } catch (e) {}
      return _origAoa.call(this, data, opts);
    };

    console.log('[EmpID-Server] ✅ XLSX export patched');
  }

  var DONE = 'data-eid';

  function makeCell(empId) {
    var td = document.createElement('td');
    td.setAttribute(DONE, empId || '—');
    td.textContent = empId || '—';
    td.style.cssText = 'color:' + (empId ? '#2ecc71' : '#aaa')
      + ';font-family:monospace;font-size:12px;font-weight:' + (empId ? '700' : '400')
      + ';padding:4px 8px;white-space:nowrap;';
    return td;
  }

  function injectEmpRow(tr) {
    if (tr.hasAttribute(DONE)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length < 3) return;
    var pc    = String(tds[2].textContent).trim();
    var empId = window.getEmpId(pc);
    tr.insertBefore(makeCell(empId), tds[1]);
    tr.setAttribute(DONE, empId || '—');
  }

  function watchEmpTbody() {
    var tbody = document.getElementById('tbody');
    if (!tbody) { setTimeout(watchEmpTbody, 300); return; }
    tbody.querySelectorAll('tr').forEach(injectEmpRow);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'TR') injectEmpRow(n);
          else n.querySelectorAll('tr').forEach(injectEmpRow);
        });
      });
    }).observe(tbody, { childList: true, subtree: true });
  }

  var WPS_DONE = 'data-weid';

  function makeWpsTh(isFilter) {
    var th = document.createElement('th');
    if (isFilter) {
      var inp = document.createElement('input');
      inp.placeholder = 'Emp ID…';
      inp.style.cssText = 'width:76px;font-size:11px;padding:2px 4px;border:1px solid #ccc;border-radius:3px;';
      th.appendChild(inp);
    } else {
      th.textContent = 'Emp. ID';
      th.style.cssText = 'color:#2ecc71;font-weight:700;white-space:nowrap;padding:6px 8px;';
    }
    th.setAttribute('data-weid-th', '1');
    return th;
  }

  function injectWpsRow(tr) {
    if (tr.hasAttribute(WPS_DONE)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length < 2) return;
    var pc    = String(tds[1].textContent).trim();
    var empId = window.getEmpId(pc);
    tr.insertBefore(makeCell(empId), tds[1]);
    tr.setAttribute(WPS_DONE, empId || '—');
  }

  function setupWpsTable(table) {
    if (table.getAttribute('data-weid-setup')) return;
    table.setAttribute('data-weid-setup', '1');
    var thead = table.querySelector('thead');
    if (thead) {
      thead.querySelectorAll('tr').forEach(function (tr, i) {
        if (tr.querySelector('[data-weid-th]')) return;
        var cells = tr.querySelectorAll('th,td');
        if (cells.length < 2) return;
        tr.insertBefore(makeWpsTh(i > 0), cells[1]);
      });
    }
    var tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(injectWpsRow);
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.tagName === 'TR') injectWpsRow(n);
            else n.querySelectorAll('tr').forEach(injectWpsRow);
          });
        });
      }).observe(tbody, { childList: true, subtree: true });
    }
  }

  function watchWpsSection() {
    var sec = document.getElementById('wpsSection');
    if (!sec) { setTimeout(watchWpsSection, 300); return; }
    sec.querySelectorAll('table').forEach(setupWpsTable);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          var tables = n.tagName === 'TABLE' ? [n] : n.querySelectorAll('table');
          tables.forEach(setupWpsTable);
        });
      });
    }).observe(sec, { childList: true, subtree: true });
  }

  function processAllExistingRows() {
    var tbody = document.getElementById('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var cell = tr.querySelector('[' + DONE + ']');
        if (cell && cell.getAttribute(DONE) === '—') {
          var tds = tr.querySelectorAll('td');
          var pc = tds[3] ? String(tds[3].textContent).trim() : '';
          var empId = window.getEmpId(pc);
          if (empId) {
            cell.textContent = empId;
            cell.style.color = '#2ecc71';
            cell.style.fontWeight = '700';
            cell.setAttribute(DONE, empId);
            tr.setAttribute(DONE, empId);
          }
        } else if (!tr.hasAttribute(DONE)) {
          injectEmpRow(tr);
        }
      });
    }
    var sec = document.getElementById('wpsSection');
    if (sec) {
      sec.querySelectorAll('table').forEach(function (tbl) {
        if (!tbl.getAttribute('data-weid-setup')) setupWpsTable(tbl);
        else tbl.querySelectorAll('tbody tr').forEach(function (tr) {
          if (!tr.hasAttribute(WPS_DONE)) injectWpsRow(tr);
        });
      });
    }
  }

  async function init() {
    await loadMap();
    patchXlsx();
    watchEmpTbody();
    watchWpsSection();
    setTimeout(processAllExistingRows, 800);
    setTimeout(processAllExistingRows, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
