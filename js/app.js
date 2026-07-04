var inputType = "itrans";
var indicType = "devanagari";
var romanType = "iast";
var doubleSpace = "yes";

// Auto-detection is on until the user picks an input system manually;
// clearing the text box re-enables it.
var autoDetect = true;

/*
 * True candrabindu (m̐) support.
 *
 * Sanskrit 2003 carries a precomposed m-with-candrabindu glyph in its
 * Private Use Area at U+F141 ("mcandrabindu"; U+F140 is the capital).
 * That character only renders in Sanskrit 2003, so the transliterator
 * emits the portable ṁ by default and upgrades it to U+F141 only after
 * confirming the font is loaded and actually supplies the glyph. A
 * notice then tells readers the text needs the Sanskrit 2003 font.
 */
var CANDRABINDU = "\uF141"; // Sanskrit 2003 PUA glyph "mcandrabindu" (U+F140 for capital M)
var candrabinduOK = false;

function initCandrabinduSupport() {
    if (!(document.fonts && document.fonts.load)) {
        return;
    }
    document.fonts.load("32px Sanskrit", CANDRABINDU).then(function () {
        if (!document.fonts.check("32px Sanskrit")) {
            return; // font not available
        }
        // If Sanskrit supplies the PUA glyph, it measures differently
        // from the generic fallback (which shows tofu in both cases).
        var ctx = document.createElement('canvas').getContext('2d');
        ctx.font = "32px Sanskrit, serif";
        var inFont = ctx.measureText(CANDRABINDU).width;
        ctx.font = "32px serif";
        var inFallback = ctx.measureText(CANDRABINDU).width;
        candrabinduOK = Math.abs(inFont - inFallback) > 0.1;
        if (candrabinduOK) {
            processInput(); // re-render with real candrabindu
        }
    }).catch(function () { /* keep ṁ fallback */ });
}

/*
 * Guess the input system from the text itself.
 * Returns null when there is no clear signal.
 */
function detectInputType(text) {
    // Any Devanagari codepoints -> devanagari input.
    if (/[ऀ-ॿ]/.test(text)) {
        return 'devanagari';
    }
    // IAST diacritics.
    if (/[āīūṛṝḷḹṃḥṁṅñṭḍṇśṣĀĪŪṚṜŚṢ]/.test(text)) {
        return 'iast';
    }
    // Tokens unique to Baraha vs. iTrans.
    var baraha = (text.match(/~M|~g|~j|Dhx|Dx/g) || []).length;
    var itrans = (text.match(/~N|~n|RRi|RRI|R\^i|R\^I|LLi|L\^i|\.D|\.Dh|GY|\{\}/g) || []).length;
    if (baraha > itrans) {
        return 'baraha';
    }
    if (itrans > baraha) {
        return 'itrans';
    }
    return null;
}


/*
 * Parenthesized alternates, e.g. "maMtra (mantra)":
 * the word(s) before the parens go to the indic output (maMtra -> मंत्र),
 * the parenthesized spelling goes to the roman output (mantra).
 */

// Indic side: drop the parenthesized alternates.
function stripParenAlternates(text) {
    return text.replace(/\s*\([^()]*\)/g, '');
}

