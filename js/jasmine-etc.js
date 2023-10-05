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


var etc = new Vue({
  el: '#app-panel',

  data: {
    N0: 1.0,
    J: 12.50,
    JH: 0.0,
    exptime: 12.5,
    throughput: 0.5,
    sigpsf: 360e-3,
    sigace: 275e-3,
    readout: 15.0,
    dark: 31.0,
    stray: 0.0,
    diffuse: 0.0,
    flat: 1.0,

    advanced: false,

    pxd: 1e-5,
    efl: 4.3704,
    fullwell: 100e3,

    s0: 2.20,
    s1: 6.247,
    s2: 0.14233,

    mag_array: Array(11).fill(0).map((_,i)=>10+0.5*i),
  },

  methods: {
    get_flux: function(Hw) {
      /** convert Hw magnitude to photon
       * the J-band photon flux in
       *   - https://www.astronomy.ohio-state.edu/martini.10/usefuldata.html
       * is tentatively used to calculate the Hw-band photon rate.
       * convert to the photon rate in the Hw-band assuming
       *   - the primary mirror diameter = 36 cm
       *   - the filter range = 1.1-1.6 um
       */
      return this.throughput * 9.82759297e+08 * Math.pow(10, -0.4 * Hw);
    },

    get_sigexp: function(Hw) {
      let Np = this.get_flux(Hw) / this.get_flux(12.5);
      let S0 = Math.pow(this.s0 * this.flat, 2.0);
      let sig = this.total_sigma;
      let npp = 2 * Math.pow(this.readout, 2) + this.background * this.exptime;
      let S1 = Math.pow(this.s1, 2) * Math.pow(sig, 2);
      let S2 = Math.pow(this.s2, 2) * Math.pow(sig, 3) * npp;
      return Math.sqrt(S0 + S1/Np + S2/Np/Np);
    },

    get_photon: function(Hw) {
      return this.get_flux(Hw) * this.exptime;
    },

    get_noise: function(Hw) {
      let s2 = 2 * Math.pow(this.readout, 2) * this.pixel_area;
      let ne = this.background * this.pixel_area * this.exptime;
      let se = this.get_photon(Hw);
      return Math.sqrt(s2 + ne + se)

    },

    get_snratio: function(Hw) {
      return this.get_photon(Hw) / this.get_noise(Hw);
    },
  },

  computed: {
    Hw: function () {
      return this.J + (0.08 + (-0.15 + 0.01 * this.JH) * this.JH) * this.JH
    },

    fwhm: {
      get: function() {
        return Math.sqrt(8 * Math.LN2) * this.sigpsf;
      },
      set: function(value) {
        this.sigpsf = value / Math.sqrt(8 * Math.LN2);
      }
    },

    total_sigma: function() {
      return Math.sqrt(this.sigpsf**2 + this.sigace**2);
    },

    total_photon: function() {
      return this.get_photon(this.Hw);
    },

    peak_photon: function() {
      return this.total_photon / this.pixel_area;
    },

    pixel_scale: function() {
      return Math.atan2(this.pxd, this.efl) / Math.PI * 180.0 * 3600;
    },

    pixel_area: function() {
      return 3 * 3;
    },

    background: function() {
      return this.dark + this.stray + this.diffuse;
    },

    total_noise: function() {
      return this.get_noise(this.Hw)
    },

    sn_ratio: function() {
      return this.total_photon / this.total_noise;
    },

    sig_exp: function() {
      return this.get_sigexp(this.Hw);
    },

    array: function() {
      let sigma = this.mag_array.map((_,i) => this.get_sigexp(_));
      let snr = this.mag_array.map((_,i) => this.get_snratio(_));
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
    array: function(u,o) {
      let data = document.getElementById('etc-data');
      var event = new Event('change')
      setTimeout(() => data.dispatchEvent(event), 1e-3);
    },
  },
});
