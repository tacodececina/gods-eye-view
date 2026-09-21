/** Original stroke icons, no remote font or network dependency. */
export const EYE_ICONS = Object.freeze({
  adjust:
    'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  arrow_drop_down: 'm5 9 7 7 7-7',
  arrow_forward: 'M3 12h18m-7-7 7 7-7 7',
  arrow_left: 'm15 5-7 7 7 7',
  arrow_right: 'm9 5 7 7-7 7',
  bolt: 'm13 2-8 12h6l-1 8 9-13h-6z',
  chevron_left: 'm15 5-7 7 7 7',
  chevron_right: 'm9 5 7 7-7 7',
  close: 'm5 5 14 14M5 19 19 5',
  close_fullscreen: 'M3 10h7V3m11 11h-7v7',
  dark_mode: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
  draw: 'm4 20 2-6L17 3l4 4L10 18z',
  east: 'M3 12h18m-7-7 7 7-7 7',
  flare: 'M12 1v22M1 12h22M4 4l16 16M4 20 20 4',
  flight: 'm12 2 2 8 8 5v2l-8-2v5l3 2H7l3-2v-5l-8 2v-2l8-5z',
  layers_clear: 'm3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4',
  light_mode: 'M12 2v3m0 14v3M2 12h3m14 0h3M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10',
  local_fire_department:
    'M12 2c5 7-1 7 5 8 6 8-1 13-5 12-9-1-7-9-3-11 0 4 3 3 3-9z',
  my_location: 'M12 2v20M2 12h20M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14',
  navigation: 'm12 2 8 20-8-5-8 5z',
  normal: 'M4 4h16v16H4z',
  on: 'M12 2v10M6 5a9 9 0 1 0 12 0',
  open_in_full: 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6',
  public:
    'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M2 12h20M12 2c-6 5-6 15 0 20 6-5 6-15 0-20',
  radar: 'M12 2a10 10 0 1 0 10 10M12 6a6 6 0 1 0 6 6M12 12 22 2',
  radio: 'M3 8h18v13H3zM3 8 18 2M6 12h6m-6 4h6M17 13v4',
  right_panel_close: 'M3 3h18v18H3zM15 3v18m-8-13 4 4-4 4',
  right_panel_open: 'M3 3h18v18H3zM15 3v18m-5-13-4 4 4 4',
  rocket_launch: 'M9 16 5 19v-5L15 3l6-1-1 6-11 11zM5 20l-3 2',
  skip_next: 'm5 4 12 8-12 8zM20 4v16',
  skip_previous: 'm19 4-12 8 12 8zM4 4v16',
  view_in_ar: 'm12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
});
export function mountEyeIcons(root = document.body) {
  const symbols = {
    '◯': 'adjust',
    '▦': 'normal',
    '🌙': 'dark_mode',
    '🌡️': 'local_fire_department',
    '✦': 'flare',
    '◐': 'dark_mode',
    '❄': 'flare',
    '◎': 'my_location',
    '▣': 'radar',
    '✈': 'flight',
    '□': 'open_in_full',
    '✨': 'light_mode',
    '🔍': 'adjust',
  };
  const selector = '.material-symbols-outlined,.style-btn .btn-icon,.pp-icon';
  const paint = (node) => {
    const icons = node?.matches?.(selector)
      ? [node]
      : [...(node?.querySelectorAll?.(selector) || [])];
    for (const el of icons) {
      const text = el.textContent.trim();
      const name = symbols[text] || text;
      const path = EYE_ICONS[name];
      if (!path) continue;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(svg.namespaceURI, 'path');
      p.setAttribute('d', path);
      svg.append(p);
      el.dataset.symbol = name;
      el.replaceChildren(svg);
    }
  };
  paint(root);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') paint(r.target.parentElement);
      else {
        paint(r.target);
        for (const n of r.addedNodes) if (n.nodeType === 1) paint(n);
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => observer.disconnect();
}
