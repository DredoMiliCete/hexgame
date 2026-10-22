// Easy-to-tweak game constants.
export const CONFIG = {
  RESPAWN_BASE: 2,          // rounds a dead hero stays away (the VIP gets 1 less). NOT specified in rules.csv - adjust freely.
  TEAM_SIZE: 7,
  PICK_PATTERN: [1, 2, 2, 2, 2, 2, 2, 1], // draft AND pregame movement: P1 1, P2 2, P1 2, ...
  MONEY_TO_WIN: 7,
  VIP_KILLS_TO_WIN: 3,
  MAX_TAPS: 3,              // heroes a player may gather per round
  AP_PER_TURN: 2,
  DEAD_AP: [0, 1, 3, 6],    // AP gained from 0, 1, 2, 3+ dead heroes
  CONTROL_BAR: 9,           // tracker starts in the middle (index 4)
};
export const TEAM_NAMES = ['Blu', 'Red'];
