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

async function processInput() {
    const input = textInput.value;

    if (input.trim() === '') {
        autoDetect = true;
    } else if (autoDetect) {
        var detected = detectInputType(input);
        if (detected && detected !== inputType) {
            inputType = detected;
            htmlInputType.value = detected;
            // Flash the select so the switch is noticeable.
            htmlInputType.classList.remove('auto-switched');
            void htmlInputType.offsetWidth; // restart the animation
            htmlInputType.classList.add('auto-switched');
        }
    }

    var indicOutput = Sanscript.t(stripParenAlternates(input).replaceAll("-", ""), inputType, indicType).trim();
    var romanOutput = Sanscript.t(applyParenAlternates(input), inputType, romanType).trim()

    // Upgrade ṁ to the true candrabindu glyph only when the font renders it.
    if (candrabinduOK && romanType === 'iast') {
        romanOutput = romanOutput.replaceAll("ṁ", CANDRABINDU);
    }
    var fontNotice = document.getElementById('fontNotice');
    if (fontNotice) {
        fontNotice.style.display = romanOutput.indexOf(CANDRABINDU) !== -1 ? 'block' : 'none';
    }
    //doubleSpace = doubleSpace.value;
    //if(doubleSpace === "yes") {
    //romanOutput = romanOutput.replaceAll(" ", "  ");
    //}
    devanagariOutput.innerText = indicOutput;
    transOutput.innerText = romanOutput;
    combinedOutput.innerText = combineText(indicOutput, romanOutput);
    sideBySid.innerText = sideBySide(indicOutput, romanOutput);
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
        romanLabel.innerText = romanOutput.options[romanOutput.selectedIndex].text;
    }

    processInput();
}

function combineText(set1, set2) {
    // Split each set by newline to get arrays of lines
    const lines1 = set1.split('\n\n');
    const lines2 = set2.split('\n\n');

    // Determine the maximum number of lines to account for unequal lengths
    const maxLength = Math.max(lines1.length, lines2.length);

    // Combine lines from both arrays
    const combinedLines = [];
    for (let i = 0; i < maxLength; i++) {
        // Get line from each set, or an empty string if one set is shorter
        const line1 = lines1[i] || "";
        const line2 = lines2[i] || "";

        // Combine the lines with a space or any desired separator
        combinedLines.push(line1 + "\n" + line2);
    }

    // Join the combined lines back into a single string with newlines
    return combinedLines.join('\n\n');
}

function sideBySide(set1, set2) {
    // Split each set by newline to get arrays of lines
    const lines1 = set1.replaceAll("  ", " ").split('\n');
    const lines2 = set2.replaceAll("  ", " ").replaceAll(" ", "  ").split('\n');

    // Determine the maximum number of lines to account for unequal lengths
    const maxLength = Math.max(lines1.length, lines2.length);

    // Combine lines from both arrays
    const combinedLines = [];
    for (let i = 0; i < maxLength; i++) {
        // Get line from each set, or an empty string if one set is shorter
        const line1 = lines1[i] || "";
        const line2 = lines2[i] || "";

        // Combine the lines with a space or any desired separator
        combinedLines.push(line1 + "\t" + line2);
    }

    // Join the combined lines back into a single string with newlines
    return combinedLines.join('\n');
}

function displayType() {
    document.getElementById('sideBySideHide').style.display = 'none';
    document.getElementById('devanagariOutputHide').style.display = 'none';
    document.getElementById('transOutputHide').style.display = 'none';
    document.getElementById('combinedOutputHide').style.display = 'none';
    const input = document.getElementById('displayType').value;
    if (input === "double") {
        document.getElementById('devanagariOutputHide').style.display = "block";
        document.getElementById('transOutputHide').style.display = "block";
    } else {
        document.getElementById(input).style.display = "block";
    }
}

async function copyText(divId) {
    // Select the text from the div
    const div = document.getElementById(divId);
    const textToCopy = div.innerHTML.replaceAll("<br>", "\n");
    console.log(div.innerHTML);
    var html = `<span style="font-family: Sanskrit2003; font-size: 16pt">${textToCopy}</span>`;
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

// Scripts are loaded with `defer`, so the DOM is ready here.
setupDropZone();
initCandrabinduSupport();