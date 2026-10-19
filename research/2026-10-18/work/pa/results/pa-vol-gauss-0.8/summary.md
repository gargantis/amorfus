# pa-vol-gauss

hints geometry; fragment picks argmax material of a gauss kernel over solid block centres at p - 0.5n

- **edge-1:8** grass|stone 1:8: std 0.209 max 0.341 off -0.000 · area ×1.000 · parts 1 · 98.6 ms
- **edge-1:5** grass|stone 1:5: std 0.157 max 0.236 off -0.043 · area ×1.000 · parts 1 · 74.2 ms
- **edge-1:3** grass|stone 1:3: std 0.081 max 0.128 off -0.156 · area ×1.000 · parts 1 · 70.4 ms
- **edge-1:2** grass|stone 1:2: std 0.029 max 0.049 off 0.174 · area ×1.000 · parts 1 · 16.9 ms
- **edge-1:1** grass|stone 1:1: std 0.011 max 0.011 off 0.184 · area ×1.000 · parts 1 · 11.6 ms
- **disc-r2.4** disc r=2.4: std 0.125 max 0.235 off -0.139 · area ×0.891 · parts 1 · 17.0 ms
- **disc-r4.3** disc r=4.3: std 0.149 max 0.364 off -0.066 · area ×0.968 · parts 1 · 12.2 ms
- **disc-r7.6** disc r=7.6: std 0.180 max 0.429 off -0.041 · area ×0.990 · parts 1 · 18.5 ms
- **line1-1:1** 1-wide 1:1: std — max — off — · area ×0.000 · parts 0 width min 0.000 mean 0.000 (ideal 0.707) · 9.3 ms
- **line1-1:2** 1-wide 1:2: std — max — off — · area ×0.000 · parts 0 width min 0.000 mean 0.000 (ideal 0.894) · 8.5 ms
- **square-6** square 6×6: std 0.111 max 0.311 off -0.079 · area ×0.947 · parts 1 · 7.7 ms
- **single**  area ×0.000 · parts 0 · 8.8 ms
- **checker**  area ×0.075 · parts 2 · 6.7 ms
- **junction3** stone|sand 90°: std 0.000 max 0.000 off 0.130; sand|grass 210°: std 0.097 max 0.206 off -0.017; grass|stone 330°: std 0.118 max 0.230 off -0.003 · area ×1.001 · parts 1 · 12.9 ms

total mesh time 373.4 ms
