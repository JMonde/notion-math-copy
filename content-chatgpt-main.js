// Math Copy -> Notion | origen: ChatGPT
// Extrae el markdown real del mensaje (con LaTeX intacto) y lo copia
// normalizado a $...$ / $$...$$ para el conversor de Notion.
(() => {
  "use strict";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Extraccion de markdown ----------

  function getRawMarkdown(msgEl) {
    // 0) Capa fuente de escritura de ChatGPT: contiene el markdown REAL del
    //    mensaje con LaTeX intacto ("$n$", \binom, $$ rotas), que el render
    //    (.katex / paneles unicode) ya no conserva. Su texto es la unica
    //    fuente fiable de las formulas.
    const wb = msgEl.querySelector('[data-writing-block]');
    if (wb) {
      const t = (wb.innerText || "").trim().replace(/^Edit\s*\n/i, "");
      if (t.length > 10) return t;
    }

    // 1) Fuente de verdad: atributo data-message-content con {markdown, html}
    const holder = msgEl.hasAttribute("data-message-content")
      ? msgEl
      : msgEl.querySelector("[data-message-content]");
    if (holder && holder.hasAttribute("data-message-content")) {
      try {
        const parsed = JSON.parse(holder.getAttribute("data-message-content"));
        if (parsed && typeof parsed.markdown === "string" && parsed.markdown.trim()) {
          return parsed.markdown;
        }
      } catch (_) {}
    }

    // 2) Reconstruir desde el DOM usando anotaciones de KaTeX
    const mdEl = msgEl.querySelector(
      '.markdown, .prose, [class*="markdown"], [class*="prose"]'
    );
    if (mdEl) return markdownFromDOM(mdEl);

    // 3) Ultimo recurso: texto plano
    return msgEl.innerText.trim();
  }

  function texOf(katexEl) {
    const ann = katexEl.querySelector('annotation[encoding="application/x-tex"]');
    if (ann && ann.textContent.trim()) return ann.textContent.trim();
    const span = katexEl.querySelector(".katex-html");
    if (span && span.dataset.text) return span.dataset.text;
    const al = katexEl.getAttribute("aria-label");
    if (al && /\\[A-Za-z]{2,}/.test(al)) return al.replace(/\s+/g, " ").trim();
    return "";
  }

  function markdownFromDOM(mdEl) {
    const clone = mdEl.cloneNode(true);
    clone.querySelectorAll(".katex-display, [class*='katex-display']").forEach((el) => {
      let t = texOf(el);
      if (!t) {
        const host = el.closest("[aria-label]");
        if (host) {
          const h = host.getAttribute("aria-label") || "";
          if (h && /\\[A-Za-z]{2,}/.test(h) && h.length < 300) t = h.replace(/\s+/g, " ").trim();
        }
      }
      if (!t) return;
      const rep = document.createElement("div");
      rep.textContent = "$$\n" + t + "\n$$";
      el.replaceWith(rep);
    });
    clone.querySelectorAll(".katex").forEach((el) => {
      const t = texOf(el);
      if (!t) return;
      const rep = document.createElement("span");
      rep.textContent = "$" + t + "$";
      el.replaceWith(rep);
    });

    // Morfologia markdown: negrita, cursiva, codigo, enlaces
    const esc = (s) => s;
    clone.querySelectorAll("pre code").forEach((el) => {
      el.replaceWith(document.createTextNode("```\n" + el.textContent + "\n```"));
    });
    clone.querySelectorAll("strong, b").forEach((el) => {
      el.replaceWith(document.createTextNode("**" + esc(el.textContent.trim()) + "**"));
    });
    clone.querySelectorAll("em, i").forEach((el) => {
      el.replaceWith(document.createTextNode("*" + esc(el.textContent.trim()) + "*"));
    });
    clone.querySelectorAll("code").forEach((el) => {
      el.replaceWith(document.createTextNode("`" + el.textContent + "`"));
    });
    clone.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href") || "";
      el.replaceWith(document.createTextNode("[" + esc(el.textContent.trim()) + "](" + href + ")"));
    });
    clone.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));

    // Serializador consciente de bloques: en un CLONE desmontado no hay layout,
    // y innerText se comporta como textContent (sin saltos entre bloques) -> los
    // parrafos se pegan ("PolynomialsBernstein"). Caminamos el arbol e insertamos
    // "\n" en los limites de los elementos de bloque.
    const BLOCK = new Set([
      "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
      "LI", "UL", "OL", "TR", "TD", "TH", "PRE",
      "BLOCKQUOTE", "TABLE", "SECTION", "ARTICLE", "HR",
    ]);
    let out = "";
    const walk = (node, deep) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (BLOCK.has(node.tagName) && deep) {
        if (out && !out.endsWith("\n")) out += "\n";
        node.childNodes.forEach((c) => walk(c, true));
        if (out && !out.endsWith("\n")) out += "\n";
      } else {
        node.childNodes.forEach((c) => walk(c, false));
      }
    };
    walk(clone, true);
    return out
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

