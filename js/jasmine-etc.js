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
    sigpsf: 328e-3,
    sigace: 275e-3,
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

    pxd: 1e-5,
    efl: 4.3704,
    fullwell: 1e5,
    margin: 2.0,

    throughput0: 1.0,
    exptime0: 1.0,
    s0: 1.0372e+2,
    s1: 4.6046e-5,
    s2: 5.3929e-14,

    nx: Array(15).fill().map((e, i) => -7 + i),
    ny: Array(15).fill().map((e, i) => -7 + i),
    mag_array: Array(15).fill().map((_,i)=>9.0+0.5*i),
  },

  methods: {
    cdf: (x,s) => 0.5 + 0.5 * math.erf(x / Math.sqrt(2*s)),

    randn: () => {
      const logu = Math.sqrt(-2.0 * Math.log(1.0 - Math.random()));
      const cosv = Math.cos(2.0 * Math.PI * Math.random());
      return logu * cosv;
    },

    linear_scale: (e, M, m) => (e - m) / (M - m),

    asinh_scale: (e, M, m) => Math.asinh(e - m) / Math.asinh(M - m),

    get_flux: function(Hw) {
      /** convert Hw magnitude to photon
       * the J-band photon flux in
       *   - https://www.astronomy.ohio-state.edu/martini.10/usefuldata.html
       * is tentatively used to calculate the Hw-band photon rate.
       * convert to the photon rate in the Hw-band assuming
       *   - the primary mirror diameter = 36 cm
       *   - the filter range = 1.1-1.6 um
       */
      return 9.82759297e+08 * Math.pow(10, -0.4 * Hw);
    },

    get_net_flux: function(Hw) {
      return this.throughput * this.get_flux(Hw);
    },

    get_sigexp: function(Hw) {
      const Np = this.get_total_photon(Hw) / this.N0;
      const sig = this.total_sigma * 1e3;
      const sr = 2 * Math.pow(this.readout, 2);
      const sc = this.background * this.exptime;

      const S0 = this.s0 * Math.pow(this.flat/100, 2.0) * sig;
      const S1 = this.s1 * Math.pow(sig, 2);
      const S2 = this.s2 * (sr + sc) * Math.pow(sig, 4);

      return Math.sqrt(S0 + S1 / Np + S2 / Np / Np);
    },

    get_photon: function(Hw) {
      return this.get_net_flux(Hw) * this.exptime;
    },

    get_total_photon: function(Hw) {
      const arr = this.get_photon_array(Hw);
      return arr.reduce((s,e) => s + e.reduce((s,e) => s + e,0), 0);
    },

    get_flat_noise: function(Hw) {
      const arr = this.get_photon_array(Hw);
      const fe = this.flat / 100;
      return Math.sqrt(arr.reduce(
        (s,e) => s + e.reduce((s,e) => s + Math.pow(fe * e, 2), 0), 0));
    },

    get_noise: function(Hw) {
      const s2 = 2 * Math.pow(this.readout, 2) * this.pixel_area;
      const ne = this.background * this.pixel_area * this.exptime;
      const se = this.get_total_photon(Hw);
      const fe = Math.pow(this.get_flat_noise(Hw), 2);
      const qe = Math.pow(this.qw_noise, 2);
      return Math.sqrt(s2 + ne + se + fe + qe);
    },

    get_SNR: function(Hw) {
      return this.get_total_photon(Hw) / this.get_noise(Hw);
    },

    get_photon_array: function(Hw) {
      let array = [...Array(15)].map(e => Array(15).fill());

      const N = this.get_photon(Hw);
      const w = this.total_sigma / this.pixel_scale;
      for (let [j, y] of this.ny.entries()) {
        for (let [i, x] of this.nx.entries()) {
          const fy = this.cdf(y + 0.5, w) - this.cdf(y - 0.5, w);
          const fx = this.cdf(x + 0.5, w) - this.cdf(x - 0.5, w);
          array[j][i] = N * fy * fx;
        }
      }
      return array;
    },

    add_noise: function(photon) {
      const rn = 2 * Math.pow(this.readout, 2);
      const bn = this.background * this.exptime;
      const randn = this.randn;
      const flat = this.flat;
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
      return this.throughput0 * this.get_flux(12.5) * this.exptime0;
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
      return this.margin * this.fullwell / Math.pow(2, this.adcbit);
    },

    throughput: function() {
      return this.Tr_filter * this.Tr_mirror
        * this.qe_detector * (1 - this.M2_fraction);
    },

    photon_array: function() {
      return this.get_photon_array(this.Hw);
    },

    adu_array: function() {
      return this.get_adu(this.add_noise(this.photon_array));
    },

    rgb_array: function() {
      return this.get_RGB_array(this.adu_array);
    },

    total_sigma: function() {
      return Math.sqrt(this.sigpsf**2 + this.sigace**2);
    },

    total_photon: function() {
      return this.get_total_photon(this.Hw);
    },

    peak_photon: function() {
      return Math.max(...this.photon_array.flat());
    },

    pixel_scale: function() {
      return Math.atan2(this.pxd, this.efl) / Math.PI * 180.0 * 3600;
    },

    pixel_area: function() {
      const sigpix = this.total_sigma / this.pixel_scale;
      const aper = 2 * Math.sqrt(8 * Math.LN2) * sigpix;
      return 4 * Math.PI * aper * aper;
    },

    background: function() {
      return this.dark + this.stray + this.diffuse;
    },

    qw_noise: function() {
      return this.gain/Math.sqrt(12);
    },

    total_noise: function() {
      return this.get_noise(this.Hw)
    },

    sn_ratio: function() {
      return this.get_SNR(this.Hw);
    },

    sig_exp: function() {
      return this.get_sigexp(this.Hw);
    },

    data_array: function() {
      const sigma = this.mag_array.map(_ => this.get_sigexp(_));
      const snr = this.mag_array.map(_ => this.get_SNR(_));
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
