/*
 JASMINE ETC core calculation module
 - Pure functions mirroring the logic in etc/js/jasmine-etc.js
 - No dependency on Vue or math.js (implements erf internally)
 - UMD-style export: window.JETCCore (browser) or module.exports (Node)
*/
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.JETCCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Error function approximation (Abramowitz and Stegun, 7.1.26)
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var a1 = 0.254829592,
      a2 = -0.284496736,
      a3 = 1.421413741,
      a4 = -1.453152027,
      a5 = 1.061405429,
      p = 0.3275911;
    var t = 1.0 / (1.0 + p * x);
    var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  // NOTE: Matches existing implementation: parameter s is used as (variance-like) in denominator sqrt(2*s)
  function cdf(x, s) {
    return 0.5 + 0.5 * erf(x / Math.sqrt(2 * s));
  }

  // Magnitude conversion J,JH -> Hw (kept identical to app formula)
  function hwFromJ(J, JH) {
    return J + (0.08 + (-0.15 + 0.01 * JH) * JH) * JH;
  }

  function throughput(params) {
    return (
      params.Tr_filter * params.Tr_mirror * params.qe_detector * (1 - params.M2_fraction)
    );
  }

  function pixelScale(pxd, efl) {
    return Math.atan2(pxd, efl) / Math.PI * 180.0 * 3600.0;
  }

  function totalSigma(sigpsf, sigace) {
    return Math.sqrt(sigpsf * sigpsf + sigace * sigace);
  }

  // Photon flux for magnitude Hw (kept identical constant)
  function get_flux(Hw) {
    return 9.82759297e+08 * Math.pow(10, -0.4 * Hw);
  }

  function get_net_flux(Hw, params) {
    return throughput(params) * get_flux(Hw);
  }

  function get_photon(Hw, params) {
    return get_net_flux(Hw, params) * params.exptime;
  }

  function buildGrid(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = i - (n - 1) / 2;
    return a;
  }

  function get_photon_array(Hw, params) {
    var nx = params.nx || buildGrid(15);
    var ny = params.ny || buildGrid(15);
    var N = get_photon(Hw, params);
    var sig = totalSigma(params.sigpsf, params.sigace);
    var w = sig / pixelScale(params.pxd, params.efl);
    var arr = new Array(ny.length);
    for (var j = 0; j < ny.length; j++) {
      arr[j] = new Array(nx.length);
      var y = ny[j];
      var fy = cdf(y + 0.5, w) - cdf(y - 0.5, w);
      for (var i = 0; i < nx.length; i++) {
        var x = nx[i];
        var fx = cdf(x + 0.5, w) - cdf(x - 0.5, w);
        arr[j][i] = N * fy * fx;
      }
    }
    return arr;
  }

  function sum2d(a) {
    var s = 0;
    for (var j = 0; j < a.length; j++) {
      for (var i = 0; i < a[j].length; i++) s += a[j][i];
    }
    return s;
  }

  function max2d(a) {
    var m = -Infinity;
    for (var j = 0; j < a.length; j++) {
      for (var i = 0; i < a[j].length; i++) if (a[j][i] > m) m = a[j][i];
    }
    return m;
  }

  function get_total_photon(Hw, params) {
    return sum2d(get_photon_array(Hw, params));
  }

  function get_flat_noise_from_array(arr, flatPercent) {
    var fe = flatPercent / 100.0;
    var s2 = 0.0;
    for (var j = 0; j < arr.length; j++) {
      for (var i = 0; i < arr[j].length; i++) {
        var e = arr[j][i];
        s2 += Math.pow(fe * e, 2);
      }
    }
    return Math.sqrt(s2);
  }

  function gain(params) {
    return params.margin * params.fullwell / Math.pow(2, params.adcbit);
  }

  function qw_noise(params) {
    return gain(params) / Math.sqrt(12);
  }

  function background(params) {
    return params.dark + params.stray + params.diffuse;
  }

  function pixel_area(params) {
    var sig = totalSigma(params.sigpsf, params.sigace);
    var scale = pixelScale(params.pxd, params.efl);
    var sigpix = sig / scale;
    var aper = 2 * Math.sqrt(8 * Math.LN2) * sigpix;
    return 4 * Math.PI * aper * aper;
  }

  function get_noise(Hw, params) {
    var arr = get_photon_array(Hw, params);
    var s2 = 2 * Math.pow(params.readout, 2) * pixel_area(params);
    var ne = background(params) * pixel_area(params) * params.exptime;
    var se = sum2d(arr);
    var fe = Math.pow(get_flat_noise_from_array(arr, params.flat), 2);
    var qe = Math.pow(qw_noise(params), 2);
    return Math.sqrt(s2 + ne + se + fe + qe);
  }

  function get_SNR(Hw, params) {
    return get_total_photon(Hw, params) / get_noise(Hw, params);
  }

  function get_sigexp(Hw, params) {
    var thr0 = typeof params.throughput0 === 'number' ? params.throughput0 : throughput(params);
    var exp0 = typeof params.exptime0 === 'number' ? params.exptime0 : params.exptime;
    var N0 = thr0 * get_flux(12.5) * exp0;
    var Np = get_total_photon(Hw, params) / N0;
    var sig = totalSigma(params.sigpsf, params.sigace) * 1e3; // mas
    var sr = 2 * Math.pow(params.readout, 2);
    var sc = background(params) * params.exptime;
    var S0 = (params.s0 != null ? params.s0 : 4.52e+4) * Math.pow(params.flat / 100, 2.0);
    var S1 = (params.s1 != null ? params.s1 : 5.58e-5) * Math.pow(sig, 2);
    var S2 = (params.s2 != null ? params.s2 : 6.82e-14) * (sr + sc) * Math.pow(sig, 4);
    return Math.sqrt(S0 + S1 / Np + S2 / (Np * Np));
  }

  function peak_photon(Hw, params) {
    return max2d(get_photon_array(Hw, params));
  }

  function defaultParams() {
    return {
      // Source
      J: 12.5,
      JH: 0.0,
      // Instrument
      exptime: 12.5,
      sigpsf: 286.5e-3,
      sigace: 275.0e-3,
      readout: 15.0,
      dark: 31.0,
      stray: 0.0,
      diffuse: 0.0,
      flat: 1.0,
      adcbit: 14,
      M2_fraction: 0.35,
      Tr_filter: 0.9933,
      Tr_mirror: 0.8258,
      qe_detector: 0.7481,
      // System
      pxd: 1e-5,
      efl: 4.3704,
      fullwell: 1e5,
      margin: 2.0,
      // Coefficients
      s0: 4.52e+4,
      s1: 5.58e-5,
      s2: 6.82e-14,
      // Grid
      nx: null,
      ny: null,
    };
  }

  return {
    // helpers
    erf: erf,
    cdf: cdf,
    hwFromJ: hwFromJ,
    throughput: throughput,
    pixelScale: pixelScale,
    totalSigma: totalSigma,
    // core physics
    get_flux: get_flux,
    get_net_flux: get_net_flux,
    get_photon: get_photon,
    get_photon_array: get_photon_array,
    get_total_photon: get_total_photon,
    get_noise: get_noise,
    get_SNR: get_SNR,
    get_sigexp: get_sigexp,
    peak_photon: peak_photon,
    // utilities
    gain: gain,
    qw_noise: qw_noise,
    background: background,
    pixel_area: pixel_area,
    defaultParams: defaultParams,
  };
});

