var inputType = "itrans";
var indicType = "devanagari";
var romanType = "iast";
var doubleSpace = "yes";


async function processInput() {
    const input = document.getElementById('textInput').value;
    var indicOutput = Sanscript.t(input.replaceAll("-", ""), inputType, indicType).trim();
    var romanOutput = Sanscript.t(input, inputType, romanType).trim()
    //doubleSpace = document.getElementById('doubleSpace').value;
    //if(doubleSpace === "yes") {
    //romanOutput = romanOutput.replaceAll(" ", "  ");
    //}
    document.getElementById('devanagariOutput').innerText = indicOutput;
    document.getElementById('transOutput').innerText = romanOutput;
    document.getElementById('combinedOutput').innerText = combineText(indicOutput, romanOutput);
    document.getElementById('sideBySide').innerText = sideBySide(indicOutput, romanOutput);
}


function updateVariable() {
    inputType = document.getElementById('inputType').value;
    indicType = document.getElementById('indicOutput').value;
    romanType = document.getElementById('romanOutput').value;
    //document.getElementById('romanOutType').innerText = romanOutput;

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

function copyText(divId) {
    // Select the text from the div
    const textToCopy = document.getElementById(divId).innerText;

    // Use the Clipboard API to copy the text
    navigator.clipboard.writeText(textToCopy).then(() => {
        // alert('Text copied to clipboard!');
    }).catch((err) => {
        console.error('Failed to copy text: ', err);
    });
}
