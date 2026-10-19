// Amex Platinum (US consumer) statement-credit catalog.
// Verified against americanexpress.com/us/credit-cards/card/platinum/ plus travel-blog
// cross-checks in October 2026. Amex changes these often: edit THIS file when they do
// (set `status: "retired"` rather than deleting so history stays readable).
//
// period:      monthly | quarterly | semiannual | annual | cycle (multi-year)
// resetBasis:  all periods are CALENDAR based (Jan-Jun / Jul-Dec, Q1-Q4, calendar year).
// matchers:    used by the CSV importer and Gmail scanner (see matcher.js)
//   creditLine  – regex for the negative "statement credit" line Amex posts
//   spend       – regex for the merchant a purchase must hit
//   senders     – email sender domains to search in Gmail for receipts
//   amountMin/Max – plausible charge range (guards against false positives)

export const ANNUAL_FEE = 895;
export const CATALOG_VERSION = '2026-10-19';

export const CREDITS = [
  {
    id: 'hotel',
    name: 'Hotel Credit',
    brand: 'Fine Hotels + Resorts / The Hotel Collection',
    emoji: '🏨',
    amount: 300,
    period: 'semiannual',
    enrollment: false,
    summary: '$300 every half-year ($600/yr) on prepaid Amex Travel hotel bookings.',
    terms:
      'Prepaid bookings through AmexTravel.com only (Fine Hotels + Resorts, or The Hotel Collection with a 2-night minimum). Pay-later bookings do not qualify. Credit posts after check-out.',
    guide: [
      'Book on AmexTravel.com and choose "Pay Now" (prepaid) – pay-later rates do not trigger the credit.',
      'Fine Hotels + Resorts works with a 1-night stay; The Hotel Collection needs 2+ nights.',
      'The credit is applied after you check out, so book before the half-year ends and travel on or before the last day to be safe.',
      'Stays booked in one half can be checked out in the same half only – cancel/rebook timing matters near June 30 and December 31.',
    ],
    matchers: {
      creditLine: '(hotel credit|fine hotels|hotel collection)',
      spend: '(amex\\s*travel|american express travel|fine hotels|hotel collection)',
      senders: ['americanexpress.com', 'amextravel.com'],
      amountMin: 50,
      amountMax: 20000,
    },
  },
  {
    id: 'resy',
    name: 'Resy Dining Credit',
    brand: 'Resy',
    emoji: '🍽️',
    amount: 100,
    period: 'quarterly',
    enrollment: true,
    summary: '$100 per calendar quarter ($400/yr) at U.S. Resy restaurants.',
    terms:
      'Enrollment required. Pay at 10,000+ U.S. Resy restaurants (reservation not required) or buy a Resy gift card. Does not roll over.',
    guide: [
      'Enroll the card in your Amex Benefits dashboard first.',
      'Easiest: buy a Resy gift card online (resy.com) with your Platinum – it often triggers the credit instantly.',
      'Or dine at any U.S. Resy restaurant and pay with the Platinum. You do not have to book through Resy.',
      'Quarters reset on Jan 1, Apr 1, Jul 1, Oct 1 – unused credit does not carry over.',
    ],
    matchers: {
      creditLine: '(resy)',
      spend: '(resy)',
      senders: ['resy.com'],
      amountMin: 5,
      amountMax: 1000,
    },
  },
  {
    id: 'lululemon',
    name: 'lululemon Credit',
    brand: 'lululemon',
    emoji: '🧘',
    amount: 75,
    period: 'quarterly',
    enrollment: true,
    summary: '$75 per calendar quarter ($300/yr) at U.S. lululemon stores and lululemon.com.',
    terms:
      'Enrollment required. U.S. full-price stores and lululemon.com only (no outlets, no "We Made Too Much" outlet stores). Does not roll over.',
    guide: [
      'Enroll first in your Amex Benefits dashboard.',
      'Shop lululemon.com or a U.S. store and pay with the Platinum; the credit posts within a few days.',
      'Gift cards bought at lululemon.com generally count – handy if nothing catches your eye this quarter.',
      'Outlet and international purchases do not qualify.',
    ],
    matchers: {
      creditLine: '(lululemon)',
      spend: '(lululemon)',
      senders: ['lululemon.com'],
      amountMin: 5,
      amountMax: 2000,
    },
  },
  {
    id: 'digital',
    name: 'Digital Entertainment Credit',
    brand: 'Disney+, Hulu, ESPN, Peacock, Paramount+, NYT, WSJ, YouTube Premium/TV',
    emoji: '📺',
    amount: 25,
    period: 'monthly',
    enrollment: true,
    summary: '$25 per month ($300/yr) on eligible streaming and news subscriptions.',
    terms:
      'Enrollment required. Must be billed directly by the provider (not via Apple, Google Play, Amazon or other third parties). Eligible: Disney+ (and bundles), ESPN, Hulu, NYT, Paramount+, Peacock, WSJ, YouTube Premium, YouTube TV.',
    guide: [
      'Enroll first, then put one or more eligible subscriptions on the Platinum – billed directly by the provider.',
      'Subscriptions that total $25+/month (e.g. YouTube Premium + Peacock) let you max it every month.',
      'Billing via Apple, Google Play or Amazon Channels does NOT qualify – check the billing method in each service.',
      'Annual plans only trigger the credit in the month charged, so prefer monthly billing.',
    ],
    matchers: {
      creditLine: '(digital entertainment|streaming credit)',
      spend:
        '(disney\\s*plus|disney\\+|disneyplus|hulu|espn|peacock|paramount|nytimes|ny times|new york times|wsj|wall street journal|youtube\\s*(premium|tv)|google\\s*\\*?\\s*youtube)',
      senders: [
        'disneyplus.com', 'hulu.com', 'espn.com', 'peacocktv.com', 'paramountplus.com',
        'nytimes.com', 'wsj.com', 'youtube.com',
      ],
      amountMin: 4,
      amountMax: 100,
    },
  },
  {
    id: 'uber_cash',
    name: 'Uber Cash',
    brand: 'Uber / Uber Eats',
    emoji: '🚗',
    amount: 15,
    monthAmounts: { 12: 35 },
    period: 'monthly',
    enrollment: false,
    summary: '$15 Uber Cash per month, $35 in December ($200/yr) for U.S. rides and Uber Eats.',
    terms:
      'Add your Platinum to your Uber account (set as a payment method). Uber Cash is added automatically each month, must be spent in the U.S. and expires at month end. Spend it by paying with the Platinum.',
    guide: [
      'Add the Platinum to your Uber account once; Uber Cash lands automatically each month.',
      'It expires at the end of the month – order Uber Eats or take a ride before then.',
      'December carries a $20 bonus ($35 total).',
      'Make sure the Platinum is selected as the payment method so the Uber Cash is applied first.',
    ],
    matchers: {
      creditLine: '(uber cash)',
      spend: '(uber\\s*\\*?\\s*(eats|trip|one)?|ubereats)',
      senders: ['uber.com'],
      amountMin: 3,
      amountMax: 500,
    },
  },
  {
    id: 'uber_one',
    name: 'Uber One Credit',
    brand: 'Uber One membership',
    emoji: '🚕',
    amount: 120,
    period: 'annual',
    enrollment: false,
    summary: 'Up to $120 per calendar year toward an auto-renewing Uber One membership.',
    terms: 'Pay the auto-renewing Uber One membership with your Platinum.',
    guide: [
      'Sign up for Uber One (or switch its payment method) with the Platinum.',
      'The membership fee must be charged to the Platinum card to trigger the credit.',
    ],
    matchers: {
      creditLine: '(uber one)',
      spend: '(uber\\s*\\*?\\s*one)',
      senders: ['uber.com'],
      amountMin: 5,
      amountMax: 150,
    },
  },
  {
    id: 'airline',
    name: 'Airline Fee Credit',
    brand: 'One selected airline',
    emoji: '✈️',
    amount: 200,
    period: 'annual',
    enrollment: true,
    summary: 'Up to $200 per calendar year in incidental fees with ONE airline you select.',
    terms:
      'Pick one qualifying airline in your Amex Benefits dashboard. Covers incidental fees (checked bags, seat selection, in-flight purchases, lounge day passes) – not airfare. Airline list subject to change.',
    guide: [
      'Choose your airline in the Amex dashboard (you can change it each year).',
      'Pay bag fees, seat selection or in-flight purchases with the Platinum.',
      'Airline gift cards generally no longer qualify – buy real incidentals.',
      'The credit can take several weeks to post, so do not wait until December 30.',
    ],
    matchers: {
      creditLine: '(airline fee|airline incidental)',
      spend: '(airline|airlines|air lines|delta|united|american air|southwest|jetblue|alaska air)',
      spendRequires: '(bag|seat|fee|wifi|wi-fi|in-?flight|upgrade|lounge)',
      senders: [],
      amountMin: 5,
      amountMax: 600,
    },
  },
  {
    id: 'clear',
    name: 'CLEAR+ Credit',
    brand: 'CLEAR+',
    emoji: '🛂',
    amount: 219,
    period: 'annual',
    enrollment: true,
    summary: 'Up to $219 per calendar year toward a CLEAR+ membership.',
    terms: 'Enrollment required. Auto-renewing CLEAR+ membership charged to the Platinum; taxes and fees excluded.',
    guide: [
      'Enroll in the Amex dashboard, then pay your CLEAR+ membership with the Platinum.',
      'Already a member? Change the payment method before your renewal date.',
    ],
    matchers: {
      creditLine: '(clear\\+?|clear secure)',
      spend: '(clear\\s*(plus|secure|me)|clearme|clear\\+)',
      senders: ['clearme.com'],
      amountMin: 50,
      amountMax: 300,
    },
  },
  {
    id: 'walmart',
    name: 'Walmart+ Credit',
    brand: 'Walmart+ membership',
    emoji: '🛒',
    amount: 12.95,
    period: 'monthly',
    enrollment: false,
    summary: 'Up to $12.95/month plus tax (~$155/yr) toward Walmart+.',
    terms:
      'One auto-renewing monthly Walmart+ membership billed to your Platinum. Annual plans and Plus Ups are not eligible.',
    guide: [
      'Put the monthly Walmart+ membership on the Platinum (a monthly plan, not annual).',
      'The credit covers the fee plus applicable tax each month.',
    ],
    matchers: {
      creditLine: '(walmart\\s*\\+|walmart plus)',
      spend: '(walmart\\s*\\+|walmart plus|walmart\\+)',
      senders: ['walmart.com'],
      amountMin: 10,
      amountMax: 20,
    },
  },
  {
    id: 'oura',
    name: 'Oura Ring Credit',
    brand: 'Oura',
    emoji: '💍',
    amount: 200,
    period: 'annual',
    enrollment: true,
    summary: 'Up to $200 per calendar year toward an Oura Ring purchase.',
    terms: 'Enrollment required. Ring hardware purchased at ouraring.com with the Platinum (memberships do not qualify).',
    guide: [
      'Enroll in the Amex dashboard first.',
      'Buy the ring (or an upgrade/accessory) at ouraring.com using the Platinum.',
      'The credit covers the hardware only – not the monthly membership.',
    ],
    matchers: {
      creditLine: '(oura)',
      spend: '(oura)',
      senders: ['ouraring.com'],
      amountMin: 50,
      amountMax: 1000,
    },
  },
  {
    id: 'equinox',
    name: 'Equinox Credit',
    brand: 'Equinox / Equinox+',
    emoji: '🏋️',
    amount: 300,
    period: 'annual',
    enrollment: true,
    summary: 'Up to $300 per calendar year toward an Equinox club membership or Equinox+ subscription.',
    terms: 'Enrollment required. Auto-renewing club membership or Equinox+ digital subscription charged to the Platinum.',
    guide: [
      'Enroll in the Amex dashboard, then pay your Equinox membership with the Platinum.',
      'Equinox+ (digital) is the cheapest way to reach the full credit.',
    ],
    matchers: {
      creditLine: '(equinox)',
      spend: '(equinox)',
      senders: ['equinox.com'],
      amountMin: 10,
      amountMax: 1000,
    },
  },
  {
    id: 'venue',
    name: 'Venue Collection Concessions',
    brand: 'Venue Collection',
    emoji: '🏟️',
    amount: 250,
    period: 'annual',
    enrollment: true,
    verify: true,
    summary: '10% back (up to $250 per calendar year) on concessions at Venue Collection stadiums/arenas.',
    terms:
      'Listed on the Amex Platinum page as of Oct 2026 – 10% back, up to $250/yr, enroll the card. Details vary by venue; confirm in your Amex account.',
    guide: ['Enroll the card, then pay for food and drink at participating venues with the Platinum.'],
    matchers: { creditLine: '(venue collection)', spend: '$^', senders: [], amountMin: 1, amountMax: 500 },
  },
  {
    id: 'global_entry',
    name: 'Global Entry / TSA PreCheck',
    brand: 'Application fee',
    emoji: '🛃',
    amount: 120,
    period: 'cycle',
    cycleYears: 4,
    enrollment: false,
    summary: '$120 Global Entry (every 4 years) or up to $85 TSA PreCheck (every 5 years) application fee.',
    terms: 'Pay the application fee with the Platinum. Not a recurring calendar credit; the tracker only records when you last used it.',
    guide: ['Pay the Global Entry ($120, 5-yr membership) or TSA PreCheck fee with the Platinum when you apply or renew.'],
    matchers: { creditLine: '(global entry|tsa precheck|trusted traveler)', spend: '(global entry|tsa pre|ttp)', senders: [], amountMin: 70, amountMax: 130 },
  },
  {
    id: 'saks',
    name: 'Saks Fifth Avenue Credit',
    brand: 'Saks Fifth Avenue',
    emoji: '🛍️',
    amount: 50,
    period: 'semiannual',
    enrollment: true,
    status: 'retired',
    retiredOn: '2026-07-01',
    summary: 'Retired July 1, 2026 (last usable June 30, 2026).',
    terms: 'No longer offered.',
    guide: [],
    matchers: { creditLine: '(saks)', spend: '(saks)', senders: [], amountMin: 1, amountMax: 5000 },
  },
];

export const CREDIT_BY_ID = Object.fromEntries(CREDITS.map((c) => [c.id, c]));
export const ACTIVE_CREDITS = CREDITS.filter((c) => c.status !== 'retired');

export const DEFAULT_LEAD_DAYS = {
  monthly: [10, 4, 1],
  quarterly: [30, 14, 7, 2],
  semiannual: [60, 30, 14, 7, 2],
  annual: [90, 60, 30, 14, 7, 2],
};
