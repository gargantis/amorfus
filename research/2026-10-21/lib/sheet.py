# Contact sheet: python3 lib/sheet.py <spec.json>
# spec: {"out": path, "cols": 4, "title": str?, "items": [{"path": p, "label": str}], "cell": [w,h]?}
import json, sys
from PIL import Image, ImageDraw, ImageFont
spec = json.load(open(sys.argv[1]))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(FONT, 15)
tfont = ImageFont.truetype(FONT, 20)
items = spec['items']
imgs = [Image.open(it['path']).convert('RGB') for it in items]
cw = spec.get('cell', [max(i.width for i in imgs), max(i.height for i in imgs)])
cols = spec.get('cols', 4)
rows = (len(imgs) + cols - 1) // cols
lab_h = 40
title_h = 34 if spec.get('title') else 0
sheet = Image.new('RGB', (cols * (cw[0] + 8) + 8, title_h + rows * (cw[1] + lab_h + 8) + 8), (250, 250, 250))
d = ImageDraw.Draw(sheet)
if spec.get('title'):
    d.text((10, 6), spec['title'], fill=(20, 20, 20), font=tfont)
for k, (im, it) in enumerate(zip(imgs, items)):
    r, c = divmod(k, cols)
    x = 8 + c * (cw[0] + 8); y = title_h + 8 + r * (cw[1] + lab_h + 8)
    im2 = im.copy(); im2.thumbnail((cw[0], cw[1]))
    sheet.paste(im2, (x + (cw[0] - im2.width) // 2, y + (cw[1] - im2.height) // 2))
    lines = it.get('label', '').split('\n')
    for li, line in enumerate(lines[:2]):
        d.text((x + 2, y + cw[1] + 3 + li * 18), line, fill=(30, 30, 30), font=font)
sheet.save(spec['out'])
print(spec['out'], sheet.size)

