// ═══════════════════════════════════════════════════════════════════════
// APP CONFIG — Daddy's Bar and Catering Service
//
// A demo/test deployment: mobile bar-service-only catering for large
// events (weddings, corporate parties, festivals) -- no venue of their
// own, they show up and pour. This is the same booking suite as
// BOOKINGSUITE, re-skinned entirely through this file plus a handful of
// business-model-specific edits noted inline in portal.html (the venue
// pricing engine's tier shape still fits "guest-count band x hours", so
// no change was needed there -- but the quote builder's DEFAULT equipment
// catalog and the generated contract's legal sections genuinely are
// venue-specific, so those got real edits, not just config values. See
// ai-notes/ARCHITECTURE-AND-PRINCIPLES.md's "Compartmentalized pricing
// model" section and KNOWN-GAPS.md for why.
//
// google.* and webhookUrl are wired up to the real deployment. payment.ach
// and payment.wire are still placeholders -- see docs/IMPLEMENTATION-GUIDE.md.
// access.adminEmail / google.calendarId / business.notifyEmail now point at
// lucas@daddyscatering.co, the real Workspace account the Sheet lives under.
//
// ⚠️ LEGAL: the generated contract in portal.html is a *template*, not
// reviewed by a lawyer, and alcohol service carries real, state-specific
// regulatory exposure (liquor liability / dram shop laws, permit
// requirements, server-training requirements) well beyond a standard
// venue rental. Do not use this for a real booking without real legal
// review -- see the disclaimer comment above the SEC[] array in
// portal.html.
// ═══════════════════════════════════════════════════════════════════════

const APP_VERSION = '1.3.4';

