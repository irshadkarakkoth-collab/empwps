/**
 * EMPWPSCTR — Emp. ID Patch v4
 * ─────────────────────────────────────────
 * 1. DOM injection: adds Emp. ID as 2nd column in Employee List & WPS tables
 * 2. EXCEL EXPORT injection: intercepts XLSX.utils.json_to_sheet and
 *    aoa_to_sheet so Emp. ID (and correct % values) appear in the download
 */
(function () {
  'use strict';

  /* ── Firebase config ── */
  var API_KEY = 'AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs';
  var PROJECT = 'empwppconvert';
  var COLL    = 'empMapping';
  var CACHE   = 'empIdMapCache';
  var TTL     = 10 * 60 * 1000;

  window.empIdMap = {};

  /* ══════════════════════════════════════════
   * LOAD MAP FROM FIRESTORE
   * ══════════════════════════════════════════ */
  async function loadMap() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
      if (c.ts && Date.now() - c.ts < TTL && c.data) {
        window.empIdMap = c.data;
        console.log('[EmpID] ' + Object.keys(c.data).length + ' entries from cache');
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
        var j = await r.json();
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
      console.log('[EmpID] Loaded ' + all.length + ' entries from Firestore');
      try { sessionStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), data: map })); } catch(e) {}
    } catch (err) {
      console.warn('[EmpID] Load failed, retrying in 5s:', err);
      setTimeout(loadMap, 5000);
    }
  }

  window.getEmpId = function (pc) {
    return window.empIdMap[String(pc || '').trim()] || '';
  };

  window.reloadEmpIdMap = async function () {
    try { sessionStorage.removeItem(CACHE); } catch (e) {}
    window.empIdMap = {};
    await loadMap();
    processAllExistingRows();
  };

  /* ══════════════════════════════════════════
   * EXCEL EXPORT — PATCH XLSX LIBRARY
   * Intercepts SheetJS before it builds the
   * workbook so Emp. ID appears in the file.
   * ══════════════════════════════════════════ */

  function patchXlsx() {
    if (typeof XLSX === 'undefined') {
      setTimeout(patchXlsx, 300);
      return;
    }

    /* ── json_to_sheet (array of objects) ── */
    var _origJson = XLSX.utils.json_to_sheet;
    XLSX.utils.json_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 0 && data[0]) {
          var keys      = Object.keys(data[0]);
          /* Detect Employee List: has 'personCode' or 'Person Code' key */
          var pcKey     = keys.find(function (k) { return /person.?code/i.test(k); });
          /* Detect WPS: look for a % / pct / ratio key */
          var pctKey    = !pcKey && keys.find(function (k) { return /^%$|pct|percent|ratio/i.test(k); });

          if (pcKey) {
            /* ── Employee List export ── inject Emp. ID as 2nd column ── */
            var newHeader = null;
            if (opts && Array.isArray(opts.header)) {
              newHeader      = opts.header.slice();
              var firstIdx   = 0; /* after serial # */
              newHeader.splice(firstIdx + 1, 0, 'Emp. ID');
              opts           = Object.assign({}, opts, { header: newHeader });
            }

            data = data.map(function (row) {
              var out    = {};
              var done   = false;
              var pcVal  = String(row[pcKey] || '').trim();
              var empId  = window.getEmpId(pcVal);
              Object.keys(row).forEach(function (k) {
                out[k] = row[k];
                if (!done) {
                  /* insert Emp. ID right after the first key */
                  out['Emp. ID'] = empId || '—';
                  done = true;
                }
              });
              return out;
            });

          } else if (pctKey) {
            /* ── WPS export ── format % column as readable string ── */
            data = data.map(function (row) {
              var out = Object.assign({}, row);
              var v   = parseFloat(out[pctKey]);
              if (!isNaN(v)) {
                var pct = Math.round(v * 100);
                out[pctKey] = (pct > 100 ? '>' : '') + pct + '%';
              }
              return out;
            });
          }
        }
      } catch (e) {
        console.warn('[EmpID] json_to_sheet patch error:', e);
      }
      return _origJson.call(this, data, opts);
    };

    /* ── aoa_to_sheet (array of arrays — used by some multi-sheet exports) ── */
    var _origAoa = XLSX.utils.aoa_to_sheet;
    XLSX.utils.aoa_to_sheet = function (data, opts) {
      try {
        if (Array.isArray(data) && data.length > 1) {
          var header = data[0]; /* first row = column headers */
          if (!Array.isArray(header)) {
            return _origAoa.call(this, data, opts);
          }

          /* Find Person Code column index */
          var pcIdx = -1;
          for (var i = 0; i < header.length; i++) {
            if (/person.?code/i.test(String(header[i] || ''))) { pcIdx = i; break; }
          }

          /* Find % column index for WPS */
          var pctIdx = -1;
          if (pcIdx === -1) {
            for (var j = 0; j < header.length; j++) {
              if (/^%$|pct|percent|ratio/i.test(String(header[j] || ''))) { pctIdx = j; break; }
            }
          }

          if (pcIdx !== -1) {
            /* ── Employee List aoa export ── inject Emp. ID as 2nd col ── */
            data = data.map(function (row, rowIdx) {
              if (!Array.isArray(row)) return row;
              var out = row.slice();
              if (rowIdx === 0) {
                /* Header row — insert 'Emp. ID' at position 1 */
                out.splice(1, 0, 'Emp. ID');
              } else {
                /* Data row — read Person Code from pcIdx+1 (shifted by our insert) */
                /* Actually, for data rows we read BEFORE insertion so use pcIdx */
                var pc    = String(row[pcIdx] || '').trim();
                var empId = window.getEmpId(pc);
                out.splice(1, 0, empId || '—');
              }
              return out;
            });

          } else if (pctIdx !== -1) {
            /* ── WPS aoa export ── format % column ── */
            data = data.map(function (row, rowIdx) {
              if (!Array.isArray(row) || rowIdx === 0) return row;
              var out = row.slice();
              var v   = parseFloat(out[pctIdx]);
              if (!isNaN(v)) {
                var pct   = Math.round(v * 100);
                out[pctIdx] = (pct > 100 ? '>' : '') + pct + '%';
              }
              return out;
            });
          }
        }
      } catch (e) {
        console.warn('[EmpID] aoa_to_sheet patch error:', e);
      }
      return _origAoa.call(this, data, opts);
    };

    console.log('[EmpID] XLSX export patched — Emp. ID + % will appear in Excel downloads');
  }

  /* ══════════════════════════════════════════
   * DOM INJECTION — EMPLOYEE LIST
   * tbody id="tbody" — rows added by app.js
   * Before injection: td[0]=# td[1]=No td[2]=PersonCode td[3]=Name...
   * After  injection: td[0]=# td[1]=EmpID td[2]=No td[3]=PersonCode...
   * ══════════════════════════════════════════ */
  var DONE = 'data-eid';

  function makeEmpIdCell(empId) {
    var td = document.createElement('td');
    td.setAttribute(DONE, empId || '—');
    td.textContent = empId || '—';
    td.style.cssText = 'color:' + (empId ? '#2ecc71' : '#888')
      + ';font-family:monospace;font-size:12px;font-weight:' + (empId ? '700' : '400')
      + ';padding:4px 8px;white-space:nowrap;';
    return td;
  }

  function injectEmpRow(tr) {
    if (tr.hasAttribute(DONE)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length < 3) return;
    var pc    = tds[2].textContent.trim();
    var empId = window.getEmpId(pc);
    tr.insertBefore(makeEmpIdCell(empId), tds[1]);
    tr.setAttribute(DONE, empId || '—');
  }

  function watchEmpTbody() {
    var tbody = document.getElementById('tbody');
    if (!tbody) { setTimeout(watchEmpTbody, 300); return; }
    tbody.querySelectorAll('tr').forEach(injectEmpRow);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1 && n.tagName === 'TR') injectEmpRow(n);
          else if (n.nodeType === 1) n.querySelectorAll('tr').forEach(injectEmpRow);
        });
      });
    }).observe(tbody, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════
   * DOM INJECTION — WPS SECTION
   * wpsSection built dynamically by obfuscated app.js
   * Before injection: td[0]=# td[1]=PersonCode td[2]=Name...
   * After  injection: td[0]=# td[1]=EmpID td[2]=PersonCode...
   * ══════════════════════════════════════════ */
  var WPS_DONE = 'data-weid';

  function makeWpsEmpIdTh() {
    var th = document.createElement('th');
    th.textContent = 'Emp. ID';
    th.style.cssText = 'color:#2ecc71;font-weight:700;white-space:nowrap;padding:6px 8px;';
    th.setAttribute('data-weid-th', '1');
    return th;
  }

  function makeWpsEmpIdFilterTh() {
    var th  = document.createElement('th');
    var inp = document.createElement('input');
    inp.placeholder = 'Emp ID…';
    inp.style.cssText = 'width:80px;font-size:11px;padding:2px 4px;border:1px solid #ccc;border-radius:3px;';
    th.appendChild(inp);
    th.setAttribute('data-weid-th', '1');
    return th;
  }

  function injectWpsRow(tr) {
    if (tr.hasAttribute(WPS_DONE)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length < 2) return;
    var pc    = tds[1].textContent.trim();
    var empId = window.getEmpId(pc);
    tr.insertBefore(makeEmpIdCell(empId), tds[1]);
    tr.setAttribute(WPS_DONE, empId || '—');
  }

  function setupWpsTable(table) {
    if (table.getAttribute('data-weid-setup')) return;
    table.setAttribute('data-weid-setup', '1');
    var thead = table.querySelector('thead');
    if (thead) {
      thead.querySelectorAll('tr').forEach(function (tr, i) {
        if (tr.querySelector('[data-weid-th]')) return;
        var cells = tr.querySelectorAll('th, td');
        if (cells.length < 2) return;
        var newTh = (i === 0) ? makeWpsEmpIdTh() : makeWpsEmpIdFilterTh();
        tr.insertBefore(newTh, cells[1]);
      });
    }
    var tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(injectWpsRow);
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1 && n.tagName === 'TR') injectWpsRow(n);
            else if (n.nodeType === 1) n.querySelectorAll('tr').forEach(injectWpsRow);
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
   * RE-PROCESS EXISTING ROWS AFTER MAP LOADS
   * ══════════════════════════════════════════ */
  function processAllExistingRows() {
    var tbody = document.getElementById('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var eidCell = tr.querySelector('[' + DONE + ']');
        if (eidCell && eidCell.getAttribute(DONE) === '—') {
          var allTds = tr.querySelectorAll('td');
          /* After injection: td[0]=# td[1]=EmpID td[2]=No td[3]=PersonCode */
          var pc = allTds[3] ? allTds[3].textContent.trim() : '';
          var empId = window.getEmpId(pc);
          if (empId) {
            eidCell.textContent = empId;
            eidCell.style.color = '#2ecc71';
            eidCell.style.fontWeight = '700';
            eidCell.setAttribute(DONE, empId);
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
    patchXlsx();        /* patch Excel BEFORE app.js can call exportExcel */
    watchEmpTbody();
    watchWpsSection();
    setTimeout(processAllExistingRows, 500);
    setTimeout(processAllExistingRows, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