// Roman side: replace the preceding word(s) with the parenthesized spelling.
// Handles multi-word parens ("kuMDala kuMcita (kuNDala ku~jcita)") and
// partial hyphenated words ("kesaree-naMdana (nandana)" -> kesaree-nandana).
function applyParenAlternates(text) {
    var re = /\(([^()]*)\)/g, out = '', last = 0, m;
    while ((m = re.exec(text)) !== null) {
        var before = text.slice(last, m.index);
        var alt = m[1].trim();
        if (alt) {
            var n = alt.split(/\s+/).length;
            // Split into word / whitespace tokens.
            var parts = before.split(/(\s+)/).filter(function(p) { return p !== ''; });
            // Drop the whitespace just before the "(".
            if (parts.length && /^\s+$/.test(parts[parts.length - 1])) {
                parts.pop();
            }
            // Remove the n words the parens replace.
            var removed = [];
            for (var i = 0; i < n && parts.length; i++) {
                removed.unshift(parts.pop());
                if (i < n - 1 && parts.length && /^\s+$/.test(parts[parts.length - 1])) {
                    parts.pop();
                }
            }
            // If the parens only cover the tail of a hyphenated word,
            // keep the word's leading segments.
            var first = removed[0] || '';
            if (n === 1 && first.indexOf('-') !== -1) {
                var remSegs = first.split('-'), altSegs = alt.split('-');
                if (remSegs.length > altSegs.length) {
                    alt = remSegs.slice(0, remSegs.length - altSegs.length).join('-') + '-' + alt;
                }
            }
            out += parts.join('') + alt;
        } else {
            out += before;
        }
        last = re.lastIndex;
    }
    return out + text.slice(last);
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/*
 * Meanings: a line starting with ">" is an English meaning for the verse
 * above it. It is never transliterated and flows through to all views
 * and exports as-is.
 */
function parseLines(input) {
    return input.split('\n').map(function (line) {
        var mm = line.match(/^\s*>\s?(.*)$/);
        return mm ? { meaning: true, text: mm[1] } : { meaning: false, text: line };
    });
}

// Group lines into verses (separated by blank lines) for the booklet
// table view and the Word/print exports.
function groupVerses(lines) {
    var verses = [], cur = null;
    lines.forEach(function (l) {
        if (l.text.trim() === '') { cur = null; return; }
        if (!cur) { cur = { rows: [], meanings: [] }; verses.push(cur); }
        if (l.meaning) { cur.meanings.push(l.text); } else { cur.rows.push(l); }
    });
    return verses;
}

// Wrap untransliterated leftovers (ASCII letters in Indic output are
// usually typos) so they stand out.
function highlightUntranslated(raw) {
    return raw.replace(/[A-Za-z\\^~]+|[^A-Za-z\\^~]+/g, function (seg) {
        var esc = escapeHtml(seg);
        return /^[A-Za-z\\^~]/.test(seg)
            ? '<mark class="untranslated" title="Not transliterated: check the spelling or input system">' + esc + '</mark>'
            : esc;
    });
}

var lastLines = []; // most recent parsed+transliterated lines, for exports

/*
 * Syllabify the input text in place: inserts hyphens at syllable
 * boundaries using the current input system's own tokens. Hyphens are
 * ignored by the Indic output and flow through to the roman output,
 * so they can be edited right in the input box. Running it again
 * re-splits from scratch (existing hyphens are recomputed).
 */
function syllabifyInput() {
    if (!Sanscript.isRomanScheme(inputType)) {
        alert('Syllabify works with roman input systems (iTrans, Baraha, IAST).');
        return;
    }
    pushUndo();
    textInput.value = textInput.value.split('\n').map(function (line) {
        if (/^\s*>/.test(line)) { return line; } // meaning line
        return line.split(/(\s+)/).map(function (w) {
            return /^\s*$/.test(w) ? w : syllabifyInputWord(w, inputType);
        }).join('');
    }).join('\n');
    processInput();
}

async function processInput() {
    const input = textInput.value;

    var lines = parseLines(input);
    var verseSource = lines.filter(function (l) { return !l.meaning; })
        .map(function (l) { return l.text; }).join('\n');

    if (input.trim() === '') {
        autoDetect = true;
    } else if (autoDetect) {
        // Detect from verse lines only; English meanings would look like IAST.
        var detected = detectInputType(verseSource);
        if (detected && detected !== inputType) {
            inputType = detected;
            htmlInputType.value = detected;
            // Flash the select so the switch is noticeable.
            htmlInputType.classList.remove('auto-switched');
            void htmlInputType.offsetWidth; // restart the animation
            htmlInputType.classList.add('auto-switched');
            updatePalette();
        }
    }

    lines.forEach(function (l) {
        if (l.meaning) { l.indic = l.text; l.roman = l.text; return; }
        l.indic = Sanscript.t(stripParenAlternates(l.text).replaceAll("-", ""), inputType, indicType);
        var r = Sanscript.t(applyParenAlternates(l.text), inputType, romanType);
        // Upgrade to the true candrabindu glyph only when the font renders it.
        if (candrabinduOK && romanType === 'iast') {
            r = r.replaceAll("ṁ", CANDRABINDU);
        }
        l.roman = r;
    });
    lastLines = lines;

    var indicText = lines.map(function (l) { return l.indic; }).join('\n').trim();
    var romanText = lines.map(function (l) { return l.roman; }).join('\n').trim();

    // Candrabindu (U+F141) and the Vedic accent glyphs (U+E007-U+E009) are
    // Sanskrit 2003 PUA characters; warn readers when either is present
    // in either script (the double svarita U+E008 appears in both).
    var fontNotice = document.getElementById('fontNotice');
    if (fontNotice) {
        fontNotice.style.display = /[\uE007-\uE009\uF141]/.test(romanText + indicText) ? 'block' : 'none';
    }

    devanagariOutput.innerHTML = lines.map(function (l) {
        return l.meaning ? '<span class="meaning-line">' + escapeHtml(l.indic) + '</span>'
            : highlightUntranslated(l.indic);
    }).join('<br>');
    transOutput.innerHTML = lines.map(function (l) {
        return l.meaning ? '<span class="meaning-line">' + escapeHtml(l.roman) + '</span>'
            : escapeHtml(l.roman);
    }).join('<br>');
    combinedOutput.innerHTML = buildCombined(lines);
    sideBySid.innerHTML = buildSideBySide(lines);

    // Booklet (verse table) view.
    var vt = document.getElementById('verseTable');
    if (vt) {
        vt.innerHTML = groupVerses(lines).map(function (v) {
            var dev = v.rows.map(function (r) { return escapeHtml(r.indic); }).join('<br>');
            var rom = v.rows.map(function (r) { return escapeHtml(r.roman); }).join('<br>');
            var html = '<tr><td class="verse-dev">' + dev + '</td><td class="verse-rom">' + rom + '</td></tr>';
            if (v.meanings.length) {
                html += '<tr><td colspan="2" class="verse-meaning">' + v.meanings.map(escapeHtml).join('<br>') + '</td></tr>';
            }
            return html;
        }).join('');
    }

    // Remember the session (restored on next visit).
    try {
        localStorage.setItem('sanskrit:last', JSON.stringify({ t: input, i: inputType, d: indicType, r: romanType }));
    } catch (e) { /* private mode */ }
}


// Called only when the user changes the input-system select by hand.
function inputSystemChanged() {
    autoDetect = false;
    updateVariable();
}

function updateVariable() {
    inputType = htmlInputType.value;
    indicType = indicOutput.value;
    romanType = romanOutput.value;

    // Keep the output card titles in sync with the selected schemes.
    var indicLabel = document.getElementById('indicLabel');
    var romanLabel = document.getElementById('romanLabel');
    if (indicLabel) {
        indicLabel.innerText = indicOutput.options[indicOutput.selectedIndex].text.replace(/\s*\(.*\)/, '');
    }
    if (romanLabel) {
        romanLabel.innerText = romanOutput.options[romanOutput.selectedIndex].text.replace(/\s*\(.*\)/, '');
    }

    updatePalette();
    processInput();
}

/*
 * Combined view: per verse, the Indic block, then the roman block,
 * then the meaning once (styled), verses separated by blank lines.
 */
function buildCombined(lines) {
    return groupVerses(lines).map(function (v) {
        var parts = [];
        if (v.rows.length) {
            parts.push(v.rows.map(function (r) { return escapeHtml(r.indic); }).join('<br>'));
            parts.push(v.rows.map(function (r) { return escapeHtml(r.roman); }).join('<br>'));
        }
        v.meanings.forEach(function (m) {
            parts.push('<span class="meaning-line">' + escapeHtml(m) + '</span>');
        });
        return parts.join('<br>');
    }).join('<br><br>');
}

/*
 * Summer Camp view: Indic <tab> roman per line (roman words double
 * spaced, for Word paste), with each meaning rendered once, spanning.
 * Rendered inside a <pre>, so \n and \t survive.
 */
function buildSideBySide(lines) {
    return lines.map(function (l) {
        if (l.text.trim() === '') { return ''; }
        if (l.meaning) {
            return '<span class="meaning-line">' + escapeHtml(l.text) + '</span>';
        }
        var dev = l.indic.replace(/ {2,}/g, ' ');
        var rom = l.roman.replace(/ {2,}/g, ' ').replace(/ /g, '  ');
        return escapeHtml(dev) + '\t' + escapeHtml(rom);
    }).join('\n');
}

function displayType() {
    document.getElementById('sideBySideHide').style.display = 'none';
    document.getElementById('devanagariOutputHide').style.display = 'none';
    document.getElementById('transOutputHide').style.display = 'none';
    document.getElementById('combinedOutputHide').style.display = 'none';
    document.getElementById('verseTableHide').style.display = 'none';
    const input = document.getElementById('displayType').value;
    if (input === "double") {
        document.getElementById('devanagariOutputHide').style.display = "block";
        document.getElementById('transOutputHide').style.display = "block";
    } else {
        document.getElementById(input).style.display = "block";
    }
}

async function copyText(divId) {
    // Plain flavor: innerText keeps line breaks/tabs, drops the markup.
    const div = document.getElementById(divId);
    const textToCopy = div.innerText;

    // HTML flavor for Word: drop the error highlights, keep meanings as
    // italic, keep line breaks, and preserve tabs (Summer Camp) using
    // Word's mso-tab-count convention.
    var htmlBody = div.innerHTML
        .replace(/<mark[^>]*>/g, '').replace(/<\/mark>/g, '')
        .replace(/<span class="meaning-line">/g, '<i style="font-size: 11pt; font-family: Calibri, sans-serif">')
        .replace(/<\/span>/g, '</i>')
        .replace(/\t/g, '<span style=\'mso-tab-count:1\'>\t</span>')
        .replace(/\n/g, '<br>');
    var html = `<span style="font-family: Sanskrit2003; font-size: 16pt">${htmlBody}</span>`;
    const clipboardItem = new ClipboardItem({
        "text/html": new Blob([html], {
            type: "text/html"
        }),
        "text/plain": new Blob([textToCopy], {
            type: "text/plain"
        })
    });
    var parentDiv = div.parentNode;

    try {
        await navigator.clipboard.write([clipboardItem]);
        parentDiv.classList.add("success-callout");
        setTimeout(function() {
            parentDiv.classList.remove("success-callout");
        }, 1000);
        console.log(clipboardItem + "copied to clipboard!");
    } catch (err) {
        console.error("Error copying HTML:", err);
    }
    /*
        // Use the Clipboard API to copy the text
        navigator.clipboard.writeText(textToCopy).then(() => {
            //alert('Text copied to clipboard!');
            parentDiv.classList.add("success-callout");
            setTimeout(function(){parentDiv.classList.remove("success-callout");}, 1000);
        }).catch((err) => {
            console.error('Failed to copy text: ', err);
        });*/
}

async function copyHTMLWithFormatting() {
    const blob = new Blob([html], {
        type: "text/html"
    });
    const clipboardItem = new ClipboardItem({
        "text/html": blob
    });

    try {
        await navigator.clipboard.write([clipboardItem]);
        console.log("HTML copied to clipboard!");
    } catch (err) {
        console.error("Error copying HTML:", err);
    }
}

/*
 * Drag & drop import of .brh / .itx / .txt files.
 * The file extension picks the input system directly (.brh -> Baraha,
 * .itx -> iTrans); otherwise content auto-detection takes over.
 */
function setupDropZone() {
    var zone = document.getElementById('textInput');
    if (!zone) {
        return;
    }

    // Keep the browser from navigating away on stray drops.
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
            e.preventDefault();
            zone.classList.add('drop-active');
        });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
        zone.addEventListener(ev, function () {
            zone.classList.remove('drop-active');
        });
    });

    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drop-active');

        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) {
            return;
        }
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'brh' && ext !== 'itx' && ext !== 'txt') {
            return;
        }

        var reader = new FileReader();
        reader.onload = function () {
            var text = String(reader.result);
            // Strip directive lines like <columns=2> found in Baraha files.
            text = text.replace(/^[ \t]*<[^>\n]*>[ \t]*\r?\n?/gm, '');
            pushUndo();
            zone.value = text;

            if (ext === 'brh') {
                inputType = 'baraha';
                autoDetect = false;
            } else if (ext === 'itx') {
                inputType = 'itrans';
                autoDetect = false;
            } else {
                autoDetect = true; // let the content decide
            }
            htmlInputType.value = inputType;
            htmlInputType.classList.remove('auto-switched');
            void htmlInputType.offsetWidth;
            htmlInputType.classList.add('auto-switched');

            processInput();
        };
        reader.readAsText(file);
    });
}

