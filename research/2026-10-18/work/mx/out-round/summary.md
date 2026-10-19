# mx-codes

Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight windows ≥ 9 cracks, else parabola ±6; |τ| ≤ 0.45), xBR saddles with margin, corners kept, one-cell chains square; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: column search + 1 code load; hints geometry; apron 10.

- **line1-1:1** 1-wide 1:1: std 0.000 max 0.000 off 0.011 · area ×0.973 · parts 1 width min 0.703 mean 0.707 (ideal 0.707) · 65.9 ms
- **single**  area ×0.793 · parts 1 · 60.2 ms
- **checker**  area ×1.000 · parts 18 · 67.9 ms

total mesh time 194.0 ms
