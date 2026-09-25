import math
meas = {32: dict(nonuni=2.94, meshed=2.45), 16: dict(nonuni=4.07, meshed=3.07)}
quads_per_b2 = 4.36  # measured, coarse terrain with caves
for R in (128, 192, 256):
    for S in (16, 32):
        r = R / S
        # columns whose nearest point is within R of player at a column centre
        n = 0
        k = int(math.ceil(r)) + 1
        for i in range(-k, k + 1):
            for j in range(-k, k + 1):
                dx = max(0, abs(i) - 0.5) ; dz = max(0, abs(j) - 0.5)
                if math.hypot(dx, dz) <= r: n += 1
        nonuni = n * meas[S]['nonuni']; meshed = n * meas[S]['meshed']
        raw = nonuni * S**3 * 2 / 2**20
        pal4 = nonuni * (S**3 / 2 + 64) / 2**20
        quads = quads_per_b2 * n * S * S
        gpu = quads * (1.13 * 16 + 6 * 2) / 2**20
        print(f"R={R:3d} S={S:2d} cols={n:4d} nonUniformChunks={nonuni:6.0f} meshedChunks(draws)={meshed:5.0f} ~visible(0.4)={meshed*0.4:5.0f} voxRaw={raw:5.1f}MiB voxPal4={pal4:5.1f}MiB quads={quads/1e3:5.0f}k tris={2*quads/1e6:4.2f}M gpuMesh={gpu:5.1f}MiB")