/*
 * Saved texts (localStorage) and shareable links.
 */
function getSavedTexts() {
    try { return JSON.parse(localStorage.getItem('sanskrit:texts')) || {}; }
    catch (e) { return {}; }
}

function putSavedTexts(obj) {
    try { localStorage.setItem('sanskrit:texts', JSON.stringify(obj)); } catch (e) {}
}

function refreshSavedList(selected) {
    var sel = document.getElementById('savedTexts');
    if (!sel) { return; }
    var names = Object.keys(getSavedTexts()).sort();
    sel.innerHTML = '<option value="">Saved texts…</option>' + names.map(function (n) {
        return '<option value="' + escapeHtml(n).replace(/"/g, '&quot;') + '">' + escapeHtml(n) + '</option>';
    }).join('');
    if (selected) { sel.value = selected; }
}

function saveText() {
    var sel = document.getElementById('savedTexts');
    var name = prompt('Name this text:', sel && sel.value ? sel.value : '');
    if (!name) { return; }
    var texts = getSavedTexts();
    texts[name] = { t: textInput.value, i: inputType, d: indicType, r: romanType };
    putSavedTexts(texts);
    refreshSavedList(name);
}

function loadSaved() {
    var sel = document.getElementById('savedTexts');
    var entry = getSavedTexts()[sel.value];
    if (!entry) { return; }
    pushUndo();
    applyState(entry);
}

function deleteSaved() {
    var sel = document.getElementById('savedTexts');
    if (!sel.value) { return; }
    if (!confirm('Delete "' + sel.value + '"?')) { return; }
    var texts = getSavedTexts();
    delete texts[sel.value];
    putSavedTexts(texts);
    refreshSavedList();
}

// Apply a {t, i, d, r} state object to the UI.
function applyState(st) {
    if (typeof st.t === 'string') { textInput.value = st.t; }
    if (st.i) { htmlInputType.value = st.i; autoDetect = false; }
    if (st.d) { indicOutput.value = st.d; }
    if (st.r) { romanOutput.value = st.r; }
    updateVariable();
}

// Unicode-safe base64url helpers for share links.
function encodeState() {
    var st = { t: textInput.value, i: inputType, d: indicType, r: romanType };
    var b = btoa(unescape(encodeURIComponent(JSON.stringify(st))));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(hash) {
    try {
        var b = hash.replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) { b += '='; }
        return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return null; }
}

function copyShareLink(btn) {
    var url = location.origin + location.pathname + '#s=' + encodeState();
    history.replaceState(null, '', '#s=' + encodeState());
    navigator.clipboard.writeText(url).then(function () {
        var old = btn.innerText;
        btn.innerText = 'Copied!';
        setTimeout(function () { btn.innerText = old; }, 1200);
    });
}

// Restore state: a share link wins, then the previous session.
function initState() {
    refreshSavedList();
    if (location.hash.indexOf('#s=') === 0) {
        var st = decodeState(location.hash.slice(3));
        if (st) { applyState(st); return; }
    }
    try {
        var last = JSON.parse(localStorage.getItem('sanskrit:last'));
        if (last && last.t) { applyState(last); }
    } catch (e) { /* ignore */ }
}

/*
 * Undo for programmatic edits of the input (find/replace, Syllabify,
 * AI meanings, file drops, loading a saved text). The browser's own
 * Ctrl+Z still covers ordinary typing.
 */
var undoStack = [];

function pushUndo() {
    undoStack.push(textInput.value);
    if (undoStack.length > 50) { undoStack.shift(); }
}

function undoEdit(btn) {
    if (!undoStack.length) {
        if (btn) {
            var old = btn.innerText;
            btn.innerText = 'Nothing to undo';
            setTimeout(function () { btn.innerText = old; }, 1200);
        }
        return;
    }
    textInput.value = undoStack.pop();
    processInput();
}

/*
 * Find & replace over the input. With "regex" on, full syntax with
 * g+m flags (so ^ and $ anchor per line; note | is alternation, so a
 * literal danda is \|). With it off, plain literal text.
 */
function findReplace(btn) {
    var find = document.getElementById('findField').value;
    if (!find) { return; }
    var isRegex = document.getElementById('frRegex').checked;
    var pattern = isRegex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var flags = 'gm' + (document.getElementById('frCase').checked ? 'i' : '');
    var re;
    try {
        re = new RegExp(pattern, flags);
    } catch (e) {
        alert('Invalid pattern: ' + e.message);
        return;
    }
    var repl = document.getElementById('replaceField').value;
    if (!isRegex) { repl = repl.replace(/\$/g, '$$$$'); } // keep $ literal
    var count = (textInput.value.match(re) || []).length;
    if (count > 0) {
        pushUndo();
        textInput.value = textInput.value.replace(re, repl);
        processInput();
    }
    var old = btn.innerText;
    btn.innerText = count + ' replaced';
    setTimeout(function () { btn.innerText = old; }, 1400);
}

/*
 * AI meaning generation (complex page). Calls the Google Gemini API
 * directly from the browser with a user-supplied key (kept in
 * localStorage only), and inserts a "> meaning" line after every verse
 * that lacks one. Free keys: aistudio.google.com.
 */
var AI_MODEL = 'gemini-2.5-flash';

function getGeminiKey(forceAsk) {
    var k = localStorage.getItem('sanskrit:geminiKey');
    if (!k || forceAsk) {
        k = prompt('Paste your Google AI Studio (Gemini) API key.\nGet one free at aistudio.google.com. It is stored only in this browser and sent only to Google.');
        if (!k) { return null; }
        k = k.trim();
        try { localStorage.setItem('sanskrit:geminiKey', k); } catch (e) {}
    }
    return k;
}

function generateMeanings(btn) {
    // Group raw input lines into verses, remembering where each ends.
    var rawLines = textInput.value.split('\n');
    var verses = [], cur = null;
    rawLines.forEach(function (line, i) {
        if (line.trim() === '') { cur = null; return; }
        if (!cur) { cur = { rows: [], hasMeaning: false, endIdx: i }; verses.push(cur); }
        if (/^\s*>/.test(line)) { cur.hasMeaning = true; } else { cur.rows.push(line); }
        cur.endIdx = i;
    });
    var targets = verses.filter(function (v) { return !v.hasMeaning && v.rows.length; });
    if (!targets.length) {
        alert(rawLines.join('').trim() === '' ? 'Type or import a text first.' : 'Every verse already has a meaning.');
        return;
    }
    var key = getGeminiKey(false);
    if (!key) { return; }

    // Send the verses in IAST, which reads unambiguously.
    var romanScheme = Sanscript.isRomanScheme(inputType) || inputType === 'devanagari' ? inputType : 'itrans';
    var numbered = targets.map(function (v, i) {
        return (i + 1) + '. ' + Sanscript.t(stripParenAlternates(v.rows.join(' / ')), romanScheme, 'iast');
    }).join('\n');

    var old = btn.innerText;
    btn.innerText = 'Generating…';
    btn.disabled = true;
    function done() { btn.innerText = old; btn.disabled = false; }

    fetch('https://generativelanguage.googleapis.com/v1beta/models/' + AI_MODEL + ':generateContent', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-goog-api-key': key
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: 'These are numbered Sanskrit/Hindi verses from a Hindu prayer, in IAST '
                        + 'transliteration ("/" separates lines of the same verse). For each verse, write '
                        + 'one short English meaning (1-2 sentences) in the devotional style of prayer '
                        + 'booklets, e.g. "I bow to Lord Śiva, who is as bright as camphor, the embodiment '
                        + 'of compassion." Skip headings like dohā/caupāī with an empty string. '
                        + 'Return ONLY a JSON array of strings, one per verse, in order.\n\n' + numbered
                }]
            }],
            generationConfig: { responseMimeType: 'application/json' }
        })
    }).then(function (r) {
        if (r.status === 400 || r.status === 401 || r.status === 403) {
            localStorage.removeItem('sanskrit:geminiKey');
            throw new Error('The API key was rejected - click AI meanings again to enter a new one.');
        }
        if (!r.ok) { return r.json().then(function (e) { throw new Error((e.error && e.error.message) || ('HTTP ' + r.status)); }); }
        return r.json();
    }).then(function (data) {
        var text = data.candidates[0].content.parts[0].text
            .replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '').trim();
        var meanings = JSON.parse(text);
        if (!Array.isArray(meanings) || meanings.length !== targets.length) {
            throw new Error('Unexpected response shape - try again.');
        }
        pushUndo();
        // Insert bottom-up so earlier indices stay valid.
        for (var i = targets.length - 1; i >= 0; i--) {
            var m = String(meanings[i] || '').trim();
            if (m) { rawLines.splice(targets[i].endIdx + 1, 0, '> ' + m); }
        }
        textInput.value = rawLines.join('\n');
        processInput();
        done();
    }).catch(function (err) {
        done();
        alert('Meaning generation failed: ' + err.message);
    });
}

