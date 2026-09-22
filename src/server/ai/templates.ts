export type TemplateId = "general" | "sales" | "one_on_one" | "standup";

export const TEMPLATES: Record<TemplateId, { label: string; description: string; instruction: string }> = {
  general: {
    label: "General",
    description: "A balanced recap of what was discussed and decided.",
    instruction:
      "Summarise this meeting for someone who was not on the call. Cover what was discussed, what was decided, and what's unresolved.",
  },
  sales: {
    label: "Sales call",
    description: "Pain points, objections, budget signals, next steps.",
    instruction:
      "Summarise this as a sales call. Pull out the prospect's stated pain points, any objections raised, budget or timeline signals, competitors mentioned, and the agreed next step.",
  },
  one_on_one: {
    label: "1:1",
    description: "Wins, blockers, career/growth notes, follow-ups.",
    instruction:
      "Summarise this as a 1:1 between a manager and a report. Pull out wins, blockers, feedback given in either direction, and anything about growth or career.",
  },
  standup: {
    label: "Standup",
    description: "Per-person yesterday / today / blockers.",
    instruction:
      "Summarise this as a standup. Organise it per person: what they did, what they're doing next, and any blockers they raised.",
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
