const assert = require('assert');
const core = require('../etc/js/core.js');

function approxEqual(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

function createBase() {
  const p = core.defaultParams();
  const Hw = core.hwFromJ(p.J, p.JH);
  const thr0 = core.throughput(p);
  const base = { ...p, throughput0: thr0, exptime0: p.exptime };
  return { p: base, Hw };
}

function testPixelScaleReasonable() {
  const p = core.defaultParams();
  const scale = core.pixelScale(p.pxd, p.efl);
  assert(scale > 0, 'pixelScale should be positive');
  assert(Math.abs(scale - 0.472) < 0.02, 'pixelScale should be close to 0.472 arcsec/pix');
}

function testSNRMonotonicWithExposure() {
  const { p, Hw } = createBase();
  const sn1 = core.get_SNR(Hw, p);
  const p2 = { ...p, exptime: p.exptime * 2 };
  const sn2 = core.get_SNR(Hw, p2);
  assert(sn2 > sn1, 'SNR should increase when exposure time increases');
}

function testSigmaExpDecreasesWithExposure() {
  const { p, Hw } = createBase();
  const s1 = core.get_sigexp(Hw, p);
  const p2 = { ...p, exptime: p.exptime * 2 };
  const s2 = core.get_sigexp(Hw, p2);
  assert(s2 < s1, 'Position error (sigexp) should decrease with longer exposure');
}

function testPeakPhotonIncreasesWithSharperPSF() {
  const { p, Hw } = createBase();
  const peak1 = core.peak_photon(Hw, p);
  const pSharp = { ...p, sigpsf: p.sigpsf * 0.8 };
  const peak2 = core.peak_photon(Hw, pSharp);
  assert(peak2 > peak1, 'Peak photon should increase when PSF sigma decreases');
}

function testTotalPhotonIncreasesWithThroughput() {
  const { p, Hw } = createBase();
  const tot1 = core.get_total_photon(Hw, p);
  const pThr = { ...p, Tr_mirror: Math.min(1.0, p.Tr_mirror * 1.1) };
  const tot2 = core.get_total_photon(Hw, pThr);
  assert(tot2 > tot1, 'Total photon should increase with higher throughput');
}

function testPhotonArraySumWithinIdeal() {
  const { p, Hw } = createBase();
  const Nideal = core.get_photon(Hw, p);
  const arr = core.get_photon_array(Hw, p);
  let sum = 0;
  for (const row of arr) for (const e of row) sum += e;
  assert(sum > 0, 'Photon array sum should be positive');
  assert(sum <= Nideal + 1e-6, 'Photon array sum should not exceed ideal photons');
}

const tests = [
  { name: 'Pixel scale is reasonable', fn: testPixelScaleReasonable },
  { name: 'SNR increases with exposure time', fn: testSNRMonotonicWithExposure },
  { name: 'Sigma_exp decreases with exposure time', fn: testSigmaExpDecreasesWithExposure },
  { name: 'Peak photon rises with sharper PSF', fn: testPeakPhotonIncreasesWithSharperPSF },
  { name: 'Total photon rises with throughput', fn: testTotalPhotonIncreasesWithThroughput },
  { name: 'Photon array sum within ideal', fn: testPhotonArraySumWithinIdeal },
];

function run() {
  for (const t of tests) t.fn();
  return true;
}

module.exports = {
  run,
  tests,
};
