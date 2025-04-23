var inputType = "itrans";
var indicType = "devanagari";
var romanType = "iast";
var doubleSpace = "yes";


async function processInput() {
    const input = textInput.value;
    var indicOutput = Sanscript.t(input.replaceAll("-", ""), inputType, indicType).trim();
    var romanOutput = Sanscript.t(input, inputType, romanType).trim()
    //doubleSpace = doubleSpace.value;
    //if(doubleSpace === "yes") {
    //romanOutput = romanOutput.replaceAll(" ", "  ");
    //}
    devanagariOutput.innerText = indicOutput;
    transOutput.innerText = romanOutput;
    combinedOutput.innerText = combineText(indicOutput, romanOutput);
    sideBySid.innerText = sideBySide(indicOutput, romanOutput);
}


function updateVariable() {
    inputType = htmlInputType.value;
    indicType = indicOutput.value;
    romanType = romanOutput.value;
    //romanOutType.innerText = romanOutput;

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
    }
    console.log(input);
    document.getElementById(input).style.display = "block";
}

async function copyText(divId) {
    // Select the text from the div
    const div = document.getElementById(divId);
    const textToCopy = div.innerHTML;
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

// Example usage
// Call copyHTMLWithFormatting() when needed