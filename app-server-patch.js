(function () {

  /* ── Your Render server URL ── */
  var API_SERVER = 'https://empwpsctr-server.onrender.com';

  window.empParsedPdfMeta = window.empParsedPdfMeta || {};
  window.empCardTypeByPersonCode = window.empCardTypeByPersonCode || {};

  /* ── Update the meta info bar below the table ── */
  function updatePdfMetaLine() {
    var box = document.getElementById('empPdfMeta');
    if (!box) return;
    var metas = Object.values(window.empParsedPdfMeta || {});
    if (!metas.length) { box.style.display = 'none'; box.textContent = ''; return; }
    box.textContent = metas.map(function (meta) {
      var expected = parseInt(meta.totalEmployees || '', 10) || 0;
      var extracted = meta.extracted || 0;
      var label = meta.source + ': ' + extracted + ' rows';
      if (expected) label += ' / PDF total ' + expected;
      if (meta.companyCode) label += ' | Est. ' + meta.companyCode;
      if (meta.category) label += ' | Cat. ' + meta.category;
      if (meta.pageCount) label += ' | Pages ' + meta.pageCount;
      if (expected && extracted < expected)
        label += ' | this PDF file only contains ' + extracted + ' readable rows';
      return label;
    }).join('   ||   ');
    box.style.display = 'block';
  }

  /* ── Store parsed meta ── */
  function rememberPdfMeta(parsed, sourceName) {
    var source = sourceName || '';
    window.empParsedPdfMeta[source] = {
      source: source,
      extracted: parsed.records.length,
      totalEmployees: parsed.totalEmployees,
      companyCode: parsed.companyCode,
      category: parsed.category,
      pageCount: parsed.pageCount
    };
    updatePdfMetaLine();
    setTimeout(updatePdfMetaLine, 100);
    setTimeout(updatePdfMetaLine, 800);
  }

  /* ── Expose helpers for the clearAll hook ── */
  window.empNewFormatParser = {
    updatePdfMetaLine: updatePdfMetaLine
  };

  /* ── Hook clearAll to reset meta ── */
  function hookClearAll() {
    if (typeof clearAll !== 'function') return false;
    var _orig = clearAll;
    clearAll = function () {
      window.empParsedPdfMeta = {};
      updatePdfMetaLine();
      return _orig.apply(this, arguments);
    };
    return true;
  }

  /* ── Groq AI proxy: intercept fetch calls to api.groq.com ── */
  var _originalFetch = window.fetch.bind(window);
  window.fetch = function (url, options) {
    if (typeof url === 'string' && url.indexOf('api.groq.com') !== -1) {
      var proxyUrl = API_SERVER + '/api/ai-chat';
      var newOptions = Object.assign({}, options);
      return _originalFetch(proxyUrl, newOptions);
    }
    return _originalFetch(url, options);
  };

  /* ── Main patch: override extractPDF to call the server ── */
  function applyPatch() {
    if (typeof extractPDF !== 'function') return false;

    var _originalExtractPDF = extractPDF;

    extractPDF = async function (file, sourceName) {
      var name = sourceName || (file && file.name) || 'upload.pdf';

      try {
        var formData = new FormData();
        formData.append('pdf', file);
        formData.append('sourceName', name);

        var res = await fetch(API_SERVER + '/api/parse-pdf', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          var parsed = await res.json();
          if (parsed && parsed.records && parsed.records.length) {
            parsed.records.forEach(function (r) {
              if (r.personCode && r.cardType)
                window.empCardTypeByPersonCode[r.personCode] = r.cardType;
            });
            rememberPdfMeta(parsed, name);
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[server-patch] Server parse failed, using client fallback:', err.message);
      }

      return _originalExtractPDF.apply(this, arguments);
    };

    hookClearAll();
    return true;
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (applyPatch() || ++tries > 150) clearInterval(iv);
  }, 100);

})();
