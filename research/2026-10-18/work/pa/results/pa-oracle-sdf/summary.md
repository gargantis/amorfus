# pa-oracle-sdf

ORACLE: per-vertex signed distance to the ideal boundary (u8, +-2 blocks), linear in each triangle, thresholded

- **edge-1:8** grass|stone 1:8: std 0.009 max 0.020 off -0.000 · area ×1.002 · parts 1 · 53.7 ms
- **edge-1:5** grass|stone 1:5: std 0.009 max 0.020 off -0.001 · area ×0.996 · parts 1 · 53.0 ms
- **edge-1:3** grass|stone 1:3: std 0.008 max 0.018 off -0.000 · area ×0.986 · parts 1 · 66.8 ms
- **edge-1:2** grass|stone 1:2: std 0.008 max 0.017 off -0.004 · area ×1.017 · parts 1 · 14.8 ms
- **edge-1:1** grass|stone 1:1: std 0.000 max 0.000 off -0.004 · area ×1.023 · parts 1 · 16.5 ms
- **disc-r2.4** disc r=2.4: std 0.021 max 0.053 off -0.033 · area ×0.977 · parts 1 · 11.7 ms
- **disc-r4.3** disc r=4.3: std 0.012 max 0.042 off -0.019 · area ×0.993 · parts 1 · 20.7 ms
- **disc-r7.6** disc r=7.6: std 0.010 max 0.033 off -0.011 · area ×1.000 · parts 1 · 7.1 ms
- **line1-1:1** 1-wide 1:1: std 0.119 max 0.257 off -0.085 · area ×0.505 · parts 25 width min 0.000 mean 0.365 (ideal 0.707) · 18.4 ms
- **line1-1:2** 1-wide 1:2: std 0.143 max 0.264 off -0.181 · area ×0.462 · parts 13 width min 0.000 mean 0.414 (ideal 0.894) · 11.9 ms
- **line2-1:1** 2-wide 1:1: std 0.119 max 0.257 off -0.085 · area ×0.877 · parts 1 width min 1.086 mean 1.249 (ideal 1.414) · 7.5 ms
- **square-6** square 6×6: std 0.110 max 0.458 off -0.042 · area ×0.972 · parts 1 · 16.1 ms
- **hill-materials** stone disc on hill: std 0.012 max 0.038 off -0.015; sand 1:2 edge on hill: std 0.009 max 0.017 off -0.001 · area ×1.028 · parts 1 · 42.0 ms

total mesh time 340.2 ms
