/**
 * EMPWPSCTR — Emp. ID + Type Patch v3 (Server Edition)
 * ─────────────────────────────────────────────────────
 * Loads Emp. ID mappings from GitHub.
 * Also injects a "Type" column (card/permit type from PDF).
 */
(function () {
  'use strict';

  var CACHE = 'empIdMapCache_v2';
  var TTL   = 10 * 60 * 1000; // 10 minutes

  window.empIdMap = {};
  window.empCardTypeByPersonCode = window.empCardTypeByPersonCode || {};

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
      var r = await fetch('https://raw.githubusercontent.com/irshadkarakkoth-collab/emp-data/refs/heads/main/empMapping.json');
      if (!r.ok) { console.warn('[EmpID-Server] ❌ HTTP error:', r.status); return; }
      var j = await r.json();
      window.empIdMap = j || {};
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

  window.getCardType = function (pc) {
    return (window.empCardTypeByPersonCode || {})[String(pc || '').trim()] || '';
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

  /* ── Type filter ─────────────────────────────────────── */
  var TYPE_COL_ATTR = 'data-ctype';

  window.applyTypeFilter = function () {
    var inp = document.getElementById('cfType');
    if (!inp) return;
    var q = inp.value.trim().toLowerCase();
    var tbody = document.getElementById('tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var typeCell = tr.querySelector('[' + TYPE_COL_ATTR + ']');
      if (!typeCell) return;
      var val = typeCell.textContent.toLowerCase();
      var match = !q || val.indexOf(q) !== -1;
      tr.style.display = match ? '' : 'none';
    });
  };

  /* ── WPS Pct Map ─────────────────────────────────────── */
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

  /* ── XLSX Patch ──────────────────────────────────────── */
  function patchXlsx() {
    if (typeof XLSX === 'undefined') { setTimeout(patchXlsx, 300); return; }

    var _origJson = XLSX.utils.json_to_sheet;
    XLSX.utils.json_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 0 && data[0]) {
          var keys   = Object.keys(data[0]);
          var pcKey  = keys.find(function (k) { return /person.?code/i.test(k); });
          var pctKey = keys.find(function (k) { return k.trim() === '%'; });
          var cardNoKey = keys.find(function (k) { return /card.?(no|number)/i.test(k); });
          var alreadyHasEmpId = keys.some(function (k) { return /emp.?\s*id/i.test(k); });
          if (pcKey) {
            var wpsPctMap = pctKey ? captureWpsPctMap() : {};
            if (opts && Array.isArray(opts.header)) {
              opts = Object.assign({}, opts);
              if (!alreadyHasEmpId) {
                opts.header = [opts.header[0], 'Emp. ID'].concat(opts.header.slice(1));
              }
              if (cardNoKey) {
                var cnIdx = opts.header.indexOf(cardNoKey);
                var typeAlreadyInHeader = opts.header.some(function(h){ return /^type$/i.test(String(h||'').trim()); });
                if (cnIdx !== -1 && !typeAlreadyInHeader) opts.header.splice(cnIdx + 1, 0, 'Type');
              }
            }
            data = data.map(function (row) {
              var out = {}, empIdDone = false, typeDone = false;
              var pc    = String(row[pcKey] || '').trim();
              var empId = window.getEmpId(pc);
              var ctype = window.getCardType(pc);
              Object.keys(row).forEach(function (k) {
                if (/^cardType$/i.test(k)) return; // skip — will be output as 'Type'
                if (k === pctKey && wpsPctMap[pc]) { out[k] = wpsPctMap[pc]; }
                else { out[k] = row[k]; }
                if (!empIdDone && !alreadyHasEmpId) { out['Emp. ID'] = empId || '—'; empIdDone = true; }
                if (cardNoKey && k === cardNoKey && !typeDone) {
                  out['Type'] = ctype || row['cardType'] || '';
                  typeDone = true;
                }
              });
              if (!typeDone && row['cardType']) { out['Type'] = ctype || row['cardType']; }
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
          var pcIdx = -1, pctIdx = -1, cardNoIdx = -1, empIdIdx = -1, typeIdx = -1;
          for (var i = 0; i < header.length; i++) {
            var h = String(header[i] || '');
            if (pcIdx     === -1 && /person.?code/i.test(h))      pcIdx     = i;
            if (pctIdx    === -1 && h.trim() === '%')              pctIdx    = i;
            if (cardNoIdx === -1 && /card.?(no|number)/i.test(h)) cardNoIdx = i;
            if (empIdIdx  === -1 && /emp.?\s*id/i.test(h))        empIdIdx  = i;
            if (typeIdx   === -1 && /^type$/i.test(h.trim()))     typeIdx   = i;
          }
          var needEmpId = empIdIdx === -1;
          var needType  = typeIdx  === -1;
          var wpsPctMap = (pcIdx !== -1 && pctIdx !== -1) ? captureWpsPctMap() : {};
          if (pcIdx !== -1) {
            data = data.map(function (row, rowIdx) {
              if (!Array.isArray(row)) return row;
              var out = row.slice();
              var shift = 0;
              // Insert Emp. ID at position 1 only if not already present
              if (needEmpId) {
                if (rowIdx === 0) {
                  out.splice(1, 0, 'Emp. ID');
                } else {
                  var pc    = String(row[pcIdx] || '').trim();
                  var empId = window.getEmpId(pc);
                  out.splice(1, 0, empId || '—');
                  if (pctIdx !== -1 && wpsPctMap[pc]) out[pctIdx + 1] = wpsPctMap[pc];
                }
                shift = 1;
              } else {
                // Still fill in the Emp. ID value at existing column position
                if (rowIdx !== 0) {
                  var pc = String(row[pcIdx] || '').trim();
                  out[empIdIdx] = window.getEmpId(pc) || out[empIdIdx] || '—';
                  if (pctIdx !== -1 && wpsPctMap[pc]) out[pctIdx] = wpsPctMap[pc];
                }
              }
              // Insert Type after Card Number only if not already present
              if (needType && cardNoIdx !== -1) {
                var typeInsertIdx = cardNoIdx + 1 + shift;
                if (rowIdx === 0) {
                  out.splice(typeInsertIdx, 0, 'Type');
                } else {
                  var pc2   = String(row[pcIdx] || '').trim();
                  var ctype = window.getCardType(pc2);
                  out.splice(typeInsertIdx, 0, ctype || '');
                }
              } else if (!needType && typeIdx !== -1) {
                // Fill value in existing Type column
                if (rowIdx !== 0) {
                  var pc3   = String(row[pcIdx] || '').trim();
                  var ctype3 = window.getCardType(pc3);
                  if (ctype3) out[typeIdx] = ctype3;
                }
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

  /* ── Employee table row injection ────────────────────── */
  var DONE = 'data-eid';

  function makeEmpIdCell(empId) {
    var td = document.createElement('td');
    td.setAttribute(DONE, empId || '—');
    td.textContent = empId || '—';
    td.style.cssText = 'color:' + (empId ? '#2ecc71' : '#aaa')
      + ';font-family:monospace;font-size:12px;font-weight:' + (empId ? '700' : '400')
      + ';padding:4px 8px;white-space:nowrap;';
    return td;
  }

  function makeTypeCell(cardType) {
    var td = document.createElement('td');
    td.setAttribute(TYPE_COL_ATTR, cardType || '');
    td.textContent = cardType || '';
    var color = '#ccc', bg = 'transparent';
    if (/renew labour/i.test(cardType))    { color = '#f39c12'; bg = 'rgba(243,156,18,0.12)'; }
    else if (/new labour/i.test(cardType)) { color = '#27ae60'; bg = 'rgba(39,174,96,0.12)'; }
    else if (/work permit/i.test(cardType)){ color = '#3498db'; bg = 'rgba(52,152,219,0.12)'; }
    td.style.cssText = 'color:' + color + ';background:' + bg
      + ';font-size:11px;font-weight:600;padding:4px 8px;white-space:nowrap;'
      + 'text-align:center;border-radius:4px;';
    return td;
  }

  function injectEmpRow(tr) {
    if (tr.hasAttribute(DONE)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length < 3) return;
    var pc       = String(tds[2].textContent).trim();
    var empId    = window.getEmpId(pc);
    var cardType = window.getCardType(pc);

    // Insert Emp. ID before tds[1] (No column)
    tr.insertBefore(makeEmpIdCell(empId), tds[1]);

    // Insert Type after Card Number (tds[7] = original Card Number cell)
    // After Emp. ID insertion, tds[7] is still the same DOM element
    if (tds[7]) {
      tr.insertBefore(makeTypeCell(cardType), tds[7].nextSibling);
    }

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

  /* ── WPS table row injection ─────────────────────────── */
  var WPS_DONE = 'data-weid';

  function makeCell(empId) {
    return makeEmpIdCell(empId);
  }

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
          // After injection, Person Code is at index 3 (#, EmpID, No, PersonCode)
          var pc = tds[3] ? String(tds[3].textContent).trim() : '';
          var empId = window.getEmpId(pc);
          if (empId) {
            cell.textContent = empId;
            cell.style.color = '#2ecc71';
            cell.style.fontWeight = '700';
            cell.setAttribute(DONE, empId);
            tr.setAttribute(DONE, empId);
          }
          // Also update type cell if it's empty
          var typeCell = tr.querySelector('[' + TYPE_COL_ATTR + ']');
          if (typeCell && !typeCell.getAttribute(TYPE_COL_ATTR) && pc) {
            var ctype = window.getCardType(pc);
            if (ctype) {
              typeCell.textContent = ctype;
              typeCell.setAttribute(TYPE_COL_ATTR, ctype);
            }
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
