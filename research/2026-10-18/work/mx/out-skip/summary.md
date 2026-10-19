# mx-codes

Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight runs ≥ 9 cracks blended into a parabola ±6; |τ| ≤ 0.45), xBR saddles with margin + checker groups, corners kept, lone blocks → discs; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: y-biased projection axis, column search + 1 code load; hints geometry; apron 10.

- **edge-1:8** grass|stone 1:8: std 0.042 max 0.100 off 0.026 · area ×1.000 · parts 1 · 101.0 ms
- **edge-1:5** grass|stone 1:5: std 0.041 max 0.064 off -0.043 · area ×0.999 · parts 1 · 73.8 ms
- **edge-1:3** grass|stone 1:3: std 0.013 max 0.025 off -0.152 · area ×1.000 · parts 1 · 72.8 ms
- **edge-1:2** grass|stone 1:2: std 0.006 max 0.007 off 0.174 · area ×1.000 · parts 1 · 24.2 ms
- **edge-2:3** grass|stone 2:3: std 0.012 max 0.030 off 0.055 · area ×0.999 · parts 1 · 14.7 ms
- **edge-1:1** grass|stone 1:1: std 0.000 max 0.000 off 0.195 · area ×0.999 · parts 1 · 18.3 ms
- **disc-r2.4** disc r=2.4: std 0.111 max 0.258 off 0.020 · area ×1.021 · parts 1 · 9.9 ms
- **disc-r4.3** disc r=4.3: std 0.130 max 0.270 off 0.001 · area ×1.001 · parts 1 · 12.9 ms
- **disc-r7.6** disc r=7.6: std 0.163 max 0.366 off -0.056 · area ×0.987 · parts 1 · 17.9 ms
- **line1-0deg** 1-wide 0deg: std 0.000 max 0.000 off 0.000 · area ×0.990 · parts 1 width min 1.000 mean 1.000 (ideal 1.000) · 12.6 ms
- **line1-1:1** 1-wide 1:1: std 0.000 max 0.000 off 0.011 · area ×0.973 · parts 1 width min 0.703 mean 0.707 (ideal 0.707) · 17.0 ms
- **line1-1:2** 1-wide 1:2: std 0.007 max 0.034 off 0.001 · area ×0.960 · parts 1 width min 0.867 mean 0.896 (ideal 0.894) · 23.3 ms
- **line2-1:1** 2-wide 1:1: std 0.017 max 0.036 off 0.003 · area ×0.980 · parts 1 width min 1.367 mean 1.397 (ideal 1.414) · 14.2 ms
- **square-6** square 6×6: std 0.000 max 0.000 off 0.000 · area ×1.000 · parts 1 · 12.0 ms
- **single**  area ×0.793 · parts 1 · 14.6 ms
- **checker**  area ×1.000 · parts 18 · 12.9 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.034 max 0.109 off -0.009; grass|stone 330°: std 0.031 max 0.059 off 0.007 · area ×1.001 · parts 1 · 18.0 ms
- **hill-materials** stone disc on hill: std 0.131 max 0.312 off -0.067; sand 1:2 edge on hill: std 0.006 max 0.007 off -0.179 · area ×1.001 · parts 1 · 66.6 ms

total mesh time 536.7 ms
