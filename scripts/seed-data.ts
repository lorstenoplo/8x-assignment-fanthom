/**
 * Seed transcripts. These are authored, not captured from a real call — we
 * don't have live recordings to seed with — but everything downstream
 * (summaries, action items, the retrieval index, alerts) is produced by the
 * actual product pipeline (`processMeeting`) running against this text, not
 * hardcoded. Said plainly in the walkthrough.
 */

export type SeedParticipant = { name: string; email?: string; role: "host" | "guest"; isExternal: boolean };
export type SeedSegment = { speaker: string; startMs: number; endMs: number; text: string };
export type SeedMeeting = {
  title: string;
  daysAgo: number;
  durationSec: number;
  participants: SeedParticipant[];
  segments: SeedSegment[];
  highlights?: { label: string; startMs: number; endMs: number }[];
  confidential?: boolean;
};

const m = (s: number) => s * 1000;

export const SEED_MEETINGS: SeedMeeting[] = [
  // ── 1. Sales call, external ──────────────────────────────────────────────
  {
    title: "Sales call — Meridian Labs",
    daysAgo: 9,
    durationSec: 14 * 60,
    participants: [
      { name: "Priya Nair", email: "priya@fathomclone.dev", role: "host", isExternal: false },
      { name: "Dana Whitfield", email: "dana@meridianlabs.com", role: "guest", isExternal: true },
    ],
    segments: [
      { speaker: "Priya Nair", startMs: m(2), endMs: m(10), text: "Thanks for making time, Dana. Before we dive in — what's prompting the search for a notetaker right now?" },
      { speaker: "Dana Whitfield", startMs: m(11), endMs: m(30), text: "Honestly, we're losing context between calls. Our AEs run four or five demos a day and nobody writes anything down consistently, so deals stall because we forget what a prospect actually cared about." },
      { speaker: "Priya Nair", startMs: m(31), endMs: m(45), text: "That's the most common reason teams come to us. Are you currently using anything — even just someone manually taking notes?" },
      { speaker: "Dana Whitfield", startMs: m(46), endMs: m(70), text: "We tried a general-purpose recorder last year but it produced walls of text nobody read. What we actually need is the action items and objections pulled out automatically." },
      { speaker: "Priya Nair", startMs: m(71), endMs: m(95), text: "That's exactly the sales template — it pulls pain points, objections, budget signals, and next steps into a structured recap instead of a transcript dump." },
      { speaker: "Dana Whitfield", startMs: m(96), endMs: m(130), text: "Good, because budget is going to be the sticking point internally. We're a 40-person team and our finance lead is going to ask about per-seat pricing versus a flat rate, and honestly the current quote from your competitor is a lot cheaper." },
      { speaker: "Priya Nair", startMs: m(131), endMs: m(160), text: "Understood — I'll get you a seat-based quote by Friday so you can compare directly. Is finance the final approver, or is there a security review too?" },
      { speaker: "Dana Whitfield", startMs: m(161), endMs: m(190), text: "There's a security review since we'd be recording client calls — data residency and retention policy will matter a lot. Also, is there a way to make sure the notetaker doesn't repeat internal numbers if a client is on the call?" },
      { speaker: "Priya Nair", startMs: m(191), endMs: m(220), text: "Yes — there's a guardrail specifically for that. If an external guest is detected in the room, the assistant restricts itself to information that guest was actually present for, and refuses out loud rather than guessing." },
      { speaker: "Dana Whitfield", startMs: m(221), endMs: m(245), text: "That actually matters a lot to us, we've had close calls with reps oversharing pipeline numbers by accident." },
      { speaker: "Priya Nair", startMs: m(246), endMs: m(270), text: "Great — next step: I'll send the security documentation and a per-seat quote by Friday, and let's put a follow-up on the calendar for the week after to get finance's read." },
      { speaker: "Dana Whitfield", startMs: m(271), endMs: m(290), text: "Works for me. I'll loop in our finance lead, Marcus, for that one." },
    ],
    highlights: [{ label: "Budget objection", startMs: m(96), endMs: m(130) }],
  },

  // ── 2. 1:1, internal ──────────────────────────────────────────────────────
  {
    title: "1:1 — Sam & Jordan",
    daysAgo: 6,
    durationSec: 16 * 60,
    participants: [
      { name: "Sam Okafor", email: "sam@fathomclone.dev", role: "host", isExternal: false },
      { name: "Jordan Blake", email: "jordan@fathomclone.dev", role: "guest", isExternal: false },
    ],
    segments: [
      { speaker: "Sam Okafor", startMs: m(3), endMs: m(15), text: "How's the retrieval work going? Last week you mentioned the chunking was producing weirdly short pieces." },
      { speaker: "Jordan Blake", startMs: m(16), endMs: m(45), text: "Fixed that — I switched to a sliding window with overlap instead of splitting strictly on segment boundaries. Search results read a lot more coherent now." },
      { speaker: "Sam Okafor", startMs: m(46), endMs: m(55), text: "Nice, that was a good call. Anything blocking you this week?" },
      { speaker: "Jordan Blake", startMs: m(56), endMs: m(90), text: "Mostly just waiting on design for the alerts UI — I've got the backend scanning done but I don't want to ship an ugly list. Also I think we should talk about my growth track, I want to take on more of the AI pipeline work." },
      { speaker: "Sam Okafor", startMs: m(91), endMs: m(120), text: "Let's do that — I think you're ready for it honestly, the guardrail work you did was genuinely senior-level thinking. I'll talk to the team about giving you ownership of the retrieval and summarization stack." },
      { speaker: "Jordan Blake", startMs: m(121), endMs: m(140), text: "That'd be great. One thing I struggled with — the summary prompts sometimes hallucinate timestamps when the transcript is short. I want to add stricter grounding." },
      { speaker: "Sam Okafor", startMs: m(141), endMs: m(160), text: "Good catch, let's prioritize that this sprint since it undermines trust in the whole feature. Can you have a fix by Thursday?" },
      { speaker: "Jordan Blake", startMs: m(161), endMs: m(170), text: "Yeah, Thursday works." },
    ],
  },

  // ── 3. Standup, internal, 4 people ───────────────────────────────────────
  {
    title: "Weekly standup — Platform team",
    daysAgo: 4,
    durationSec: 11 * 60,
    participants: [
      { name: "Priya Nair", email: "priya@fathomclone.dev", role: "host", isExternal: false },
      { name: "Sam Okafor", email: "sam@fathomclone.dev", role: "guest", isExternal: false },
      { name: "Jordan Blake", email: "jordan@fathomclone.dev", role: "guest", isExternal: false },
      { name: "Elena Petrova", email: "elena@fathomclone.dev", role: "guest", isExternal: false },
    ],
    segments: [
      { speaker: "Priya Nair", startMs: m(2), endMs: m(10), text: "Let's go round robin. Elena, want to start?" },
      { speaker: "Elena Petrova", startMs: m(11), endMs: m(35), text: "Yesterday I finished the recording upload path to Blob storage, today I'm adding retry logic since large files were timing out on slow connections. No blockers." },
      { speaker: "Sam Okafor", startMs: m(36), endMs: m(60), text: "I reviewed the onboarding wizard and shipped the consent banner copy. Today I'm pairing with Jordan on the guardrail eval set — we need real test cases for when it should and shouldn't refuse." },
      { speaker: "Jordan Blake", startMs: m(61), endMs: m(90), text: "On my end, retrieval chunking is done, alerts backend is done. Blocked on the alerts UI design, so today I'll start on the wake-word detection for the in-call agent instead." },
      { speaker: "Priya Nair", startMs: m(91), endMs: m(115), text: "I closed the Meridian Labs call yesterday — good signal, but they specifically asked about the guardrail before committing, so that needs to demo well in the next call. I'll also chase down the design for alerts today so Jordan's unblocked." },
      { speaker: "Elena Petrova", startMs: m(116), endMs: m(130), text: "One flag — the 8-person call recording from Tuesday is almost an hour long and processing took a while. We should keep an eye on cost as call volume grows." },
      { speaker: "Priya Nair", startMs: m(131), endMs: m(145), text: "Good catch, let's put a rough budget check on the agenda for next week." },
    ],
  },

  // ── 4. Client check-in, external, confidential aside ─────────────────────
  {
    title: "Client check-in — Northwind Retail",
    daysAgo: 2,
    durationSec: 19 * 60,
    participants: [
      { name: "Priya Nair", email: "priya@fathomclone.dev", role: "host", isExternal: false },
      { name: "Marcus Webb", email: "marcus@northwindretail.com", role: "guest", isExternal: true },
    ],
    segments: [
      { speaker: "Priya Nair", startMs: m(3), endMs: m(20), text: "Good to see you, Marcus. How's the rollout going on your end since we onboarded your team last month?" },
      { speaker: "Marcus Webb", startMs: m(21), endMs: m(50), text: "Pretty smooth. Adoption's around 70% of the sales team using it daily. The main complaint is that search sometimes surfaces meetings that feel unrelated." },
      { speaker: "Priya Nair", startMs: m(51), endMs: m(75), text: "That's useful feedback — we've been tuning the retrieval threshold, I'll take a look at specific examples if you can send a couple over." },
      { speaker: "Marcus Webb", startMs: m(76), endMs: m(100), text: "Will do. Also, we're evaluating expanding the contract to our EU offices next quarter — what does data residency look like there?" },
      { speaker: "Priya Nair", startMs: m(101), endMs: m(125), text: "We can support EU data residency on the higher tier — I'll get you the specifics in writing this week so your legal team can review ahead of the renewal." },
      { speaker: "Marcus Webb", startMs: m(126), endMs: m(140), text: "Perfect, that's the main blocker for expansion so getting that in writing soon would help a lot." },
    ],
  },

  // ── 5. Product planning, internal ────────────────────────────────────────
  {
    title: "Product planning — Q4 roadmap",
    daysAgo: 1,
    durationSec: 24 * 60,
    participants: [
      { name: "Priya Nair", email: "priya@fathomclone.dev", role: "host", isExternal: false },
      { name: "Sam Okafor", email: "sam@fathomclone.dev", role: "guest", isExternal: false },
      { name: "Elena Petrova", email: "elena@fathomclone.dev", role: "guest", isExternal: false },
    ],
    segments: [
      { speaker: "Priya Nair", startMs: m(3), endMs: m(25), text: "Big picture for Q4: I think the guardrailed in-call agent is our biggest differentiator, so I want that polished before we push search further." },
      { speaker: "Sam Okafor", startMs: m(26), endMs: m(55), text: "Agreed. We should also think about the 8-person-call case specifically — long calls with lots of speakers are where competitors visibly struggle, speaker attribution gets muddy." },
      { speaker: "Elena Petrova", startMs: m(56), endMs: m(85), text: "From an infra side, long calls mean bigger recordings and more embedding calls at index time. We should batch embedding requests to control cost as usage grows." },
      { speaker: "Priya Nair", startMs: m(86), endMs: m(110), text: "Let's prioritize in this order: guardrail hardening, then the long/multi-speaker call experience, then search quality, then a proper alerts UI." },
      { speaker: "Sam Okafor", startMs: m(111), endMs: m(130), text: "I'll own the guardrail eval set and get a first pass done by end of week." },
      { speaker: "Elena Petrova", startMs: m(131), endMs: m(150), text: "I'll look at embedding batching and get rough cost numbers so we know what we're dealing with at scale." },
    ],
  },
];

