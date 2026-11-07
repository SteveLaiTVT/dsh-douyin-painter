// Original, code-drawn character. LivLiv supplies the pose, idle motion and actions.
// No featured LivLiv character assets or external model service are used.
export class MoonBody {
  format = 'moon-canvas';
  attach(canvas) { this.g = canvas.getContext('2d'); if (!this.g) throw Error('无法绘制主持形象'); }
  async load() { return { name: '阿月', expressions: [{ id: 'surprised', label: '惊喜' }] }; }
  head() { return { x: .5, y: .38, rx: .27, ry: .22 }; }
  dispose() { this.g = null; }
  render(canvas, { params: p, move, expr }, w, h) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = this.g; if (!g) return;
    g.clearRect(0, 0, w, h);
    const k = Math.min(w / 260, h / 290) * move.s;
    const smile = Math.max(p.smile || 0, expr.smile || 0), mouth = Math.max(0, Math.min(1, p.mouthOpen));
    // Pose telemetry comes from the same values used to draw; useful for local playback diagnostics.
    canvas.dataset.mouth = mouth.toFixed(3);
    const ellipse = (x, y, rx, ry, fill, stroke) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    const box = (x, y, width, height, radius, fill, stroke) => { g.beginPath(); g.roundRect(x, y, width, height, radius); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    const line = (points, color, width = 3) => { g.beginPath(); g.moveTo(...points[0]); for (const point of points.slice(1)) g.lineTo(...point); g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.stroke(); };
    g.save(); g.translate(w / 2, h - 12 * k); g.scale(k, k);
    ellipse(0, -1, 78, 8, '#b8c6c313');
    g.translate(move.x * 100 + p.bodyX * .4, -move.y * 120 - p.breath * 1.4);
    g.rotate((p.bodyZ * .4 + p.angleZ * .18) * Math.PI / 180);
    // Dusty lunar boots, a warm ivory body and the shopkeeper's petrol-green apron.
    box(-49, -33, 39, 27, 12, '#7b8a89', '#283a3d'); box(10, -33, 39, 27, 12, '#7b8a89', '#283a3d');
    box(-58, -118, 116, 94, 31, '#dfded2', '#738486');
    for (const side of [-1, 1]) {
      g.save(); g.translate(side * 55, -105); g.rotate(side * (-.17 - smile * .35));
      box(side < 0 ? -24 : -3, -3, 27, 66, 13, '#c6cdc4', '#70858a');
      ellipse(side * 10, 62, 13, 12, '#e7d7b5', '#9c8d73'); g.restore();
    }
    box(-45, -112, 90, 82, 17, '#326466', '#80a5a0');
    line([[-30, -112], [-25, -135]], '#9fbfb1', 7); line([[30, -112], [25, -135]], '#9fbfb1', 7);
    box(-23, -65, 46, 25, 5, '#244e53', '#64928b'); line([[-18, -60], [18, -60]], '#8aa99a', 1.5);
    ellipse(0, -90, 13, 13, '#efd39b'); ellipse(6, -95, 12, 12, '#326466');
    // Helmet follows the head separately from the body; the face is not a static image.
    g.save(); g.translate(p.angleX * .55, -165 - p.angleY * .28);
    g.rotate(p.angleZ * .55 * Math.PI / 180);
    const shell = g.createLinearGradient(-80, -70, 70, 75); shell.addColorStop(0, '#f4eedc'); shell.addColorStop(.5, '#d5d9cf'); shell.addColorStop(1, '#96adaa');
    ellipse(-82, 1, 13, 28, '#b69d76', '#685c4b'); ellipse(82, 1, 13, 28, '#b69d76', '#685c4b');
    // A little radio aerial and a copper moon badge keep the silhouette legible at stream size.
    line([[43, -62], [53, -91]], '#a9bab2', 4); ellipse(54, -94, 7, 7, '#ebad6a');
    ellipse(0, 0, 84, 77, shell, '#7d9592');
    ellipse(0, 4, 70, 60, '#162f38', '#859fa0');
    const glass = g.createLinearGradient(-50, -50, 45, 65); glass.addColorStop(0, '#33535a'); glass.addColorStop(1, '#10242e');
    ellipse(0, 4, 65, 55, glass);
    g.save(); g.globalAlpha = .32; line([[-46, -18], [-24, -35], [-4, -39]], '#cfe4d6', 5); g.restore();
    const gaze = Math.max(-5, Math.min(5, p.eyeBallX * 5));
    for (const [x, open] of [[-26, p.eyeLOpen], [26, p.eyeROpen]]) {
      if (open < .3 || smile > .55) {
        g.beginPath(); g.ellipse(x + gaze, 3, 11, 7, 0, Math.PI, Math.PI * 2); g.strokeStyle = '#b9ebdc'; g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
      } else ellipse(x + gaze, -2, 6 + (expr.surprised || 0) * 2, Math.max(2, 12 * open), '#b9ebdc');
    }
    if (smile > .15) { ellipse(-41, 21, 9, 4, '#c18d7260'); ellipse(41, 21, 9, 4, '#c18d7260'); }
    if (mouth > .055) {
      ellipse(0, 27, 6 + mouth * (8 + p.vowel * 3), 2 + mouth * 13, '#091b24', '#9ed7cc');
      if (mouth > .3) ellipse(0, 31 + mouth * 3, 4 + mouth * 4, 2, '#dbaa88');
    } else {
      g.beginPath(); g.moveTo(-8, 25); g.quadraticCurveTo(0, 29 + smile * 6, 8, 25); g.strokeStyle = '#b9ebdc'; g.lineWidth = 3; g.lineCap = 'round'; g.stroke();
    }
    g.restore(); g.restore();
  }
}
