# mv-fit

Hints geometry + fitted material boundaries: DSS lines, corners/caps, max-margin arcs; per-vertex (s1,s2,o1,o2,op) in 3 bytes, fragment picks the material.

- **edge-1:8** grass|stone 1:8: std 0.008 max 0.014 off 0.021 · area ×1.000 · parts 1 · 164.7 ms
- **edge-1:3** grass|stone 1:3: std 0.009 max 0.015 off -0.152 · area ×1.000 · parts 1 · 167.4 ms
- **disc-r2.4** disc r=2.4: std 0.047 max 0.106 off -0.020 · area ×0.988 · parts 1 · 133.4 ms
- **line1-0deg** 1-wide 0deg: std 0.000 max 0.000 off 0.000 · area ×0.995 · parts 2+1 specks width min 1.000 mean 1.000 (ideal 1.000) · 48.9 ms
- **line1-1:1** 1-wide 1:1: std 0.011 max 0.011 off -0.000 · area ×0.989 · parts 1 width min 0.664 mean 0.707 (ideal 0.707) · 66.5 ms
- **square-6** square 6×6: std 0.000 max 0.000 off 0.000 · area ×1.000 · parts 1 · 44.5 ms
- **checker**  area ×0.998 · parts 2 · 73.6 ms
- **hill-materials** stone disc on hill: std 0.047 max 0.099 off -0.080; sand 1:2 edge on hill: std 0.006 max 0.007 off -0.179 · area ×0.995 · parts 1 · 106.6 ms

total mesh time 805.7 ms
