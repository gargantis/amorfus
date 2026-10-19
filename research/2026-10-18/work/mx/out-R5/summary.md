# mx-codes

Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight windows ≥ 9 cracks, else parabola ±6; |τ| ≤ 0.45), xBR saddles with margin, corners kept, one-cell chains square; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: column search + 1 code load; hints geometry; apron 10.

- **edge-1:8** grass|stone 1:8: std 0.127 max 0.211 off 0.010 · area ×1.000 · parts 1 · 57.4 ms
- **edge-1:5** grass|stone 1:5: std 0.028 max 0.058 off -0.043 · area ×0.999 · parts 1 · 57.6 ms
- **edge-1:3** grass|stone 1:3: std 0.022 max 0.047 off -0.149 · area ×1.000 · parts 1 · 69.7 ms
- **edge-2:3** grass|stone 2:3: std 0.012 max 0.031 off 0.047 · area ×0.999 · parts 1 · 16.2 ms
- **disc-r2.4** disc r=2.4: std 0.111 max 0.258 off 0.020 · area ×1.021 · parts 1 · 13.2 ms
- **disc-r4.3** disc r=4.3: std 0.143 max 0.312 off -0.019 · area ×0.993 · parts 1 · 12.0 ms
- **disc-r7.6** disc r=7.6: std 0.172 max 0.378 off -0.089 · area ×0.979 · parts 1 · 14.1 ms
- **line1-1:2** 1-wide 1:2: std 0.007 max 0.034 off 0.001 · area ×0.960 · parts 1 width min 0.867 mean 0.896 (ideal 0.894) · 12.8 ms
- **line2-1:1** 2-wide 1:1: std 0.013 max 0.040 off 0.007 · area ×0.983 · parts 1 width min 1.367 mean 1.405 (ideal 1.414) · 14.9 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.042 max 0.124 off -0.024; grass|stone 330°: std 0.022 max 0.053 off 0.013 · area ×1.001 · parts 1 · 14.4 ms
- **hill-materials** stone disc on hill: std 0.143 max 0.307 off -0.079; sand 1:2 edge on hill: std 0.006 max 0.007 off -0.179 · area ×0.996 · parts 1 · 89.2 ms

total mesh time 371.4 ms
