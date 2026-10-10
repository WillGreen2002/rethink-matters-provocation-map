/* A small force simulation (no dependencies): many-body repulsion, springs, anchors, a radial band, and
   position-based collision so nodes never overlap. Same cooling idea as d3-force (alpha decays towards a target). */
(function () {
  const RM = (window.RM = window.RM || {});

  class Sim {
    constructor() {
      this.nodes = [];
      this.springs = [];
      this.alpha = 0;
      this.alphaTarget = 0;
      this.alphaDecay = 0.0228; // ~300 ticks to cool
      this.alphaMin = 0.003;
      this.damping = 0.8;
      this.K = 36;              // repulsion constant (force ~ K*q1*q2/d)
      this.range2 = 340 * 340;  // ignore repulsion beyond this distance
      this.pad = 7;             // minimum gap between node edges
    }
    set(nodes, springs) { this.nodes = nodes; this.springs = springs; }
    reheat(a = 0.5) { this.alpha = Math.max(this.alpha, a); }
    get active() { return this.alpha > this.alphaMin || this.alphaTarget > 0; }

    tick() {
      const N = this.nodes, n = N.length, a = this.alpha;
      // 1. repulsion (velocity) + collision (position)
      for (let i = 0; i < n; i++) {
        const A = N[i];
        if (!A.on) continue;
        for (let j = i + 1; j < n; j++) {
          const B = N[j];
          if (!B.on) continue;
          let dx = B.x - A.x, dy = B.y - A.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > this.range2) continue;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy + 0.01; }
          const d = Math.sqrt(d2);
          const ux = dx / d, uy = dy / d;
          const f = (this.K * A.q * B.q / d) * a;
          if (!A.fixed) { A.vx -= ux * f / A.m; A.vy -= uy * f / A.m; }
          if (!B.fixed) { B.vx += ux * f / B.m; B.vy += uy * f / B.m; }
          const minD = A.r + B.r + this.pad;
          if (d < minD) {
            const push = (minD - d) * 0.5;
            const wa = A.fixed ? 0 : (B.fixed ? 1 : B.m / (A.m + B.m));
            const wb = B.fixed ? 0 : (A.fixed ? 1 : A.m / (A.m + B.m));
            const s = (A.fixed || B.fixed) ? 2 : 1;
            A.x -= ux * push * s * wa * 2; A.y -= uy * push * s * wa * 2;
            B.x += ux * push * s * wb * 2; B.y += uy * push * s * wb * 2;
          }
        }
      }
      // 2. springs
      for (const s of this.springs) {
        const A = s.a, B = s.b;
        if (!A.on || !B.on) continue;
        let dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (s.slack && d < s.len) continue;   // slack springs only pull when stretched (cross-links shouldn't crush clusters)
        const f = (d - s.len) * s.k * a;
        const fx = dx / d * f, fy = dy / d * f;
        if (!A.fixed) { A.vx += fx / A.m; A.vy += fy / A.m; }
        if (!B.fixed) { B.vx -= fx / B.m; B.vy -= fy / B.m; }
      }
      // 3. anchors (themes → ring), radial band (topics), gentle gravity (everything else)
      for (const nd of N) {
        if (!nd.on || nd.fixed) continue;
        if (nd.anchor) {
          nd.vx += (nd.anchor.x - nd.x) * nd.anchor.k * a;
          nd.vy += (nd.anchor.y - nd.y) * nd.anchor.k * a;
        }
        if (nd.band) {
          // one-sided, position-based: keep the node outside an (elliptical) radius so the middle stays free for the question
          const rx = nd.x / (nd.band.sx || 1), ry = nd.y / (nd.band.sy || 1);
          const r = Math.hypot(rx, ry) || 1;
          if (nd.band.rmin != null && r < nd.band.rmin) {
            const dr = (nd.band.rmin - r) * nd.band.k;
            nd.x += (rx / r) * dr * (nd.band.sx || 1);
            nd.y += (ry / r) * dr * (nd.band.sy || 1);
          } else if (nd.band.rmax != null && r > nd.band.rmax) {
            const dr = (nd.band.rmax - r) * nd.band.k;   // negative: pull back inside
            nd.x += (rx / r) * dr * (nd.band.sx || 1);
            nd.y += (ry / r) * dr * (nd.band.sy || 1);
          }
        }
        if (nd.gravity) { nd.vx -= nd.x * nd.gravity * a; nd.vy -= nd.y * nd.gravity * a; }
      }
      // 4. integrate
      for (const nd of N) {
        if (!nd.on) continue;
        if (nd.fixed) { nd.vx = nd.vy = 0; continue; }
        nd.vx *= this.damping; nd.vy *= this.damping;
        nd.x += nd.vx; nd.y += nd.vy;
      }
      this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    }
  }
  RM.Sim = Sim;
})();
