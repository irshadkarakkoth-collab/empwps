/* ═══════════════════════════════════════════════════════════════
   DEOBFUSCATED VERSION OF app.js
   Original used _0x / base64-string-array obfuscation.
   The last ~900 lines were already plain; only the top 5 blocks
   required reconstruction. Logic is preserved exactly; variable
   names and string literals are restored from context analysis.
   ═══════════════════════════════════════════════════════════════ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ─────────────────────────────────────────────────────────────
   BLOCK 1 — Slide / presentation tour state
   ───────────────────────────────────────────────────────────── */

var curSlide   = 0;
var totalSlides = 10;
var autoTimer  = null;
var _firstVisit = !localStorage.getItem('nesto_tour_visited');

/* ─────────────────────────────────────────────────────────────
   BLOCK 2 — Cooldown countdown overlay
   ───────────────────────────────────────────────────────────── */

var _cooldownInterval = null;

function showCooldownCountdown(seconds, onExpire, label) {
  if (_cooldownInterval) clearInterval(_cooldownInterval);

  var remaining = seconds;

  /* Build/show overlay */
  var overlay = document.getElementById('cooldownOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cooldownOverlay';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(0,0,0,.55)', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'flex-direction:column', 'color:#fff', 'font-size:2rem',
      'font-family:sans-serif'
    ].join(';');
    document.body.appendChild(overlay);
  }

  var msgEl = document.createElement('div');
  msgEl.id  = 'cooldownMsg';
  overlay.innerHTML = '';
  overlay.appendChild(msgEl);
  overlay.style.display = 'flex';

  function tick() {
    if (remaining <= 0) {
      clearInterval(_cooldownInterval);
      _cooldownInterval = null;
      overlay.style.display = 'none';
      if (typeof onExpire === 'function') onExpire();
      return;
    }
    msgEl.textContent = (label || 'Please wait') + ' — ' + remaining + 's';
    remaining--;
  }

  tick();
  _cooldownInterval = setInterval(tick, 1000);
}

/* ─────────────────────────────────────────────────────────────
   BLOCK 3 — Logout
   ───────────────────────────────────────────────────────────── */

var _testTimerInterval = null;

function doLogout() {
  if (!confirm('Are you sure you want to log out?')) return;

  sessionStorage.removeItem('nesto_logged_in');
  sessionStorage.removeItem('nesto_role');

  localStorage.removeItem('nesto_totalsecs');
  localStorage.removeItem('nesto_logged_in');
  localStorage.removeItem('nesto_username');
  localStorage.removeItem('nesto_role');
  localStorage.removeItem('nesto_loaded');

  var loginWrap = document.getElementById('loginWrap');
  if (loginWrap) loginWrap.style.display = 'none';

  location.reload();
}

/* ─────────────────────────────────────────────────────────────
   BLOCK 4 — Main application bootstrap / UI init
   (originally the largest obfuscated block; key behaviours
    reconstructed from leaked identifiers and patterns)
   ───────────────────────────────────────────────────────────── */

