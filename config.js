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
// google.* and webhookUrl are wired up to the real deployment. Payment
// instructions live in config.payment.js (loaded only by portal.html); its
// ACH/wire values are still placeholders -- see docs/IMPLEMENTATION-GUIDE.md.
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

const APP_VERSION = '2.7.1';

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

  // ── GOOGLE APPS SCRIPT WEBHOOK ────────────────────────────────────────
  const webhookUrl = 'https://script.google.com/macros/s/AKfycbzaPPTrBtl3_IMPjBGPBjyvwbm2kfQuW8tXRq9vFeO21oPl3CdhptgwbmfX72kwGf2obg/exec';

  // ── GOOGLE DRIVE ──────────────────────────────────────────────────────
  const drive = {
    parentFolder: "Daddy's Files",
    teamFolder:   'Team Only',
    clientFolder: 'Client-Facing',
    // Fork-only: the spreadsheet Code.gs files "Work with us" applications
    // into (under teamFolder). applications.html finds it by this name.
    // Must match Config.gs's APPLICATIONS_FILE_NAME.
    applicationsFile: "Daddy's Team Applications",
    // Tab inside that spreadsheet where applications.html keeps review
    // decisions (status, star), one row per person. Created on first use,
    // after the Applications tab Code.gs writes to. Hub-only: Code.gs never
    // reads it.
    applicationsReviewTab: 'Review',
    // Crew info form (crew.html) responses. Created by Code.gs in Team
    // Only on the first submission; must match Config.gs's CREW_INFO_FILE_NAME.
    crewInfoFile: "Daddy's Crew Info",
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
  // STAFFING COUNTS (bartenders, barbacks, leads) now follow the public
  // crew calculator: portal.html's scaledStaffDefaults() takes them from
  // CrewMath.estimate() (crew-math.js) using scaling.crewMath below, so the
  // quote starts from the same numbers the client saw on the booking form.
  // They are uncapped: a 10,000-guest festival gets the crew the formula
  // says. The old per-guest staffing keys (guestsPerBartender through
  // extraBartendersPerStation) stay in place but are only the fallback,
  // used if crewMath is missing; minBartenders / minBarbacks / minLeads
  // still apply as floors either way.
  //
  // Equipment/supplies are still plain per-guest and per-bar-station rates
  // rather than a hardcoded lookup table, so a 50-guest backyard party and
  // a 20,000-person festival both get sane starting numbers from the same
  // formula. All of this is just the *default* the quote builder fills in
  // when a guest count is known (see scaleForEvent() in portal.html) --
  // every line stays editable afterward, same as any other quote line
  // item. Tune the numbers below; no code changes needed elsewhere.
  const scaling = {
    // Public crew calculator (crew-math.js). Ratios are guests per
    // bartender, keyed by the barType value the form writes. The marketing
    // site (../bigdaddy-site/assets/crew-math.js) uses the same numbers:
    // change both together.
    crewMath: {
      ratios: { 'Beer & Wine Only': 100, 'Full Bar': 75, 'Signature Cocktails': 50, 'Mocktail / Dry Bar': 50, 'BYOB': 75 },
      defaultRatio: 75,
      bartendersPerBarback: 3,
      bartendersPerStation: 2,
      bartendersPerLead: 8,
    },

    // FALLBACK staffing, used only if crewMath above is missing: 1 of each
    // role per N guests, floored at a minimum crew and capped at a maximum.
    // The floor is deliberately just one bartender and zero barback/lead,
    // matching a small private party.
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
    { id: 'clientType',     label: 'Client Type' },
    { id: 'eventType',      label: 'Event Type' },
    { id: 'eventDate',      label: 'Event Date' },
    { id: 'showDays',       label: 'Show Days' },
    { id: 'eventLocation',  label: 'Event Address' },
    { id: 'eventHours',     label: 'Hours Of Bar Service' },
    { id: 'doorsOpen',      label: 'Bar Opens',  askOnForm: false }, // exact clock times, set by staff once confirmed -- the public form only asks for a duration (eventHours)
    { id: 'doorsClose',     label: 'Bar Closes', askOnForm: false },
    { id: 'guestCount',     label: 'Expected Attendance' },
    { id: 'crewEstimate',   label: 'Crew Estimate (Calculator)' },
    { id: 'leadBartender',  label: 'Lead Bartender Assigned', askOnForm: false }, // staff-assigned, not asked of the public
    { id: 'barType',        label: 'Bar Style' },
    { id: 'servicesWanted', label: 'Services Wanted' },
    { id: 'sponsorInterest',label: 'Sponsor Interest' },
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
    heroPitch: "Tell us the venue, the date and the headcount. We'll come back with a bar plan, a crew and the numbers. Festival field or rooftop for 40, same crew.",
    successTitle: "Order's In.",
    successBody: "Got it. We'll come back with a bar plan and a quote within a day.",
    moreToggleLabel: "Tell us more about the bar",
    moreNote: "None of this is required, but it helps us build the bar plan.",
    submitLabel: 'Send it in',
    submitNote: "We'll follow up by email, usually within a day.",
    sections: [
      {
        key: 'main',
        // Control kinds the renderer (inquiry.html) knows: name, text, textarea,
        // pills, pills-multi, date-flex, and crew-math (a read-only panel that
        // shows the crew-math.js estimate and writes its one-line summary to
        // writesTo on submit). A text control can carry min/max/step/inputMode
        // for number inputs; validate: 'integer' checks for a whole number.
        // showIf: { field, equals | notEquals } hides a control based on a
        // pill control's value; with nothing picked yet, notEquals counts as
        // visible and equals as hidden. A hidden control submits blank.
        controls: [
          { kind: 'pills', id: 'clientType', label: "Who's asking?", asSection: true, required: true, errorMsg: 'Pick the closest one.', writesTo: 'clientType', options: [
            { value: 'Venue or festival', label: 'Venue or festival' }, { value: 'Brand or agency', label: 'Brand or agency' },
            { value: 'Private party', label: 'Private party' },
          ]},
          { kind: 'name', id: 'fullName', label: 'Your name', placeholder: 'Jamie Rivera', autocomplete: 'name', required: true, writesTo: ['firstName', 'lastName'], errorMsg: 'Let us know your name.' },
          { kind: 'text', id: 'email', label: 'Email', htmlType: 'email', placeholder: 'jamie@example.com', autocomplete: 'email', required: true, validate: 'email', writesTo: 'email', errorMsg: 'A valid email helps us get back to you.' },
          { kind: 'text', id: 'company', label: 'Company / organization', optional: true, placeholder: 'If applicable', writesTo: 'company', showIf: { field: 'clientType', notEquals: 'Private party' } },
          { kind: 'text', id: 'eventType', label: "What are we pouring for?", asSection: true, placeholder: 'Festival, concert, brand event, wedding, block party...', required: true, writesTo: 'eventType', errorMsg: "Let us know what you're planning." },
          { kind: 'text', id: 'eventLocation', label: 'Where is it?', placeholder: 'Venue name or address (we come to you)', required: true, writesTo: 'eventLocation', errorMsg: 'We need to know where to send the crew.' },
          { kind: 'text', id: 'guestCount', label: 'How many people?', htmlType: 'number', min: 1, step: 1, inputMode: 'numeric', validate: 'integer', required: true, placeholder: 'e.g. 2500', hint: 'Per day, if it runs more than one. Best guess is fine.', errorMsg: 'Give us a number, even a rough one.', writesTo: 'guestCount' },
          { kind: 'text', id: 'eventHours', label: 'Hours of bar service', htmlType: 'number', min: 1, max: 24, step: 1, inputMode: 'numeric', validate: 'integer', optional: true, placeholder: 'e.g. 5', hint: 'Per day. Rough is fine.', errorMsg: 'Use a whole number of hours, 1 to 24.', writesTo: 'eventHours' },
          { kind: 'pills', id: 'barType', label: "What's pouring?", asSection: true, writesTo: 'barType', options: [
            { value: 'Beer & Wine Only', label: 'Beer & wine' }, { value: 'Full Bar', label: 'Full bar' },
            { value: 'Signature Cocktails', label: 'Cocktails' }, { value: 'Mocktail / Dry Bar', label: 'Zero-proof' },
            { value: 'BYOB', label: 'BYOB, just send bartenders' },
          ]},
          // Live crew calculator: reads guestCount, eventHours and barType,
          // sizes the crew with CrewMath and scaling.crewMath, and writes
          // CrewMath.summary() into crewEstimate on submit.
          { kind: 'crew-math', id: 'crewEstimate', writesTo: 'crewEstimate',
            from: { guests: 'guestCount', hours: 'eventHours', barType: 'barType' },
            title: 'Your crew, ballpark',
            labels: { bartenders: 'Bartenders', barbacks: 'Barbacks', stations: 'Bar stations', leads: 'Bar leads' },
            totalsLine: 'About {drinks} drinks \u00b7 {ice} lb of ice',
            note: 'Rule of thumb: one bartender per 100 guests for beer and wine, 75 for a full bar, 50 for cocktails. We firm it up on the walkthrough.',
            emptyNote: 'Enter a headcount to see your crew.' },
          { kind: 'date-flex', id: 'eventDate', label: 'Event date', flexLabel: 'Still deciding / date is flexible', writesTo: 'eventDate' },
          { kind: 'text', id: 'showDays', label: 'How many show days?', htmlType: 'number', min: 1, step: 1, inputMode: 'numeric', validate: 'integer', optional: true, placeholder: 'e.g. 4', errorMsg: 'Use a whole number, 1 or more.', writesTo: 'showDays', showIf: { field: 'clientType', notEquals: 'Private party' } },
          { kind: 'pills-multi', id: 'servicesWanted', label: 'What do you need from us?', optional: true, hint: 'Pick any. One piece or the whole bar.', writesTo: 'servicesWanted', options: [
            { value: 'Bar program', label: 'Bar program' }, { value: 'Staffing', label: 'Staffing' },
            { value: 'Liquor license', label: 'Liquor license' }, { value: 'Permits', label: 'Permits' },
            { value: 'VIP bar', label: 'VIP bar' }, { value: 'Sponsors', label: 'Sponsors' },
            { value: 'Food', label: 'Food' }, { value: 'Rentals', label: 'Rentals' },
          ]},
          { kind: 'pills', id: 'sponsorInterest', label: 'Want liquor sponsors on this?', optional: true, hint: 'Brands pay for pouring rights. No fixed cost to you.', writesTo: 'sponsorInterest', showIf: { field: 'clientType', notEquals: 'Private party' }, options: [
            { value: 'Yes', label: 'Yes' }, { value: 'Tell me more', label: 'Tell me more' }, { value: 'No', label: 'No' },
          ]},
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
          { kind: 'pills', id: 'referral', label: "How'd you hear about us?", writesTo: 'referral', options: [
            { value: 'Google', label: 'Google' }, { value: 'Instagram', label: 'Instagram' },
            { value: 'Word of mouth', label: 'Word of mouth' }, { value: 'Past guest', label: 'Past guest' },
            { value: 'Other', label: 'Other' },
          ]},
          { kind: 'pills', id: 'returningClient', label: 'Have you booked {business} before?', writesTo: 'returningClient', valueMap: { Yes: 'true', No: 'false' }, options: [
            { value: 'Yes', label: "Yes, we're repeat customers" }, { value: 'No', label: 'No, this is our first time' },
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

  // ── TEAM APPLICATION FORM ("Work with us") ───────────────────────────
  // Fork-only. A separate public form (apply.html) for people applying to
  // join the crew. These never touch the Inquiries tab or the hub board:
  // Code.gs routes `type: 'team_application'` payloads into their own
  // spreadsheet in Drive (drive.parentFolder > drive.teamFolder), with
  // uploaded files saved to folders beside it and linked from the row, so
  // applicants' details don't sit in the file the whole hub reads.
  // Config.gs mirrors applicationFields (id + label + order, plus which
  // columns are uploaded files) -- change them in both files. Column order
  // here is the spreadsheet's column order; the form's own order is the
  // `controls` list below.
  //
  // `file: true` columns aren't typed answers: the form sends the upload as
  // `{id}File` ({name, data}) and Code.gs stores a link to the saved file.
  const applicationFields = [
    { id: 'fullName',      label: 'Full Name' },
    { id: 'phone',         label: 'Phone' },
    { id: 'email',         label: 'Email' },
    { id: 'area',          label: 'Area' },
    { id: 'role',          label: 'Wants To' },
    { id: 'bottleService', label: 'Bottle Service Experience' },
    { id: 'availability',  label: 'Rough Availability' },
    { id: 'lateNights',    label: 'Can Work Late Nights' },
    { id: 'longShifts',    label: 'Open To 12+ Hour Shifts' },
    { id: 'referredBy',    label: 'Referred By' },
    { id: 'resume',        label: 'Resume',   file: true },
    { id: 'headshot',      label: 'Headshot', file: true },
  ];

  // Same control kinds and renderer shape as intakeForm above; apply.html
  // supports text/textarea/pills/pills-multi/file (no date-flex, no "more"
  // section). A `file` control takes `accept`, `maxMB`, and `photo: true`
  // to have the browser downscale it to a ~1200px JPEG before sending.
  // Code.gs enforces its own size/type limits regardless of these.
  const applicationForm = {
    heroTitle: '{business}',
    heroSubtitle: 'Work With Us',
    heroPitch: "Want to join the crew? Tell us who you are and when you're around, and we'll reach out if there's a spot that fits.",
    successTitle: "Got it.",
    successBody: "Thanks for reaching out. If there's a fit, we'll be in touch by phone or email.",
    submitLabel: 'Send it in',
    submitNote: "We'll reach out by phone or email if there's a fit.",
    // Shown instead of the form when the script behind it isn't ready
    // (see checkWebhookIsReady in apply.html).
    closedTitle: "Applications aren't open just yet.",
    closedBody: "This form isn't switched on yet. Check back soon, or email us and we'll get you sorted.",
    sections: [
      {
        key: 'main',
        controls: [
          { kind: 'text', id: 'fullName', label: 'Full name', placeholder: 'Jamie Rivera', autocomplete: 'name', required: true, writesTo: 'fullName', errorMsg: 'Let us know your name.' },
          { kind: 'text', id: 'phone', label: 'Phone', htmlType: 'tel', placeholder: '(555) 123-4567', autocomplete: 'tel', required: true, validate: 'phone', writesTo: 'phone', errorMsg: 'A phone number we can reach you at.' },
          { kind: 'text', id: 'email', label: 'Email', htmlType: 'email', placeholder: 'jamie@example.com', autocomplete: 'email', required: true, validate: 'email', writesTo: 'email', errorMsg: 'A valid email helps us get back to you.' },
          { kind: 'text', id: 'area', label: 'What area do you live in?', placeholder: 'Neighborhood or borough, e.g. Bushwick', required: true, writesTo: 'area', errorMsg: 'Let us know roughly where you live.' },
          { kind: 'pills', id: 'role', label: 'What do you want to do?', asSection: true, required: true, errorMsg: 'Pick one.', writesTo: 'role', options: [
            { value: 'Bartend', label: 'Bartend' }, { value: 'Barback', label: 'Barback' }, { value: 'Either / both', label: 'Either or both' },
          ]},
          { kind: 'pills', id: 'bottleService', label: 'Any bottle service experience?', asSection: true, required: true, errorMsg: 'Pick one.', writesTo: 'bottleService', options: [
            { value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' },
          ]},
          { kind: 'pills-multi', id: 'availability', label: 'Rough availability', asSection: true, required: true, hint: 'Tap everything that fits. We can sort out exact days later.', errorMsg: 'Pick at least one.', writesTo: 'availability', joinWith: ', ', options: [
            { value: 'Weekdays', label: 'Weekdays' }, { value: 'Weeknights', label: 'Weeknights' },
            { value: 'Weekends', label: 'Weekends' }, { value: 'Holidays', label: 'Holidays' },
          ]},
          { kind: 'pills', id: 'lateNights', label: 'Can you work late nights?', asSection: true, required: true, hint: 'Events can run well past midnight.', errorMsg: 'Pick one.', writesTo: 'lateNights', options: [
            { value: 'Yes', label: 'Yes' }, { value: 'Sometimes', label: 'Sometimes' }, { value: 'No', label: 'Not really' },
          ]},
          { kind: 'pills', id: 'longShifts', label: 'Open to long shifts (12+ hours)?', asSection: true, required: true, errorMsg: 'Pick one.', writesTo: 'longShifts', options: [
            { value: 'Yes', label: 'Yes' }, { value: 'Sometimes', label: 'Sometimes' }, { value: 'No', label: 'Not really' },
          ]},
          { kind: 'text', id: 'referredBy', label: 'Who referred you?', optional: true, placeholder: 'Name, if anyone', writesTo: 'referredBy' },
          { kind: 'file', id: 'resume', label: 'Resume', required: true, accept: '.pdf,.doc,.docx,.rtf,.jpg,.jpeg,.png', maxMB: 5, hint: 'PDF, Word document, or a clear photo of a paper copy. Up to 5 MB.', errorMsg: 'Attach your resume.', writesTo: 'resume' },
          { kind: 'file', id: 'headshot', label: 'Headshot', optional: true, accept: '.jpg,.jpeg,.png', photo: true, maxMB: 15, hint: 'A clear photo of your face. JPG or PNG.', writesTo: 'headshot' },
        ],
      },
    ],
  };

  // ── CREW ROSTER ──────────────────────────────────────────────────────
  // Fork-only. One spreadsheet of everyone who works (or has worked) for
  // the business, in drive.parentFolder > drive.teamFolder, created by the
  // hub on first use. Written by roster.js only: accepting an applicant
  // (applications.html) and imports (roster.html). Its columns live in
  // roster.js; this is just names and the role list. Apps Script doesn't
  // read it yet, so there's no Config.gs mirror until onboarding needs one.
  const roster = {
    fileName: "Daddy's Crew Roster",
    tabs: { people: 'People', sources: 'Sources', review: 'Needs Review' },
    // Matches the staffing tool's role_type, plus manager.
    roles: [
      { id: 'bartender', label: 'Bartender' },
      { id: 'barback',   label: 'Barback' },
      { id: 'captain',   label: 'Captain' },
      { id: 'manager',   label: 'Manager' },
    ],
    statuses: ['Active', 'Inactive', 'Blocked'],
    // Fork-only (2.5.0). The Roster page's People tab shows the validated
    // roster from the staffing tool (Daddy's Crew, on Supabase), read-only,
    // through its hub-roster function. Not a secret: the function checks the
    // signed-in Google account against its own allow-list, and that list, not
    // anything in this file, decides who can read the roster. Empty
    // rosterUrl = the People tab falls back to the sheet above.
    staffing: {
      rosterUrl: 'https://xtuewpvxkohizswkzdih.supabase.co/functions/v1/hub-roster',
      // 2.6.0: accepting an applicant on the Applications page also adds them
      // here, through the staffing tool's hub-accept function (same Google
      // account check as the roster read). Empty = off; the sheet roster is
      // updated either way.
      acceptUrl: 'https://xtuewpvxkohizswkzdih.supabase.co/functions/v1/hub-accept',
      appUrl: 'https://cruzin95.github.io/bigdaddy-crew/',
      // The staffing tool's person_status, in its order.
      statuses: [
        { id: 'applied',  label: 'Applied' },
        { id: 'vetting',  label: 'Vetting' },
        { id: 'approved', label: 'Approved' },
        { id: 'inactive', label: 'Inactive' },
        { id: 'blocked',  label: 'Blocked' },
      ],
    },
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

  const configRoot = { google, access, business, webhookUrl, drive, sheetTabs, theme, pricing, storagePrefix, oauthScopes };
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
    google, access, business, webhookUrl, drive, sheetTabs, theme, pricing, scaling, storagePrefix, oauthScopes,
    stages, intakeFields, hubColumns, intakeForm, applicationFields, applicationForm, roster,
    buildColumnMap, totalColumns, colLetter, lastColumnLetter, k, withBusinessName, applyBranding,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_CONFIG, APP_VERSION };
}
