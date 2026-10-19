# mx-codes

Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight windows ≥ 9 cracks, else parabola ±6; |τ| ≤ 0.45), xBR saddles with margin, corners kept, one-cell chains square; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: column search + 1 code load; hints geometry; apron 10.

- **edge-1:8** grass|stone 1:8: std 0.042 max 0.100 off 0.026 · area ×1.000 · parts 1 · 69.0 ms
- **edge-1:5** grass|stone 1:5: std 0.041 max 0.064 off -0.043 · area ×0.999 · parts 1 · 70.2 ms
- **edge-1:3** grass|stone 1:3: std 0.013 max 0.025 off -0.152 · area ×1.000 · parts 1 · 74.2 ms
- **edge-2:3** grass|stone 2:3: std 0.012 max 0.030 off 0.055 · area ×0.999 · parts 1 · 19.9 ms
- **disc-r2.4** disc r=2.4: std 0.111 max 0.258 off 0.020 · area ×1.021 · parts 1 · 18.6 ms
- **disc-r4.3** disc r=4.3: std 0.143 max 0.312 off -0.019 · area ×0.993 · parts 1 · 17.6 ms
- **disc-r7.6** disc r=7.6: std 0.171 max 0.347 off -0.076 · area ×0.982 · parts 1 · 13.8 ms
- **line1-1:2** 1-wide 1:2: std 0.007 max 0.034 off 0.001 · area ×0.960 · parts 1 width min 0.867 mean 0.896 (ideal 0.894) · 11.4 ms
- **line2-1:1** 2-wide 1:1: std 0.017 max 0.036 off 0.003 · area ×0.978 · parts 1 width min 1.367 mean 1.397 (ideal 1.414) · 24.0 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.033 max 0.111 off -0.011; grass|stone 330°: std 0.029 max 0.061 off 0.009 · area ×1.001 · parts 1 · 17.9 ms
- **hill-materials** stone disc on hill: std 0.136 max 0.318 off -0.068; sand 1:2 edge on hill: std 0.006 max 0.007 off -0.179 · area ×1.001 · parts 1 · 47.0 ms

total mesh time 383.6 ms
