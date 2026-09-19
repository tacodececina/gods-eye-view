/** Presentation adapter for retained engine controls. Never visits provider data or private notes. */
const copy = new Map(
  Object.entries({
    'SOURCE · UNKNOWN': 'FUENTE · NO CONFIGURADA',
    'Enable CCTV to load camera intersections':
      'Catálogo de cámaras no configurado',
    'No cameras available in catalog.':
      'No hay un catálogo de cámaras configurado.',
    'CCTV OFF': 'CÁMARAS APAGADAS',
    'COVERAGE ON': 'COBERTURA ACTIVA',
    'AUTO HOP OFF': 'RECORRIDO APAGADO',
    'PROJECTION ON': 'PROYECCIÓN ACTIVA',
    ADJUST: 'AJUSTAR',
    'HDG --': 'RUMBO —',
    'PITCH --': 'INCLINACIÓN —',
    'RANGE --': 'DISTANCIA —',
    'HGT --': 'ALTURA —',
    OFF: 'APAGADO',
    Ready: 'Listo',
    DENSE: 'DENSAS',
    SPARSE: 'DISPERSAS',
    ON: 'ACTIVO',
    'No shots yet. Use CAPTURE SHOT to save current look.':
      'Sin tomas. Captura el encuadre actual para empezar.',
    'HUD layout': 'Diseño del HUD',
    'Map source': 'Cartografía',
    'Scene recipe': 'Escena',
    'Current style: NORMAL — click for next':
      'Modo actual: natural. Activa para cambiar.',
    'Show the globe without a visual filter.':
      'Mostrar el globo sin filtro visual.',
    'Emulate a green phosphor CRT with scanlines and screen curvature.':
      'Tratamiento de monitor CRT.',
    'Simulate night-vision goggles with green intensification and a tube vignette.':
      'Tratamiento de visión nocturna.',
    'Simulate FLIR-style thermal contrast. Turn up Ironbow for color.':
      'Contraste de apariencia térmica. No es un sensor.',
    'Apply bright cel-shaded color and illustrated outlines.':
      'Color ilustrado y contornos.',
    'Apply high-contrast monochrome film-noir grading.':
      'Tratamiento monocromo.',
    'Add a cold, snowy whiteout treatment to the scene.':
      'Tratamiento frío de nieve.',
    '3D aircraft — flat icons zoomed out, 3D models up close':
      'Modelos 3D de aeronaves. Requiere una fuente configurada.',
    'Intelligence HUD (H)': 'Instrumentos de cámara (H)',
    'Detection Overlay (D)': 'Etiquetas de contactos (D)',
    'Detection overlay': 'Etiquetas de contactos',
    'Hide UI chrome': 'Ocultar interfaz',
    'Return UI controls': 'Volver a la consola',
    'Bloom / Glow': 'Resplandor',
    Sharpening: 'Nitidez',
    'Label (optional)': 'Etiqueta opcional',
    'Label for the drawn shape': 'Etiqueta de la marca',
    'Colour of the drawn shape': 'Color de la marca',
    'Shape to draw': 'Forma que se dibujará',
    'Remove every mark from the board': 'Borrar todas las marcas de la sesión',
    'Draw on the world — click vertices, double-click or Enter to finish, Esc to cancel':
      'Marca vértices sobre el globo. Enter termina; Escape cancela.',
    Stopped: 'Detenido',
    'Stopped (Esc)': 'Detenido con Escape',
    'Scene action failed': 'No se completó la acción de escena',
  }),
);
export function mountEyeinskyLanguage() {
  const roots = [
    'eye-display-host',
    'eye-director-host',
    'eye-sensor-host',
    'eye-context-host',
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  function translate(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      if (
        text.parentElement?.matches(
          'input,textarea,script,style,.scene-shot-label,option',
        )
      )
        continue;
      const replacement = copy.get(text.data.trim());
      if (replacement && text.data.trim() !== replacement)
        text.data = replacement;
    }
    for (const element of root.querySelectorAll(
      '[title],[aria-label],[placeholder]',
    ))
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        const value = element.getAttribute(attribute);
        if (copy.has(value)) element.setAttribute(attribute, copy.get(value));
      }
  }
  const observer = new MutationObserver(() => {
    for (const root of roots) translate(root);
  });
  for (const root of roots) {
    translate(root);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  return () => observer.disconnect();
}
