// 1D block-profile kernels k(t): the blur of one block's indicator along one
// axis, t measured from the block centre (blocks are 1 wide). The 3D kernel
// of one block is K(x) = k(x) k(y) k(z) (separable), so a cluster's blurred
// indicator is a sum of these "metaballs".
//
//  gauss(sigma):   k(t) = (erf((t+1/2)/(sqrt2 sigma)) - erf((t-1/2)/(sqrt2 sigma)))/2
//                  (the engine's Gaussian blur of a box, continuous limit)
//  bspline(sigma, m): box(1) convolved with a uniform B-spline of degree m
//                  (m+1 boxes of width h, variance (m+1) h^2/12 = sigma^2).
//                  k(t) = F(t+1/2) - F(t-1/2), F = the B-spline's CDF
//                  (scaled Irwin-Hall CDF). Piecewise polynomial of degree
//                  m+1, compact support |t| < 1/2 + (m+1) h / 2, and needs
//                  only + - * / to evaluate (no erf, no exp).
// Each kernel exposes k(t), dk(t) (derivative) and `support` (k = 0 beyond).

export function erf(x) {
  const ax = Math.abs(x);
  if (ax < 4) {
    // Maclaurin series: erf x = 2/sqrt(pi) * sum (-1)^n x^(2n+1) / (n! (2n+1))
    let term = ax, sum = ax, n = 0;
    const x2 = ax * ax;
    while (Math.abs(term) > 1e-17 * Math.abs(sum) || n < 3) {
      n++;
      term *= -x2 / n;
      sum += term / (2 * n + 1);
      if (n > 200) break;
    }
    const r = (2 / Math.sqrt(Math.PI)) * sum;
    return x < 0 ? -r : r;
  }
  // asymptotic erfc for |x| >= 4 (relative error < 1e-12 there)
  const x2 = ax * ax;
  let s = 1, t = 1;
  for (let k = 1; k < 8; k++) { t *= -(2 * k - 1) / (2 * x2); s += t; }
  const erfc = Math.exp(-x2) / (ax * Math.sqrt(Math.PI)) * s;
  return x < 0 ? -(1 - erfc) : 1 - erfc;
}

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

export function gauss(sigma) {
  const a = 1 / (Math.SQRT2 * sigma);
  const phi = (u) => INV_SQRT_2PI * Math.exp(-0.5 * u * u);
  return {
    name: `gauss(${sigma})`, sigma,
    support: 0.5 + 6 * sigma,
    k: (t) => 0.5 * (erf((t + 0.5) * a) - erf((t - 0.5) * a)),
    dk: (t) => (phi((t + 0.5) / sigma) - phi((t - 0.5) / sigma)) / sigma,
  };
}

// Irwin-Hall CDF and PDF for N uniforms on [0,1], at x in [0, N].
function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
function makeIH(N) {
  const C = []; for (let k = 0; k <= N; k++) C.push(binom(N, k));
  let fN = 1; for (let i = 2; i <= N; i++) fN *= i;
  const fN1 = fN / N;
  const pow = (v, e) => { let r = 1; for (let i = 0; i < e; i++) r *= v; return r; };
  return {
    cdf(x) {
      if (x <= 0) return 0; if (x >= N) return 1;
      let s = 0; const fl = Math.floor(x);
      for (let k = 0; k <= fl; k++) s += (k & 1 ? -1 : 1) * C[k] * pow(x - k, N);
      return s / fN;
    },
    pdf(x) {
      if (x <= 0 || x >= N) return 0;
      let s = 0; const fl = Math.floor(x);
      for (let k = 0; k <= fl; k++) s += (k & 1 ? -1 : 1) * C[k] * pow(x - k, N - 1);
      return s / fN1;
    },
  };
}

export function bspline(sigma, m = 3) {
  const N = m + 1;
  const h = sigma * Math.sqrt(12 / N);
  const ih = makeIH(N);
  const F = (t) => ih.cdf(t / h + N / 2);
  const f = (t) => ih.pdf(t / h + N / 2) / h;
  return {
    name: `bspline${m}(${sigma})`, sigma, m, h,
    support: 0.5 + (N * h) / 2,
    k: (t) => F(t + 0.5) - F(t - 0.5),
    dk: (t) => f(t + 0.5) - f(t - 0.5),
  };
}

/** Tabulate a kernel on a sub-cell lattice: values at t = (i + 0.5)/n - c for
 *  a block whose centre sits at offset c; used to fill grids quickly. */
export function kernelByName(name, sigma) {
  if (name === 'gauss') return gauss(sigma);
  const m = Number(name.replace('bspline', ''));
  return bspline(sigma, m);
}