/*
 * Dark mode: follows the system preference until the user chooses,
 * then remembers the choice.
 */
function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('sanskrit:theme'); } catch (e) {}
    var dark = saved ? saved === 'dark'
        : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', dark);
    updateThemeButton();
}

function toggleTheme() {
    var dark = !document.body.classList.contains('dark');
    document.body.classList.toggle('dark', dark);
    try { localStorage.setItem('sanskrit:theme', dark ? 'dark' : 'light'); } catch (e) {}
    updateThemeButton();
}

function updateThemeButton() {
    var b = document.getElementById('themeToggle');
    if (b) { b.innerHTML = document.body.classList.contains('dark') ? '&#9788;' : '&#9790;'; }
}

/*
 * Presentation mode: fullscreen, one verse at a time, for leading
 * chanting. Arrows / space / click advance; Esc closes.
 */
var presentIdx = 0, presentVerses = [];

function openPresent() {
    presentVerses = groupVerses(lastLines).filter(function (v) { return v.rows.length; });
    if (!presentVerses.length) {
        alert('Type or import a text first.');
        return;
    }
    presentIdx = 0;
    document.getElementById('presentView').style.display = 'flex';
    renderPresent();
    document.addEventListener('keydown', presentKeys);
    var pv = document.getElementById('presentView');
    if (pv.requestFullscreen) { pv.requestFullscreen().catch(function () {}); }
}

