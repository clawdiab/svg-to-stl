/**
 * Cherry MX Blue switch dimensions (mm)
 * Reference: Cherry MX datasheet
 */
export const CHERRY_MX = {
  // Plate mount hole
  PLATE_HOLE: 14.0, // 14mm square cutout
  PLATE_THICKNESS: 1.5, // standard plate thickness

  // Switch body
  BODY_WIDTH: 15.6,
  BODY_HEIGHT: 15.6,
  BODY_DEPTH: 11.6, // below plate

  // Pin positions (from center)
  PIN_1: { x: -3.81, y: 2.54, diameter: 1.5 },
  PIN_2: { x: 2.54, y: -5.08, diameter: 1.5 },
  CENTER_POST: { x: 0, y: 0, diameter: 4.0 },

  // Stem (cross shaped)
  STEM_WIDTH: 4.0, // overall cross width
  STEM_THICKNESS: 1.2, // thickness of each arm
  STEM_HEIGHT: 3.6, // height above plate

  // Plate mount clips
  CLIP_WIDTH: 1.0,
  CLIP_DEPTH: 1.5,
  CLIP_OFFSET: 7.0, // from center, on sides

  // Travel
  ACTUATION: 2.0,
  TOTAL_TRAVEL: 4.0,
};

/**
 * Fidget clicker part dimensions
 */
export const CLICKER = {
  // Base
  BASE_WALL: 2.0, // wall thickness
  BASE_HEIGHT: 14.0, // total height (switch body + plate + clearance)
  BASE_BOTTOM: 1.5, // bottom plate thickness
  BASE_FILLET: 2.0, // edge rounding

  // Top cap
  CAP_THICKNESS: 3.0, // overall cap thickness
  CAP_CLEARANCE: 0.3, // gap between cap and base walls
  CAP_LIP: 1.0, // lip that goes inside base

  // Stem receiver (connects cap to switch stem)
  STEM_RECEIVER_WIDTH: 4.2, // slightly larger than stem for fit
  STEM_RECEIVER_DEPTH: 3.0, // how deep the cross slot is
};
