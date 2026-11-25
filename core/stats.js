/* Wetware core: small descriptive statistics used in summaries. */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const finite = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

  function mean(xs) {
    const a = finite(xs);
    return a.length ? a.reduce((p, q) => p + q, 0) / a.length : null;
  }

  /** Sample SD (n - 1). */
  function sd(xs) {
    const a = finite(xs);
    if (a.length < 2) return a.length ? 0 : null;
    const m = mean(a);
    return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / (a.length - 1));
  }

  function median(xs) {
    const a = finite(xs).sort((p, q) => p - q);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /** Coefficient of variation (SD / mean). */
  function cv(xs) {
    const m = mean(xs);
    const s = sd(xs);
    return m ? s / m : null;
  }

  /** Round for summaries; keeps null. */
  function round(x, dp = 1) {
    if (x === null || x === undefined || !Number.isFinite(x)) return null;
    const k = Math.pow(10, dp);
    return Math.round(x * k) / k;
  }

  /** Inverse standard normal CDF (Acklam's rational approximation, |err| < 1.2e-9). */
  function zinv(p) {
    if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425;
    let q, r;
    if (p < lo) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - lo) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /** d' with the log-linear correction (Hautus 1995): never infinite. */
  function dprime(hits, misses, fas, crs) {
    const H = (hits + 0.5) / (hits + misses + 1);
    const F = (fas + 0.5) / (fas + crs + 1);
    return zinv(H) - zinv(F);
  }

  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  WW.stats = { mean, sd, median, cv, round, zinv, dprime, clamp01 };
})(globalThis);
