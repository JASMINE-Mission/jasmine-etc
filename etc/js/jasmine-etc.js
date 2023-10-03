Vue.component('etc-input', {
  template: `<input :step="step"
    v-bind:value="fixed(value, precision)"
    @change="$emit('input', parseFloat($event.target.value))">
  </input>`,
  props: {
    value: Number,
    precision: { default: 2 },
  },
  methods: {
    fixed: (v,n) => parseFloat(v).toFixed(n)
  },
  computed: {
    step: function() {
      return Math.pow(10, -this.precision)
    },
  }
});


var etc = new Vue({
  el: '#etc',

  data: {
    N0: 1.0,
    J: 12.86,
    JH: 2.0,
    exptime: 12.5,
    throughput: 0.5,
    sigpsf: 360e-3,
    sigace: 275e-3,
    readout: 15.0,
    dark: 31.0,
    stray: 0.0,
    diffuse: 0.0,
    flat: 1.0,

    pxd: 1e-5,
    efl: 4.3704,

    s0: 2.20,
    s1: 6.247,
    s2: 0.14233,
  },

  methods: {
    get_photon: function(Hw) {
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
      let Np = this.get_photon(Hw) / this.get_photon(12.5);
      let S0 = Math.pow(this.s0 * this.flat, 2.0);
      let sig = this.total_sigma;
      let npp = 2 * Math.pow(this.readout, 2) + this.background * this.exptime;
      let S1 = Math.pow(this.s1, 2) * Math.pow(sig, 2);
      let S2 = Math.pow(this.s2, 2) * Math.pow(sig, 3) * npp;
      return Math.sqrt(S0 + S1/Np + S2/Np/Np);
    }
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
      return this.get_photon(this.Hw) * this.exptime
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
      let s2 = 2 * Math.pow(this.readout, 2) * this.pixel_area;
      let ne = this.background * this.pixel_area * this.exptime;
      let se = this.total_photon;
      return Math.sqrt(s2 + ne + se)
    },

    sn_ratio: function() {
      return this.total_photon / this.total_noise;
    },

    sig_exp: function() {
      return this.get_sigexp(this.Hw);
    },
  },
});
