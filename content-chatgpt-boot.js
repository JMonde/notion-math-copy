// Math Copy -> Notion | boot: inyecta content-chatgpt-main.js en el mundo
// MAIN lo antes posible (document_start). Brave no respeta "world":"MAIN" en
// el manifest (lo ignora y el script quedaria en mundo aislado, perdiendo la
// carrera contra los listeners de Ctrl+C de ChatGPT). Con un <script> normal
// el codigo corre en el mundo principal ANTES del bundle de la pagina.
(() => {
  try {
    if (document.getElementById("nmc-main-inject")) return;
    const s = document.createElement("script");
    s.id = "nmc-main-inject";
    s.src = chrome.runtime.getURL("content-chatgpt-main.js");
    (document.head && document.head.firstChild
      ? document.head
      : document.documentElement
    ).appendChild(s);
  } catch (_) {}
})();