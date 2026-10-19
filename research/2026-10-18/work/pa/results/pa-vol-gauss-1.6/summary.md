# pa-vol-gauss

hints geometry; fragment picks argmax material of a gauss kernel over solid block centres at p - 0.5n

- **edge-1:8** grass|stone 1:8: std 0.141 max 0.241 off 0.003 · area ×1.000 · parts 1 · 52.9 ms
- **edge-1:5** grass|stone 1:5: std 0.061 max 0.101 off -0.043 · area ×1.000 · parts 1 · 43.9 ms
- **edge-1:3** grass|stone 1:3: std 0.035 max 0.065 off -0.153 · area ×1.000 · parts 1 · 47.2 ms
- **edge-1:2** grass|stone 1:2: std 0.023 max 0.035 off 0.174 · area ×1.000 · parts 1 · 36.6 ms
- **edge-1:1** grass|stone 1:1: std 0.052 max 0.056 off 0.185 · area ×1.000 · parts 1 · 11.5 ms
- **disc-r2.4** disc r=2.4: std 0.072 max 0.146 off -0.610 · area ×0.558 · parts 1 · 15.3 ms
- **disc-r4.3** disc r=4.3: std 0.117 max 0.245 off -0.272 · area ×0.878 · parts 1 · 5.3 ms
- **disc-r7.6** disc r=7.6: std 0.137 max 0.321 off -0.149 · area ×0.963 · parts 1 · 7.5 ms
- **line1-1:1** 1-wide 1:1: std — max — off — · area ×0.000 · parts 0 width min 0.000 mean 0.000 (ideal 0.707) · 5.5 ms
- **line1-1:2** 1-wide 1:2: std — max — off — · area ×0.000 · parts 0 width min 0.000 mean 0.000 (ideal 0.894) · 5.6 ms
- **square-6** square 6×6: std 0.251 max 0.555 off -0.305 · area ×0.797 · parts 1 · 10.2 ms
- **single**  area ×0.000 · parts 0 · 12.8 ms
- **checker**  area ×0.000 · parts 0 · 9.6 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.056 max 0.120 off -0.018; grass|stone 330°: std 0.066 max 0.131 off 0.012 · area ×1.000 · parts 1 · 6.4 ms

total mesh time 270.2 ms
