# pa-oracle-sdf2

ORACLE: per-vertex signed distance to the ideal boundary (u8, +-2 blocks), linear in each triangle, thresholded

- **edge-1:8** grass|stone 1:8: std 0.009 max 0.020 off -0.000 · area ×1.002 · parts 1 · 99.6 ms
- **disc-r4.3** disc r=4.3: std 0.012 max 0.042 off -0.019 · area ×0.993 · parts 1 · 127.0 ms
- **line1-1:1** 1-wide 1:1: std 0.011 max 0.011 off -0.000 · area ×0.989 · parts 1 width min 0.664 mean 0.707 (ideal 0.707) · 127.3 ms
- **line1-1:2** 1-wide 1:2: std 0.008 max 0.018 off 0.000 · area ×1.000 · parts 1 width min 0.867 mean 0.895 (ideal 0.894) · 34.5 ms
- **line2-1:1** 2-wide 1:1: std 0.011 max 0.011 off -0.000 · area ×0.994 · parts 1 width min 1.414 mean 1.414 (ideal 1.414) · 27.3 ms
- **square-6** square 6×6: std 0.000 max 0.000 off 0.000 · area ×1.000 · parts 1 · 34.2 ms

total mesh time 449.8 ms
