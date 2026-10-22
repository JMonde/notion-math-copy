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
    // 1) Fuente de verdad: atributo data-message-content con {markdown, html} (preserva **bold**, *italic*, etc.)
    const holder0 = msgEl.hasAttribute("data-message-content")
      ? msgEl
      : msgEl.querySelector("[data-message-content]");
    if (holder0 && holder0.hasAttribute("data-message-content")) {
      try {
        const parsed = JSON.parse(holder0.getAttribute("data-message-content"));
        if (parsed && typeof parsed.markdown === "string" && parsed.markdown.trim()) {
          return parsed.markdown;
        }
      } catch (_) {}
    }

    // 0) Fallback escritura: contiene LaTeX intacto si data-message-content no está
    const wb = msgEl.querySelector('[data-writing-block]');
    if (wb) {
      const t = (wb.innerText || "").trim().replace(/^Edit\s*\n/i, "");
      if (t.length > 10) return t;
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
      rep.textContent = "$$" + t.replace(/\s+/g, " ").trim() + "$$";
      el.replaceWith(rep);
    });
    clone.querySelectorAll(".katex").forEach((el) => {
      const t = texOf(el);
      if (!t) return;
      const rep = document.createElement("span");
      rep.textContent = "$" + t.replace(/\s+/g, " ").trim() + "$";
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

  // ---------- Saneado de portapapeles (anti-carrera) ----------
  // ChatGPT reescribe el portapapeles con su markdown CRUDO (\\[ .. \\]) unos
  // ms despues de Ctrl+C. Si esa escritura gana la carrera, la sustitucion
  // \\[\\] -> $$ se pierde y Obsidian vuelve a recibir \\[ .. \\]. Defensa en
  // capas: saneamos cualquier texto ANTES de salir hacia el portapapeles, y el
  // saneado es idempotente (normalizar dos veces no rompe nada), asi que la
  // reescritura tardia de ChatGPT no puede deshacer la sustitucion.
  const TEX_DELIM = /\\[\[\]()]/;

  function sanitizeClipboardText(text) {
    if (typeof text !== "string" || !TEX_DELIM.test(text)) return text;
    return normalizeLatexDelimiters(text);
  }

  function patchClipboard() {
    const clip = navigator.clipboard;
    if (!clip || clip.__nmcPatched) {
      nmcLog("patchClipboard: omitido (sin clipboard o ya parcheado)");
      return;
    }
    try {
      const origWriteText = clip.writeText.bind(clip);
      const patched = (text) => origWriteText(sanitizeClipboardText(text));
      Object.defineProperty(clip, "writeText", {
        value: patched,
        writable: true,
        configurable: true,
      });
      clip.__nmcPatched = true;
      nmcLog("patchClipboard: writeText parcheado (saneado activo)");
    } catch (err) {
      nmcLog("patchClipboard: no se pudo parchar", String(err));
      // Seguimos con las otras defensas (copy + keydown).
    }
  }

  // ---------- Normalizacion de delimitadores LaTeX ----------
  // ChatGPT emite \[...\] (display) y \(...\) (inline). Notion solo entiende
  // $$...$$ (display, en UNA linea) y $...$ (inline). Sin esto, las lineas
  // \[...\] se envolvian como $$\[...\]$$ y Notion no renderizaba (bad paste).
  // Ej: \[ L(s,\chi)=\sum... \] -> $$L(s,\chi)=\sum...$$
  function normalizeLatexDelimiters(raw) {
    if (!raw || raw.indexOf("\\") === -1) return raw;
    const parts = raw.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
    for (let i = 0; i < parts.length; i += 2) {
      let t = parts[i];
      if (!t || t.indexOf("\\") === -1) continue;
      t = t.replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (_, inner) => {
        const one = inner.replace(/\s+/g, " ").trim();
        return one ? "$$" + one + "$$" : "";
      });
      t = t.replace(/(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g, (_, inner) => {
        const one = inner.replace(/\s+/g, " ").trim();
        return one ? "$" + one + "$" : "";
      });
      // Restos sin pareja (mensaje truncado): no dejar \[ \] \( \) a Notion.
      // En replacement "$$" = "$" literal y "$$$$" = "$$" literal.
      t = t.replace(/(?<!\\)\\\[/g, "$$$$").replace(/(?<!\\)\\\]/g, "$$$$");
      t = t.replace(/(?<!\\)\\\(/g, "$$").replace(/(?<!\\)\\\)/g, "$$");
      // Displays $$...$$ a UNA linea y sin espacios en bordes (Notion lo exige
      // para convertir a bloque nativo). [^$] no cruza otros delimitadores.
      t = t.replace(/\$\$\s*([^$]+?)\s*\$\$/g, (_, m) => "$$" + m.replace(/\s+/g, " ").trim() + "$$");
      // Displays embebidos en prosa -> su propia linea (Notion exige bloque solo).
      t = t.replace(/([^\n])(\$\$[^$\n]+?\$\$)/g, "$1\n$2");
      t = t.replace(/(\$\$[^$\n]+?\$\$)([^\n])/g, "$1\n$2");
      parts[i] = t;
    }
    return parts.join("");
  }

  // ---------- Formato chatgpt -> formato Notion ----------
  // El writing-block de ChatGPT delimita cada display con una linea que es
  // exactamente "$$" (closing-only o pares $$ ... $$), y el cuerpo TeX son
  // lineas consecutivas (matematica densa o con comando \). Convertimos por
  // maquina de estados lineal y SIN regex globales ambiguos (que tragaban prosa
  // y dejaban $$ huerfanos). Salida: displays en UNA linea (Notion los
  // convierte nativo solo si no contienen salto de linea).
  function convertWritingBlock(raw) {
    raw = raw.replace(/^Edit\s*\n/i, "");
    raw = normalizeLatexDelimiters(raw);
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
    const isProseLine = (t) => {
      const before = t.split("\\")[0];
      const words = before.match(/\b[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}\b/g);
      return words ? words.length >= 2 : false;
    };
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
      // Lineas con $ ya normalizadas ($...$ inline o $$...$$ display):
      // preservarlas tal cual. Sin esto, una prosa con inline como
      // "El factor es $\log...$ en la cota" se envolvia como
      // "$$El factor es $\log...$ en la cota$$" y "$\chi_3$" como "$$$\chi_3$$$".
      if (t.includes("$")) {
        if (isAtomicDisplay(t)) {
          flushProse();
          out.push("$$" + t.slice(2, -2).replace(/\s+/g, " ").trim() + "$$");
        } else {
          if (run) {
            emit(run);
            run = null;
          }
          buf.push(t);
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

    // Limpieza final: numeracion "cN." + escapes dobles + fix S_n Poisson (ChatGPT renderiza e^{-nx} como Unicode)
    let res = out
      .join("\n\n")
      .replace(/\b(c\d+)\.\s/g, (_, bad) => bad.replace(/^c/, "") + ". ")
      .replace(/\\{2}([()\[\]{}])/g, "\\$1")
      .trim();
    res = res.replace(/Sn\(f\)\(x\)\s*=\s*e[−–—]nxk=0[^\n]*?k!\(nx\)k\.?/g, "S_n(f)(x) = e^{-nx} \\sum_{k=0}^{\\infty} f\\left(\\frac{k}{n}\\right) \\frac{(nx)^k}{k!}");
    res = res.replace(/S_?n\(f\)\(x\)\s*=\s*e[−–—\-]?n\s*x\s*k\s*=\s*0[^\$]*?\(nx\)\s*\^?\s*k[^\n]*?/g, "S_n(f)(x) = e^{-nx} \\sum_{k=0}^{\\infty} f\\left(\\frac{k}{n}\\right) \\frac{(nx)^k}{k!}");
    return res;
  }

  async function copyText(text) {
    // Saneado idempotente: gana quien escriba ultimo en el portapapeles,
    // pero ya con \[.. \] convertido a $$ .. $$ por la defensa anti-carrera.
    text = sanitizeClipboardText(text);
    try {
      await navigator.clipboard.writeText(text);
      // ChatGPT reescribe el portapapeles de forma diferida tras nuestro
      // keydown; re-escribimos en ventanas tardias para quedarnos los ultimos.
      setTimeout(() => navigator.clipboard.writeText(text).catch(() => {}), 300);
      setTimeout(() => navigator.clipboard.writeText(text).catch(() => {}), 1200);
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
      rep.textContent = "$$" + t.replace(/\s+/g, " ").trim() + "$$";
      el.replaceWith(rep);
    });
    wrap.querySelectorAll(".katex").forEach((el) => {
      if (el.closest(".katex-display, [class*='katex-display']")) return;
      const t = texOf(el);
      if (!t) return;
      const rep = document.createElement("span");
      rep.textContent = "$" + t.replace(/\s+/g, " ").trim() + "$";
      el.replaceWith(rep);
    });
    wrap.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
    const esc = (s) => s;
    wrap.querySelectorAll("pre code").forEach((el) => el.replaceWith(document.createTextNode("```\n" + el.textContent + "\n```")));
    wrap.querySelectorAll("strong, b").forEach((el) => el.replaceWith(document.createTextNode("**" + esc(el.textContent.trim()) + "**")));
    wrap.querySelectorAll("em, i").forEach((el) => el.replaceWith(document.createTextNode("*" + esc(el.textContent.trim()) + "*")));
    wrap.querySelectorAll("code").forEach((el) => { if (el.closest("pre")) return; el.replaceWith(document.createTextNode("`" + el.textContent + "`")); });
    wrap.querySelectorAll("a").forEach((el) => { const href = el.getAttribute("href") || ""; el.replaceWith(document.createTextNode("[" + esc(el.textContent.trim()) + "](" + href + ")")); });
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
    if (root && root.closest) {
      // Selectores en orden: el DOM de ChatGPT vario a lo largo del tiempo.
      const selMsgs = [
        '[data-message-author-role="assistant"]',
        '[data-message-author-role]',
        '[data-message-role="assistant"]',
        '[data-message-role]',
        '[data-testid*="assistant"]',
        '[data-testid="conversation-turn"]',
        'article[data-msg]',
        'article',
      ];
      for (const s of selMsgs) {
        const el = root.closest(s);
        if (el) {
          nmcLog("messageFromSelection: selector " + s);
          return el;
        }
      }
    }
    // Fallback A: el mensaje que intersecta con la seleccion.
    try {
      const cands = document.querySelectorAll(
        '[data-message-author-role="assistant"], [data-message-author-role], article'
      );
      for (const el of cands) {
        try {
          if (range.intersectsNode(el)) {
            nmcLog("messageFromSelection: intersectsNode");
            return el;
          }
        } catch (_) {}
      }
    } catch (_) {}
    // Fallback B: subir desde el ancla hasta el contenedor con mates.
    // No depende de atributos data-* ni de <article>: sobrevive a redisenos
    // del DOM de ChatGPT.
    try {
      let n = range.commonAncestorContainer;
      let guard = 0;
      while (n && guard++ < 18) {
        const el = n.nodeType === 1 ? n : n.parentElement;
        if (!el || !el.querySelector || !el.matches) break;
        if (el.tagName === "MAIN" || el.tagName === "BODY" || el.tagName === "HTML") break;
        if (
          el.matches(
            '.katex, [data-message-content], [data-writing-block], [class*="markdown"], [class*="prose"]'
          ) ||
          el.querySelector(
            '.katex, annotation[encoding="application/x-tex"], [data-message-content], [data-writing-block], [class*="markdown"], [class*="prose"]'
          )
        ) {
          nmcLog("messageFromSelection: contenedor-con-mates (subida " + guard + " niveles)");
          return el;
        }
        n = el.parentElement;
      }
    } catch (_) {}
    nmcLog("messageFromSelection: sin mensaje (selectores + intersectsNode + subida fallaron)");
    return null;
  }

  // Inspector del DOM real: ejecutar __NMC.inspect() en la consola (F12)
  // con el texto ya seleccionado y pegar el resultado en el chat.
  function nmcInspect() {
    const out = {
      url: location.href,
      version: typeof NMC_VERSION !== "undefined" ? NMC_VERSION : "?",
      articles: document.querySelectorAll("article").length,
      msgRole: document.querySelectorAll("[data-message-author-role]").length,
      msgContent: document.querySelectorAll("[data-message-content]").length,
      writingBlock: document.querySelectorAll("[data-writing-block]").length,
      katex: document.querySelectorAll(".katex").length,
      katexDisplay: document.querySelectorAll(".katex-display").length,
    };
    const sel = document.getSelection();
    out.selection = !sel
      ? "sin getSelection"
      : {
          rangeCount: sel.rangeCount,
          collapsed: sel.isCollapsed,
          text: sel.toString().slice(0, 200),
        };
    const chain = [];
    try {
      if (sel && sel.rangeCount) {
        let n = sel.getRangeAt(0).commonAncestorContainer;
        let guard = 0;
        while (n && guard++ < 14) {
          if (n.nodeType === 1) {
            const attrs = {};
            for (const a of Array.from(n.attributes || [])) {
              if (
                a.name.indexOf("data-") === 0 ||
                a.name === "id" ||
                a.name === "role" ||
                a.name === "class"
              ) {
                attrs[a.name] = String(a.value).slice(0, 100);
              }
            }
            chain.push(n.tagName + " " + JSON.stringify(attrs));
          } else if (n.nodeType === 3) {
            chain.push('#text "' + String(n.nodeValue).slice(0, 40) + '"');
          } else if (n.nodeType === 11) {
            chain.push("#shadow-root");
          }
          const rn = n.getRootNode ? n.getRootNode() : null;
          const up = n.parentNode || (rn && rn.host);
          if (!up || up.nodeType === 9) {
            chain.push(up ? "#document" : "(null)");
            break;
          }
          n = up;
        }
      }
    } catch (err) {
      chain.push("error: " + String(err));
    }
    out.chain = chain;
    try {
      console.log("[NMC] inspect", JSON.stringify(out, null, 2));
    } catch (_) {}
    nmcLog("inspect listo: pega este objeto en el chat", out);
    return out;
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
          if (!md) {
            nmcLog("copy: sin payload (no hay mensaje o no hay $) - dejo copia nativa");
            return;
          }
          const clean = sanitizeClipboardText(md);
          e.clipboardData.setData("text/plain", clean);
          const html = clean
            .split("\n")
            .map((l) =>
              l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            )
            .join("<br>\n");
          e.clipboardData.setData("text/html", html);
          e.preventDefault();
          {
            const c = nmcReport("copy: interceptado", clean, "copy-event");
            if (c.residue) {
              toast("NMC Advertencia: copiado pero quedan restos sin convertir (F12, consola [NMC])", "warn");
            } else {
              toast("NMC copiado (" + c.dispOut + " display $$)", "ok");
            }
          }
        } catch (_) {
          // ante cualquier error dejamos la copia nativa intacta
        }
      },
      true
    );

    // Red de seguridad (burbuja, corre DESPUES que los handlers de la pagina):
    // si ChatGPT llego a escribir \[ .. \] crudo en el portapapeles del propio
    // evento, lo saneamos aqui igualmente.
    document.addEventListener("copy", (e) => {
      try {
        const raw = e.clipboardData && e.clipboardData.getData("text/plain");
        const clean = sanitizeClipboardText(raw);
        if (clean && clean !== raw) {
          e.clipboardData.setData("text/plain", clean);
          e.preventDefault();
          nmcReport("copy: red de seguridad (burbuja) saneo restos", clean, "copy-bubble");
        }
      } catch (_) {}
    });

    // Atajo Ctrl+C: ChatGPT re-escribe el portapapeles por su cuenta (handlers
    // propios en window que ganan al evento "copy"). Para no pelear con ellos,
    // interceptamos la tecla ANTES y escribimos nosotros directamente.
    document.addEventListener(
      "keydown",
      (e) => {
        const kcKey = String(e.key || "").toLowerCase();
        if (!(e.ctrlKey || e.metaKey) || kcKey !== "c") return;
        if (e.shiftKey || e.altKey) return; // no robar Ctrl+Shift+C (DevTools)
        const md = buildCopyPayload();
        if (!md) {
          const msg = messageFromSelection();
          const fallback = msg && prepareMarkdown(msg);
          if (!fallback || fallback.indexOf("$") === -1) {
            const selTxt = document.getSelection() ? document.getSelection().toString() : "";
            nmcLog("keydown: sin payload", { hasMsg: !!msg, selLen: selTxt.length, selPreview: selTxt.slice(0, 80) });
            if (msg || /\\|\$\$/.test(selTxt)) {
              toast("NMC Advertencia: no pude extraer formulas, copia nativa (F12, consola [NMC])", "warn");
            }
            return;
          }
          e.preventDefault();
          e.stopImmediatePropagation();
          copyText(fallback).then((ok) => {
            const c = nmcReport("keydown: copiado (fallback mensaje)", fallback, "keydown-fallback");
            toast(ok ? ("NMC copiado (" + c.dispOut + " display)") : "NMC Error: fallo al copiar", ok ? "ok" : "err");
          });
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        copyText(md).then((ok) => {
          const c = nmcReport("keydown: copiado", md, "keydown");
          if (!ok) {
            toast("NMC Error: fallo al copiar", "err");
          } else if (c.residue) {
            toast("NMC Advertencia: copiado pero quedan restos sin convertir (F12, consola [NMC])", "warn");
          } else {
            toast("NMC copiado (" + c.dispOut + " display $$)", "ok");
          }
        });
      },
      true
    );

    // Gancho de test del harness: replica buildCopyPayload() sin tocar el
    // portapapeles (los ClipboardEvent sinteticos no permiten setData).
    document.addEventListener(
      "nmc:testcopy",
      () => {
        const out = document.createElement("div");
        out.id = "nmc-test-out";
        const md = buildCopyPayload();
        out.dataset.has = String(md !== "");
        out.dataset.found = String(md !== "");
        out.dataset.md = md;
        document.querySelector("#nmc-test-out")?.remove();
        document.body.appendChild(out);
      },
      true
    );

    // Gancho de test: formato chatgpt -> formato Notion.
    document.addEventListener(
      "nmc:norm",
      (e) => {
        const out = document.createElement("div");
        out.id = "nmc-norm-out";
        const raw = e.detail?.arg || "";
        out.dataset.result = convertWritingBlock(raw);
        document.querySelector("#nmc-norm-out")?.remove();
        document.body.appendChild(out);
      },
      true
    );
  }

  // ---------- Diagnostico visual + logs ----------
  // Todo lo que hace la extension deja rastro: consola (filtro "[NMC]"),
  // toast en pagina y objeto window.__NMC (ultima copia + funcion test).
  const NMC_VERSION = "1.1.0";

  function nmcLog(stage, data) {
    try {
      if (data === undefined) console.log("[NMC]", stage);
      else console.log("[NMC]", stage, data);
    } catch (_) {}
  }

  function countMath(text) {
    const s = text || "";
    return {
      dispIn: (s.match(/\\\[/g) || []).length,
      inlIn: (s.match(/\\\(/g) || []).length,
      dispOut: (s.match(/\$\$[^$\n]+?\$\$/g) || []).length,
      residue: /\\\[|\\\]|\\\(|\\\)/.test(s),
    };
  }

  function nmcReport(what, md, source) {
    const c = countMath(md);
    const info = {
      time: new Date().toISOString(),
      what,
      source: source || "",
      chars: (md || "").length,
      dispIn: c.dispIn,
      inlIn: c.inlIn,
      dispOut: c.dispOut,
      residue: c.residue,
      preview: (md || "").slice(0, 160),
    };
    try {
      window.__NMC = window.__NMC || {};
      window.__NMC.last = info;
    } catch (_) {}
    nmcLog(what, info);
    return c;
  }

  function toast(msg, kind, ms) {
    if (typeof kind === "number") {
      ms = kind;
      kind = "ok";
    }
    kind = kind || "ok";
    ms = ms || (kind === "err" ? 5000 : 3200);
    let t = document.querySelector(".nmc-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "nmc-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove("nmc-ok", "nmc-warn", "nmc-err");
    t.classList.add("show", "nmc-" + kind);
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), ms);
    nmcLog("toast", kind + ": " + msg);
  }

  async function copyMessage(msgEl, btn) {
    const md = prepareMarkdown(msgEl);
    if (!md) {
      toast("NMC Error: no se pudo leer el mensaje", "err");
      nmcLog("boton: prepareMarkdown vacio");
      return;
    }
    const ok = await copyText(md);
    {
      const c = nmcReport("boton: copiado", md, "button");
      toast(ok ? ("NMC copiado (" + c.dispOut + " display)") : "NMC Error: fallo al copiar", ok ? "ok" : "err");
    }
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
    patchClipboard();
    installCopyInterceptor();
    ensureButtons();
    try {
      window.__NMC = window.__NMC || {};
      window.__NMC.version = NMC_VERSION;
      window.__NMC.test = (s) => sanitizeClipboardText(convertWritingBlock(String(s)));
      window.__NMC.rescan = () => {
        ensureButtons();
        return document.querySelectorAll(".nmc-copy-btn").length;
      };
      window.__NMC.inspect = nmcInspect;
    } catch (_) {}
    nmcLog("activo v" + NMC_VERSION + " en " + location.href);
    toast("NMC activo - selecciona formulas y Ctrl+C (F12, [NMC] para detalle)", "ok");
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