function closePresent() {
    document.getElementById('presentView').style.display = 'none';
    document.removeEventListener('keydown', presentKeys);
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
    }
}

function presentKeys(e) {
    if (e.key === 'Escape') { closePresent(); }
    else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); presentStep(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); presentStep(-1); }
}

function presentStep(d) {
    presentIdx = Math.min(Math.max(presentIdx + d, 0), presentVerses.length - 1);
    renderPresent();
}

function renderPresent() {
    var v = presentVerses[presentIdx];
    var html = '<div class="pv-dev">' + v.rows.map(function (r) { return escapeHtml(r.indic); }).join('<br>') + '</div>'
        + '<div class="pv-rom">' + v.rows.map(function (r) { return escapeHtml(r.roman); }).join('<br>') + '</div>';
    if (v.meanings.length) {
        html += '<div class="pv-meaning">' + v.meanings.map(escapeHtml).join('<br>') + '</div>';
    }
    document.getElementById('presentContent').innerHTML = html;
    document.getElementById('presentCounter').innerText = (presentIdx + 1) + ' / ' + presentVerses.length;
}

/*
 * IAST character palette: one-click diacritics, shown only when the
 * input system is IAST. Inserts at the cursor.
 */
var IAST_CHARS = 'ā ī ū ṛ ṝ ḷ ḹ ṃ ḥ ṁ ṅ ñ ṭ ḍ ṇ ś ṣ ।'.split(' ');

