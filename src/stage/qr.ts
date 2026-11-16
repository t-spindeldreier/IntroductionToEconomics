import qrcode from 'qrcode-generator';
import { svg } from '../ui/dom';

/** The join link as a QR code (crisp at any size, with the required quiet zone). */
export function qrSvg(text: string): SVGElement {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + quiet},${r + quiet}h1v1h-1z`;
  }
  const size = n + quiet * 2;
  return svg('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': 'QR code to join', 'shape-rendering': 'crispEdges' },
    svg('rect', { width: size, height: size, fill: '#fff' }),
    svg('path', { d: path, fill: '#000' }));
}
