# pa-vol-tri

hints geometry; fragment picks argmax material of a tri kernel over solid block centres at p - 0.5n

- **edge-0deg** grass|stone 0deg: std 0.000 max 0.000 off -0.370 · area ×1.000 · parts 1 · 54.3 ms
- **edge-1:8** grass|stone 1:8: std 0.266 max 0.458 off -0.000 · area ×1.000 · parts 1 · 49.4 ms
- **edge-1:5** grass|stone 1:5: std 0.237 max 0.395 off -0.043 · area ×1.000 · parts 1 · 75.2 ms
- **edge-1:3** grass|stone 1:3: std 0.197 max 0.333 off -0.164 · area ×1.000 · parts 1 · 15.2 ms
- **edge-1:2** grass|stone 1:2: std 0.153 max 0.231 off 0.174 · area ×1.000 · parts 1 · 11.3 ms
- **edge-2:3** grass|stone 2:3: std 0.175 max 0.304 off 0.051 · area ×1.000 · parts 1 · 12.5 ms
- **edge-1:1** grass|stone 1:1: std 0.043 max 0.056 off 0.185 · area ×1.000 · parts 1 · 13.7 ms
- **disc-r2.4** disc r=2.4: std 0.210 max 0.493 off -0.020 · area ×0.979 · parts 1 · 19.0 ms
- **disc-r4.3** disc r=4.3: std 0.204 max 0.423 off -0.007 · area ×0.993 · parts 1 · 14.3 ms
- **disc-r7.6** disc r=7.6: std 0.235 max 0.484 off -0.009 · area ×0.998 · parts 1 · 11.4 ms
- **line1-0deg** 1-wide 0deg: std 0.000 max 0.000 off 0.000 · area ×1.000 · parts 1 width min 1.000 mean 1.000 (ideal 1.000) · 20.5 ms
- **line1-1:1** 1-wide 1:1: std 0.131 max 0.274 off -0.068 · area ×0.807 · parts 24 width min 0.000 mean 0.569 (ideal 0.707) · 15.4 ms
- **line1-1:2** 1-wide 1:2: std 0.246 max 0.435 off -0.025 · area ×0.903 · parts 13 width min 0.000 mean 0.808 (ideal 0.894) · 9.5 ms
- **line2-1:1** 2-wide 1:1: std 0.043 max 0.056 off 0.001 · area ×0.996 · parts 1 width min 1.414 mean 1.414 (ideal 1.414) · 11.4 ms
- **square-6** square 6×6: std 0.044 max 0.187 off -0.016 · area ×0.989 · parts 1 · 11.2 ms
- **single**  area ×0.613 · parts 1 · 11.4 ms
- **checker**  area ×0.882 · parts 18 · 7.3 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.183 max 0.396 off -0.012; grass|stone 330°: std 0.204 max 0.429 off -0.017 · area ×1.000 · parts 1 · 11.5 ms
- **hill-materials** stone disc on hill: std 0.248 max 0.566 off 0.090; sand 1:2 edge on hill: std 0.160 max 0.305 off -0.063 · area ×1.074 · parts 1 · 59.6 ms

total mesh time 434.0 ms