// ── 6. The one that actually matters: 8 people, ~1 hour ──────────────────────
const BIG_PARTICIPANTS: SeedParticipant[] = [
  { name: "Priya Nair", email: "priya@fathomclone.dev", role: "host", isExternal: false },
  { name: "Sam Okafor", email: "sam@fathomclone.dev", role: "guest", isExternal: false },
  { name: "Jordan Blake", email: "jordan@fathomclone.dev", role: "guest", isExternal: false },
  { name: "Elena Petrova", email: "elena@fathomclone.dev", role: "guest", isExternal: false },
  { name: "Marcus Webb", email: "marcus@northwindretail.com", role: "guest", isExternal: true },
  { name: "Dana Whitfield", email: "dana@meridianlabs.com", role: "guest", isExternal: true },
  { name: "Theo Adeyemi", email: "theo@fathomclone.dev", role: "guest", isExternal: false },
  { name: "Nina Kowalski", email: "nina@fathomclone.dev", role: "guest", isExternal: false },
];

const BIG_SEGMENTS: SeedSegment[] = [
  { speaker: "Priya Nair", startMs: m(10), endMs: m(40), text: "Thanks everyone for joining — this is our quarterly business review with both Northwind and Meridian on the line, plus the internal team. Agenda: renewal status, roadmap preview, then open Q&A." },
  { speaker: "Marcus Webb", startMs: m(41), endMs: m(70), text: "Appreciate the invite. From our side, adoption is strong — around 70% weekly active — but I did want to raise the search relevance issue I mentioned to Priya earlier this week." },
  { speaker: "Jordan Blake", startMs: m(71), endMs: m(105), text: "That's on us to fix — we've already identified the retrieval threshold is too loose for short queries. Should have a tuned version out in two weeks." },
  { speaker: "Dana Whitfield", startMs: m(106), endMs: m(140), text: "We're still pre-contract, evaluating alongside a couple other vendors, but the guardrail behavior in the demo was the deciding factor for us over the alternative." },
  { speaker: "Priya Nair", startMs: m(141), endMs: m(175), text: "Good to hear. Sam, can you walk through the roadmap priorities for next quarter at a high level, keeping it external-appropriate?" },
  { speaker: "Sam Okafor", startMs: m(176), endMs: m(230), text: "Sure. Top priority is hardening the in-call guardrail further, then improving the experience for long calls with lots of participants — this call is actually a good example of that use case — then search quality, then a proper alerts dashboard." },
  { speaker: "Elena Petrova", startMs: m(231), endMs: m(260), text: "From infrastructure, we're also investing in making processing faster for hour-long calls like this one so summaries are ready within a minute or two of hangup." },
  { speaker: "Theo Adeyemi", startMs: m(261), endMs: m(290), text: "On the design side, the alerts UI mockups are close to done, I'll share them with the team by Friday for internal review before anything client-facing." },
  { speaker: "Nina Kowalski", startMs: m(291), endMs: m(320), text: "I've been doing customer interviews and the recurring theme is people want the summary to be shorter and more scannable, not longer. Worth feeding into the template work." },
  { speaker: "Marcus Webb", startMs: m(600), endMs: m(635), text: "Coming back to search — is there a timeline commitment we can put in writing? It's the one blocker for our EU expansion discussion internally." },
  { speaker: "Priya Nair", startMs: m(636), endMs: m(665), text: "Two weeks for the relevance fix, and I'll follow up in writing today with the EU data residency details as well." },
  { speaker: "Dana Whitfield", startMs: m(666), endMs: m(700), text: "For us, the main open question is per-seat pricing at our size — 40 seats. Is there a volume discount tier?" },
  { speaker: "Priya Nair", startMs: m(701), endMs: m(730), text: "Yes, there's a discount starting at 25 seats. I'll get Dana a formal quote by Friday reflecting that." },
  { speaker: "Sam Okafor", startMs: m(1500), endMs: m(1540), text: "Switching to the internal roadmap detail for a moment — Jordan, where are we on the wake-word detection for the notetaker?" },
  { speaker: "Jordan Blake", startMs: m(1541), endMs: m(1575), text: "Working, currently tuned to the default name but configurable per workspace. Needs more testing with background noise from multi-speaker calls exactly like this one." },
  { speaker: "Elena Petrova", startMs: m(1576), endMs: m(1610), text: "I'll pull audio samples from today's call — with consent already given — to use as a noisy test case." },
  { speaker: "Theo Adeyemi", startMs: m(1900), endMs: m(1935), text: "Quick design note — for calls this size, we should show a speaker talk-time breakdown, it's one of the more requested small features from user interviews." },
  { speaker: "Nina Kowalski", startMs: m(1936), endMs: m(1965), text: "Agreed, especially for standups and reviews like this one where a couple people naturally dominate." },
  { speaker: "Priya Nair", startMs: m(2400), endMs: m(2430), text: "Let's start wrapping up. Marcus, Dana — thank you both for your patience while we work through search relevance and pricing. You'll each have something in writing by end of week." },
  { speaker: "Marcus Webb", startMs: m(2431), endMs: m(2450), text: "Appreciated, thanks everyone." },
  { speaker: "Dana Whitfield", startMs: m(2451), endMs: m(2465), text: "Likewise, talk soon." },
  { speaker: "Priya Nair", startMs: m(3000), endMs: m(3040), text: "For the internal team, quick recap of owners: Jordan on search relevance and wake-word, Elena on processing speed and infra cost, Theo on alerts and talk-time UI, Sam on guardrail hardening. Let's sync again next week." },
  { speaker: "Sam Okafor", startMs: m(3041), endMs: m(3055), text: "Sounds good, I'll send a written recap after this." },
  { speaker: "Nina Kowalski", startMs: m(3300), endMs: m(3330), text: "One last thing — can we make sure the shorter-summary feedback from customer interviews gets into the sales template specifically, since that's what Dana and Marcus both actually read?" },
  { speaker: "Priya Nair", startMs: m(3331), endMs: m(3355), text: "Good call, adding that to the template backlog now. Thanks everyone, that's a wrap." },
];

export const BIG_MEETING: SeedMeeting = {
  title: "Quarterly business review — Northwind & Meridian",
  daysAgo: 0,
  durationSec: 58 * 60,
  participants: BIG_PARTICIPANTS,
  segments: BIG_SEGMENTS,
  highlights: [
    { label: "Pricing ask — 40 seats", startMs: m(666), endMs: m(700) },
    { label: "Search relevance commitment", startMs: m(600), endMs: m(665) },
  ],
};

export const ALL_SEED_MEETINGS: SeedMeeting[] = [...SEED_MEETINGS, BIG_MEETING];
