// ═══════════════════════════════════════════════════════════════════════
// crew-math.js -- ballpark bar crew from guests, hours and what's pouring.
//
// Pure logic, no DOM. Loads as a browser script (sets window.CrewMath) and
// in Node (module.exports). Used by inquiry.html (the live calculator panel
// and the Crew Estimate column) and portal.html (starting staff counts).
//
// The marketing site (../bigdaddy-site/assets/crew-math.js) carries the same
// formulas: change both together.
//
// The ratios and divisors live in config.js as scaling.crewMath; callers
// pass them in. The numbers below are only the built-in defaults, identical
// to config.js, so the module also works with nothing passed.
// ═══════════════════════════════════════════════════════════════════════
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrewMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var DEFAULTS = {
    ratios: { 'Beer & Wine Only': 100, 'Full Bar': 75, 'Signature Cocktails': 50, 'Mocktail / Dry Bar': 50, 'BYOB': 75 },
    defaultRatio: 75,
    bartendersPerBarback: 3,
    bartendersPerStation: 2,
    bartendersPerLead: 8,
  };

  function positive(v, fallback) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  // input: { guests, hours, barType, ratios, defaultRatio, bartendersPerBarback,
  //          bartendersPerStation, bartendersPerLead } -- config.js's
  // scaling.crewMath can be spread straight in. Returns null when guests is
  // not a number >= 1.
  function estimate(input) {
    input = input || {};
    var guests = Number(input.guests);
    if (!isFinite(guests) || guests < 1) return null;
    var hours = positive(input.hours, 4);
    var ratios = input.ratios || DEFAULTS.ratios;
    var type = input.barType == null ? '' : String(input.barType);
    var ratio = Object.prototype.hasOwnProperty.call(ratios, type) ? positive(ratios[type], 0) : 0;
    if (!ratio) ratio = positive(input.defaultRatio, DEFAULTS.defaultRatio);

    var bartenders = Math.max(1, Math.ceil(guests / ratio));
    return {
      bartenders: bartenders,
      barbacks: Math.max(1, Math.ceil(bartenders / positive(input.bartendersPerBarback, DEFAULTS.bartendersPerBarback))),
      stations: Math.max(1, Math.ceil(bartenders / positive(input.bartendersPerStation, DEFAULTS.bartendersPerStation))),
      leads: Math.max(1, Math.ceil(bartenders / positive(input.bartendersPerLead, DEFAULTS.bartendersPerLead))),
      drinks: Math.round(guests * (1.5 + 0.75 * (hours - 1)) / 25) * 25,
      iceLb: Math.round(guests * 1.5 / 10) * 10,
      ratio: ratio,
    };
  }

  function fmt(n) { return Number(n).toLocaleString('en-US'); }

  // One line for the Crew Estimate column. Blank when there is no estimate.
  function summary(est) {
    if (!est) return '';
    return fmt(est.bartenders) + ' bartenders, ' + fmt(est.barbacks) + ' barbacks, ' +
      fmt(est.stations) + ' stations, ' + fmt(est.leads) + ' leads (about ' +
      fmt(est.drinks) + ' drinks, ' + fmt(est.iceLb) + ' lb ice)';
  }

  return { estimate: estimate, summary: summary, format: fmt, DEFAULTS: DEFAULTS };
});
