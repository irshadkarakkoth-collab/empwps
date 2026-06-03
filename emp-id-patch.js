/**
 * EMPWPSCTR — Employee ID Lookup Patch v2
 * Add this script AFTER firebase.js and BEFORE </body> in app.html
 */
(function () {
  'use strict';

  /* ── CONFIG ── */
  var API_KEY   = 'AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs';
  var PROJECT   = 'empwppconvert';
  var COLL      = 'empMapping';
  var CACHE_KEY = 'empIdMapCache';
  var CACHE_TTL = 10 * 60 * 1000; // 10 min

  /* Column header text to detect Person Code column */
  var PC_HEADERS = ['person code', 'personcode', 'person_code'];

  /* ── GLOBAL MAP ── */
  window.empIdMap = {};

  /* ──────────────────────────────────────────────
   * 1. LOAD FROM FIREBASE (paged REST, no SDK)
   * ────────────────────────────────────────────── */
  async function loadMap() {
    /* sessionStorage cache */
    try {
      var c = sessionStorage.getItem(CACHE_KEY);
      if (c) {
        var p = JSON.parse(c);
        if (Date.now() - p.ts < CACHE_TTL) {
          window.empIdMap = p.data;
          console.log('[EmpID] ' + Object.keys(p.data).length + ' records from cache');
          return;
        }
      }
    } catch (e) {}

    var all = [];
    var nextPage = null;
    try {
      do {
        var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT
          + '/databases/(default)/documents/' + COLL
          + '?key=' + API_KEY + '&pageSize=300'
          + (nextPage ? '&pageToken=' + nextPage : '');
        var res  = await fetch(url);
        var json = await res.json();
        if (json.documents) all = all.concat(json.documents);
        nextPage = json.nextPageToken || null;
      } while (nextPage);

      var map = {};
      all.forEach(function (d) {
        var f  = d.fields || {};
        var pc = (f.personCode && f.personCode.stringValue) || '';
        var id = (f.empId      && f.empId.stringValue)      || '';
        if (pc) map[pc] = id;
      });
      window.empIdMap = map;
      console.log('[EmpID] Loaded ' + all.length + ' records from Firebase');

      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map }));
      } catch (e) {}
    } catch (err) {
      console.warn('[EmpID] Load failed:', err);
      /* Retry in 5 seconds */
      setTimeout(loadMap, 5000);
    }
  }

  window.getEmpId = function (personCode) {
    return window.empIdMap[String(personCode || '').trim()] || '';
  };

  window.reloadEmpIdMap = async function () {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {}
    window.empIdMap = {};
    await loadMap();
    scanAllTables();
  };

  /* ──────────────────────────────────────────────
   * 2. TABLE INJECTION
   * ────────────────────────────────────────────── */
  var INJECTED_ROW = 'data-eid-done';
  var INJECTED_HDR = 'data-eid-hdr';
  var EMP_ID_TH_CLASS = 'eid-th';

  function isPersonCodeHeader(text) {
    var t = (text || '').trim().toLowerCase();
    return PC_HEADERS.some(function (h) { return t === h || t.includes(h); });
  }

  function getPersonCodeColIndex(thead) {
    if (!thead) return -1;
    var ths = thead.querySelectorAll('th, td');
    for (var i = 0; i < ths.length; i++) {
      if (isPersonCodeHeader(ths[i].textContent)) return i;
    }
    return -1;
  }

  function injectHeader(thead) {
    if (!thead || thead.hasAttribute(INJECTED_HDR)) return false;
    var pcIdx = getPersonCodeColIndex(thead);
    if (pcIdx === -1) return false;

    var headerRow = thead.querySelector('tr');
    if (!headerRow) return false;
    var ths = headerRow.querySelectorAll('th, td');
    if (ths.length === 0) return false;

    /* Build the Emp. ID header cell */
    var th = document.createElement('th');
    th.textContent = 'Emp. ID';
    th.className = EMP_ID_TH_CLASS;
    th.style.cssText = [
      'color:#6ee7b7',
      'background:#112240',
      'font-weight:700',
      'font-size:12px',
      'padding:8px 12px',
      'white-space:nowrap',
      'border-right:1px solid rgba(14,165,233,0.2)',
      'text-align:left'
    ].join(';');

    /* Insert as 2nd column (after the # column) */
    var insertBefore = ths[1] || null;
    headerRow.insertBefore(th, insertBefore);
    thead.setAttribute(INJECTED_HDR, pcIdx);
    return true;
  }

  function injectRow(tr, pcIdx) {
    if (tr.hasAttribute(INJECTED_ROW)) return;
    var tds = tr.querySelectorAll('td');
    if (tds.length <= pcIdx) return;

    var personCode = tds[pcIdx].textContent.trim();
    var empId      = window.getEmpId(personCode);

    var td = document.createElement('td');
    td.textContent = empId || '—';
    td.setAttribute('data-eid-pc', personCode);
    td.style.cssText = [
      'color:' + (empId ? '#6ee7b7' : '#4a5568'),
      'font-family:monospace',
      'font-size:12px',
      'padding:8px 12px',
      'white-space:nowrap',
      'border-right:1px solid rgba(14,165,233,0.12)'
    ].join(';');

    var insertBefore = tds[1] || null;
    tr.insertBefore(td, insertBefore);
    tr.setAttribute(INJECTED_ROW, empId || '—');
  }

  function processTable(table) {
    if (!table || !table.querySelector) return;

    var thead = table.querySelector('thead');
    if (!thead) return;

    /* Get or inject header, record pcIdx */
    var pcIdx;
    if (thead.hasAttribute(INJECTED_HDR)) {
      pcIdx = parseInt(thead.getAttribute(INJECTED_HDR), 10);
    } else {
      pcIdx = getPersonCodeColIndex(thead);
      if (pcIdx === -1) return; /* not an employee table */
      injectHeader(thead);
    }

    /* Inject body rows */
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (tr) {
      injectRow(tr, pcIdx);
    });
  }

  function scanAllTables() {
    document.querySelectorAll('table').forEach(processTable);
  }

  /* ──────────────────────────────────────────────
   * 3. MUTATION OBSERVER — watches the whole body
   *    for ANY table/row changes
   * ────────────────────────────────────────────── */
  function startObserver() {
    var observer = new MutationObserver(function (mutations) {
      var needScan = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.addedNodes.length > 0) { needScan = true; break; }
        if (m.type === 'characterData') { needScan = true; break; }
      }
      if (needScan) {
        /* Debounce: wait 60ms then scan */
        clearTimeout(startObserver._t);
        startObserver._t = setTimeout(scanAllTables, 60);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false
    });
  }

  /* ──────────────────────────────────────────────
   * 4. INTERVAL FALLBACK — every 2s
   *    Catches cases where observer misses changes
   * ────────────────────────────────────────────── */
  function startInterval() {
    setInterval(function () {
      scanAllTables();
      /* Also re-fill any cells where empId was '—' but map is now loaded */
      if (Object.keys(window.empIdMap).length > 0) {
        document.querySelectorAll('[data-eid-pc]').forEach(function (td) {
          var pc = td.getAttribute('data-eid-pc');
          if (!pc) return;
          var eid = window.getEmpId(pc);
          if (eid && td.textContent === '—') {
            td.textContent = eid;
            td.style.color = '#6ee7b7';
            var tr = td.closest('tr');
            if (tr) tr.setAttribute(INJECTED_ROW, eid);
          }
        });
      }
    }, 2000);
  }

  /* ──────────────────────────────────────────────
   * 5. PATCH extractPDF — run scan after extract
   * ────────────────────────────────────────────── */
  function patchExtractPDF() {
    /* Wait until extractPDF function is defined */
    if (typeof window.extractPDF === 'function' && !window.extractPDF.__eidPatched) {
      var orig = window.extractPDF;
      window.extractPDF = function () {
        var result = orig.apply(this, arguments);
        /* Scan after a short delay (allow render to complete) */
        setTimeout(scanAllTables, 500);
        setTimeout(scanAllTables, 1500);
        setTimeout(scanAllTables, 3000);
        return result;
      };
      window.extractPDF.__eidPatched = true;
      return true;
    }
    return false;
  }

  /* ──────────────────────────────────────────────
   * 6. INIT
   * ────────────────────────────────────────────── */
  async function init() {
    /* Load Firebase data */
    await loadMap();

    /* Patch extractPDF if already defined, or watch for it */
    if (!patchExtractPDF()) {
      var patchAttempts = 0;
      var patchInterval = setInterval(function () {
        if (patchExtractPDF() || ++patchAttempts > 30) clearInterval(patchInterval);
      }, 500);
    }

    /* Start observer and interval */
    startObserver();
    startInterval();

    /* Initial scan */
    scanAllTables();
    setTimeout(scanAllTables, 1000);
    setTimeout(scanAllTables, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
