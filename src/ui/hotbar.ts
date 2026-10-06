// §9.2: the DOM hotbar — 6 materials, the selected slot, and the sharp
// placement indicator (Q mode shows on the hotbar and the ghost).
import { MATERIALS } from '../core/world/block';

const SWATCH_COLOURS = ['', '#3f7a2a', '#5d4028', '#6f6f74', '#c4b183', '#8a5f33', '#8f3a2c'];

export class Hotbar {
  private root: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private sharpBadge: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hotbar';
    this.root.style.cssText =
      'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;' +
      'padding:6px;background:#10141880;border-radius:8px;z-index:5;';
    for (let m = 1; m <= 6; m++) {
      const slot = document.createElement('div');
      slot.style.cssText =
        `width:44px;height:44px;border-radius:6px;background:${SWATCH_COLOURS[m]};` +
        'border:2px solid #0008;display:flex;align-items:flex-end;justify-content:center;' +
        'font:10px system-ui;color:#fff9;padding-bottom:2px;';
      slot.textContent = `${m} ${MATERIALS[m]!}`;
      this.root.appendChild(slot);
      this.slots.push(slot);
    }
    this.sharpBadge = document.createElement('div');
    this.sharpBadge.style.cssText =
      'width:44px;height:44px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
      'font:11px system-ui;color:#ffd;border:2px dashed #fff5;';
    this.sharpBadge.textContent = 'sharp';
    this.root.appendChild(this.sharpBadge);
    document.body.appendChild(this.root);
  }

  update(material: number, sharpMode: boolean): void {
    this.slots.forEach((slot, i) => {
      slot.style.borderColor = i + 1 === material ? '#fff' : '#0008';
    });
    this.sharpBadge.style.borderColor = sharpMode ? '#ffd34d' : '#fff5';
    this.sharpBadge.style.background = sharpMode ? '#6b5516' : 'transparent';
  }
}
