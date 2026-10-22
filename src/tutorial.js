import { smooth } from './engine.js';
const $ = s => document.querySelector(s);
export class Tutorial {
  constructor() { this.started = performance.now() / 1000; this.lastStep = -1; $('#replay-demo-btn').addEventListener('click', () => { this.started = performance.now() / 1000; this.update(this.started); }); }
  update(now) {
    if ($('#tutorial-modal').hidden) return;
    const elapsed = Math.max(0, now - this.started), cycle = Math.floor(elapsed / 7), t = elapsed % 7;
    const lanes = [50, 190, 120], index = cycle % 3, target = lanes[index], from = lanes[(index + 2) % 3];
    const aligned = smooth((t - .35) / 1.5), turned = smooth((t - 2.1) / 1.5), inserted = smooth((t - 4.2) / 1.1);
    const side = cycle % 2, angle = (side ? 0 : Math.PI) + turned * Math.PI;
    const x = from + (target - from) * aligned, y = 205 - inserted * 62;
    $('#demo-port').setAttribute('transform', `translate(${target} 0)`);
    $('#demo-plug').setAttribute('transform', `translate(${x} ${y})`);
    $('#demo-plug').setAttribute('opacity', String(1 - smooth((t - 5.25) / .4)));
    $('#demo-plug-turn').setAttribute('transform', `scale(${Math.cos(angle)} 1)`);
    $('#demo-port-tongue').setAttribute('y', side ? '12' : '26');
    $('#demo-usb-tongue').setAttribute('y', String(19 - 7 * Math.cos(angle)));
    $('#demo-usb-tongue').setAttribute('fill', turned > .95 ? '#c4d8ab' : '#d6b488');
    $('#demo-check').setAttribute('opacity', String(smooth((t - 5.25) / .3)));
    $('#demo-location').textContent = `${['左侧', '右侧', '中间'][index]}插口`;
    const step = t < 2.1 ? 0 : t < 4.2 ? 1 : 2;
    if (step !== this.lastStep) { for (const item of document.querySelectorAll('[data-step]')) { if (Number(item.dataset.step) === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); } this.lastStep = step; }
  }
}
