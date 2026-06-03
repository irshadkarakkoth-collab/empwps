/**
 * EMPWPSCTR — Emp. ID Patch v5
 * ─────────────────────────────────────────
 * 1. DOM injection  : adds Emp. ID as 2nd column in Employee List & WPS tables
 * 2. Excel injection: intercepts XLSX so Emp. ID appears in downloaded files
 *
 * NOTE: % column is intentionally NOT touched — the original app handles it.
 */
(function () {
  'use strict';

  var API_KEY = 'AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs';
  var PROJECT = 'empwppconvert';
  var COLL    = 'empMapping';
  var CACHE   = 'empIdMapCache';
  var TTL     = 10 * 60 * 1000;

  window.empIdMap = {};

  /* ══════════════════════════════════════════
   * LOAD MAP FROM FIRESTORE (REST API)
   * ══════════════════════════════════════════ */
  async function loadMap() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
      if (c.ts && Date.now() - c.ts < TTL && c.data) {
        window.empIdMap = c.data;
        console.log('[EmpID] ✅ Loaded ' + Object.keys(c.data).length + ' entries from cache');
        return;
      }
    } catch (e) {}

    var all = [], page = null;
    try {
      do {
        var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT
          + '/databases/(default)/documents/' + COLL
          + '?key=' + API_KEY + '&pageSize=300'
          + (page ? '&pageToken=' + page : '');
        var r = await fetch(url);
        if (!r.ok) {
          console.warn('[EmpID] ❌ Firestore HTTP error:', r.status, r.statusText);
          break;
        }
        var j = await r.json();
        if (j.error) {
          console.warn('[EmpID] ❌ Firestore error:', j.error.message);
          break;
        }
        if (j.documents) all = all.concat(j.documents);
        page = j.nextPageToken || null;
      } while (page);

      var map = {};
      all.forEach(function (d) {
        var f  = d.fields || {};
        var pc = (f.personCode && f.personCode.stringValue) || '';
        var id = (f.empId      && f.empId.stringValue)      || '';
        if (pc) map[pc] = id;
      });
      window.empIdMap = map;
      var count = Object.keys(map).length;
      console.log('[EmpID] ✅ Loaded ' + count + ' entries from Firestore');
      if (count === 0) {
        console.warn('[EmpID] ⚠️  Map is empty — no empMapping docs found in Firestore');
      } else {
        /* Log a sample to verify keys look right */
        var sample = Object.keys(map).slice(0, 3);
        console.log('[EmpID] Sample keys:', sample);
      }
      try { sessionStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), data: map })); } catch(e) {}
    } catch (err) {
      console.warn('[EmpID] ❌ Load failed:', err);
      setTimeout(loadMap, 5000);
    }
  }

  window.getEmpId = function (pc) {
    var key = String(pc || '').trim();
    var result = window.empIdMap[key] || '';
    return result;
  };

  /* Helper: open browser console and call this to test a Person Code */
  window.checkEmpId = function (pc) {
    var result = window.getEmpId(pc);
    console.log('[EmpID] checkEmpId("' + pc + '") =', result || '(not found)');
    console.log('[EmpID] Total entries in map:', Object.keys(window.empIdMap).length);
    var keys = Object.keys(window.empIdMap).slice(0, 5);
    console.log('[EmpID] First 5 keys in map:', keys);
  };

  window.reloadEmpIdMap = async function () {
    try { sessionStorage.removeItem(CACHE); } catch (e) {}
    window.empIdMap = {};
    await loadMap();
    processAllExistingRows();
  };

  /* ══════════════════════════════════════════
   * EXCEL EXPORT — PATCH XLSX
   * Only injects Emp. ID — does NOT touch % or any other column
   * ══════════════════════════════════════════ */
  function patchXlsx() {
    if (typeof XLSX === 'undefined') { setTimeout(patchXlsx, 300); return; }

    /* ── json_to_sheet (array of objects) ── */
    var _origJson = XLSX.utils.json_to_sheet;
    XLSX.utils.json_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 0 && data[0]) {
          var keys  = Object.keys(data[0]);
          var pcKey = keys.find(function (k) { return /person.?code/i.test(k); });

          if (pcKey) {
            /* Inject Emp. ID header into opts.header if provided */
            if (opts && Array.isArray(opts.header)) {
              opts = Object.assign({}, opts);
              opts.header = [opts.header[0], 'Emp. ID'].concat(opts.header.slice(1));
            }
            /* Inject Emp. ID value into each data row after the first key */
            data = data.map(function (row) {
              var out  = {};
              var done = false;
              var empId = window.getEmpId(row[pcKey]);
              Object.keys(row).forEach(function (k) {
                out[k] = row[k];
                if (!done) {
                  out['Emp. ID'] = empId || '—';
                  done = true;
                }
              });
              return out;
            });
          }
        }
      } catch (e) { console.warn('[EmpID] json_to_sheet error:', e); }
      return _origJson.call(this, data, opts);
    };

    /* ── aoa_to_sheet (array of arrays) ── */
    var _origAoa = XLSX.utils.aoa_to_sheet;
    XLSX.utils.aoa_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
          var header = data[0];
          var pcIdx  = -1;
          for (var i = 0; i < header.length; i++) {
            if (/person.?code/i.test(String(header[i] || ''))) { pcIdx = i; break; }
          }
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
              }
              return out;
            });
          }
        }
      } catch (e) { console.warn('[EmpID] aoa_to_sheet error:', e); }
      return _origAoa.call(this, data, opts);
    };

    console.log('[EmpID] ✅ XLSX export patched — Emp. ID will appear in downloads');
  }

  /* ══════════════════════════════════════════
   * DOM — EMPLOYEE LIST  (id="tbody")
   * Before injection: td[0]=# td[1]=No td[2]=PersonCode ...
   * After  injection: td[0]=# td[1]=EmpID td[2]=No td[3]=PersonCode ...
   * ══════════════════════════════════════════ */
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
    var pc    = String(tds[2].textContent).trim();   /* PersonCode at td[2] before inject */
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

  /* ══════════════════════════════════════════
   * DOM — WPS SECTION  (id="wpsSection")
   * Before injection: td[0]=# td[1]=PersonCode td[2]=Name ...
   * After  injection: td[0]=# td[1]=EmpID td[2]=PersonCode ...
   * ══════════════════════════════════════════ */
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
    var pc    = String(tds[1].textContent).trim();   /* PersonCode at td[1] before inject */
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

  /* ══════════════════════════════════════════
   * RE-PROCESS existing rows after map loads
   * ══════════════════════════════════════════ */
  function processAllExistingRows() {
    /* Employee List */
    var tbody = document.getElementById('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var cell = tr.querySelector('[' + DONE + ']');
        if (cell && cell.getAttribute(DONE) === '—') {
          /* Try again — map may have loaded since first attempt */
          var tds = tr.querySelectorAll('td');
          /* After injection: td[0]=# td[1]=EmpID td[2]=No td[3]=PersonCode */
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

    /* WPS */
    var sec = document.getElementById('wpsSection');
    if (sec) {
      sec.querySelectorAll('table').forEach(function (tbl) {
        if (!tbl.getAttribute('data-weid-setup')) {
          setupWpsTable(tbl);
        } else {
          tbl.querySelectorAll('tbody tr').forEach(function (tr) {
            if (!tr.hasAttribute(WPS_DONE)) injectWpsRow(tr);
          });
        }
      });
    }
  }

  /* ══════════════════════════════════════════
   * INIT
   * ══════════════════════════════════════════ */
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
