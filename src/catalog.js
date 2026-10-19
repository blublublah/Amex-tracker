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

export const ANNUAL_FEE = 895; // Platinum; per-card fees are in CARDS
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


// ---- Other cards (verified against americanexpress.com card pages, Oct 2026) ----
export const CARDS = {
  platinum: { id: 'platinum', name: 'Platinum Card®', fee: 895 },
  business_platinum: { id: 'business_platinum', name: 'Business Platinum Card®', fee: 895 },
  gold: { id: 'gold', name: 'Gold Card', fee: 325 },
};

const mk = (card, id, o) => ({ card, id, emoji: '', enrollment: false, guide: [], ...o });
const m = (creditLine, spend, amountMin, amountMax, senders = []) => ({ creditLine, spend, senders, amountMin, amountMax });
const AIRLINES_BP = 'Alaska, American, Delta, Hawaiian, JetBlue, Spirit, Southwest or United';

CREDITS.push(
  mk('business_platinum', 'bp_hotel', { name: 'Hotel Credit', brand: 'Fine Hotels + Resorts / The Hotel Collection', amount: 300, period: 'semiannual',
    summary: '$300 every half-year ($600/yr) on prepaid Amex Travel hotel bookings.', terms: 'Prepaid Fine Hotels + Resorts or The Hotel Collection (2-night minimum) through AmexTravel.com.',
    guide: ['Book on AmexTravel.com with "Pay Now" using the Business Platinum.', 'One qualifying stay per half-year captures the full credit.'], matchers: m('(hotel credit|fine hotels|hotel collection)', '(amex\\s*travel|american express travel|fine hotels|hotel collection)', 50, 20000, ['americanexpress.com']) }),
  mk('business_platinum', 'bp_hilton', { name: 'Hilton Credit', brand: 'Hilton for Business', amount: 50, period: 'quarterly', enrollment: true,
    summary: '$50 per quarter ($200/yr) on purchases made directly with Hilton properties.', terms: 'Enrollment required. Hilton for Business membership required; gift cards excluded; purchases made directly with Hilton portfolio properties.',
    guide: ['Enroll, and join Hilton for Business so the stay is eligible.', 'Pay for stays or on-property dining directly with Hilton, not through a third-party site.'], matchers: m('(hilton)', '(hilton|hampton|doubletree|embassy suites|conrad|waldorf)', 10, 5000, ['hilton.com']) }),
  mk('business_platinum', 'bp_airline', { name: 'Airline Fee Credit', brand: 'One selected airline', amount: 200, period: 'annual', enrollment: true,
    summary: `Up to $200 per calendar year in incidental fees with one of ${AIRLINES_BP}.`, terms: 'Select one qualifying airline. Incidental fees only, not airfare.',
    guide: ['Choose your airline in the Amex dashboard.', 'Pay bag fees, seat selection or in-flight purchases with the card.'], matchers: { ...m('(airline fee|airline incidental)', '(airline|airlines|delta|united|american air|southwest|jetblue|alaska air|hawaiian|spirit)', 5, 600), spendRequires: '(bag|seat|fee|wifi|wi-fi|in-?flight|upgrade|lounge)' } }),
  mk('business_platinum', 'bp_clear', { name: 'CLEAR+ Credit', brand: 'CLEAR+', amount: 209, period: 'annual',
    summary: 'Up to $209 per calendar year toward CLEAR+ (taxes and fees excluded).', terms: 'CLEAR+ membership charged to the Business Platinum.', guide: ['Pay your CLEAR+ membership with this card.'], matchers: m('(clear\\+?|clear secure)', '(clear\\s*(plus|secure|me)|clearme|clear\\+)', 50, 300, ['clearme.com']) }),
  mk('business_platinum', 'bp_dell', { name: 'Dell Technologies Credit', brand: 'Dell', amount: 1150, period: 'annual', enrollment: true,
    summary: 'Up to $1,150 per calendar year: $150 plus a $1,000 credit after $5,000+ in U.S. Dell purchases.', terms: 'Enrollment required. U.S. purchases directly with Dell Technologies. The additional $1,000 requires $5,000+ in purchases.',
    guide: ['Enroll, then buy business hardware directly from Dell.com or Dell sales with the card.', 'The first $150 needs no minimum; the extra $1,000 unlocks after $5,000 of purchases.'], matchers: m('(dell)', '(dell\\s*(technologies|marketing|inc|\\.com)|dell\\*)', 20, 50000, ['dell.com']) }),
  mk('business_platinum', 'bp_chatgpt', { name: 'ChatGPT Business Credit', brand: 'OpenAI', amount: 300, period: 'annual', enrollment: true,
    summary: 'Up to $300 per calendar year on U.S. ChatGPT Business purchases.', terms: 'Enrollment required; U.S. purchases of ChatGPT Business, subject to auto-renewal.', guide: ['Enroll, then pay your ChatGPT Business subscription with the card.'], matchers: m('(openai|chatgpt)', '(openai|chatgpt)', 10, 2000, ['openai.com']) }),
  mk('business_platinum', 'bp_adobe', { name: 'Adobe Credit', brand: 'Adobe', amount: 250, period: 'annual', enrollment: true,
    summary: '$250 per calendar year after $600+ in U.S. Adobe purchases.', terms: 'Enrollment required. Credit applies after $600+ in U.S. purchases directly with Adobe in the calendar year.', guide: ['Enroll, then pay Adobe subscriptions with the card until you pass $600.'], matchers: m('(adobe)', '(adobe)', 5, 5000, ['adobe.com']) }),
  mk('business_platinum', 'bp_indeed', { name: 'Indeed Credit', brand: 'Indeed', amount: 90, period: 'quarterly', enrollment: true,
    summary: 'Up to $90 per quarter ($360/yr) on Indeed purchases.', terms: 'Enrollment required; purchases with Indeed.', guide: ['Enroll, then pay for Indeed job promotion or hiring products with the card each quarter.'], matchers: m('(indeed)', '(indeed)', 5, 5000, ['indeed.com']) }),
  mk('business_platinum', 'bp_wireless', { name: 'Wireless Credit', brand: 'U.S. wireless providers', amount: 10, period: 'monthly', enrollment: true,
    summary: 'Up to $10 per month ($120/yr) on wireless phone service.', terms: 'Enrollment required; wireless service purchased directly from U.S. wireless providers.', guide: ['Put your phone bill on the card (autopay) after enrolling.'], matchers: m('(wireless)', '(verizon|at&t|att\\*|t-mobile|tmobile|us cellular|wireless)', 10, 500, ['verizon.com', 'att.com', 't-mobile.com']) }),
  mk('business_platinum', 'bp_global_entry', { name: 'Global Entry / TSA PreCheck', brand: 'Application fee', amount: 120, period: 'cycle', cycleYears: 4,
    summary: '$120 Global Entry or up to $85 TSA PreCheck, once every 4 years.', terms: 'Application fee charged to the card.', guide: ['Pay the application fee with the card.'], matchers: m('(global entry|tsa precheck)', '(global entry|tsa pre)', 70, 130) }),

  mk('gold', 'gold_dining', { name: 'Dining Credit', brand: 'Grubhub, Five Guys, Cheesecake Factory, Wonder, Buffalo Wild Wings', amount: 10, period: 'monthly', enrollment: true,
    summary: 'Up to $10 per month ($120/yr) at select dining partners.', terms: 'Enrollment required. Grubhub (including Seamless), Buffalo Wild Wings, Five Guys, The Cheesecake Factory and Wonder.',
    guide: ['Enroll, then order Grubhub/Seamless or visit a partner each month.', 'It resets monthly and does not roll over.'], matchers: m('(dining credit)', '(grubhub|seamless|buffalo wild wings|five guys|cheesecake factory|wonder)', 5, 500, ['grubhub.com', 'seamless.com']) }),
  mk('gold', 'gold_uber', { name: 'Uber Cash', brand: 'Uber / Uber Eats', amount: 10, period: 'monthly',
    summary: '$10 Uber Cash per month ($120/yr) for U.S. rides and orders.', terms: 'Add the Gold Card to your Uber account; pay with an Amex card.', guide: ['Add the card in the Uber app and use Uber Eats before month end.'], matchers: m('(uber cash)', '(uber\\s*\\*?\\s*(eats|trip)?|ubereats)', 3, 500, ['uber.com']) }),
  mk('gold', 'gold_resy', { name: 'Resy Credit', brand: 'Resy', amount: 50, period: 'semiannual', enrollment: true,
    summary: 'Up to $50 per half-year ($100/yr) at U.S. Resy restaurants.', terms: 'Enrollment required; 10,000+ qualifying U.S. Resy restaurants.', guide: ['Enroll, then dine at a Resy restaurant or buy a Resy gift card each half-year.'], matchers: m('(resy)', '(resy)', 5, 1000, ['resy.com']) }),
  mk('gold', 'gold_dunkin', { name: "Dunkin' Credit", brand: "Dunkin'", amount: 7, period: 'monthly', enrollment: true,
    summary: "Up to $7 per month ($84/yr) at U.S. Dunkin' locations.", terms: "Enrollment required; U.S. Dunkin' locations.", guide: ["Enroll, then pay at Dunkin' with the card (in-store or app)."], matchers: m("(dunkin)", "(dunkin)", 2, 100, ['dunkindonuts.com']) }),
);
for (const c of CREDITS) c.card ||= 'platinum';

