const assert = require('assert');
const core = require('../etc/js/core.js');

function approxEqual(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

function run() {
  const p = core.defaultParams();
  const Hw = core.hwFromJ(p.J, p.JH);

  // Sanity: pixel scale is positive and around expected value ~0.47"/pix
  const scale = core.pixelScale(p.pxd, p.efl);
  assert(scale > 0, 'pixelScale should be positive');
  assert(Math.abs(scale - 0.472) < 0.02, 'pixelScale should be close to 0.472 arcsec/pix');

  // SNR increases with exptime
  const thr0 = core.throughput(p);
  const pBase = { ...p, throughput0: thr0, exptime0: p.exptime };
  const sn1 = core.get_SNR(Hw, pBase);
  const p2 = { ...pBase, exptime: p.exptime * 2 };
  const sn2 = core.get_SNR(Hw, p2);
  assert(sn2 > sn1, 'SNR should increase when exposure time increases');

  // sigexp decreases with exptime
  const s1 = core.get_sigexp(Hw, pBase);
  const s2 = core.get_sigexp(Hw, p2);
  assert(s2 < s1, 'Position error (sigexp) should decrease with longer exposure');

  // Peak photon increases when PSF gets narrower (smaller sigma)
  const peak1 = core.peak_photon(Hw, pBase);
  const pSharp = { ...pBase, sigpsf: p.sigpsf * 0.8 };
  const peak2 = core.peak_photon(Hw, pSharp);
  assert(peak2 > peak1, 'Peak photon should increase when PSF sigma decreases');

  // Total photon increases with throughput increase (e.g., better mirror transmittance)
  const tot1 = core.get_total_photon(Hw, pBase);
  const pThr = { ...pBase, Tr_mirror: Math.min(1.0, p.Tr_mirror * 1.1) };
  const tot2 = core.get_total_photon(Hw, pThr);
  assert(tot2 > tot1, 'Total photon should increase with higher throughput');

  // Photon array sum should be > 0 and <= ideal photon count (due to finite grid)
  const Nideal = core.get_photon(Hw, pBase);
  const arr = core.get_photon_array(Hw, pBase);
  let sum = 0;
  for (const row of arr) for (const e of row) sum += e;
  assert(sum > 0, 'Photon array sum should be positive');
  assert(sum <= Nideal + 1e-6, 'Photon array sum should not exceed ideal photons');

  return true;
}

module.exports = { run };
