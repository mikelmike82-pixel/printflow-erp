// Purely decorative: draws a field of soft diagonal lines that slowly
// drift across the login screen's hero panel. This is a vanilla-JS/CSS
// reproduction of a "floating paths" background effect from a design
// reference (which used React + framer-motion) — no framework or
// animation library, just an inline SVG built at runtime and a CSS
// keyframe animation on each path's stroke-dashoffset. Has no effect
// on app behavior; safe to fail silently if the container is missing.
export function renderLoginLines(container, { perDirection = 16 } = {}) {
  if (!container || container.dataset.linesRendered) return;
  container.dataset.linesRendered = "true";

  // A tall-ish viewBox (rather than the reference's wide 696x316) so the
  // visible "window" onto these long diagonal curves matches this panel's
  // portrait shape instead of being zoomed in on one corner of it.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-40 -80 780 900");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("fill", "none");
  svg.classList.add("login-lines-svg");

  [1, -1].forEach((direction) => {
    for (let i = 0; i < perDirection; i++) {
      const off = i * 5 * direction;
      const d = `M-${380 - off} -${189 + i * 6}C-${380 - off} -${189 + i * 6} -${312 - off} ${216 - i * 6} ${152 - off} ${343 - i * 6}C${616 - off} ${470 - i * 6} ${684 - off} ${875 - i * 6} ${684 - off} ${875 - i * 6}`;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", (0.7 + i * 0.05).toFixed(2));
      path.setAttribute("stroke-opacity", (0.1 + i * 0.02).toFixed(3));
      path.classList.add("login-line-path");
      path.style.animationDelay = `${-(i * 0.7).toFixed(1)}s`;
      path.style.animationDuration = `${16 + (i % 5) * 2}s`;
      svg.appendChild(path);
    }
  });

  container.appendChild(svg);
}
