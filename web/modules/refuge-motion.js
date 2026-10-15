// Screen projection shared by pointer input and rendering. Positions are viewport-relative.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function refugeOrigin(width, height) {
  const scale = Math.min(width / 850, height / 590);
  return { x: width * .5, y: width <= 920 ? height * .49 : height * .73 - 120 * scale };
}
export function refugeDestination(clientX, clientY, box, width, height) {
  if (!(box.width > 0 && box.height > 0 && width > 0 && height > 0)) return null;
  const x = (clientX - box.left) / box.width * width;
  const y = (clientY - box.top) / box.height * height;
  if (x < 0 || x > width || y < height * .32 || y > height) return null;
  const origin = refugeOrigin(width, height);
  return { x: clamp((x - origin.x) / width, -.22, .22), y: clamp((y - origin.y) / height, -.08, .10) };
}
export function advanceRefuge(position, destination, width, height, dt, reduced = false) {
  const dx = (destination.x - position.x) * width;
  const dy = (destination.y - position.y) * height;
  const distance = Math.hypot(dx, dy);
  // Uniform screen speed, bounded after a hidden tab resumes, with an exact stop.
  const speed = Math.max(70, Math.min(220, width * .22));
  const step = speed * clamp(dt, 0, 64) / 1000;
  if (reduced || distance <= Math.max(.25, step)) return { ...destination };
  const fraction = step / distance;
  return { x: position.x + (destination.x - position.x) * fraction, y: position.y + (destination.y - position.y) * fraction };
}
