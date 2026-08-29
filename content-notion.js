(() => {
  "use strict";
  // Notion convierte nativamente al pegar:
  //   - "$$...$$" en una sola linea  -> bloque de ecuacion (display)
  //   - "$...$" dentro de prosa      -> ecuacion inline
  // El pipeline de copia (content-chatgpt.js / content-chatgpt-main.js) ya
  // normaliza el clipboard a ese formato exacto: displays balanceados en una
  // sola linea, inline con un solo "$", sin texto pegado a las formulas.
  // Aqui NO hacemos nada: dejar que Notion aplique sus reglas nativas.
})();