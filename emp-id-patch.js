/**
 * EMPWPSCTR — Employee ID Lookup Patch
 * ------------------------------------------------------------
 * Add this script AFTER firebase.js and BEFORE the closing </body>
 * tag in your app.html file.
 *
 * What it does:
 *  1. On load, fetches the full empMapping collection from Firebase
 *     and caches it as window.empIdMap = { personCode: empId }
 *  2. Patches the table renderer to inject an "Emp. ID" column
 *     (2nd column) in both Employee List and WPS Salary tables.
 *  3. Patches the Excel export to include the Emp. ID column.
 * ------------------------------------------------------------
 */

(function() {
  'use strict';

  /* ── CONFIG ── */
  const FIREBASE_API_KEY = 'AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs';
  const FIREBASE_PROJECT  = 'empwppconvert';
  const COLLECTION        = 'empMapping';
  const CACHE_KEY         = 'empIdMapCache';
  const CACHE_TTL_MS      = 10 * 60 * 1000; // 10 minutes

  /* ── Global lookup map: { personCode (string) → empId (string) } ── */
  window.empIdMap = {};

  /* ──────────────────────────────────────────────────────────
   * 1. LOAD MAPPING FROM FIREBASE (REST API, no SDK needed)
   * ────────────────────────────────────────────────────────── */
  async function loadEmpIdMap() {
    /* Try memory cache first */
    if (Object.keys(window.empIdMap).length > 0) return;

    /* Try sessionStorage cache */
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL_MS) {
          window.empIdMap = data;
          console.log('[EmpID] Loaded ' + Object.keys(data).length + ' records from cache.');
          return;
        }
      }
    } catch(e) {}

    /* Fetch from Firestore REST */
    try {
      let pageToken = null;
      let allDocs = [];
      do {
        let url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT
          + '/databases/(default)/documents/' + COLLECTION
          + '?key=' + FIREBASE_API_KEY + '&pageSize=300';
        if (pageToken) url += '&pageToken=' + pageToken;

        const res  = await fetch(url);
        const data = await res.json();
        if (data.documents) allDocs = allDocs.concat(data.documents);
        pageToken = data.nextPageToken || null;
      } while (pageToken);

      const map = {};
      allDocs.forEach(function(d) {
        const f  = d.fields || {};
        const pc = (f.personCode && f.personCode.stringValue) || '';
        const id = (f.empId      && f.empId.stringValue)      || '';
        if (pc) map[pc] = id;
      });

      window.empIdMap = map;
      console.log('[EmpID] Loaded ' + allDocs.length + ' records from Firebase.');

      /* Cache it */
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map }));
      } catch(e) {}
    } catch(err) {
      console.warn('[EmpID] Failed to load mapping:', err);
    }
  }

  /* ──────────────────────────────────────────────────────────
   * 2. LOOKUP HELPER
   * ────────────────────────────────────────────────────────── */
  window.getEmpId = function(personCode) {
    if (!personCode) return '';
    return window.empIdMap[String(personCode).trim()] || '';
  };

  /* ──────────────────────────────────────────────────────────
   * 3. TABLE COLUMN INJECTION (MutationObserver)
   *
   *    Watches every <table> in the real-app-wrapper for rows
   *    being added, then injects an Emp. ID cell at position 2
   *    (after the row number / first column).
   * ────────────────────────────────────────────────────────── */
  const EMP_ID_ATTR    = 'data-empid-injected';
  const HEADER_ATTR    = 'data-empid-header';
  const PERSON_CODE_COL_NAMES = ['person code', 'personcode', 'person_code'];

  /* Find the column index that holds Person Code in a <thead> row */
  function findPersonCodeColIndex(thead) {
    if (!thead) return -1;
    const ths = thead.querySelectorAll('th');
    for (let i = 0; i < ths.length; i++) {
      const txt = ths[i].textContent.trim().toLowerCase();
      if (PERSON_CODE_COL_NAMES.some(n => txt.includes(n))) return i;
    }
    return -1;
  }

  /* Inject header cell if not already injected */
  function injectHeaderCell(thead) {
    if (!thead || thead.getAttribute(HEADER_ATTR)) return;
    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;
    const ths = headerRow.querySelectorAll('th');
    if (ths.length < 2) return;

    /* Insert after 1st column */
    const th = document.createElement('th');
    th.textContent = 'Emp. ID';
    th.style.cssText = 'color:#6ee7b7;white-space:nowrap;';
    th.setAttribute('data-empid-th', '1');
    headerRow.insertBefore(th, ths[1]);
    thead.setAttribute(HEADER_ATTR, '1');
  }

  /* Inject data cell into a body row */
  function injectDataCell(tr, empId) {
    if (tr.getAttribute(EMP_ID_ATTR)) return;
    const tds = tr.querySelectorAll('td');
    if (tds.length < 1) return;

    const td = document.createElement('td');
    td.textContent = empId || '—';
    td.style.cssText = 'color:' + (empId ? '#6ee7b7' : '#4a5568') + ';font-family:monospace;font-size:12px;white-space:nowrap;';
    td.setAttribute('data-empid-td', '1');
    tr.insertBefore(td, tds[1] || tds[0].nextSibling);
    tr.setAttribute(EMP_ID_ATTR, empId || '');
  }

  /* Process a single table */
  function processTable(table) {
    const thead = table.querySelector('thead');
    if (!thead) return;
    /* Skip tables that already have our header */
    if (thead.getAttribute(HEADER_ATTR)) return;

    const pcColIdx = findPersonCodeColIndex(thead);
    if (pcColIdx === -1) return; /* Not an employee table */

    injectHeaderCell(thead);

    /* Process existing body rows */
    table.querySelectorAll('tbody tr').forEach(function(tr) {
      if (tr.getAttribute(EMP_ID_ATTR) !== null) return;
      const tds = tr.querySelectorAll('td');
      if (tds.length <= pcColIdx) return;
      const personCode = tds[pcColIdx].textContent.trim();
      injectDataCell(tr, window.getEmpId(personCode));
    });
  }

  /* Watch for new rows added to tables */
  function startObserver() {
    const appWrapper = document.getElementById('real-app-wrapper') || document.body;

    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;

          /* New table added */
          if (node.tagName === 'TABLE') { processTable(node); return; }

          /* New row added inside a table */
          if (node.tagName === 'TR') {
            const table = node.closest('table');
            if (!table) return;
            const thead = table.querySelector('thead');
            if (!thead || !thead.getAttribute(HEADER_ATTR)) { processTable(table); return; }

            /* Header already injected — just add the cell to this new row */
            if (node.closest('tbody')) {
              if (node.getAttribute(EMP_ID_ATTR) !== null) return;
              const pcColIdx = findPersonCodeColIndex(thead);
              if (pcColIdx === -1) return;
              const tds = node.querySelectorAll('td');
              if (tds.length <= pcColIdx) return;
              const personCode = tds[pcColIdx].textContent.trim();
              injectDataCell(node, window.getEmpId(personCode));
            }
            return;
          }

          /* Subtree changes (table rebuilt) */
          node.querySelectorAll('table').forEach(processTable);
        });
      });
    });

    observer.observe(appWrapper, { childList: true, subtree: true });
  }

  /* ──────────────────────────────────────────────────────────
   * 4. EXCEL EXPORT PATCH
   *
   *    Wraps the global exportToExcel / exportXLSX / any
   *    window function name the original app uses for export,
   *    and injects the Emp. ID as the 2nd column in the data.
   * ────────────────────────────────────────────────────────── */
  function patchExcelExport() {
    /* Known export function names used by the obfuscated app */
    const EXPORT_FN_NAMES = [
      'exportToExcel', 'exportXLSX', 'downloadExcel',
      'exportData', 'doExport', 'exportFile'
    ];

    function wrapExportFn(name) {
      if (typeof window[name] !== 'function') return;
      if (window[name].__empIdPatched) return;
      const original = window[name];
      window[name] = function() {
        /* Inject Emp. ID into global employee data array if present */
        injectEmpIdIntoData();
        return original.apply(this, arguments);
      };
      window[name].__empIdPatched = true;
    }

    EXPORT_FN_NAMES.forEach(wrapExportFn);

    /* Also watch for any future assignment */
    EXPORT_FN_NAMES.forEach(function(name) {
      let _val = window[name];
      Object.defineProperty(window, name, {
        get: function() { return _val; },
        set: function(fn) {
          _val = fn;
          if (typeof fn === 'function' && !fn.__empIdPatched) {
            const orig = fn;
            _val = function() {
              injectEmpIdIntoData();
              return orig.apply(this, arguments);
            };
            _val.__empIdPatched = true;
          }
        },
        configurable: true
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
   * 5. DATA ARRAY INJECTION
   *
   *    The app stores extracted records in a global array
   *    (window.empData, window.allRows, window.tableData, etc.)
   *    We add empId to each record if Person Code is present
   *    and it isn't already there.
   * ────────────────────────────────────────────────────────── */
  const DATA_ARRAY_NAMES = [
    'empData', 'allRows', 'tableData', 'employeeData',
    'extractedData', 'wpsData', 'allRecords', 'empRows'
  ];

  function injectEmpIdIntoData() {
    DATA_ARRAY_NAMES.forEach(function(name) {
      const arr = window[name];
      if (!Array.isArray(arr)) return;
      arr.forEach(function(row) {
        if (!row || typeof row !== 'object') return;
        if (row.empId !== undefined) return; /* already set */

        /* Find Person Code value */
        const pc = row['Person Code'] || row['personCode'] || row['person_code'] ||
                   row['PersonCode']  || row['PERSON CODE'] || '';
        row.empId = window.getEmpId(String(pc).trim());
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
   * 6. PERIODIC RE-PROCESS (fallback for dynamic renders)
   * ────────────────────────────────────────────────────────── */
  function reProcessAllTables() {
    document.querySelectorAll('table').forEach(processTable);
  }

  /* ──────────────────────────────────────────────────────────
   * 7. INIT
   * ────────────────────────────────────────────────────────── */
  async function init() {
    await loadEmpIdMap();
    startObserver();
    patchExcelExport();
    reProcessAllTables();

    /* Re-process a few times after page settles */
    setTimeout(reProcessAllTables, 1000);
    setTimeout(reProcessAllTables, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose refresh function so app can call window.reloadEmpIdMap() after admin saves */
  window.reloadEmpIdMap = async function() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch(e) {}
    window.empIdMap = {};
    await loadEmpIdMap();
    reProcessAllTables();
    console.log('[EmpID] Map reloaded.');
  };

})();
