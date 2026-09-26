/** DOM helpers shared by the EYEINSKY shell modules. */
export const $ = (id) => document.getElementById(id);

/**
 * Crea un elemento con texto y clase opcionales.
 * @param {string} tag Etiqueta.
 * @param {string} [text] Texto.
 * @param {string} [className] Clase.
 * @returns {HTMLElement} Elemento nuevo.
 */
export const node = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