// ---------- Portapapeles ----------

  // ---------- Formato chatgpt -> formato Notion ----------
  // El writing-block de ChatGPT delimita cada display con una linea que es
  // exactamente "$$" (closing-only o pares $$ ... $$), y el cuerpo TeX son
  // lineas consecutivas (matematica densa o con comando \). Convertimos por
  // maquina de estados lineal y SIN regex globales ambiguos (que tragaban prosa
  // y dejaban $$ huerfanos). Salida: displays en UNA linea (Notion los
  // convierte nativo solo si no contienen salto de linea).
  function convertWritingBlock(raw) {
    raw = raw.replace(/^Edit\s*\n/i, "");
    const lines = raw.split("\n");
    const out = [];
    let buf = [];
    const flushProse = () => {
      const p = buf
        .filter((b) => b !== null)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (p) out.push(p);
      buf = [];
    };
    const hasTexCmd = (t) => /\\[A-Za-z]/.test(t);
    const isProseLine = (t) => /^[^\\]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/.test(t);
    const isTexContent = (t) =>
      t === "}" ||
      (hasTexCmd(t) && !isProseLine(t)) ||
      (!/\s/.test(t) &&
        (/\d/.test(t) || /[\^_{}]/.test(t)) &&
        /[\[\](){}_^=+.,:<>]/.test(t) &&
        t.length < 90);
    const isAtomicDisplay = (t) => /^\$\$[^$\n]+\$\$$/.test(t);
    const runPlain = (r) => r.body.filter((b) => b !== null).join(" ");
    const emit = (r) => {
      if (r.tex) {
        flushProse();
        out.push("$$" + runPlain(r) + "$$");
      } else buf.push(...r.body.filter((b) => b !== null));
    };

    let run = null;
    for (const raw of lines) {
      const t = raw.trim();
      if (t === "$$") {
        if (run) {
          emit(run);
          run = null;
        } else {
          run = { body: [], tex: 0 };
        }
        continue;
      }
      if (t === "") {
        if (run) run.body.push(null);
        else buf.push("");
        continue;
      }
      if (run) {
        if (isAtomicDisplay(t)) {
          run.body.push(t.slice(2, -2));
          run.tex++;
        } else if (isTexContent(t)) {
          run.body.push(t);
          run.tex++;
        } else {
          emit(run);
          run = null;
          buf.push(t);
        }
        continue;
      }
      if (isAtomicDisplay(t)) {
        flushProse();
        out.push(t);
        continue;
      }
      if (isTexContent(t)) {
        run = { body: [t], tex: 1 };
        continue;
      }
      buf.push(t);
    }
    if (run) emit(run);
    flushProse();

    // Limpieza final: numeracion "cN." de la exportacion + escapes dobles
    return out
      .join("\n\n")
      .replace(/\b(c\d+)\.\s/g, (_, bad) => bad.replace(/^c/, "") + ". ")
      .replace(/\\{2}([()\[\]{}])/g, "\\$1")
      .trim();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      // ChatGPT reescribe el portapapeles de forma diferida tras nuestro
      // keydown; aseguramos que nuestro texto sea el ultimo en quedar.
      setTimeout(() => navigator.clipboard.writeText(text).catch(() => {}), 300);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  // ---------- Interceptor de Ctrl+C ----------
  // Hace que copiar con seleccion de texto (Ctrl+C / menu) conserve
  // el LaTeX: si la seleccion toca una formula, copia el markdown exacto
  // del mensaje (normalizado a $...$ / $$...$$). Asi Ctrl+C en ChatGPT
  // + Ctrl+V en Notion funciona de punta a punta.

  function getSelectedFragmentMarkdown(msgEl) {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return "";
    const range = sel.getRangeAt(0);
    const ca = range.commonAncestorContainer;
    const inside = msgEl.contains(ca) || msgEl.contains(range.startContainer) || msgEl.contains(range.endContainer);
    if (!inside) return "";
    const txt = sel.toString();
    const whole = (msgEl.innerText || "").trim();
    if (txt.length > whole.length * 0.9) return "";
    if (txt.trim().length < 2) return "";
    const frag = range.cloneContents();
    const wrap = document.createElement("div");
    wrap.appendChild(frag);
    wrap.querySelectorAll(".katex-display, [class*='katex-display']").forEach((el) => {
      let t = texOf(el);
      if (!t) {
        const host = el.closest("[aria-label]");
        if (host) {
          const h = host.getAttribute("aria-label") || "";
          if (h && /\\[A-Za-z]{2,}/.test(h) && h.length < 300) t = h.replace(/\s+/g, " ").trim();
        }
      }
      if (!t) return;
      const rep = document.createElement("div");
      rep.textContent = "$$\n" + t + "\n$$";
      el.replaceWith(rep);
    });
    wrap.querySelectorAll(".katex").forEach((el) => {
      if (el.closest(".katex-display, [class*='katex-display']")) return;
      const t = texOf(el);
      if (!t) return;
      const rep = document.createElement("span");
      rep.textContent = "$" + t + "$";
      el.replaceWith(rep);
    });
    wrap.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
    const BLOCK = new Set(["P","DIV","H1","H2","H3","H4","H5","H6","LI","UL","OL","TR","TD","TH","PRE","BLOCKQUOTE","TABLE","SECTION","ARTICLE","HR"]);
    let out = "";
    const walk = (node, deep) => {
      if (node.nodeType === Node.TEXT_NODE) { out += node.nodeValue; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (BLOCK.has(node.tagName) && deep) {
        if (out && !out.endsWith("\n")) out += "\n";
        node.childNodes.forEach((c) => walk(c, true));
        if (out && !out.endsWith("\n")) out += "\n";
      } else node.childNodes.forEach((c) => walk(c, false));
    };
    walk(wrap, true);
    return out.replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  }

  function prepareMarkdown(msgEl) {
    const md = convertWritingBlock(getRawMarkdown(msgEl));
    return md || "";
  }

  function messageFromSelection() {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const root =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!root || !root.closest) return null;
    // Selectores en orden: el DOM de ChatGPT vario a lo largo del tiempo.
    const selMsgs = [
      '[data-message-author-role="assistant"]',
      '[data-message-author-role]',
      '[data-message-role="assistant"]',
      '[data-message-role]',
      '[data-testid*="assistant"]',
      '[data-testid="conversation-turn"]',
      'article[data-msg]',
    ];
    for (const s of selMsgs) {
      const el = root.closest(s);
      if (el) return el;
    }
    // Ultimo recurso: bloque con math visible dentro del area de seleccion.
    return null;
  }

  function buildCopyPayload() {
    const msg = messageFromSelection();
    if (!msg) return "";
    const frag = getSelectedFragmentMarkdown(msg);
    if (frag && frag.trim().length > 0) {
      if (frag.includes("$") || /\\[A-Za-z]/.test(frag)) {
        const norm = convertWritingBlock(frag);
        return norm || frag;
      }
      return frag;
    }
    const md = prepareMarkdown(msg);
    if (!md || !md.includes("$")) return "";
    return md;
  }

  function installCopyInterceptor() {
    document.addEventListener(
      "copy",
      (e) => {
        try {
          const md = buildCopyPayload();
          if (!md) return;
          e.clipboardData.setData("text/plain", md);
          const html = md
            .split("\n")
            .map((l) =>
              l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            )
            .join("<br>\n");
          e.clipboardData.setData("text/html", html);
          e.preventDefault();
          toast("Copiado para Notion \u2713");
        } catch (_) {
          // ante cualquier error dejamos la copia nativa intacta
        }
      },
      true
    );

    // Atajo Ctrl+C: ChatGPT re-escribe el portapapeles por su cuenta (handlers
    // propios en window que ganan al evento "copy"). Para no pelear con ellos,
    // interceptamos la tecla ANTES y escribimos nosotros directamente.
    document.addEventListener(
      "keydown",
      (e) => {
        if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== "c")) return;
        const md = buildCopyPayload();
        if (!md) {
          const msg = messageFromSelection();
          const fallback = msg && prepareMarkdown(msg);
          if (!fallback || !fallback.includes("$")) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          copyText(fallback).then((ok) => toast(ok ? "Copiado para Notion \u2713" : "Fallo al copiar"));
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        copyText(md).then((ok) =>
          toast(ok ? "Copiado para Notion \u2713" : "Fallo al copiar")
        );
      },
      true
    );

    // (MAIN: sin ganchos de test del harness)
  }

  function toast(msg, ms = 2600) {
    let t = document.querySelector(".nmc-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "nmc-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), ms);
  }

  async function copyMessage(msgEl, btn) {
    const md = prepareMarkdown(msgEl);
    if (!md) {
      toast("No se pudo leer el mensaje");
      return;
    }
    const ok = await copyText(md);
    toast(ok ? "Copiado para Notion \u2713" : "Fallo al copiar");
  }

  function ensureButtons() {
    const slate = document.querySelector("main[role='main'] ~ * input, main");
    void slate;
    document.querySelectorAll('[data-message-author-role="assistant"]').forEach((msg) => {
      if (msg.querySelector(":scope > .nmc-copy-btn")) return;
      if (getComputedStyle(msg).position === "static") msg.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "nmc-copy-btn";
      btn.type = "button";
      btn.title = "Copiar para Notion (texto + LaTeX exacto)";
      btn.setAttribute("aria-label", "Copiar para Notion");
      btn.textContent = "\u03A3";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyMessage(msg, btn);
      });
      msg.appendChild(btn);
    });
  }

  function init() {
    installCopyInterceptor();
    ensureButtons();
    new MutationObserver(() => ensureButtons()).observe(
      document.body,
      { childList: true, subtree: true }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();