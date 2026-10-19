import sys, re, zlib
data = open(sys.argv[1], 'rb').read()
out = []
for m in re.finditer(rb'stream\r?\n', data):
    start = m.end()
    end = data.find(b'endstream', start)
    if end < 0: continue
    raw = data[start:end]
    try:
        dec = zlib.decompress(raw)
    except Exception:
        try:
            dec = zlib.decompressobj().decompress(raw)
        except Exception:
            continue
    # extract text from Tj / TJ
    texts = []
    for t in re.finditer(rb'\[(.*?)\]\s*TJ|\((.*?)\)\s*Tj', dec, re.S):
        if t.group(1) is not None:
            parts = re.findall(rb'\(((?:\\.|[^\\)])*)\)', t.group(1))
            texts.append(b''.join(parts))
        else:
            texts.append(t.group(2))
    if texts:
        out.append(b' '.join(texts))
s = b'\n'.join(out)
s = s.replace(b'\\(', b'(').replace(b'\\)', b')')
sys.stdout.write(s.decode('latin-1'))
