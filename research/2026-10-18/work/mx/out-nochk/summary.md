# mx-codes

Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight windows ≥ 9 cracks, else parabola ±6; |τ| ≤ 0.45), xBR saddles with margin, corners kept, one-cell chains square; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: column search + 1 code load; hints geometry; apron 10.

- **checker**  area ×0.880 · parts 3 · 77.5 ms

total mesh time 77.5 ms
