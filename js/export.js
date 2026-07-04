/*
 * Syllabifier and export (Word .docx / print-PDF) in the CMWRC
 * prayer-booklet style: side-by-side tables of Devanagari | roman,
 * with the roman line split into syllables (kar-pū-ra-gau-raṃ).
 */

/* Scheme-aware syllabifier
 * ------------------------
 * Tokenizes a word with the *input scheme's own tokens* (including
 * alternates like aa/ee, R^i, chh), so hyphens can be inserted directly
 * into the input text without ever splitting a token. The same engine
 * syllabifies IAST for exports.
 *
 * Syllable rule (calibrated against the VA Binder 2025 splits):
 * each syllable is onset + vowel + trailing marks; in an internal
 * cluster the next syllable keeps only its final consonant, except that
 * C+r (pra, tra, dra), ty, Shy, tv, sv, and dv stay together as onsets.
 * Everything else closes the previous syllable (kar-pU, sam-pruk-tau,
 * av-yak, abh-yA, par-yu, meS-va).
 */

// Consonant slot numbers in Sanscript schemes (same order in every scheme).
var CONS_T = 15, CONS_D = 17, CONS_Y = 25, CONS_R = 26, CONS_V = 28,
    CONS_SSA = 30, CONS_S = 31, CONS_COMPOUND = 34; // kSh / j~n start here

var schemeTokenCache = {};

function schemeTokens(name) {
    if (schemeTokenCache[name]) { return schemeTokenCache[name]; }
    if (!window.Sanscript || !Sanscript.isRomanScheme(name)) { return null; }
    var scheme = Sanscript.schemes[name];
    var alts = (Sanscript.alternates && Sanscript.alternates[name]) || {};
    var tk = { vowels: {}, cons: {}, marks: {}, consIndex: {}, maxLen: 1 };

    function add(map, token, idx) {
        [token].concat(alts[token] || []).forEach(function (t) {
            if (!t) { return; }
            map[t] = true;
            if (idx !== undefined) { tk.consIndex[t] = idx; }
            if (t.length > tk.maxLen) { tk.maxLen = t.length; }
        });
    }

    (scheme.vowels || []).forEach(function (t) { add(tk.vowels, t); });
    (scheme.consonants || []).forEach(function (t, i) {
        // Decompose kSh / j~n so their halves can split across syllables
        // (bhak-Shyam, yaj-na), matching the booklet style.
        if (i < CONS_COMPOUND) { add(tk.cons, t, i); }
    });
    (scheme.other || []).forEach(function (t, i) { add(tk.cons, t, 100 + i); });
    (scheme.other_marks || []).forEach(function (t) { add(tk.marks, t); });
    (scheme.accent || []).forEach(function (t) { add(tk.marks, t); });
    (scheme.combo_accent || []).forEach(function (t) { add(tk.marks, t); });
    if (scheme.symbols && scheme.symbols[11]) { add(tk.marks, scheme.symbols[11]); } // avagraha
    // Universal trailing marks: avagraha quotes and the PUA candrabindu.
    add(tk.marks, "'"); add(tk.marks, '’'); add(tk.marks, '\uF141');

    schemeTokenCache[name] = tk;
    return tk;
}

// May the next syllable keep two consonants as its onset?
function keepsTwoOnset(prevIdx, lastIdx) {
    if (lastIdx === CONS_R) { return prevIdx !== CONS_R; }                        // pra, tra, dra...
    if (lastIdx === CONS_Y) { return prevIdx === CONS_T || prevIdx === CONS_SSA; } // ty, Shy
    if (lastIdx === CONS_V) { return prevIdx === CONS_T || prevIdx === CONS_S || prevIdx === CONS_D; } // tv, sv, dv
    return false;
}

// Split one word (already tokenizable in the given scheme) into
// hyphenated syllables. Returns null when anything is unrecognized.
function syllabifySchemeWord(word, tk) {
    var sylls = [], onset = [], i = 0;
    while (i < word.length) {
        var matched = null, kind = null;
        for (var len = Math.min(tk.maxLen, word.length - i); len >= 1; len--) {
            var sub = word.substr(i, len);
            if (tk.vowels[sub]) { matched = sub; kind = 'v'; break; }
            if (tk.cons[sub]) { matched = sub; kind = 'c'; break; }
            if (tk.marks[sub] && sylls.length && onset.length === 0) { matched = sub; kind = 'm'; break; }
        }
        if (!matched) { return null; }
        if (kind === 'v') {
            sylls.push({ onset: onset, v: matched, marks: '', coda: '' });
            onset = [];
        } else if (kind === 'c') {
            onset.push(matched);
        } else {
            sylls[sylls.length - 1].marks += matched;
        }
        i += matched.length;
    }
    if (!sylls.length) { return null; }
    // Word-final consonants close the last syllable.
    if (onset.length) { sylls[sylls.length - 1].coda += onset.join(''); }
    // Distribute internal clusters.
    for (var k = 1; k < sylls.length; k++) {
        var on = sylls[k].onset;
        if (on.length >= 2) {
            var keep = keepsTwoOnset(tk.consIndex[on[on.length - 2]], tk.consIndex[on[on.length - 1]]) ? 2 : 1;
            while (on.length > keep) {
                sylls[k - 1].coda += on.shift();
            }
        }
    }
    return sylls.map(function (s) {
        return s.onset.join('') + s.v + s.marks + s.coda;
    }).join('-');
}

