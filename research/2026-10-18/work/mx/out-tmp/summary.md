# mx-codes

Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight runs ≥ 9 cracks blended into a parabola ±6; |τ| ≤ 0.45), xBR saddles with margin + checker groups, corners kept, lone blocks → discs; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: y-biased projection axis, column search + 1 code load; hints geometry; apron 10.

- **edge-1:8** grass|stone 1:8: std 0.042 max 0.100 off 0.026 · area ×1.000 · parts 1 · 61.0 ms
- **disc-r7.6** disc r=7.6: std 0.163 max 0.366 off -0.056 · area ×0.987 · parts 1 · 62.5 ms
- **line1-1:2** 1-wide 1:2: std 0.007 max 0.034 off 0.001 · area ×0.960 · parts 1 width min 0.867 mean 0.896 (ideal 0.894) · 64.4 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.034 max 0.109 off -0.009; grass|stone 330°: std 0.031 max 0.059 off 0.007 · area ×1.001 · parts 1 · 15.0 ms
- **hill-materials** stone disc on hill: std 0.127 max 0.316 off -0.063; sand 1:2 edge on hill: std 0.006 max 0.007 off -0.179 · area ×1.003 · parts 1 · 68.2 ms

total mesh time 271.1 ms
