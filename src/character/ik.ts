/**
 * Two-bone IK in a limb's sagittal plane (the plane its knee bends in).
 *
 * The limb hangs along -y from its root joint at rest; rotating the upper bone by θ about x puts
 * the end at (y, z) = (-cos θ, -sin θ) · length. Given a target for the end joint in the root's
 * parent space (relative to the root joint), returns the upper and lower bone angles. The knee
 * always bends forward (lower angle ≥ 0), like a human knee.
 */
export function solveLeg(ty: number, tz: number, upper: number, lower: number): { upper: number; lower: number } {
  const reach = upper + lower;
  let d = Math.hypot(ty, tz);
  d = Math.min(Math.max(d, Math.abs(upper - lower) + 1e-4), reach - 1e-4);
  const cosKnee = (upper * upper + lower * lower - d * d) / (2 * upper * lower);
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosKnee)));
  const cosA = (upper * upper + d * d - lower * lower) / (2 * upper * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const aim = Math.atan2(-tz, -ty);
  return { upper: aim - alpha, lower: knee };
}

/** End position of the two-bone chain for given angles (the forward kinematics of solveLeg). */
export function legEnd(upperAngle: number, lowerAngle: number, upper: number, lower: number): { y: number; z: number } {
  const a = upperAngle;
  const b = upperAngle + lowerAngle;
  return { y: -Math.cos(a) * upper - Math.cos(b) * lower, z: -Math.sin(a) * upper - Math.sin(b) * lower };
}
