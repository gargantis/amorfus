# pa-vol-bspl

hints geometry; fragment picks argmax material of a bspl kernel over solid block centres at p - 0.5n

- **edge-0deg** grass|stone 0deg: std 0.000 max 0.000 off -0.370 · area ×1.000 · parts 1 · 48.3 ms
- **edge-1:8** grass|stone 1:8: std 0.255 max 0.423 off -0.000 · area ×1.000 · parts 1 · 54.4 ms
- **edge-1:5** grass|stone 1:5: std 0.221 max 0.340 off -0.043 · area ×1.000 · parts 1 · 64.1 ms
- **edge-1:3** grass|stone 1:3: std 0.172 max 0.262 off -0.162 · area ×1.000 · parts 1 · 13.3 ms
- **edge-1:2** grass|stone 1:2: std 0.119 max 0.175 off 0.174 · area ×1.000 · parts 1 · 23.0 ms
- **edge-2:3** grass|stone 2:3: std 0.152 max 0.259 off 0.050 · area ×1.000 · parts 1 · 11.4 ms
- **edge-1:1** grass|stone 1:1: std 0.028 max 0.034 off 0.185 · area ×1.000 · parts 1 · 9.4 ms
- **disc-r2.4** disc r=2.4: std 0.183 max 0.348 off -0.042 · area ×0.965 · parts 1 · 6.4 ms
- **disc-r4.3** disc r=4.3: std 0.190 max 0.415 off -0.015 · area ×0.990 · parts 1 · 13.6 ms
- **disc-r7.6** disc r=7.6: std 0.221 max 0.457 off -0.013 · area ×0.997 · parts 1 · 8.8 ms
- **line1-0deg** 1-wide 0deg: std 0.000 max 0.000 off 0.000 · area ×1.000 · parts 1 width min 1.000 mean 1.000 (ideal 1.000) · 7.9 ms
- **line1-1:1** 1-wide 1:1: std 0.102 max 0.204 off -0.138 · area ×0.609 · parts 24 width min 0.000 mean 0.431 (ideal 0.707) · 10.2 ms
- **line1-1:2** 1-wide 1:2: std 0.232 max 0.397 off -0.058 · area ×0.828 · parts 13 width min 0.000 mean 0.740 (ideal 0.894) · 7.1 ms
- **line2-1:1** 2-wide 1:1: std 0.028 max 0.034 off 0.001 · area ×0.995 · parts 1 width min 1.414 mean 1.414 (ideal 1.414) · 9.6 ms
- **square-6** square 6×6: std 0.055 max 0.209 off -0.025 · area ×0.983 · parts 1 · 13.2 ms
- **single**  area ×0.270 · parts 1 · 9.6 ms
- **checker**  area ×0.772 · parts 18 · 12.7 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.158 max 0.345 off -0.013; grass|stone 330°: std 0.180 max 0.377 off -0.014 · area ×1.000 · parts 1 · 9.1 ms
- **hill-materials** stone disc on hill: std 0.233 max 0.493 off 0.085; sand 1:2 edge on hill: std 0.126 max 0.267 off -0.059 · area ×1.072 · parts 1 · 35.7 ms

total mesh time 367.8 ms