// Syllabify one word of input text: peels surrounding punctuation,
// strips existing hyphens (so the pass is repeatable), and leaves the
// word untouched when it doesn't tokenize (numbers, dandas, English).
function syllabifyInputWord(word, schemeName) {
    var tk = schemeTokens(schemeName);
    if (!tk) { return word; }
    var m = word.match(/^([("]*)(.*?)([)",|।॥]*)$/);
    var syl = syllabifySchemeWord(m[2].replace(/-/g, ''), tk);
    return syl === null ? word : m[1] + syl + m[3];
}

// IAST helpers used by the export fallback.
function syllabifyWord(word) {
    var tk = schemeTokens('iast');
    return tk ? syllabifySchemeWord(word.replace(/-/g, ''), tk) : null;
}

function syllabifyLine(line) {
    return line.trim().split(/\s+/).map(function (w) {
        return syllabifyInputWord(w, 'iast');
    }).join('  ');
}

/* Word (.docx) generation
 * ----------------------- */
function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function docxRun(text, halfPts, opts) {
    opts = opts || {};
    var rpr = '<w:rPr>';
    if (opts.sanskritFont !== false) {
        rpr += '<w:rFonts w:ascii="Sanskrit 2003" w:hAnsi="Sanskrit 2003" w:cs="Sanskrit 2003"/>';
    }
    if (opts.italic) { rpr += '<w:i/>'; }
    if (halfPts) { rpr += '<w:sz w:val="' + halfPts + '"/><w:szCs w:val="' + halfPts + '"/>'; }
    rpr += '</w:rPr>';
    return '<w:r>' + rpr + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}

function docxPara(runsXml, ppr) {
    return '<w:p><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/>'
        + (ppr || '') + '</w:pPr>' + runsXml + '</w:p>';
}

/*
 * Verses for export. Roman lines that already carry syllable hyphens
 * (via the Syllabify button, or typed by hand) are used verbatim;
 * anything else gets an automatic IAST pass. Words are separated by
 * double spaces, booklet-style.
 */
function versesForExport() {
    var lines = lastLines.map(function (l) {
        var roman;
        if (l.meaning) {
            roman = l.text;
        } else if (l.roman.indexOf('-') !== -1) {
            roman = l.roman.trim().split(/\s+/).join('  ');
        } else {
            roman = syllabifyLine(l.roman);
        }
        return { meaning: l.meaning, text: l.text, indic: l.indic, roman: roman };
    });
    return groupVerses(lines);
}

function docxCell(paraXml, widthDxa, span) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + widthDxa + '" w:type="dxa"/>'
        + (span ? '<w:gridSpan w:val="2"/>' : '')
        + '<w:vAlign w:val="top"/></w:tcPr>' + paraXml + '</w:tc>';
}

// One bordered two-column table per verse: Devanagari | roman,
// meaning rows spanning both columns.
function docxVerseTable(v) {
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/>'
        + '<w:tblBorders>'
        + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) {
            return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>';
        }).join('')
        + '</w:tblBorders>'
        + '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/>'
        + '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>'
        + '</w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid>';
    v.rows.forEach(function (r) {
        xml += '<w:tr>'
            + docxCell(docxPara(docxRun(r.indic, 40)), 4680)
            + docxCell(docxPara(docxRun(r.roman, 32)), 4680)
            + '</w:tr>';
    });
    v.meanings.forEach(function (m) {
        xml += '<w:tr>' + docxCell(docxPara(docxRun(m, 22, { sanskritFont: false })), 9360, true) + '</w:tr>';
    });
    return xml + '</w:tbl>';
}

function buildDocxXml(verses) {
    // A paragraph between consecutive tables (and before sectPr) keeps Word happy.
    var body = verses.map(docxVerseTable).join('<w:p/>') + '<w:p/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        + '<w:body>' + body
        + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
        + '<w:cols w:space="720"/></w:sectPr>'
        + '</w:body></w:document>';
}

function downloadDocx() {
    if (!window.JSZip) {
        alert('The document library has not loaded yet - check your connection and try again.');
        return;
    }
    var verses = versesForExport();
    if (!verses.length) {
        alert('Nothing to export - type or import a text first.');
        return;
    }

    var zip = new JSZip();
    zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '</Types>');
    zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>');
    zip.file('word/document.xml', buildDocxXml(verses));

    zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }).then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'transliteration.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
}

/* Print / PDF
 * ----------- */
function printDoc() {
    var verses = versesForExport();
    if (!verses.length) {
        alert('Nothing to print - type or import a text first.');
        return;
    }

    var area = document.getElementById('printArea');
    var html = '';
    verses.forEach(function (v) {
        html += '<table class="p-table"><tbody>';
        v.rows.forEach(function (r) {
            html += '<tr><td class="p-dev">' + escapeHtml(r.indic) + '</td>'
                + '<td class="p-rom">' + escapeHtml(r.roman) + '</td></tr>';
        });
        v.meanings.forEach(function (m) {
            html += '<tr><td colspan="2" class="p-meaning">' + escapeHtml(m) + '</td></tr>';
        });
        html += '</tbody></table>';
    });
    area.innerHTML = html;

    document.body.classList.add('printing');
    window.addEventListener('afterprint', function handler() {
        document.body.classList.remove('printing');
        window.removeEventListener('afterprint', handler);
    });
    window.print();
}
