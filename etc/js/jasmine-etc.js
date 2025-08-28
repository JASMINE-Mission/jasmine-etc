Vue.component('etc-input', {
  template: `<input
    type="number"
    :step="step"
    :min="min" :max="max"
    :data-invalid="invalid"
    v-bind:value="fixed(value, precision)"
    @change="$emit('input', parseFloat($event.target.value))"
    required>
  </input>`,
  props: {
    value: Number,
    precision: { default: 2 },
    min: {},
    max: {},
  },

  methods: {
    fixed: (v,n) => parseFloat(v).toFixed(n),
    isNum: (v) => Number.isFinite(parseFloat(v)),
  },

  computed: {
    step: function() {
      return Math.pow(10, -this.precision);
    },

    invalid_l: function() {
      if (!this.isNum(this.value)) return true;
      if (!this.isNum(this.min)) return false;
      return (this.value < this.min);
    },

    invalid_h: function() {
      if (!this.isNum(this.value)) return true;
      if (!this.isNum(this.max)) return false;
      return (this.value > this.max);
    },

    invalid: function() {
      return this.invalid_l || this.invalid_h;
    }
  }
});


let etc = new Vue({
  el: '#app-panel',

  data: {
    J: 12.50,
    JH: 0.0,
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

    advanced: false,
    arcsinh: false,
    // Seed for simulated image noise; change to re-generate image
    seed: 1,

    pxd: 1e-5,
    efl: 4.3704,
    fullwell: 1e5,
    margin: 2.0,

    throughput0: 1.0,
    exptime0: 1.0,
    s0: 4.52e+4,
    s1: 5.58e-5,
    s2: 6.82e-14,

    nx: Array(15).fill().map((e, i) => -7 + i),
    ny: Array(15).fill().map((e, i) => -7 + i),

    // Magnitude range controls for the plot
    mag_min: 9.0,
    mag_max: 16.0,
    // Number of points to sample across [min, max]
    mag_points: 15,
  },

  methods: {
    // Mulberry32 PRNG factory for deterministic uniform [0,1)
    _mulberry32: (a) => function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // Reseed noise generation for simulated image
    reseed: function() {
      // Simple evolving seed; avoids needing crypto
      const now = Date.now() >>> 0;
      this.seed = ((this.seed << 5) - this.seed + 1 + now) >>> 0;
    },

    linear_scale: (e, M, m) => (e - m) / (M - m),

    asinh_scale: (e, M, m) => Math.asinh(e - m) / Math.asinh(M - m),

    // UI-side noise and rendering helpers remain here

    add_noise: function(photon) {
      const rn = 2 * Math.pow(this.readout, 2);
      const bn = this.background * this.exptime;
      const flat = this.flat;
      // Create a local PRNG from the current seed
      const seed = (this.seed >>> 0) || 1;
      const u = this._mulberry32(seed);
      // Box-Muller transform using local PRNG
      const randn = () => {
        const u1 = 1 - u();
        const u2 = u();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      };
      return [...photon].map(e => e.map(function(e) {
        const fp = 1.0 + (flat / 100) * randn();
        return fp * e + Math.sqrt(rn + bn) * randn();
      }));
    },

    get_adu: function(electron) {
      const emax = this.fullwell;
      const gain = this.gain;
      return [...electron].map(e => e.map(function(e) {
        return Math.floor(Math.min(e, emax) / gain + 0.5);
      }));
    },

    get_RGB_array: function(adu) {
      const M = Math.max(...adu.flat());
      const m = Math.min(...adu.flat());
      const scale = this.arcsinh ? this.asinh_scale: this.linear_scale;
      return [...adu].map(e => e.map(function(e) {
        const v = Math.floor(255 * scale(e, M, m));
        return `rgb(${v},${v},${v})`;
      }));
    },

    drawPSF: function(rgb) {
      const canvas = document.getElementById('psf-canvas');
      const width = canvas.width;
      const blk = width / 15;

      let ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, width);

      for (let j in this.ny) {
        for (let i in this.nx) {
          ctx.fillStyle = rgb[j][i];
          ctx.fillRect(i * blk, j * blk, blk, blk);
        }
      }
    },
  },

  computed: {
    Hw: function() {
      return this.J + (0.08 + (-0.15 + 0.01 * this.JH) * this.JH) * this.JH
    },

    N0: function() {
      return (this.throughput0 || ETCCore.throughput(this)) * ETCCore.get_flux(12.5) * (this.exptime0 || this.exptime);
    },

    fwhm: {
      get: function() {
        return Math.sqrt(8 * Math.LN2) * this.sigpsf;
      },
      set: function(value) {
        this.sigpsf = value / Math.sqrt(8 * Math.LN2);
      }
    },

    gain: function() {
      return ETCCore.gain(this);
    },

    throughput: function() {
      return ETCCore.throughput(this);
    },

    photon_array: function() {
      return ETCCore.get_photon_array(this.Hw, this);
    },

    adu_array: function() {
      // Depend on seed so reseeding triggers recomputation
      const _seed = this.seed;
      return this.get_adu(this.add_noise(this.photon_array));
    },

    rgb_array: function() {
      return this.get_RGB_array(this.adu_array);
    },

    mag_array: function() {
      const lo = Math.min(this.mag_min, this.mag_max);
      const hi = Math.max(this.mag_min, this.mag_max);
      // Use P points across [lo, hi] (P in [3, 101])
      const P = Math.max(3, Math.min(101, Math.round(this.mag_points || 3)));
      const N = Math.max(1, P - 1);
      const count = P;
      const eff = (N > 0) ? (hi - lo) / N : 0;
      const arr = Array(count).fill().map((_, i) => lo + i * eff);
      if (arr.length > 0) arr[0] = lo;
      if (arr.length > 1) arr[arr.length - 1] = hi;
      return arr;
    },

    total_sigma: function() {
      return ETCCore.totalSigma(this.sigpsf, this.sigace);
    },

    total_photon: function() {
      return ETCCore.get_total_photon(this.Hw, this);
    },

    peak_photon: function() {
      return ETCCore.peak_photon(this.Hw, this);
    },

    pixel_scale: function() {
      return ETCCore.pixelScale(this.pxd, this.efl);
    },

    pixel_area: function() {
      return ETCCore.pixel_area(this);
    },

    background: function() {
      return ETCCore.background(this);
    },

    qw_noise: function() {
      return ETCCore.qw_noise(this);
    },

    total_noise: function() {
      return ETCCore.get_noise(this.Hw, this);
    },

    sn_ratio: function() {
      return ETCCore.get_SNR(this.Hw, this);
    },

    sig_exp: function() {
      return ETCCore.get_sigexp(this.Hw, this);
    },

    data_array: function() {
      const sigma = this.mag_array.map(_ => ETCCore.get_sigexp(_, this));
      const snr = this.mag_array.map(_ => ETCCore.get_SNR(_, this));
      return {
         data: [{
            x: this.mag_array,
            y: snr,
            type: 'scatter',
            name: 'S/N',
            yaxis: 'y2',
            marker: { size: 8, symbol: 'circle' },
          }, {
            x: this.mag_array,
            y: sigma,
            type: 'scatter',
            name: 'σexp',
            yaxis: 'y1',
            marker: { size: 8, symbol: 'square' },
          },
        ],
        layout: {
          height: 800,
          xaxis: {
            title: 'Hw-band magnitude (mag)',
            font: { size: 18 },
            zeroline: false,
          },
          yaxis: {
            title: 'Positional Accuracy (mas)',
            font: { size: 18 },
            zeroline: false,
            rangemode: 'tozero',
            domain: [0.0, 0.48],
          },
          yaxis2: {
            title: 'Signal to noise ratio',
            type: 'log',
            font: { size: 18 },
            zeroline: false,
            domain: [0.52, 1.00],
          },
          margin: {
            l: 60, t: 0, r: 60, b: 60,
          },
          legend: {
            font: { size: 12 },
            x: 1, y: 1,
            xanchor: 'right',
          },
        },
        config: {
          scrollZoom: false,
          modeBarButtonsToRemove: [
            'zoom2d', 'pan2d', 'select2d', 'lasso2d', 'autoscale',
            'zoomIn2d', 'zoomOut2d',
          ],
        }
      }
    },
  },

  watch: {
    data_array: function(u, o) {
      const data = document.getElementById('etc-data');
      let event = new Event('change')
      setTimeout(() => data.dispatchEvent(event), 1e-3);
    },

    rgb_array: function(u, o) {
      this.drawPSF(u);
    },
  },

  mounted: function() {
    this.drawPSF(this.rgb_array);
    this.throughput0 = this.throughput;
    this.exptime0 = this.exptime;
  },
});
