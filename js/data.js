// Domain knowledge per event type. Every figure is a planning heuristic in INR, not a vendor quote.

export const DIETS = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
  halal: 'Halal',
  glutenfree: 'Gluten-free',
};

export const ACCESS_NEEDS = {
  wheelchair: { label: 'Wheelchair access', item: 'Confirm step-free entry, ramps and accessible restrooms with the venue.' },
  elderly: { label: 'Elderly guests', item: 'Plan seating with back support, shade or fans, and a quiet rest area.' },
  kids: { label: 'Children', item: "Set up a supervised kids' corner with child-safe food and activities." },
  hearing: { label: 'Hearing or vision support', item: 'Test sound clarity, add visual cues or captions, and keep walkways well lit.' },
};

/** Chance of rain on a given month (index 0 = January). Defaults for an Indian climate; users can override. */
export const RAIN_BY_MONTH = [0.04, 0.04, 0.05, 0.06, 0.1, 0.3, 0.45, 0.45, 0.35, 0.15, 0.08, 0.04];

/** Vendors that can run late on the day, in the order delays accumulate. */
export const DAY_OF_CHAIN = {
  wedding: [
    { key: 'decor', delayProb: 0.12 },
    { key: 'catering', delayProb: 0.1 },
    { key: 'photo', delayProb: 0.06 },
    { key: 'entertainment', delayProb: 0.1 },
  ],
  birthday: [
    { key: 'decor', delayProb: 0.12 },
    { key: 'catering', delayProb: 0.1 },
    { key: 'entertainment', delayProb: 0.1 },
  ],
  community: [
    { key: 'av', delayProb: 0.14 },
    { key: 'permits', delayProb: 0.05 },
    { key: 'catering', delayProb: 0.1 },
  ],
};