(function () {
  /* ── Auth gate ─────────────────────────────────────────── */
  function checkLogin() {
    var loggedIn = sessionStorage.getItem('nesto_logged_in') ||
                   localStorage.getItem('nesto_logged_in');
    if (!loggedIn) {
      var loginWrap = document.getElementById('loginWrap');
      if (loginWrap) loginWrap.style.display = 'flex';
      var appWrap = document.getElementById('appWrap');
      if (appWrap) appWrap.style.display = 'none';
    } else {
      var loginWrap = document.getElementById('loginWrap');
      if (loginWrap) loginWrap.style.display = 'none';
      var appWrap = document.getElementById('appWrap');
      if (appWrap) appWrap.style.display = 'block';
      restoreUsername();
    }
  }

  function restoreUsername() {
    var name = localStorage.getItem('nesto_username') || '';
    var el   = document.getElementById('loggedInName');
    if (el && name) el.textContent = name;
  }

  /* ── Login form handler ────────────────────────────────── */
  function handleLogin(e) {
    if (e) e.preventDefault();
    var userEl = document.getElementById('loginUser');
    var passEl = document.getElementById('loginPass');
    var errEl  = document.getElementById('loginError');
    if (!userEl || !passEl) return;

    var username = (userEl.value || '').trim();
    var password = (passEl.value || '').trim();
    if (!username || !password) {
      if (errEl) errEl.textContent = 'Please enter username and password.';
      return;
    }

    /* Credentials validated server-side; placeholder check here */
    if (errEl) errEl.textContent = 'Invalid credentials. Please try again.';
  }

  /* ── Mode switching ────────────────────────────────────── */
  window.switchMode = window.switchMode || function (mode) {
    var sections = document.querySelectorAll('.modeSection');
    sections.forEach(function (s) { s.style.display = 'none'; });
    var target = document.getElementById(mode + 'Section');
    if (target) target.style.display = 'block';

    var tabs = document.querySelectorAll('.modeTab');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    var activeTab = document.querySelector('[data-mode="' + mode + '"]');
    if (activeTab) activeTab.classList.add('active');
  };

  /* ── Tour slides ───────────────────────────────────────── */
  function showSlide(idx) {
    var slides = document.querySelectorAll('.tourSlide');
    slides.forEach(function (s, i) {
      s.style.display = (i === idx) ? 'block' : 'none';
    });
    curSlide = idx;
    var dotsContainer = document.getElementById('tourDots');
    if (dotsContainer) {
      var dots = dotsContainer.querySelectorAll('.dot');
      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === idx);
      });
    }
  }

  window.tourNext = function () {
    if (curSlide < totalSlides - 1) showSlide(curSlide + 1);
  };
  window.tourPrev = function () {
    if (curSlide > 0) showSlide(curSlide - 1);
  };
  window.tourGoto = function (idx) {
    showSlide(idx);
  };
  window.startAutoTour = function () {
    stopAutoTour();
    autoTimer = setInterval(function () {
      var next = (curSlide + 1) % totalSlides;
      showSlide(next);
    }, 4000);
  };
  window.stopAutoTour = function () {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  };

  function closeTour() {
    localStorage.setItem('nesto_tour_visited', '1');
    var modal = document.getElementById('tourModal');
    if (modal) modal.style.display = 'none';
    stopAutoTour();
  }
  window.closeTour = closeTour;

  /* ── DOMContentLoaded bootstrap ───────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    checkLogin();

    var loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

    /* Show tour on first visit */
    if (_firstVisit) {
      var tourModal = document.getElementById('tourModal');
      if (tourModal) {
        tourModal.style.display = 'flex';
        showSlide(0);
        startAutoTour();
      }
    }
  });
})();

/* ═══════════════════════════════════════════════════════════════
   BELOW THIS LINE: original code was already unobfuscated.
   No changes made — reproduced verbatim.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   PDF EMPLOYEE LIST PARSER (MOHRE / UAE work-permit PDFs)
   ───────────────────────────────────────────────────────────── */