const APP_CONFIG = (function () {

  // ── GOOGLE INFRASTRUCTURE ────────────────────────────────────────────
  const google = {
    clientId:   '208218110418-qf6dglipglnifele9ts87i4j8e7ma2c1.apps.googleusercontent.com',
    sheetId:    '18Vzg5GVMHraU1JfLmeaxGthqMBnO6Tg1eSQsfJBoB5c',
    calendarId: 'lucas@daddyscatering.co',
  };

  // ── ACCESS CONTROL ───────────────────────────────────────────────────
  const access = {
    adminEmail:    'lucas@daddyscatering.co',
    allowedDomain: 'daddyscatering.co',
  };

  // ── BRANDING ──────────────────────────────────────────────────────────
  const business = {
    displayName: "Daddy's", // shortened form, used almost everywhere -- see legalName for the full name
    legalName:   "Daddy's Bar and Catering Service",
    address:     '1053 Metropolitan Avenue, #1227, Brooklyn, NY 11211', // mailing/legal address -- the crew travels to you
    bookingEmail: 'bookings@daddyscatering.co',
    notifyEmail:  'lucas@daddyscatering.co',
    website:      'daddyscatering.co',
    publicFormUrl: 'https://book.bigdaddy.rocks/', // the inquiry form lives in its own repo on its own subdomain -- see the hub's "+ Inquiry form" link
    timezone:    'America/New_York',
    phone:        '(917) 555-0199',
    senderName:   'James Zinkand',
  };

  // ── PAYMENT INSTRUCTIONS ────────────────────────────────────────────────
  const payment = {
    zelleVenmoHandle: 'bigdaddy@bigdaddy.rocks',
    checkPayableTo:   "Daddy's Bar and Catering Service",
    ach:  { bank: 'REPLACE_ME_BANK', routing: '000000000', account: '000000000' },
    wire: { bank: 'REPLACE_ME_BANK', routing: '000000000', account: '000000000' },
    cardSurchargePct: 3.5,
  };

  // ── GOOGLE APPS SCRIPT WEBHOOK ────────────────────────────────────────
  const webhookUrl = 'https://script.google.com/macros/s/AKfycby9FJvNzcK6VXIQMF_fCIOofjCYvy4EXoR0pR_FcK2NHh-41N-_MnHh6m_HClelxVh24A/exec';

  // ── GOOGLE DRIVE ──────────────────────────────────────────────────────
  const drive = {
    parentFolder: "Daddy's Files",
    teamFolder:   'Team Only',
    clientFolder: 'Client-Facing',
  };

  // ── OAUTH SCOPES ──────────────────────────────────────────────────────
  const oauthScopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive',
  ].join(' ');

  // ── BROWSER STORAGE PREFIX ────────────────────────────────────────────
  const storagePrefix = 'bdc';

  // ── SHEET TAB NAMES ───────────────────────────────────────────────────
  const sheetTabs = {
    inquiries:   'Inquiries',
    theme:       'SiteTheme',
    activityLog: 'ActivityLog',
    permissions: 'UserPermissions',
    catalog:     'LineItemOptions',
  };

  // ── THEME DEFAULTS ────────────────────────────────────────────────────
  // Sanitized for legibility: true black/white/grey base (no color tint
  // on the backdrop, card, or text), with the bubblegum pink pulled back
  // to a small accent -- buttons, tags, highlights -- rather than tinting
  // the whole page. Only 5 tokens are ever stored/picked -- see
  // shared.js's applyTheme().
  const theme = {
    accent: '#ff4fa3', bg: '#0a0a0a', card: '#1c1c1c',
    text: '#f2f2f2', mutedText: '#9a9a9a',
  };

  // ── PRICING MODEL: a continuous guest-count curve, not flat tiers ────
  // The base bar-service fee is `baseRateCoefficient * guests ^
  // baseRateExponent` (see calculateVenueBase() in portal.html) rather
  // than a handful of hand-picked flat-rate bands. A flat tier can't
  // extrapolate: "20,000+ guests" has to cover both a 20,001-person event
  // and a 200,000-person one at the same price, which is exactly the
  // failure mode that prompted this. `tiers` below is now display-only --
  // guest-count band labels used on the quote/contract -- not a price
  // lookup; every dollar figure comes from the curve.
  //
  // Calibrated against two real data points (2026-09-12): a small private
  // party with a single bartender running about $1,500 all-in on the low
  // end, and a real invoice for a 60,000-guest, 2-day/24-hour festival on
  // the high end ($25,000 base "guarantee" covering staffing/overhead,
  // billed as its own separate line from the license fee and
  // infrastructure below). The exponent is 0.5 (a square-root curve) --
  // sublinear on purpose, since per-guest cost genuinely drops at scale.
  // This is a fit through two points, not a law of nature -- adjust
  // baseRateCoefficient up/down to shift the whole curve, or exponent to
  // change its steepness, and see KNOWN-GAPS-style caveat: extreme
  // multi-day/24-hour bookings will still price higher than a bespoke
  // guarantee-style quote once staffing/equipment scaling (below) is
  // added on top, since this tool itemizes everything rather than
  // bundling it into one flat number. Use the quote's "Custom flat fee"
  // override for an exact match to a real negotiated guarantee like that.
  const pricing = {
    baseRateCoefficient: 102,
    baseRateExponent: 0.5,
    tiers: [
      { id: 'u1000',    label: 'Under 1,000 guests' },
      { id: 't1to5k',   label: '1,000 – 5,000 guests' },
      { id: 't5to20k',  label: '5,000 – 20,000 guests' },
      { id: 't20kplus', label: '20,000+ guests (go big or go home)' },
    ],
    includedHours: 4,   // hours of bar service included in the base rate
    extraHourRate: 75,  // $/hr beyond includedHours -- deliberately modest; the curve carries scale, not this
    loadInRate: 60,      // $/hr for rig setup & breakdown
    dayMultipliers: { 5: 1.15, 6: 1.20 }, // Fri/Sat surge
    // License / permit assistance, only charged when the client needs
    // help getting one (see permitStatus and the 'license' PROD item in
    // portal.html) -- calibrated off the same reference invoice: $5,000
    // for a 2-day SLA temporary permit at 60,000 guests.
    licensePerGuest: 0.083,
    licenseMin: 250,
  };

  // ── COST SCALING: how staffing & equipment defaults size themselves to
  // the event ──────────────────────────────────────────────────────────
  // Plain per-guest and per-bar-station rates rather than a hardcoded
  // lookup table, so a 50-guest backyard party and a 20,000-person
  // festival both get sane starting numbers from the same formula instead
  // of jumping between a few hand-picked tiers. All of this is just the
  // *default* the quote builder fills in when a guest count is known
  // (see scaleForEvent() in portal.html) -- every line stays editable
  // afterward, same as any other quote line item. Tune the numbers below;
  // no code changes needed elsewhere.
  const scaling = {
    // Staffing: 1 of each role per N guests, floored at a minimum crew
    // and capped at a maximum. The cap matters as much as the floor here:
    // linear per-guest staffing has to break down somewhere, because a
    // real 60,000-guest festival doesn't actually run 600 bartenders
    // billed hourly -- past a point, headcount plateaus and cost is
    // negotiated as part of the guarantee (the base rate above), not
    // itemized per bartender-hour. The floor is deliberately just one
    // bartender and zero barback/lead, matching a small private party.
    guestsPerBartender: 150, maxBartenders: 20,
    guestsPerBarback: 300,   maxBarbacks: 10,
    guestsPerLead: 1000,     maxLeads: 4,
    minBartenders: 1, minBarbacks: 0, minLeads: 0,
    // Extra bartenders added per additional bar station beyond the first
    // (separate from the guest-count math -- more physical bars need more
    // hands even at the same total headcount). Still subject to the cap.
    extraBartendersPerStation: 1,

    // Equipment/supplies that scale with expected attendance -- $/guest,
    // with a floor so a tiny event doesn't price out at pennies, and a
    // cap for the same plateau-past-a-point reason staffing has one.
    icePerGuest: 0.20,     iceMin: 80,  iceMax: 800,    // Ice & coolers
    glassPerGuest: 0.30,   glassMin: 100, glassMax: 1000, // Glassware package
    mixersPerGuest: 0.35,  mixersMin: 0,  mixersMax: 1200, // Mixers & garnish
    napkinsPerGuest: 0.15, napkinsMin: 0, napkinsMax: 600, // Cups, napkins & bar supplies

    // Equipment that scales with the number of physical bar setups instead
    // of headcount -- each station needs its own rig/POS/tent/generator.
    // barRigPerGuest is additional on top of the per-station rate, for a
    // large footprint a station *count* can't express (e.g. "200 linear
    // feet of bar" on a 60,000-guest festival) -- capped at $10,000,
    // matching the "additional infrastructure" line on the reference
    // invoice almost exactly.
    barRigPerStation: 600, barRigPerGuest: 0.167, barRigMax: 10000,
    posPerStation: 100,        // Mobile POS / tap-to-pay station
    tentPerStation: 250,       // Pop-up tent / canopy
    generatorPerStation: 180,  // Generator (no power on-site)
  };

  // ── DEAL STAGES ───────────────────────────────────────────────────────
  const stages = [
    { key: 'new',        label: 'New' },
    { key: 'quoted',     label: 'Quoted' },
    { key: 'contracted', label: 'Contracted' },
    { key: 'invoiced',   label: 'Invoiced' },
    { key: 'stale',      label: 'Stale' },
    { key: 'dead',       label: 'Dead' },
  ];

  // ── INTAKE FIELDS (the sheet schema) ─────────────────────────────────
  // Re-shaped for a mobile bar-only service: dropped venue-only concepts
  // (rooftop access, guest-invitation method for someone else's venue),
  // added what a traveling bar crew actually needs to know -- where the
  // event is, how many hours (doorsOpen/doorsClose), how many people,
  // how many bar stations to staff, indoor vs. outdoor (outdoor needs a
  // tent), whether a POS/card reader is needed, and whether there's an
  // SLA permit on file (this business operates in NYC -- NY State Liquor
  // Authority, not a generic "liquor license").
  // Mirrored in Config.gs -- keep the two in sync.
  const intakeFields = [
    { id: 'firstName',      label: 'First Name' },
    { id: 'lastName',       label: 'Last Name' },
    { id: 'email',          label: 'Email' },
    { id: 'phone',          label: 'Phone' },
    { id: 'company',        label: 'Company' },
    { id: 'referral',       label: 'Referral Source' },
    { id: 'returningClient',label: 'Returning Client' },
    { id: 'eventType',      label: 'Event Type' },
    { id: 'eventDate',      label: 'Event Date' },
    { id: 'eventLocation',  label: 'Event Address' },
    { id: 'eventHours',     label: 'Hours Of Bar Service' },
    { id: 'doorsOpen',      label: 'Bar Opens',  askOnForm: false }, // exact clock times, set by staff once confirmed -- the public form only asks for a duration (eventHours)
    { id: 'doorsClose',     label: 'Bar Closes', askOnForm: false },
    { id: 'guestCount',     label: 'Expected Attendance' },
    { id: 'leadBartender',  label: 'Lead Bartender Assigned', askOnForm: false }, // staff-assigned, not asked of the public
    { id: 'barType',        label: 'Bar Style' },
    { id: 'barPayModel',    label: 'Open Bar Or Cash Bar' },
    { id: 'barStations',    label: 'Number Of Bar Locations' },
    { id: 'venueSetting',   label: 'Indoor Or Outdoor' },
    { id: 'posNeeded',      label: 'Point-Of-Sale Needs' },
    { id: 'addOnsNeeded',   label: 'Add-Ons Wanted' },
    { id: 'vendorNotes',    label: 'Other Vendors / Coordination Notes', askOnForm: false },
    { id: 'idCheckPreference', label: 'ID Checking At The Bar' },
    { id: 'publicEvent',    label: 'Public Event' },
    { id: 'permitStatus',   label: 'NY SLA Permit / Event License' },
    { id: 'ageReq',         label: 'Age Requirement',  askOnForm: false },
    { id: 'insurance',      label: 'Liquor Liability Insurance', askOnForm: false },
    { id: 'budget',         label: 'Budget Range' },
    { id: 'payMethod',      label: 'Payment Method',   askOnForm: false },
    { id: 'notes',          label: 'Additional Notes' },
  ];

  // ── HUB-MANAGED COLUMNS ──────────────────────────────────────────────
  // Not business-specific -- unchanged from the default.
  const hubColumns = [
    'status', 'quoteTotal', 'quoteData', 'contractGenerated', 'lastUpdatedBy',
    'calendarEventId', 'invoiceData', 'invoiceTotal', 'starred', 'followupDate',
    'lastActivityAt', 'lastAutoDraftAt', 'eventTitle',
    'eventRating', 'internalNotes', 'problemClient',
    'quotedBy', 'contractedBy', 'invoicedBy',
    'meetings', 'contractFileId',
  ];

  // ── PUBLIC INTAKE FORM LAYOUT ─────────────────────────────────────────
  // {business} in any label is replaced with business.displayName.
  const intakeForm = {
    heroTitle: '{business}',
    heroSubtitle: "You Scream, We Pour",
    heroPitch: "Remember chasing the ice cream truck as a kid? Same idea, but grown up: it comes to you, and everything on the menu has a kick. Tell us about your event and we'll bring the truck.",
    successTitle: "Order's In.",
    successBody: "Got your scoop. We'll have a quote back to you within a day.",
    moreToggleLabel: "Tell us more (the juicy details)",
    moreNote: "None of this is required, but it helps us size the truck.",
    submitLabel: 'Send it in',
    submitNote: "We'll follow up by email, usually within a day.",
    sections: [
      {
        key: 'main',
        controls: [
          { kind: 'name', id: 'fullName', label: 'Your name', placeholder: 'Jamie Rivera', autocomplete: 'name', required: true, writesTo: ['firstName', 'lastName'], errorMsg: 'Let us know your name.' },
          { kind: 'text', id: 'email', label: 'Email', htmlType: 'email', placeholder: 'jamie@example.com', autocomplete: 'email', required: true, validate: 'email', writesTo: 'email', errorMsg: 'A valid email helps us get back to you.' },
          { kind: 'text', id: 'eventType', label: "What's the occasion?", asSection: true, placeholder: 'Wedding, corporate mixer, block party, festival...', required: true, writesTo: 'eventType', errorMsg: "Let us know what you're planning." },
          { kind: 'text', id: 'eventLocation', label: 'Where\'s the party?', placeholder: 'Venue name or address (we come to you)', required: true, writesTo: 'eventLocation', errorMsg: 'We need to know where to send the truck.' },
          { kind: 'pills', id: 'guestCount', label: 'How big a crowd?', asSection: true, required: true, hint: "Rough estimate is fine, we'll fine-tune later.", errorMsg: 'Pick your best guess.', writesTo: 'guestCount', options: [
            { value: '750', label: 'Under 1,000' }, { value: '3000', label: '1,000 – 5,000' },
            { value: '12000', label: '5,000 – 20,000' }, { value: '25000', label: 'Go big or go home' },
          ]},
          { kind: 'date-flex', id: 'eventDate', label: 'Event date', flexLabel: 'Still deciding / date is flexible', writesTo: 'eventDate' },
          { kind: 'text', id: 'eventHours', label: 'How many hours do you need us pouring?', htmlType: 'number', optional: true, placeholder: 'e.g. 5', hint: "Rough estimate is fine, we'll nail down exact times later.", writesTo: 'eventHours' },
          { kind: 'text', id: 'phone', label: 'Phone', htmlType: 'tel', optional: true, placeholder: '(555) 123-4567', autocomplete: 'tel', writesTo: 'phone' },
          { kind: 'pills', id: 'budget', label: 'Ballpark budget', optional: true, hint: "Optional, but it helps us pour a quote that fits.", writesTo: 'budget', options: [
            { value: 'Under $5k', label: 'Under $5k' }, { value: '$5k - $15k', label: '$5k – $15k' },
            { value: '$15k - $30k', label: '$15k – $30k' }, { value: '$30k - $50k', label: '$30k – $50k' },
            { value: '$50k+', label: '$50k+' }, { value: 'Not sure yet', label: 'Not sure yet' },
          ]},
        ],
      },
      {
        key: 'more',
        controls: [
          [
            { kind: 'text', id: 'company', label: 'Company / organization', placeholder: 'If applicable', writesTo: 'company' },
            { kind: 'pills', id: 'referral', label: "How'd you hear about us?", writesTo: 'referral', options: [
              { value: 'Google', label: 'Google' }, { value: 'Instagram', label: 'Instagram' },
              { value: 'Word of mouth', label: 'Word of mouth' }, { value: 'Past guest', label: 'Past guest' },
              { value: 'Other', label: 'Other' },
            ]},
          ],
          { kind: 'pills', id: 'returningClient', label: 'Have you booked {business} before?', writesTo: 'returningClient', valueMap: { Yes: 'true', No: 'false' }, options: [
            { value: 'Yes', label: "Yes, we're repeat customers" }, { value: 'No', label: 'No, this is our first scoop' },
          ]},
          { kind: 'pills', id: 'barType', label: 'What kind of bar are we talking?', asSection: true, writesTo: 'barType', options: [
            { value: 'Full Bar', label: 'Full bar' }, { value: 'Beer & Wine Only', label: 'Beer & wine only' },
            { value: 'Signature Cocktails', label: 'Signature cocktails' }, { value: 'Mocktail / Dry Bar', label: 'Mocktail / dry bar' },
            { value: 'BYOB', label: 'BYOB (just send bartenders)' },
          ]},
          { kind: 'pills', id: 'barPayModel', label: 'Open bar or cash bar?', hint: "Open bar means you're covering it; cash bar means guests pay their own way.", writesTo: 'barPayModel', options: [
            { value: 'Open Bar', label: 'Open bar' }, { value: 'Cash Bar', label: 'Cash bar' },
          ]},
          [
            { kind: 'pills', id: 'barStations', label: 'How many bar locations?', writesTo: 'barStations', options: [
              { value: '1', label: 'Just one' }, { value: '2', label: 'Two' }, { value: '3', label: 'Three or more' },
            ]},
            { kind: 'pills', id: 'venueSetting', label: 'Indoor or outdoor?', hint: 'Outdoor setups need a tent or canopy. We can bring one.', writesTo: 'venueSetting', options: [
              { value: 'Indoor', label: 'Indoor' }, { value: 'Outdoor', label: 'Outdoor' }, { value: 'Both', label: 'Both' },
            ]},
          ],
          [
            { kind: 'pills', id: 'publicEvent', label: 'Private or public event?', writesTo: 'publicEvent', options: [
              { value: 'Private', label: 'Private' }, { value: 'Open to the public', label: 'Open to the public' },
            ]},
            { kind: 'pills', id: 'idCheckPreference', label: 'Want ID checking at the bar?', writesTo: 'idCheckPreference', options: [
              { value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }, { value: 'Not sure', label: 'Not sure' },
            ]},
          ],
          { kind: 'pills', id: 'permitStatus', label: 'Got an NY State Liquor Authority (SLA) permit for this event?', writesTo: 'permitStatus', options: [
            { value: 'Yes, have it', label: 'Yes, have it' }, { value: 'No, need help', label: 'No, need help' },
            { value: 'Not sure', label: 'Not sure what that is' },
          ]},
          { kind: 'pills', id: 'posNeeded', label: 'Need a card reader at the bar?', showIf: { field: 'barPayModel', notEquals: 'Open Bar' }, writesTo: 'posNeeded', options: [
            { value: 'Have my own', label: 'Have my own' }, { value: 'Need a rental', label: 'Need a rental' }, { value: 'Not sure', label: 'Not sure' },
          ]},
          { kind: 'text', id: 'addOnsNeeded', label: 'Any extras? (specialty menu, generator...)', optional: true, writesTo: 'addOnsNeeded' },
          { kind: 'textarea', id: 'notes', label: 'Anything else we should know?', placeholder: "Vibe you're going for, must-haves, questions, whatever's useful", writesTo: 'notes' },
        ],
      },
    ],
  };

  // ── COMPUTED: column index map ───────────────────────────────────────
  function buildColumnMap() {
    const COL = { timestamp: 0, refId: 1 };
    intakeFields.forEach((f, i) => { COL[f.id] = 2 + i; });
    const hubStart = 2 + intakeFields.length;
    hubColumns.forEach((key, i) => { COL[key] = hubStart + i; });
    return COL;
  }

  function totalColumns() {
    return 2 + intakeFields.length + hubColumns.length;
  }

  function colLetter(idx) {
    if (idx < 26) return String.fromCharCode(65 + idx);
    return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
  }

  function lastColumnLetter() {
    return colLetter(totalColumns() - 1);
  }

  function k(name) { return storagePrefix + '_' + name; }

  function withBusinessName(str) {
    return (str || '').replace(/\{business\}/g, business.displayName);
  }

  const configRoot = { google, access, business, payment, webhookUrl, drive, sheetTabs, theme, pricing, storagePrefix, oauthScopes };
  function resolvePath(path) {
    return path.split('.').reduce((o, k) => (o && o[k] != null) ? o[k] : '', configRoot);
  }
  function applyBranding(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-brand]').forEach(el => {
      let val = resolvePath(el.getAttribute('data-brand'));
      if (el.hasAttribute('data-brand-upper')) val = String(val).toUpperCase();
      el.textContent = val;
    });
    scope.querySelectorAll('[data-brand-href]').forEach(el => {
      el.setAttribute('href', 'mailto:' + resolvePath(el.getAttribute('data-brand-href')));
    });
    // Plain URL, no mailto: prefix -- for cross-site links (e.g. the hub
    // linking to the public inquiry form, which lives in its own repo on
    // its own subdomain, not a relative path within this one).
    scope.querySelectorAll('[data-brand-link]').forEach(el => {
      el.setAttribute('href', resolvePath(el.getAttribute('data-brand-link')));
    });
  }

  return {
    google, access, business, payment, webhookUrl, drive, sheetTabs, theme, pricing, scaling, storagePrefix, oauthScopes,
    stages, intakeFields, hubColumns, intakeForm,
    buildColumnMap, totalColumns, colLetter, lastColumnLetter, k, withBusinessName, applyBranding,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_CONFIG, APP_VERSION };
}