function buildPalette() {
    var pal = document.getElementById('iastPalette');
    if (!pal) { return; }
    pal.innerHTML = IAST_CHARS.map(function (c) {
        return '<button type="button" class="pal-key" onclick="insertChar(\'' + c + '\')">' + c + '</button>';
    }).join('');
}

function insertChar(c) {
    textInput.setRangeText(c, textInput.selectionStart, textInput.selectionEnd, 'end');
    textInput.focus();
    processInput();
}

function updatePalette() {
    var pal = document.getElementById('iastPalette');
    if (pal) { pal.style.display = inputType === 'iast' ? 'flex' : 'none'; }
}

/*
 * Number verses: appends "|| n ||" (or "॥ n ॥" for Devanagari input)
 * to the last line of every verse of two or more lines, skipping
 * verses that already carry a number. Undo-able.
 */
function toDevaDigits(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '०१२३४५६७८९'[+d]; });
}

function numberVerses(btn) {
    var before = textInput.value;
    var rawLines = before.split('\n');
    var verses = [], cur = null;
    rawLines.forEach(function (line, i) {
        if (line.trim() === '') { cur = null; return; }
        if (!cur) { cur = { rowIdx: [], text: '' }; verses.push(cur); }
        if (!/^\s*>/.test(line)) { cur.rowIdx.push(i); cur.text += line + ' '; }
    });
    var deva = inputType === 'devanagari';
    var numRe = /\|\|\s*[0-9०-९]+\s*\|\||॥\s*[0-9०-९]+\s*॥/;
    var n = 0, changed = 0;
    verses.forEach(function (v) {
        if (v.rowIdx.length < 2) { return; }   // headings stay unnumbered
        n++;
        if (numRe.test(v.text)) { return; }    // keeps the sequence in sync
        var li = v.rowIdx[v.rowIdx.length - 1];
        rawLines[li] = rawLines[li].replace(/\s+$/, '') + ' '
            + (deva ? '॥ ' + toDevaDigits(n) + ' ॥' : '|| ' + n + ' ||');
        changed++;
    });
    if (changed) {
        undoStack.push(before);
        if (undoStack.length > 50) { undoStack.shift(); }
        textInput.value = rawLines.join('\n');
        processInput();
    }
    var old = btn.innerText;
    btn.innerText = changed + ' numbered';
    setTimeout(function () { btn.innerText = old; }, 1400);
}

