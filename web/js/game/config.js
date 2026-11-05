// Every size is in field units and every speed in units per second: the field is 160 × 100
// whatever the screen, so a match plays the same on a phone and on a 27" monitor.

export const FIELD = Object.freeze({ width: 160, height: 100 });

/** The simulation advances in fixed steps, independent of the display's refresh rate. */
export const STEP = 1 / 120;

export const PADDLE = Object.freeze({
  width: 2,
  height: 18,
  /** Gap between the field's edge and the back of the paddle. */
  inset: 5,
  /** Speed of the player's paddle when moved with the keyboard. */
  keySpeed: 115,
});

export const BALL = Object.freeze({
  radius: 1.5,
  serveSpeed: 62,
  /** The cap, as a multiple of the serve: three times as fast. */
  topSpeed: 3,
  /** Each paddle hit multiplies the speed by this, up to the cap (about 23 hits from a serve). */
  speedUp: 1.05,
  /** Angle given by where the ball meets the paddle: centre = straight, edge = this. */
  maxBounce: (50 * Math.PI) / 180,
  /** Extra angle from the paddle's own movement at the moment of the hit. */
  maxSpin: (15 * Math.PI) / 180,
  /** Paddle speed that gives the full spin. */
  spinAt: 180,
  /** No return is steeper than this, so the ball always crosses the field. */
  maxAngle: (62 * Math.PI) / 180,
  /** Serves leave within ± this angle. */
  serveAngle: (24 * Math.PI) / 180,
});

/** Pauses inside a match, in game time: a paused match freezes them too. */
export const TIMING = Object.freeze({
  /** Ball held at the centre before a serve. */
  serve: 0.7,
  /** After a point, before the next serve or the end of the match: the "GOAL!" celebration. */
  point: 1.5,
});

/**
 * The opponent's handicaps. It sees the ball only every `reaction` seconds, aims with an error up
 * to `error` units (the paddle covers ±10.5 around its aim), moves at most at `speed`, and only
 * the hard one works out bounces off the walls in advance: the others are caught out until the
 * ball is close. Against a player who reaches every ball, it returns on average about 4 (easy),
 * 7 (medium) and 14 (hard) shots before missing one.
 */
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ reaction: 0.28, error: 13, speed: 32, predictBounces: false, ballScale: 0.85 }),
  medium: Object.freeze({ reaction: 0.17, error: 12, speed: 50, predictBounces: false, ballScale: 1 }),
  hard: Object.freeze({ reaction: 0.12, error: 11, speed: 52, predictBounces: true, ballScale: 1.12 }),
});

export const DIFFICULTY_IDS = Object.freeze(['easy', 'medium', 'hard']);
export const TARGETS = Object.freeze([3, 5, 7]);
export const DEFAULT_SETTINGS = Object.freeze({ difficulty: 'medium', target: 5 });