export const TEMPLATES = {
  wedding: {
    label: 'Wedding',
    minPerHead: 1500,
    tiers: [2500, 6000],
    maxLeadWeeks: 52,
    attendance: { min: 0.88, mode: 1, max: 1.12 },
    lines: [
      { key: 'venue', label: 'Venue & rentals', share: 0.25, risk: 0.08, guestSensitive: false },
      { key: 'catering', label: 'Catering', share: 0.3, risk: 0.12, guestSensitive: true },
      { key: 'decor', label: 'Decor & flowers', share: 0.1, risk: 0.15, guestSensitive: false },
      { key: 'photo', label: 'Photo & video', share: 0.1, risk: 0.05, guestSensitive: false },
      { key: 'attire', label: 'Attire & styling', share: 0.08, risk: 0.1, guestSensitive: false },
      { key: 'entertainment', label: 'Music & entertainment', share: 0.07, risk: 0.08, guestSensitive: false },
      { key: 'misc', label: 'Invitations & miscellaneous', share: 0.03, risk: 0.15, guestSensitive: true },
      { key: 'reserve', label: 'Contingency reserve', share: 0.07, risk: 0, guestSensitive: false, reserve: true },
    ],
    tasks: [
      { id: 'budget', name: 'Finalize budget and draft guest list', lead: 52, dur: 14, deps: [] },
      { id: 'venue', name: 'Shortlist, visit and book the venue', lead: 50, dur: 28, deps: ['budget'] },
      { id: 'core-vendors', name: 'Book caterer and photographer', lead: 44, dur: 21, deps: ['venue'] },
      { id: 'attire', name: 'Choose and order attire', lead: 36, dur: 45, deps: ['budget'] },
      { id: 'decor', name: 'Lock decor theme and vendor', lead: 30, dur: 21, deps: ['venue'] },
      { id: 'entertainment', name: 'Book music and entertainment', lead: 26, dur: 14, deps: ['venue'] },
      { id: 'invites', name: 'Design and send invitations', lead: 16, dur: 14, deps: ['venue'] },
      { id: 'rsvp', name: 'Collect RSVPs and dietary needs', lead: 12, dur: 28, deps: ['invites'] },
      { id: 'menu', name: 'Menu tasting and final menu', lead: 8, dur: 10, deps: ['core-vendors'] },
      { id: 'logistics', name: 'Seating, transport and guest stay plan', lead: 5, dur: 14, deps: ['rsvp'] },
      { id: 'final', name: 'Final confirmations and run-of-show', lead: 2, dur: 5, deps: ['menu', 'logistics', 'decor', 'entertainment'] },
    ],
    vendors: {
      venue: ['Get the full written quote including taxes and overtime rates', 'Ask about power backup, parking and noise curfew', 'Confirm the rain or heat backup space', 'Pay the deposit against a signed contract'],
      catering: ['Hold a tasting before signing', 'Agree a per-plate price with a guest-count tolerance', 'Confirm staff count, crockery and live-station needs', 'Ask for a food-safety licence (FSSAI) copy'],
      decor: ['Share the theme board and get a 3D mock-up or photos of past work', 'Fix setup and teardown timings', 'Agree what happens to flowers if prices spike'],
      photo: ['Review two full past albums, not only highlights reels', 'Confirm the number of photographers and edit turnaround', 'Get a shot list for key family moments'],
      attire: ['Schedule fittings with a buffer for alterations', 'Order accessories and footwear early'],
      entertainment: ['Confirm the sound and equipment rider', 'Share a do-play and do-not-play list', 'Agree set times and breaks'],
      misc: ['Print a small extra batch of invitations', 'Prepare return gifts and welcome kits'],
    },
    ideas: [
      { title: 'Sunset vows and lantern exit', detail: 'Time the ceremony for golden hour and close the night with a lantern or sparkler-free light walk.', outdoor: true, tier: 'any', keywords: ['photo', 'romantic'] },
      { title: 'Regional live food stations', detail: 'Replace one buffet line with live counters that showcase both families’ home cuisines.', tier: 'high', keywords: ['food', 'cuisine'] },
      { title: 'Voice guest-book', detail: 'A phone-handset or QR audio guest-book captures blessings in guests’ own voices.', tier: 'low', keywords: ['memory', 'memories'] },
      { title: 'Plantable return gifts', detail: 'Seed paper or small potted plants replace plastic favours at a low cost.', tier: 'low', keywords: ['eco', 'green', 'sustainable'] },
      { title: 'Silent-disco after-party', detail: 'Headphone sets let the dance floor run late while elders rest in quiet.', tier: 'mid', minGuests: 80, keywords: ['music', 'dance', 'party'] },
      { title: 'Instant-print photo booth', detail: 'Prints double as keepsakes and cut the pressure on the photographer.', tier: 'low', keywords: ['photo', 'fun'] },
      { title: 'Micro-wedding weekend', detail: 'Fewer guests, more days: a mehendi brunch, the ceremony, and a farewell lunch.', tier: 'low', maxGuests: 80, keywords: ['intimate', 'small'] },
      { title: 'Live portrait artist', detail: 'An artist sketches guests or the couple during the reception.', tier: 'high', keywords: ['art', 'creative'] },
      { title: "Kids' activity table", detail: 'Colouring, clay and a helper keep children happy through long ceremonies.', tier: 'any', needs: ['kids'], keywords: ['kids', 'children'] },
      { title: 'Rain-proof fairy-light canopy', detail: 'A covered, lit pavilion keeps the outdoor feel without weather anxiety.', outdoor: false, tier: 'mid', keywords: ['rain', 'monsoon'] },
    ],
  },

  birthday: {
    label: 'Birthday',
    minPerHead: 500,
    tiers: [800, 2000],
    maxLeadWeeks: 12,
    attendance: { min: 0.75, mode: 0.95, max: 1.1 },
    lines: [
      { key: 'venue', label: 'Venue & rentals', share: 0.2, risk: 0.08, guestSensitive: false },
      { key: 'catering', label: 'Food & drinks', share: 0.35, risk: 0.12, guestSensitive: true },
      { key: 'decor', label: 'Decor & balloons', share: 0.12, risk: 0.12, guestSensitive: false },
      { key: 'entertainment', label: 'Entertainment & games', share: 0.13, risk: 0.1, guestSensitive: false },
      { key: 'cake', label: 'Cake & desserts', share: 0.06, risk: 0.08, guestSensitive: true },
      { key: 'favours', label: 'Gifts & party favours', share: 0.06, risk: 0.12, guestSensitive: true },
      { key: 'photo', label: 'Photos', share: 0.03, risk: 0.05, guestSensitive: false },
      { key: 'reserve', label: 'Contingency reserve', share: 0.05, risk: 0, guestSensitive: false, reserve: true },
    ],
    tasks: [
      { id: 'budget', name: 'Set budget and draft guest list', lead: 12, dur: 5, deps: [] },
      { id: 'venue', name: 'Book the venue or plan the home layout', lead: 11, dur: 10, deps: ['budget'] },
      { id: 'catering', name: 'Order food and cake', lead: 8, dur: 10, deps: ['venue'] },
      { id: 'entertainment', name: 'Book entertainment or plan games', lead: 7, dur: 10, deps: ['venue'] },
      { id: 'invites', name: 'Send invitations', lead: 7, dur: 7, deps: ['venue'] },
      { id: 'decor', name: 'Buy or book decor', lead: 5, dur: 10, deps: ['venue'] },
      { id: 'rsvp', name: 'Collect RSVPs and dietary needs', lead: 5, dur: 14, deps: ['invites'] },
      { id: 'final', name: 'Confirm vendors and prepare the run-of-show', lead: 2, dur: 4, deps: ['rsvp', 'catering', 'decor', 'entertainment'] },
    ],
    vendors: {
      venue: ['Confirm the capacity, the end time and any decoration rules', 'Ask about the cleaning fee and the security deposit'],
      catering: ['Agree the per-head price and the minimum order', 'Plan a kid-friendly and a diet-friendly option', 'Confirm delivery or setup time at least an hour early'],
      decor: ['Order balloons and props one week ahead', 'Keep a small repair kit: tape, pins, spare balloons'],
      entertainment: ['Test the speaker, projector or game kit beforehand', 'Plan a backup activity in case the main one falls flat'],
      cake: ['Confirm egg-free or sugar-free needs', 'Arrange cake delivery with a cool-storage plan'],
      favours: ['Budget per child or per guest and buy a few spares'],
      photo: ['Assign a friend or hire a photographer for the cake moment'],
    },
    ideas: [
      { title: 'Escape-room night at home', detail: 'Printed clues and padlocks turn the living room into a team challenge.', outdoor: false, tier: 'low', keywords: ['puzzle', 'friends', 'game'] },
      { title: 'Backyard movie night', detail: 'A projector, blankets and popcorn stations make a cosy evening.', outdoor: true, tier: 'mid', keywords: ['movie', 'film'] },
      { title: 'Build-your-own pizza stations', detail: 'Guests top their own pizza or cupcakes, which doubles as the activity.', tier: 'low', keywords: ['food', 'kids', 'cooking'] },
      { title: 'Karaoke battle', detail: 'Two teams, a scoreboard and a silly trophy keep the energy up.', tier: 'low', keywords: ['music', 'sing'] },
      { title: 'Surprise memory video', detail: 'Ask friends and family for 10-second clips and stitch them together.', tier: 'low', keywords: ['surprise', 'memory'] },
      { title: 'Treasure hunt with clues', detail: 'Clues around the garden or neighbourhood end at the cake.', outdoor: true, tier: 'low', needs: ['kids'], keywords: ['kids', 'adventure'] },
      { title: 'Board-game cafe takeover', detail: 'Rent a table block at a board-game cafe, which needs little decor.', outdoor: false, tier: 'mid', keywords: ['games', 'friends'] },
      { title: "Chef's table tasting", detail: 'A small guest list around a tasting menu suits an adult milestone.', tier: 'high', maxGuests: 25, keywords: ['food', 'milestone'] },
      { title: 'Photo timeline wall', detail: 'One photo per year of life, hung as a walk-through gallery.', tier: 'any', keywords: ['memory', 'milestone'] },
    ],
  },

  community: {
    label: 'Community event',
    minPerHead: 60,
    tiers: [150, 500],
    maxLeadWeeks: 20,
    attendance: { min: 0.6, mode: 1, max: 1.4 },
    lines: [
      { key: 'venue', label: 'Venue & permissions', share: 0.15, risk: 0.08, guestSensitive: false },
      { key: 'catering', label: 'Food & refreshments', share: 0.3, risk: 0.14, guestSensitive: true },
      { key: 'av', label: 'Sound, lights & stage', share: 0.12, risk: 0.1, guestSensitive: false },
      { key: 'permits', label: 'Permits, safety & first aid', share: 0.08, risk: 0.1, guestSensitive: false },
      { key: 'promo', label: 'Promotion & printing', share: 0.1, risk: 0.12, guestSensitive: false },
      { key: 'decor', label: 'Signage & decor', share: 0.08, risk: 0.12, guestSensitive: false },
      { key: 'supplies', label: 'Volunteer supplies & activities', share: 0.07, risk: 0.15, guestSensitive: true },
      { key: 'reserve', label: 'Contingency reserve', share: 0.1, risk: 0, guestSensitive: false, reserve: true },
    ],
    tasks: [
      { id: 'goal', name: 'Define goals, budget and core team', lead: 20, dur: 10, deps: [] },
      { id: 'permits', name: 'Apply for permits and police or municipal clearance', lead: 18, dur: 35, deps: ['goal'] },
      { id: 'venue', name: 'Book the venue or ground', lead: 17, dur: 14, deps: ['goal'] },
      { id: 'volunteers', name: 'Recruit and brief volunteers', lead: 12, dur: 28, deps: ['goal'] },
      { id: 'promo', name: 'Promote the event and line up sponsors', lead: 10, dur: 28, deps: ['venue'] },
      { id: 'av', name: 'Book sound, lights and stage', lead: 6, dur: 10, deps: ['venue'] },
      { id: 'safety', name: 'Plan safety, crowd flow and first aid', lead: 5, dur: 10, deps: ['permits', 'venue'] },
      { id: 'final', name: 'Walk-through and volunteer roster lock', lead: 2, dur: 5, deps: ['volunteers', 'promo', 'av', 'safety'] },
    ],
    vendors: {
      venue: ['Get written permission from the owner or the local body', 'Check toilets, water, parking and a rain plan'],
      catering: ['Plan for 20% more than the RSVPs if entry is open', 'Use compostable plates and set up waste stations', 'Check food-safety rules for community distribution'],
      av: ['Confirm power capacity and a backup generator', 'Keep a sound check slot before gates open'],
      permits: ['Keep printed permits on site', 'Name a safety officer and a first-aid lead', 'Mark emergency exits and an assembly point'],
      promo: ['Create a one-page event sheet for WhatsApp and noticeboards', 'Ask local shops to display posters'],
      decor: ['Use clear signage for accessibility, toilets and help desks'],
      supplies: ['Hand each volunteer a role card and contact list', 'Stock water, gloves, bags and spare batteries'],
    },
    ideas: [
      { title: 'Zero-waste stations', detail: 'Volunteers guide guests to compost, recycle and reuse bins, and publish the totals afterwards.', tier: 'low', keywords: ['eco', 'green', 'waste'] },
      { title: 'Local artisan corner', detail: 'Invite home businesses to sell or demo, with a small stall fee that offsets costs.', tier: 'low', keywords: ['market', 'local'] },
      { title: 'Open-mic stage', detail: 'Residents perform in 5-minute slots, which gives the event free local talent.', tier: 'low', keywords: ['music', 'talent'] },
      { title: "Kids' craft and games zone", detail: 'A shaded corner with trained volunteers lets parents join in the main programme.', tier: 'low', needs: ['kids'], keywords: ['kids', 'children'] },
      { title: 'Neighbourhood potluck map', detail: 'Each household signs up for a dish, and a printed map shows the cuisines on offer.', tier: 'low', keywords: ['food', 'potluck'] },
      { title: 'Fun-run kick-off', detail: 'A 2 km walk or run sets the tone and builds an attendance base.', outdoor: true, tier: 'mid', keywords: ['fitness', 'run', 'health'] },
      { title: 'Skill-swap booths', detail: 'Short stalls where neighbours teach a skill, from first aid to Excel.', tier: 'low', keywords: ['learn', 'skills'] },
      { title: 'Shaded rest and first-aid desk', detail: 'A visible help desk with water, seating and a trained first-aider.', tier: 'any', needs: ['elderly', 'wheelchair'], keywords: ['safety', 'health'] },
      { title: 'Sponsor-a-corner wall', detail: 'Local businesses fund a themed corner in exchange for a small sign.', tier: 'mid', minGuests: 100, keywords: ['sponsor'] },
    ],
  },
};