/*
 * Convert the input text itself into another system (e.g. an iTrans
 * file into Baraha), switching the input-system select along with it.
 * Meaning lines are left alone. Undo-able.
 */
function convertInput(btn) {
    var to = document.getElementById('convertTo').value;
    if (to === inputType) {
        var old0 = btn.innerText;
        btn.innerText = 'Already ' + to;
        setTimeout(function () { btn.innerText = old0; }, 1200);
        return;
    }
    pushUndo();
    textInput.value = textInput.value.split('\n').map(function (line) {
        if (/^\s*>/.test(line)) { return line; }
        return Sanscript.t(line, inputType, to);
    }).join('\n');
    inputType = to;
    autoDetect = false;
    htmlInputType.value = to;
    htmlInputType.classList.remove('auto-switched');
    void htmlInputType.offsetWidth;
    htmlInputType.classList.add('auto-switched');
    updatePalette();
    processInput();
}

/*
 * Complex mode. The main page keeps the interface simple; the /complex
 * page (a path-adjusted copy of index.html) additionally shows the
 * power features: Syllabify, Word (.docx), Print/PDF, Booklet Table.
 */
var complexMode = /\/complex(\/|\/index\.html)?$/.test(location.pathname);

function applyComplexMode() {
    if (complexMode) {
        document.body.classList.add('complex');
        var sub = document.querySelector('.topHeader .subtitle');
        if (sub) { sub.innerText += ' · complex mode'; }
        return;
    }
    // Simple page: remove the complex-only controls entirely.
    var els = document.querySelectorAll('.complex-only');
    for (var i = els.length - 1; i >= 0; i--) {
        els[i].parentNode.removeChild(els[i]);
    }
}

// Scripts are loaded with `defer`, so the DOM is ready here.
applyComplexMode();
initTheme();
buildPalette();
setupDropZone();
initCandrabinduSupport();
initState();
updatePalette();