export const TOURNAMENT_STATES = Object.freeze({
  DRAFT: "DRAFT",
  REGISTRATION_OPEN: "REGISTRATION_OPEN",
  LIVE_ROUND: "LIVE_ROUND",
  ROUND_CLOSED: "ROUND_CLOSED",
  FINISHED: "FINISHED",
});

const LEGACY_STATE_ALIASES = Object.freeze({
  draft: TOURNAMENT_STATES.DRAFT,
  registering: TOURNAMENT_STATES.REGISTRATION_OPEN,
  running: TOURNAMENT_STATES.LIVE_ROUND,
  finished: TOURNAMENT_STATES.FINISHED,
});

export function normalizeTournamentState(status) {
  const raw = String(status || "").trim();
  if (raw === "PAIRING_PREVIEW" || raw.toLowerCase() === "pairing_preview") {
    return TOURNAMENT_STATES.LIVE_ROUND;
  }
  if (LEGACY_STATE_ALIASES[raw]) return LEGACY_STATE_ALIASES[raw];
  return raw || TOURNAMENT_STATES.DRAFT;
}

const NEXT_STATE_ACTIONS = Object.freeze({
  open_registration: {
    from: [TOURNAMENT_STATES.DRAFT],
    to: TOURNAMENT_STATES.REGISTRATION_OPEN,
  },
  close_registration: {
    from: [TOURNAMENT_STATES.REGISTRATION_OPEN],
    to: TOURNAMENT_STATES.LIVE_ROUND,
  },
  close_round: {
    from: [TOURNAMENT_STATES.LIVE_ROUND],
    to: TOURNAMENT_STATES.ROUND_CLOSED,
  },
  next_round: {
    from: [TOURNAMENT_STATES.ROUND_CLOSED],
    to: TOURNAMENT_STATES.LIVE_ROUND,
  },
  finish_tournament: {
    from: [
      TOURNAMENT_STATES.ROUND_CLOSED,
      TOURNAMENT_STATES.LIVE_ROUND,
      TOURNAMENT_STATES.REGISTRATION_OPEN,
      TOURNAMENT_STATES.DRAFT,
    ],
    to: TOURNAMENT_STATES.FINISHED,
  },
});

export function canApplyTournamentAction(state, action) {
  const normalized = normalizeTournamentState(state);
  const rule = NEXT_STATE_ACTIONS[action];
  if (!rule) return false;
  return rule.from.includes(normalized);
}

export function resolveTournamentNextState(state, action) {
  const normalized = normalizeTournamentState(state);
  const rule = NEXT_STATE_ACTIONS[action];
  if (!rule) return null;
  if (!rule.from.includes(normalized)) return null;
  return rule.to;
}
