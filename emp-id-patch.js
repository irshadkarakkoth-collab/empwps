/**
 * EMPWPSCTR — Emp. ID Patch v3 (Targeted)
 * ─────────────────────────────────────────
 * Works by directly watching the known tbody IDs
 * instead of scanning all tables.
 *
 * Employee List tbody : id="tbody"
 *   Row structure AFTER header edits in app.html:
 *     td[0] = row#  td[1] = Emp.ID(injected)  td[2] = No
 *     td[3] = Person Code  td[4] = Name ...
 *   Person Code to read from original row: td[2] (No) shifts to td[2]
 *   Actually, BEFORE injection the app.js creates rows with:
 *     td[0]=# td[1]=No td[2]=PersonCode td[3]=Name ...
 *   So we read td[2] and inject BEFORE td[1].
 *
 * WPS tbody: built dynamically inside #wpsSection
 *   Row structure (before injection):
 *     td[0]=# td[1]=PersonCode td[2]=Name ...
 *   We read td[1] and inject BEFORE td[1].
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

  /* ──────────────────────────────────────────
   * LOAD MAP
   * ────────────────────────────────────────── */
  async function loadMap() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
      if (c.ts && Date.now() - c.ts < TTL && c.data) {
        window.empIdMap = c.data;
        console.log('[EmpID] ' + Object.keys(c.data).length + ' from cache');
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
      console.log('[EmpID] Loaded ' + all.length + ' from Firebase');
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

  /* ──────────────────────────────────────────
   * CELL BUILDER
   * ────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────
   * EMPLOYEE LIST (id="tbody")
   *   Before injection: td[0]=# td[1]=No td[2]=PersonCode td[3]=Name...
   *   After  injection: td[0]=# td[1]=EmpID td[2]=No td[3]=PersonCode...
   * ────────────────────────────────────────── */
  function injectEmpRow(tr) {
    if (tr.hasAttribute(DONE)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length < 3) return;
    var pc    = tds[2].textContent.trim(); /* Person Code is td[2] */
    var empId = window.getEmpId(pc);
    var cell  = makeEmpIdCell(empId);
    tr.insertBefore(cell, tds[1]); /* insert before td[1] (No) → becomes 2nd col */
    tr.setAttribute(DONE, empId || '—');
  }

  function watchEmpTbody() {
    var tbody = document.getElementById('tbody');
    if (!tbody) {
      /* tbody not in DOM yet — wait */
      setTimeout(watchEmpTbody, 300);
      return;
    }

    /* Process any rows already there */
    tbody.querySelectorAll('tr').forEach(injectEmpRow);

    /* Watch for new rows being added */
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1 && n.tagName === 'TR') injectEmpRow(n);
          else if (n.nodeType === 1) n.querySelectorAll('tr').forEach(injectEmpRow);
        });
      });
    }).observe(tbody, { childList: true, subtree: true });
  }

  /* ──────────────────────────────────────────
   * WPS SECTION (id="wpsSection")
   *   Built entirely by the obfuscated JS.
   *   Row structure before injection:
   *     td[0]=# td[1]=PersonCode td[2]=Name...
   *   After injection:
   *     td[0]=# td[1]=EmpID td[2]=PersonCode td[3]=Name...
   * ────────────────────────────────────────── */
  var WPS_DONE = 'data-weid';

  function makeWpsEmpIdTh() {
    var th = document.createElement('th');
    th.textContent = 'Emp. ID';
    th.style.cssText = 'color:#2ecc71;font-weight:700;white-space:nowrap;padding:6px 8px;cursor:default;';
    th.setAttribute('data-weid-th', '1');
    return th;
  }

  function makeWpsEmpIdFilterTh() {
    var th = document.createElement('th');
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
    var pc    = tds[1].textContent.trim(); /* Person Code is td[1] in WPS */
    var empId = window.getEmpId(pc);
    var cell  = makeEmpIdCell(empId);
    tr.insertBefore(cell, tds[1]); /* insert before td[1] → becomes 2nd col */
    tr.setAttribute(WPS_DONE, empId || '—');
  }

  function setupWpsTable(table) {
    if (table.getAttribute('data-weid-setup')) return;
    table.setAttribute('data-weid-setup', '1');

    /* Inject header rows */
    var thead = table.querySelector('thead');
    if (thead) {
      var headerRows = thead.querySelectorAll('tr');
      headerRows.forEach(function (tr, i) {
        var cells = tr.querySelectorAll('th, td');
        if (cells.length < 2) return;
        if (tr.querySelector('[data-weid-th]')) return; /* already done */
        /* First header row → name header, subsequent → filter rows */
        var newTh = (i === 0) ? makeWpsEmpIdTh() : makeWpsEmpIdFilterTh();
        tr.insertBefore(newTh, cells[1]);
      });
    }

    /* Inject existing body rows */
    var tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(injectWpsRow);

      /* Watch for new WPS rows */
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
    var wpsSection = document.getElementById('wpsSection');
    if (!wpsSection) { setTimeout(watchWpsSection, 300); return; }

    /* If table already exists */
    var existing = wpsSection.querySelector('table');
    if (existing) setupWpsTable(existing);

    /* Watch for table being added to WPS section */
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          var tables = n.tagName === 'TABLE' ? [n] : n.querySelectorAll('table');
          tables.forEach(setupWpsTable);
        });
      });
    }).observe(wpsSection, { childList: true, subtree: true });
  }

  /* ──────────────────────────────────────────
   * RE-PROCESS (for rows already in DOM when map loads)
   * ────────────────────────────────────────── */
  function processAllExistingRows() {
    /* Employee List */
    var tbody = document.getElementById('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(function (tr) {
        /* If already injected but was '—', retry with loaded map */
        var existing = tr.querySelector('[' + DONE + ']');
        if (existing && existing.getAttribute(DONE) === '—') {
          var tds = tr.querySelectorAll('td');
          /* The injected cell is now td[1], PersonCode is td[3] after injection */
          /* Find the injected cell directly */
          var eidCell = tr.querySelector('[data-eid]');
          if (eidCell) {
            /* PersonCode is the next-next sibling after # and EmpID */
            var allTds = tr.querySelectorAll('td');
            var pc = allTds[3] ? allTds[3].textContent.trim() : '';
            var empId = window.getEmpId(pc);
            if (empId) {
              eidCell.textContent = empId;
              eidCell.style.color = '#2ecc71';
              eidCell.style.fontWeight = '700';
              eidCell.setAttribute('data-eid', empId);
              tr.setAttribute(DONE, empId);
            }
          }
        } else if (!tr.hasAttribute(DONE)) {
          injectEmpRow(tr);
        }
      });
    }

    /* WPS */
    var wpsSection = document.getElementById('wpsSection');
    if (wpsSection) {
      wpsSection.querySelectorAll('table').forEach(function (tbl) {
        if (!tbl.getAttribute('data-weid-setup')) {
          setupWpsTable(tbl);
        } else {
          tbl.querySelectorAll('tbody tr').forEach(function (tr) {
            var eidCell = tr.querySelector('[data-weid]');
            if (eidCell && eidCell.getAttribute(WPS_DONE) === '—') {
              var allTds = tr.querySelectorAll('td');
              var pc = allTds[2] ? allTds[2].textContent.trim() : '';
              var empId = window.getEmpId(pc);
              if (empId) {
                eidCell.textContent = empId;
                eidCell.style.color = '#2ecc71';
                eidCell.style.fontWeight = '700';
                eidCell.setAttribute(WPS_DONE, empId);
              }
            } else if (!tr.hasAttribute(WPS_DONE)) {
              injectWpsRow(tr);
            }
          });
        }
      });
    }
  }

  /* ──────────────────────────────────────────
   * INIT
   * ────────────────────────────────────────── */
  async function init() {
    await loadMap();

    watchEmpTbody();
    watchWpsSection();

    /* After map loads, fill in any '—' cells */
    setTimeout(processAllExistingRows, 500);
    setTimeout(processAllExistingRows, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
