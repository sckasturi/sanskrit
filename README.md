# Sanskrit Transliterator

Forked from [this repository](https://github.com/sanskrit/sanscript) to create a tool for transliterating Sanskrit.

Inspired by [this tool](https://www.learnsanskrit.org/tools/sanscript/) from learnsanskrit.org. Made some quality of life adjustments to fit my specific needs.

## Pages

- `/` — the simple transliterator (input, outputs, save/share).
- `/complex` — everything, plus the power features: Syllabify, Word (.docx) export, Print/PDF, Booklet Table view.

`complex/index.html` is a generated copy of `index.html` with `../`-prefixed asset paths; the feature gating itself lives in `js/app.js` (elements marked `complex-only` are removed unless the URL path ends in `/complex`). After editing `index.html`, regenerate the copy:

```sh
python3 -c "
import io, re
src = io.open('index.html', encoding='utf-8').read()
out = re.sub(r'(src|href)=\"(?!https?:|//|#|\.\./)', r'\1=\"../', src)
io.open('complex/index.html', 'w', encoding='utf-8').write(out)
"
```