// Practical strategy tips, appended to each credit's guide. Kept separate so the core terms above stay easy to audit.
const EXTRA_TIPS = {
  hotel: [
    'Compare the Amex Travel price with the hotel\'s own site; the credit usually outweighs a small difference, and Fine Hotels + Resorts adds perks (breakfast, upgrade when available, late checkout).',
    'Plan one stay per half-year, or a single $300+ night, since the credit is per half and does not roll over.',
    'Keep the confirmation email; if the credit does not post within a few days after checkout, send it to Amex chat.',
  ],
  resy: [
    'A Resy gift card for yourself or a friend is the lowest-effort way to use a quarter\'s $100 when you are not dining out.',
    'Split across occasions: a $100 dinner, or two $50 lunches, both work; the credit posts per qualifying charge.',
    'Check the restaurant is on Resy (not OpenTable) before you go; the Resy app lists them.',
  ],
  lululemon: [
    'Everyday basics (socks, tank tops, belt bags) fit near $75 if you do not need anything big; gift cards also work.',
    'Make the purchase early in the quarter so any post-purchase hiccup can be fixed before the quarter closes.',
    'Returns reverse the credit, so keep what you buy within the quarter.',
  ],
  digital: [
    'Pick a monthly service you would pay for anyway (YouTube Premium, Peacock, NYT) and stack a second to reach $25.',
    'Annual-billed plans only count the month they are charged; keep a monthly subscription for consistent monthly credits.',
    'Check "Amex Offers" and your Benefits dashboard monthly to confirm each credit posted.',
  ],
  uber_cash: [
    'Order Uber Eats for something you would buy anyway; $15 covers a modest meal with fees.',
    'Check your Uber Cash balance in the app before month end; a short ride or a grocery order uses up any leftover.',
    'In December the balance is $35, so plan a larger order or a ride.',
  ],
  uber_one: [
    'If you already pay for Uber One, just switch its payment method to the Platinum before the next billing date.',
    'The credit appears once the membership charge posts; monthly plans accumulate toward $120 for the year.',
  ],
  airline: [
    'Pick the airline you actually fly most; the selection is yours to change annually.',
    'Checked bags, seat selection and in-flight Wi-Fi are the easiest qualifying charges; buy the seat or bag for a trip you have booked.',
    'Airline gift cards are generally not accepted, and airfare is excluded.',
  ],
  clear: [
    'If you are already a CLEAR+ member, change the card on file; the credit only needs the membership charge on the Platinum.',
  ],
  walmart: [
    'Use the monthly membership; the credit covers the fee plus tax each month, so effectively it is free.',
    'Walmart+ Plus Up add-ons are not covered.',
  ],
  oura: [
    'The credit applies once per calendar year, so buy the ring or an accessory early rather than at the last minute.',
    'Memberships do not count; make sure the order is hardware on ouraring.com.',
  ],
  equinox: [
    'Equinox+ digital is the cheapest way to qualify; stack it with a CLEAR or Walmart+ credit and your fee coverage climbs quickly.',
    'Cancel auto-renewal after the credit posts if you will not use it.',
  ],
};
for (const c of CREDITS) c.guide.push(...(EXTRA_TIPS[c.id] || []));

export const CREDIT_BY_ID = Object.fromEntries(CREDITS.map((c) => [c.id, c]));
export const ACTIVE_CREDITS = CREDITS.filter((c) => c.status !== 'retired');

export const DEFAULT_LEAD_DAYS = {
  monthly: [10, 4, 1],
  quarterly: [30, 14, 7, 2],
  semiannual: [60, 30, 14, 7, 2],
  annual: [90, 60, 30, 14, 7, 2],
};
