# P5 · Móvil: lo medido y el límite declarado (P5-17)

Fecha: 2026-09-25. Reparación de la auditoría T8 (antes de T10).

## Lo medido

Se midió con Chrome headless emulando el móvil (`isMobile`, `hasTouch`, DPR 2) contra el Vite dev de `http://127.0.0.1:4204/`. Arnés: `scripts/eyeinsky-p5.mjs`.

- **390×844.** Hay 7 comprobaciones:
  - `mobile-390x844-targets`: la cabecera del dock, con objetivos ≥ 44 px y texto ≥ 13 px;
  - `mobile-390x844-active-layer-off`: cada «Apagar» de la lista Activas, con la Luna encendida, se toca en su centro;
  - `mobile-keyboard-focus`: el foco no cae en `<body>` tras APUNTAR y VOLVER;
  - `mobile-system-frames-or-warns`;
  - `reduced-motion-cuts`;
  - `zoom-200-time-strip`;
  - p31 en 390×844 y 844×390.
- **Chip TIEMPO (§6).** En la cabecera compacta, un chip («◆ SIM 07-OCT 03:12 ×3600», «● VIVO 14:32 UTC», «❚❚ PAUSA 14-MAR 06:00») abre la hoja con PAUSA, AVANCE, AHORA y FECHA, todos ≥ 44 px. El chip lleva `aria-expanded`, y Esc cierra la hoja y devuelve el foco al chip.

## Límite declarado: teléfono físico

**No se ha probado en un teléfono físico.** No se usó ningún dispositivo iOS ni Android: toda la evidencia de móvil es emulación de Chrome en la GPD (SwiftShader o ANGLE). Por eso quedan sin verificar:

- el tacto real (tamaño del dedo, gestos del sistema y zonas seguras de muesca o barra);
- Safari iOS: el zoom al enfocar el campo de fecha (mitigado con 16 px en `pointer: coarse`), `100dvh` y el teclado virtual sobre el dock;
- el rendimiento y la memoria de la textura LROC 1k en una GPU móvil. No se afirma ninguna cifra;
- lectores de pantalla móviles (VoiceOver y TalkBack). Solo se comprobaron el orden de foco y los `aria-*` en el DOM.

Para cerrar este límite hace falta una sesión en un teléfono real, con orden aparte.