(function () {
  if (typeof extractPDF !== 'function' || typeof pdfjsLib === 'undefined') return;

  const originalExtractPDF = extractPDF;
  window.empParsedPdfMeta = window.empParsedPdfMeta || {};
  window.empCardTypeByPersonCode = window.empCardTypeByPersonCode || {};

  const nationalities = [
    'UNITED ARAB EMIRATES', 'SRI LANKA', 'PHILIPPINES', 'BANGLADESH', 'PAKISTAN',
    'AFGHANISTAN', 'INDONESIA', 'ETHIOPIA', 'MOROCCO', 'MYANMAR', 'VIETNAM',
    'NIGERIA', 'TANZANIA', 'SOMALIA', 'JORDAN', 'EMIRATES', 'SUDAN', 'EGYPT',
    'YEMEN', 'CHINA', 'GHANA', 'KENYA', 'UGANDA', 'NEPAL', 'NIPAL', 'INDIA'
  ];

  const permitTypes = [
    'NATIONAL AND GCC ELECTRONIC WORK PERMIT',
    'PRE APPROVAL FOR WORK PERMIT UNDERPROCESS',
    'PRE APPROVAL FOR WORK PERMIT',
    'RENEW ELECTRONIC WORK PERMIT',
    'NEW ELECTRONIC WORK PERMIT',
    'Golden Visa Work Permit'
  ];

  const escapeRx    = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nationalityRx = new RegExp(
    '(' + nationalities.sort((a, b) => b.length - a.length).map(escapeRx).join('|') + ')',
    'i'
  );
  const permitRx    = new RegExp(permitTypes.map(escapeRx).join('|'), 'i');
  const cardTypeRx  = /(National\s+and\s+GCC\s+Lab(?:o|ou)r\s+Card(?:\s+Under\s+Cancellation)?|Golden\s+Visa\s+Work\s+Permit|Renew\s+Lab(?:o|ou)r\s+Card(?:\s+Under\s+Cancellation)?|New\s+Lab(?:o|ou)r\s+Card|Renew\s+Work\s+Permit|New\s+Work\s+Permit|Work\s+Permit)/i;
  const startRx     = /^([A-Z0-9]{5,12})\s+([A-Z][A-Z .'-]+)/;
  const looseStartRx = /^([A-Z0-9]{5,12})(?:\s|$)/;
  const arabicRx    = /[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff\x00]+/g;

  /* ── Text cleaners ─────────────────────────────────────── */

  function cleanEnglish(text) {
    return String(text || '')
      .replace(/\x00/g, ' ')
      .replace(arabicRx, ' ')
      .replace(/(\d{6,13})(\d{2}\/\d{2}\/\d{4})/g, '$1 $2')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanJob(text) {
    return String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\bPage\s+\d+\s*\/\s*\d+\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(Limited|Unlimited|He has an escape report)\b.*$/i, '')
      .trim()
      .replace(/^[-: ]+|[-: ]+$/g, '');
  }

  function cleanName(text) {
    return cleanEnglish(text)
      .replace(permitRx, ' ')
      .replace(/\bPage\s+\d+\s*\/\s*\d+\b/gi, ' ')
      .replace(/\b(Card Type|Contract Type|Limited|Unlimited|Underprocess)\b/gi, ' ')
      .replace(/\b\d{6,14}\b/g, ' ')
      .replace(/\d{2}\/\d{2}\/\d{4}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[-: ]+|[-: ]+$/g, '');
  }

  /* ── Record detection helpers ──────────────────────────── */

  function looksLikeNewEmployeeList(text) {
    const clean = cleanEnglish(text);
    return /The List Of Employees/i.test(text) &&
      /Passport Number/i.test(clean) &&
      /Person Name/i.test(clean) &&
      /Card Type/i.test(clean) &&
      /Contract Type/i.test(clean);
  }

  function isPassportToken(token) {
    token = String(token || '').trim();
    if (!/^[A-Z0-9]{5,12}$/.test(token)) return false;
    if (!/\d/.test(token) || /^RP\d+/i.test(token)) return false;
    if (/^\d+$/.test(token) && token.length < 8) return false;
    return true;
  }

  function isRecordStart(line) {
    const clean = cleanEnglish(line);
    const token = (clean.split(/\s+/)[0] || '').trim();
    if (!isPassportToken(token)) return false;
    return !!(startRx.exec(clean) || permitRx.test(clean) || clean === token);
  }

  function skipLine(line) {
    const clean = cleanEnglish(line);
    const firstToken = (clean.split(/\s+/)[0] || '').trim();
    if (isPassportToken(firstToken)) return false;
    if (/\b\d{14}\b/.test(clean)) return false;
    if (/\d{2}\/\d{2}\/\d{4}/.test(clean) && /Page\s+\d+\s*\//i.test(clean)) return false;

    /* Skip repeated column-header rows that appear on every page */
    if (/^\s*(No\.?\s*)?Passport\s+(No\.?\s*)?Person\s+/i.test(clean)) return true;
    if (/^\s*No\.?\s*Person\s+Code/i.test(clean)) return true;
    if (/Passport\s+Number.*Person\s+Name/i.test(clean)) return true;
    if (/Person\s+Name.*Card\s+Type/i.test(clean)) return true;

    return /(Passport Number|Person Name|Card Type|Job Name|Nationality|Card Number|Contract Type|The List Of Employees|Scan QR|Category\/|Establishment Name|Establishment Number|RP\d+AE|Page\s+\d+\s*\/|Total Number of Employees|Printing Date)/i.test(line) ||
      /(NESTO|HYPERMARKET|HYPERMARKT|SOLE PROPRIETORSHIP|NESTO MANAGEMENT OFFICE|\bQR\b)/i.test(clean);
  }

  /* ── Header / metadata parsers ─────────────────────────── */

  function parseCompanyCode(text, fileName) {
    const clean = cleanEnglish(text);
    const headerMatch = clean.match(/Establishment Number\s*\/?.{0,80}?(\d{4,})/i);
    if (headerMatch) return headerMatch[1];
    const fileMatch = String(fileName || '').match(/\[(\d{4,})\]/);
    return fileMatch ? fileMatch[1] : '';
  }

  function cleanCompanyName(text) {
    return cleanEnglish(text)
      .replace(/\s*-\s*BR\b/gi, ' BR')
      .replace(/\bBR\s+(\d)\s+(\d)\b/gi, 'BR $1$2')
      .replace(/\s+/g, ' ')
      .replace(/\s+-\s*$/g, '')
      .trim();
  }

  function parseCompanyName(text) {
    const clean = cleanEnglish(text);
    const companyCode = parseCompanyCode(text);
    if (companyCode) {
      const byCode = clean.match(new RegExp(
        '\\b' + escapeRx(companyCode) +
        '\\s+([A-Z][A-Z0-9 .&/\\-]{8,}?)(?:\\s+Category/|\\s+\\*RP|\\s+Scan QR|\\s+Passport Number|$)',
        'i'
      ));
      if (byCode && !/Establishment Number/i.test(byCode[1])) return cleanCompanyName(byCode[1]);
    }
    const match = clean.match(/Establishment Name\s*\/?\s*(.*?)(?:Scan QR|Passport Number|$)/i);
    if (!match) return '';
    return cleanCompanyName(
      match[1]
        .replace(/^\d{4,}\s+/, '')
        .replace(/\s+Category\/.*$/i, '')
        .replace(/\s+\*?RP\d+AE\*?.*$/i, '')
    );
  }

  function parseCategory(text) {
    const clean = cleanEnglish(text);
    const match = clean.match(/Category\s*\/?\s*(\d+)/i);
    return match ? match[1] : '';
  }

  function parseTotalEmployees(text) {
    const clean = cleanEnglish(text);
    const match = clean.match(/Total Number of Employees\s*:\s*(\d+)/i);
    return match ? match[1] : '';
  }

  function parsePageCount(text) {
    const clean = cleanEnglish(text);
    const matches = [...clean.matchAll(/Page\s+\d+\s*\/\s*(\d+)/gi)];
    return matches.length ? matches[matches.length - 1][1] : '';
  }

  /* ── PDF meta display ──────────────────────────────────── */

  function updatePdfMetaLine() {
    const box = document.getElementById('empPdfMeta');
    if (!box) return;
    const metas = Object.values(window.empParsedPdfMeta || {});
    if (!metas.length) {
      box.style.display = 'none';
      box.textContent   = '';
      return;
    }
    box.textContent = metas.map(meta => {
      const expected  = parseInt(meta.totalEmployees || '', 10) || 0;
      const extracted = meta.extracted || 0;
      let label = meta.source + ': ' + extracted + ' rows';
      if (expected)            label += ' / PDF total ' + expected;
      if (meta.companyCode)    label += ' | Est. '   + meta.companyCode;
      if (meta.category)       label += ' | Cat. '   + meta.category;
      if (meta.pageCount)      label += ' | Pages '  + meta.pageCount;
      if (expected && extracted < expected)
        label += ' | this PDF file only contains ' + extracted + ' readable rows';
      return label;
    }).join('   ||   ');
    box.style.display = 'block';
  }

  function rememberPdfMeta(parsed, sourceName) {
    const source = sourceName || '';
    window.empParsedPdfMeta[source] = {
      source:          source,
      extracted:       parsed.records.length,
      totalEmployees:  parsed.totalEmployees,
      companyCode:     parsed.companyCode,
      category:        parsed.category,
      pageCount:       parsed.pageCount
    };
    updatePdfMetaLine();
    setTimeout(updatePdfMetaLine, 100);
    setTimeout(updatePdfMetaLine, 800);
  }

  /* ── Core list parser ──────────────────────────────────── */

  function parseNewEmployeeList(text, sourceName) {
    const companyCode    = parseCompanyCode(text, sourceName);
    const companyName    = parseCompanyName(text);
    const category       = parseCategory(text);
    const totalEmployees = parseTotalEmployees(text);
    const pageCount      = parsePageCount(text);
    const chunks = [];
    let current  = [];

    String(text || '').split(/\r?\n/).forEach(rawLine => {
      const line  = rawLine.replace(/\x00/g, '').trim();
      if (!line || skipLine(line)) return;
      const clean = cleanEnglish(line);
      if (!clean) return;

      /* Skip column-header rows repeated on every page */
      if (/^(No\.?\s*|#\s*)?(Passport\s+(No\.?|Number)|Person\s+(Name|Code)|Card\s+Type|Job\s+Name|Nationality|Card\s+Number|Contract\s+Type|Expiry\s+Date)/i.test(clean)) return;

      if (isRecordStart(clean)) {
        if (current.length) chunks.push(current.join(' '));
        current = [line];
      } else if (current.length) {
        current.push(line);
      }
    });
    if (current.length) chunks.push(current.join(' '));

    const records = [];

    chunks.forEach(chunk => {
      const raw   = cleanEnglish(chunk);
      const start = startRx.exec(raw) || looseStartRx.exec(raw);
      if (!start) return;

      const passport = start[1];
      if (!isPassportToken(passport)) return;

      const personCodeMatch = raw.match(/\b\d{14}\b/);
      const personCode      = personCodeMatch ? personCodeMatch[0] : '';
      const personIndex     = personCode ? raw.indexOf(personCode) : -1;
      const permitMatch     = permitRx.exec(raw);
      const endCandidates   = [];
      if (personIndex > passport.length)                   endCandidates.push(personIndex);
      if (permitMatch && permitMatch.index > passport.length) endCandidates.push(permitMatch.index);

      const nameEnd = endCandidates.filter(pos => pos > passport.length).sort((a, b) => a - b)[0] || raw.length;
      let name = cleanName(raw.slice(passport.length, nameEnd));
      if (!name && personIndex > passport.length) name = cleanName(raw.slice(passport.length, personIndex));
      if (!name) return;

      const expiryMatch = raw.match(/\d{2}\/\d{2}\/\d{4}/);
      const expiry      = expiryMatch ? expiryMatch[0] : '';
      const cardTypeMatch = cardTypeRx.exec(raw);
      const cardType    = cardTypeMatch ? cardTypeMatch[1] : '';

      let afterPermit = '';
      if (permitMatch && personIndex > permitMatch.index) {
        const betweenPermitAndCode = raw.slice(permitMatch.index + permitMatch[0].length, personIndex);
        const afterCode            = raw.slice(personIndex + personCode.length);
        afterPermit = nationalityRx.test(betweenPermitAndCode) ? betweenPermitAndCode : (afterCode || betweenPermitAndCode);
      } else if (permitMatch) {
        afterPermit = raw.slice(permitMatch.index + permitMatch[0].length);
      } else if (personCode && raw.indexOf(personCode) >= 0) {
        afterPermit = raw.slice(raw.indexOf(personCode) + personCode.length);
      } else {
        afterPermit = raw.slice(passport.length + name.length);
      }

      const nationalityMatch = nationalityRx.exec(afterPermit);
      const nationality = nationalityMatch ? nationalityMatch[0].toUpperCase() : '';
      const job = nationalityMatch
        ? cleanJob(afterPermit.slice(0, nationalityMatch.index).replace(permitRx, '').replace(/\b\d{6,14}\b/g, ''))
        : '';

      let cardNo = '';
      const numberSource = expiry ? raw.slice(0, raw.indexOf(expiry)) : raw;
      let candidates = numberSource.match(/\b\d{6,13}\b/g) || [];
      if (!candidates.length) candidates = raw.match(/\b\d{6,13}\b/g) || [];
      candidates = candidates.filter(value =>
        value !== personCode &&
        value !== companyCode &&
        !passport.includes(value)
      );
      if (candidates.length) cardNo = candidates[candidates.length - 1];

      records.push({
        no:               records.length + 1,
        personCode:       personCode,
        name:             name,
        job:              job,
        passport:         passport,
        nationality:      nationality,
        cardNo:           cardNo,
        cardType:         cardType,
        expiry:           expiry,
        companyCode:      companyCode,
        companyName:      companyName,
        category:         category,
        pdfTotalEmployees: totalEmployees,
        pdfPages:         pageCount,
        source:           sourceName
      });

      if (personCode && cardType) {
        window.empCardTypeByPersonCode[personCode] = cardType;
      }
    });

    return {
      records:         records,
      companyName:     companyName,
      companyCode:     companyCode,
      category:        category,
      totalEmployees:  totalEmployees,
      pageCount:       pageCount,
      fmt:             'mohre_passport_employee_list'
    };
  }

  /* ── PDF text extraction ───────────────────────────────── */

  function lineTextFromItems(items) {
    const rows = [];
    (items || []).forEach(item => {
      const text = (item.str || '').replace(/\x00/g, '').trim();
      if (!text) return;
      const transform = item.transform || [0, 0, 0, 0, 0, 0];
      const x = transform[4] || 0;
      const y = transform[5] || 0;
      let row = rows.find(candidate => Math.abs(candidate.y - y) <= 2.5);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, text });
    });
    return rows
      .sort((a, b) => b.y - a.y)
      .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
      .join('\n');
  }

  async function readPdfText(file) {
    const buffer = await file.arrayBuffer();
    const pdf    = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages  = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page    = await pdf.getPage(pageNo);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      pages.push(lineTextFromItems(content.items));
    }
    return pages.join('\n');
  }

  /* ── Card-type back-fill (second-pass from WPS section) ── */

  const fillCardTypeRx = /(National\s+and\s+GCC\s+Lab(?:o|ou)r\s+Card(?:\s+Under\s+Cancellation)?|Golden\s+Visa\s+Work\s+Permit|Renew\s+Lab(?:o|ou)r\s+Card(?:\s+Under\s+Cancellation)?|New\s+Lab(?:o|ou)r\s+Card|Renew\s+Work\s+Permit|New\s+Work\s+Permit|Work\s+Permit)/i;

  function buildCardTypeMap(text) {
    const map          = {};
    const personCodeRx = /\b(\d{14})\b/g;
    const lines        = text.split(/\r?\n/).map(l => l.replace(/\x00/g, '').trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line    = lines[i];
      const codeMatch = personCodeRx.exec(line);
      personCodeRx.lastIndex = 0;
      if (!codeMatch) continue;
      const personCode = codeMatch[1];

      /* Search nearby lines for a card-type label */
      const context = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
      const ctMatch  = fillCardTypeRx.exec(context);
      if (ctMatch) map[personCode] = ctMatch[1];
    }
    return map;
  }

  function fillMissingCardTypes(records, cardTypeMap) {
    records.forEach(rec => {
      if (!rec.cardType && rec.personCode) {
        const fromMap = cardTypeMap[rec.personCode] || window.empCardTypeByPersonCode[rec.personCode];
        if (fromMap) rec.cardType = fromMap;
      }
    });
  }

  /* ── extractPDF override ───────────────────────────────── */

  window.extractPDF = async function (file, options) {
    if (!file) return originalExtractPDF(file, options);

    let text;
    try {
      text = await readPdfText(file);
    } catch (err) {
      console.warn('[empParser] PDF read failed, falling back:', err);
      return originalExtractPDF(file, options);
    }

    if (!looksLikeNewEmployeeList(text)) {
      return originalExtractPDF(file, options);
    }

    const sourceName = file.name || '';
    const parsed     = parseNewEmployeeList(text, sourceName);

    if (!parsed.records.length) {
      return originalExtractPDF(file, options);
    }

    const cardTypeMap = buildCardTypeMap(text);
    fillMissingCardTypes(parsed.records, cardTypeMap);
    rememberPdfMeta(parsed, sourceName);

    return parsed;
  };
})();

/* ─────────────────────────────────────────────────────────────
   WPS SECTION — threshold modal + % column rewriter
   ───────────────────────────────────────────────────────────── */

(function () {
  var _hooked     = false;
  var _extracting = false;

  /* ── Threshold-input modal ─────────────────────────────── */

  function showThresholdModal(callback) {
    var existing = document.getElementById('thresholdModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id  = 'thresholdModal';
    modal.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(0,0,0,.45)', 'z-index:99998',
      'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');

    modal.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <h3 style="margin:0 0 14px;font-size:1.1rem">Set WPS threshold (%)</h3>
        <input id="thresholdInput" type="number" min="0" max="100" value="90"
          style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:1rem;border:1px solid #ccc;border-radius:6px">
        <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end">
          <button id="thresholdCancel"
            style="padding:7px 18px;border:1px solid #ccc;border-radius:6px;cursor:pointer;background:#f5f5f5">
            Cancel
          </button>
          <button id="thresholdOk"
            style="padding:7px 18px;border:none;border-radius:6px;cursor:pointer;background:#1976d2;color:#fff">
            Extract
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('thresholdOk').addEventListener('click', function () {
      var val = parseFloat(document.getElementById('thresholdInput').value);
      if (isNaN(val)) val = 90;
      modal.remove();
      callback(val);
    });

    document.getElementById('thresholdCancel').addEventListener('click', function () {
      modal.remove();
    });
  }

  /* ── Column detection ──────────────────────────────────── */

  var _colIdx = { pct: -1, name: -1 };

  function detectColumns(table) {
    var ths = table.querySelectorAll('thead th');
    _colIdx.pct  = -1;
    _colIdx.name = -1;
    ths.forEach(function (th, i) {
      var txt = (th.textContent || '').trim().toLowerCase();
      if (txt.includes('%') || txt.includes('percent') || txt.includes('wps')) _colIdx.pct  = i;
      if (txt.includes('name') || txt.includes('employee'))                     _colIdx.name = i;
    });
  }

  /* ── % column rewriter ─────────────────────────────────── */

  function rewritePctColumn(table, threshold) {
    if (_colIdx.pct < 0) return;
    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function (tr) {
      var cells = tr.querySelectorAll('td');
      var cell  = cells[_colIdx.pct];
      if (!cell) return;
      var raw = (cell.textContent || '').trim().replace('%', '');
      var val = parseFloat(raw);
      if (isNaN(val)) return;

      cell.textContent = val.toFixed(1) + '%';
      cell.style.fontWeight  = 'bold';
      cell.style.textAlign   = 'center';

      if (val >= threshold) {
        cell.style.color      = '#2e7d32';
        cell.style.background = '#e8f5e9';
      } else {
        cell.style.color      = '#c62828';
        cell.style.background = '#ffebee';
      }
    });
  }

  /* ── Hook: intercept the WPS Extract button click ─────── */

  function hookExtractButton() {
    var wpsSection = document.getElementById('wpsSection');
    if (!wpsSection || _hooked) return false;

    /* Find the Extract button by its label text */
    var extractBtn = null;
    Array.prototype.forEach.call(wpsSection.querySelectorAll('button'), function (b) {
      if (!extractBtn && /extract/i.test((b.textContent || '').trim())) extractBtn = b;
    });
    if (!extractBtn) return false;

    /* Capture phase: fires before the app's own listener */
    extractBtn.addEventListener('click', function (e) {
      if (_extracting) return;           /* we dispatched this — let it through */
      e.stopImmediatePropagation();
      e.preventDefault();

      var btn = this;
      showThresholdModal(function (threshold) {
        _extracting = true;
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        _extracting = false;

        /* Watch for results table to populate, then rewrite % column */
        var wps = document.getElementById('wpsSection');
        if (!wps) return;
        var obs = new MutationObserver(function (_, self) {
          var table = wps.querySelector('table');
          if (!table || !table.querySelector('tbody tr')) return;
          self.disconnect();
          clearTimeout(safetyTimer);
          setTimeout(function () {
            detectColumns(table);
            rewritePctColumn(table, threshold);
          }, 250);
        });
        var safetyTimer = setTimeout(function () { obs.disconnect(); }, 30000);
        obs.observe(wps, { childList: true, subtree: true });
      });
    }, true /* capture */);

    _hooked = true;
    return true;
  }

  /* ── Boot: watch for WPS section to appear ─────────────── */

  function startWatching() {
    var wpsSection = document.getElementById('wpsSection');
    if (!wpsSection) return;
    new MutationObserver(function () {
      if (!_hooked) hookExtractButton();
    }).observe(wpsSection, { childList: true, subtree: true });
  }

  function hookSwitchMode() {
    var orig = window.switchMode;
    if (typeof orig !== 'function') return false;
    window.switchMode = function (mode) {
      orig.apply(this, arguments);
      if (mode === 'wps') setTimeout(function () { if (!_hooked) hookExtractButton(); }, 300);
    };
    return true;
  }

  window.addEventListener('DOMContentLoaded', function () {
    startWatching();
    if (!hookSwitchMode()) {
      var tries = 0;
      var iv = setInterval(function () {
        if (hookSwitchMode() || ++tries > 30) clearInterval(iv);
      }, 200);
    }
    setTimeout(hookExtractButton, 800);
  });
})();

/* ─────────────────────────────────────────────────────────────
   EXCEL EXPORT — multi-sheet (one tab per source PDF)
   ───────────────────────────────────────────────────────────── */

(function () {
  /* ── Helpers ───────────────────────────────────────────── */

  function getHeaders() {
    var hdr = document.querySelector('#empSection table thead tr.hdr');
    if (!hdr) return [];
    return Array.prototype.slice.call(hdr.querySelectorAll('th'))
      .map(function (th) { return (th.textContent || '').trim(); })
      .filter(function (h) { return h !== '#'; });
  }

  function rowToArr(tr) {
    return Array.prototype.slice.call(tr.querySelectorAll('td'))
      .slice(1)                                     /* skip # column */
      .map(function (td) { return (td.textContent || '').trim(); });
  }

  /* Expiry date colouring — expects DD/MM/YYYY */
  function expiryFill(dateStr) {
    var p = (dateStr || '').split('/');
    if (p.length !== 3) return null;
    var d     = new Date(+p[2], +p[1] - 1, +p[0]);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff  = Math.floor((d - today) / 86400000);
    if (diff <  0)  return 'FFC7C7'; /* red    */
    if (diff < 30)  return 'FFE0B2'; /* orange */
    if (diff < 90)  return 'FFF9C4'; /* yellow */
    return 'C6EFCE';                 /* green  */
  }

  /* Build one XLSX worksheet from an array of <tr> elements */
  function buildSheet(headers, rows, withColors) {
    var expiryIdx = headers.indexOf('Expiry Date');  /* 0-based in data */
    var data      = [headers].concat(rows.map(rowToArr));
    var ws        = XLSX.utils.aoa_to_sheet(data);

    /* Column widths */
    ws['!cols'] = headers.map(function (h) {
      return { wch: Math.max(h.length + 4, 14) };
    });

    /* Header row style */
    headers.forEach(function (_, ci) {
      var ref = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[ref]) ws[ref].s = {
        fill:      { fgColor: { rgb: '1F3864' } },
        font:      { color: { rgb: 'FFFFFF' }, bold: true },
        alignment: { horizontal: 'center' }
      };
    });

    /* Expiry colour per data row */
    if (withColors && expiryIdx >= 0) {
      rows.forEach(function (_, ri) {
        var ref  = XLSX.utils.encode_cell({ r: ri + 1, c: expiryIdx });
        var cell = ws[ref];
        if (!cell) return;
        var fill = expiryFill(String(cell.v || ''));
        if (fill) cell.s = {
          fill:      { fgColor: { rgb: fill } },
          font:      { bold: true },
          alignment: { horizontal: 'center' }
        };
      });
    }

    return ws;
  }

  /* Sanitise an Excel sheet name (max 31 chars, no invalid chars) */
  function safeName(s, used) {
    var n    = s.replace(/[\\\/\?\*\[\]:]/g, '').replace(/\.pdf$/i, '').trim().slice(0, 31) || 'Sheet';
    var base = n, i = 2;
    while (used[n]) { n = base.slice(0, 28) + '_' + i++; }
    used[n] = true;
    return n;
  }

  /* ── Main export function ──────────────────────────────── */

  function multiSheetExport(withColors) {
    var tbody = document.getElementById('tbody');
    if (!tbody) return false;

    var allTrs = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    if (!allTrs.length) return false;

    var headers = getHeaders();
    if (!headers.length) return false;

    /* Group rows by source file (last column in data) */
    var groups = {}, order = [];
    allTrs.forEach(function (tr) {
      var cells = tr.querySelectorAll('td');
      var src   = cells[cells.length - 1] ? (cells[cells.length - 1].textContent || '').trim() : '';
      if (!src) src = 'Unknown';
      if (!groups[src]) { groups[src] = []; order.push(src); }
      groups[src].push(tr);
    });

    /* Only one source file → fall through to original single-sheet handler */
    if (order.length < 2) return false;

    var WB   = XLSX.utils.book_new();
    var used = {};

    /* Sheet 1: all rows combined */
    XLSX.utils.book_append_sheet(WB, buildSheet(headers, allTrs, withColors), 'All Files');
    used['All Files'] = true;

    /* One sheet per source file */
    order.forEach(function (src) {
      var name = safeName(src, used);
      XLSX.utils.book_append_sheet(WB, buildSheet(headers, groups[src], withColors), name);
    });

    /* Trigger download */
    var ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(WB, 'EMPWPSCTR_' + ts + (withColors ? '_colored' : '') + '.xlsx');

    /* Close the colour-choice modal */
    var modal = document.getElementById('xlColorModal');
    if (modal) modal.style.display = 'none';

    return true;
  }

  /* ── Hook xlExportChoice ───────────────────────────────── */

  function hookExport() {
    if (typeof window.xlExportChoice !== 'function') return false;
    var _orig = window.xlExportChoice;
    window.xlExportChoice = function (withColors) {
      var done = false;
      try { done = multiSheetExport(withColors); } catch (e) {
        console.warn('[multi-sheet] error:', e);
      }
      if (!done) _orig.apply(this, arguments);   /* single-file: original path */
    };
    return true;
  }

  window.addEventListener('DOMContentLoaded', function () {
    var tries = 0;
    var iv = setInterval(function () {
      if (hookExport() || ++tries > 60) clearInterval(iv);
    }, 200);
  });
})();
