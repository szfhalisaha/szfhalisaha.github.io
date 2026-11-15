#!/usr/bin/env python3
"""Safe, repeatable patch for the existing SZF GitHub Pages app; original files are backed up."""
from pathlib import Path
import sys, shutil, re

root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
app=root/'app.js'; css=root/'styles.css'; html=root/'index.html'
for f in (app,css,html):
    if not f.exists(): raise SystemExit(f'Eksik dosya: {f}')
src=app.read_text(encoding='utf-8')
start=src.find('function fillInlineSharePreviews(){')
end=src.find('function rosterPickerItems(){',start)
if start<0 or end<0: raise SystemExit('Desteklenmeyen app.js sürümü: önizleme fonksiyonu bulunamadı. Hiçbir dosya değiştirilmedi.')
if 'SZF_FAST_POSTER_V140' in src: raise SystemExit('Bu sürüm zaten kurulmuş.')
new=Path(__file__).with_name('fast-poster-function.js').read_text(encoding='utf-8')
patched=src[:start]+new+'\n'+src[end:]
htmltext=html.read_text(encoding='utf-8')
if '</head>' not in htmltext:raise SystemExit('index.html head etiketi bulunamadı; hiçbir dosya değiştirilmedi.')
htmltext=htmltext.replace('</head>','  <link rel="stylesheet" href="szf-fast-poster.css?v=140" />\n</head>',1)
for f in (app,html):shutil.copy2(f,str(f)+'.before-v140.bak')
app.write_text(patched,encoding='utf-8');html.write_text(htmltext,encoding='utf-8')
css_source=Path(__file__).with_name('szf-fast-poster.css')
css_target=root/'szf-fast-poster.css'
if css_source.resolve()!=css_target.resolve():shutil.copy2(css_source,css_target)
print('Başarılı: app.js, index.html, szf-fast-poster.css güncellendi. Yedekler .before-v140.bak uzantısıyla hazır.')
