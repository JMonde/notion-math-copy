(() => {
  "use strict";
  function wrapOrphans(r){
    // Huerfanos de Google AI: \{a_1, \dots, a_n\} sin \(...\) -> $\{...\}$
    // Solo fuera de mate ya delimitado (\(...\), \[...\], $...$, $$...$$).
    const toks=r.split(/(\$\$[^$\n]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g);
    for(let k=0;k<toks.length;k+=2){
      let s=toks[k];
      if(!s||s.indexOf("\\")===-1) continue;
      s=s.replace(/\\\{(.{1,300}?)\\\}/g,(m,inner)=>{
        if(!inner) return m;
        if(!/_|\^|\\(?:dots|ldots|cdots|text|gcd|ne|quad|frac|sum|prod|sqrt|times|cdot|leq|geq|infty|alpha|beta|gamma|in|for|all)/.test(inner)) return m;
        return "$"+m+"$";
      });
      toks[k]=s;
    }
    return toks.join("");
  }
  function conv(t){
    if(!t||t.indexOf("\\")===-1) return t;
    const parts=t.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
    for(let i=0;i<parts.length;i+=2){
      let r=parts[i];
      if(!r||r.indexOf("\\")===-1) continue;
      r=wrapOrphans(r);
      // Pares: \[...\] -> $$...$$ (display, una linea), \(...\) -> $...$ (inline)
      r=r.replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g,(_,m)=>{ const one=m.replace(/\s+/g," ").trim(); return one?"$$"+one+"$$":""; });
      r=r.replace(/(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g,(_,m)=>{ const one=m.replace(/\s+/g," ").trim(); return one?"$"+one+"$":""; });
      // Restos sin pareja: \[ \] -> $$, \( \) -> $ ("$$" en replacement = "$" literal)
      r=r.replace(/(?<!\\)\\\[/g,"$$$$").replace(/(?<!\\)\\\]/g,"$$$$");
      r=r.replace(/(?<!\\)\\\(/g,"$$").replace(/(?<!\\)\\\)/g,"$$");
      // Colapsa displays a una linea (Notion lo exige) y separa embebidos
      r=r.replace(/\$\$\s*([^$]+?)\s*\$\$/g,(_,m)=>"$$"+m.replace(/\s+/g," ").trim()+"$$");
      r=r.replace(/([^\n])(\$\$[^$\n]+?\$\$)/g,"$1\n$2");
      r=r.replace(/(\$\$[^$\n]+?\$\$)([^\n])/g,"$1\n$2");
      parts[i]=r;
    }
    return parts.join("");
  }
  function patchClipboard(){
    try{
      const c=navigator.clipboard;
      if(!c) return;
      if(!c._nmcPatched){
        const orig=c.writeText.bind(c);
        c.writeText=async (txt)=>{
          try{
            const n=conv(txt);
            if(n!==txt) txt=n;
          }catch(_){}
          return orig(txt);
        };
        c._nmcPatched=true;
      }
      // Boton "copiar" de Google AI: escribe via ClipboardItem (write), no writeText.
      if(!c._nmcPatchedW&&c.write){
        const origW=c.write.bind(c);
        c.write=async (items)=>{
          try{
            const out=[];
            for(const it of (items||[])){
              let done=false;
              try{
                if(it&&it.types&&it.types.indexOf("text/plain")!==-1){
                  const blob=await it.getType("text/plain");
                  const txt=await blob.text();
                  const n=conv(txt);
                  if(n&&n!==txt){
                    const rec={};
                    try{
                      for(const tp of it.types){
                        if(tp==="text/plain") continue;
                        try{ rec[tp]=await it.getType(tp); }catch(_){}
                      }
                    }catch(_){}
                    rec["text/plain"]=new Blob([n],{type:"text/plain"});
                    out.push(new ClipboardItem(rec));
                    done=true;
                  }
                }
              }catch(_){}
              if(!done) out.push(it);
            }
            return origW(out);
          }catch(_){ return origW(items); }
        };
        c._nmcPatchedW=true;
      }
    }catch(_){}
  }
  patchClipboard(); setInterval(patchClipboard,1500);
  function texOf(el){
    try{
      const ann=el.querySelector&&el.querySelector('annotation[encoding="application/x-tex"]');
      if(ann&&ann.textContent.trim()) return ann.textContent.trim();
      for(const a of ["data-tex","data-latex","data-math"]){
        const v=el.getAttribute&&el.getAttribute(a);
        if(v&&v.indexOf("\\")!==-1&&v.length<800) return v.replace(/\s+/g," ").trim();
      }
      const al=el.getAttribute&&el.getAttribute("aria-label");
      if(al&&/\\[A-Za-z]{2,}/.test(al)&&al.length<800) return al.replace(/\s+/g," ").trim();
    }catch(_){}
    return "";
  }
  // Serializador consciente de bloques: en un clon DESMONTADO no hay layout
  // e innerText se comporta como textContent (pega "if:$\text{gcd}..." sin
  // salto). Caminamos el arbol e insertamos "\n" en los limites de bloque.
  function blockText(root){
    const BLOCK = new Set(["P","DIV","H1","H2","H3","H4","H5","H6","LI","UL","OL","TR","TD","TH","PRE","BLOCKQUOTE","TABLE","SECTION","ARTICLE","HR","BR"]);
    let out = "";
    const walk = (node, deep) => {
      if(!node) return;
      if(node.nodeType === 3){ out += node.nodeValue; return; }
      if(node.nodeType !== 1) return;
      if(node.tagName === "BR"){ out += "\n"; return; }
      if(BLOCK.has(node.tagName) && deep){
        if(out && out.charAt(out.length-1) !== "\n") out += "\n";
        const kids = node.childNodes;
        for(let i=0;i<kids.length;i++) walk(kids[i], true);
        if(out && out.charAt(out.length-1) !== "\n") out += "\n";
      } else {
        const kids = node.childNodes;
        for(let i=0;i<kids.length;i++) walk(kids[i], false);
      }
    };
    walk(root, true);
    return out.replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  }
  function fragmentMath(){
    try{
      const s=window.getSelection();
      if(!s||!s.rangeCount||s.isCollapsed) return "";
      const frag=s.getRangeAt(0).cloneContents();
      const d=document.createElement("div");
      d.appendChild(frag);
      d.querySelectorAll(".katex-display, mjx-container[display='true'], mjx-container[jax='CHTML'][display='true']").forEach((el)=>{
        const t=texOf(el)||texOf(el.parentElement||{});
        if(!t) return;
        el.replaceWith(document.createTextNode("$$"+t.replace(/\s+/g," ").trim()+"$$"));
      });
      d.querySelectorAll("annotation[encoding='application/x-tex']").forEach((ann)=>{
        const t=(ann.textContent||"").trim();
        if(!t) return;
        const host=ann.closest(".katex-display, mjx-container, math, span, div")||ann;
        const isDisp=host&&(host.className||"").toString().indexOf("display")!==-1||(host.getAttribute&&host.getAttribute("display")==="block");
        host.replaceWith(document.createTextNode(isDisp?"$$"+t+"$$":"$"+t+"$"));
      });
      d.querySelectorAll(".katex, mjx-container, math, [data-tex], [data-latex]").forEach((el)=>{
        if(el.textContent&&el.textContent.indexOf("$$")!==-1) return;
        const t=texOf(el);
        if(!t) return;
        el.replaceWith(document.createTextNode("$"+t.replace(/\s+/g," ").trim()+"$"));
      });
      // Morfologia markdown (como ChatGPT): codigo, negrita, cursiva, enlaces
      d.querySelectorAll("pre").forEach((el)=>{
        el.replaceWith(document.createTextNode("```\n"+(el.textContent||"")+"\n```"));
      });
      d.querySelectorAll("strong, b").forEach((el)=>{
        const t=(el.textContent||"").trim();
        if(!t) return;
        el.replaceWith(document.createTextNode("**"+t+"**"));
      });
      d.querySelectorAll("em, i").forEach((el)=>{
        const t=(el.textContent||"").trim();
        if(!t) return;
        el.replaceWith(document.createTextNode("*"+t+"*"));
      });
      d.querySelectorAll("code").forEach((el)=>{
        el.replaceWith(document.createTextNode("`"+(el.textContent||"")+"`"));
      });
      d.querySelectorAll("a").forEach((el)=>{
        const href=(el.getAttribute&&el.getAttribute("href"))||"";
        const t=(el.textContent||"").trim();
        if(!t) return;
        el.replaceWith(document.createTextNode(href?"["+t+"]("+href+")":t));
      });
      const txt=blockText(d);
      if(txt) return txt;
    }catch(_){}
    return "";
  }
  function selText(){
    try{
      const fm=fragmentMath();
      if(fm) return fm;
      const s=window.getSelection();
      if(s&&!s.isCollapsed&&s.toString()) return s.toString();
      if(s&&s.rangeCount){
        const c=s.getRangeAt(0).cloneContents();
        const d=document.createElement("div");
        d.appendChild(c);
        return blockText(d);
      }
    }catch(_){}
    return "";
  }
  function plainSelText(){
    try{
      const s=window.getSelection();
      if(!s||s.isCollapsed) return "";
      return s.toString()||"";
    }catch(_){ return ""; }
  }
  function hasMdFmt(t){
    return /\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|(?:^|[^\w*])\*[^*\n]{1,80}\*(?=[^\w*]|$)/.test(t);
  }
  function buildOut(raw){
    if(!raw) return "";
    const n=conv(raw);
    if(n&&n!==raw) return n;
    if(hasMdFmt(raw)&&raw!==plainSelText()) return raw;
    return "";
  }
  function onCopy(e){
    try{
      let raw=selText();
      let fromEvent=false;
      if(!raw&&e.clipboardData){ raw=e.clipboardData.getData("text/plain")||""; fromEvent=true; }
      if(!raw) return;
      let out=buildOut(raw);
      if(!out){
        // Ultimo recurso: sanear restos crudos del evento
        if(fromEvent&&raw.indexOf("\\")!==-1){
          const n=conv(raw);
          if(n&&n!==raw) out=n;
        }
        if(!out) return;
      }
      if(e.clipboardData){
        e.clipboardData.setData("text/plain", out);
        try{ e.clipboardData.setData("text/html", out); }catch(_){}
        e.preventDefault();
        e.stopImmediatePropagation();
        setTimeout(()=>{ try{ navigator.clipboard.writeText(out).catch(()=>{});}catch(_){} },80);
        setTimeout(()=>{ try{ navigator.clipboard.writeText(out).catch(()=>{});}catch(_){} },380);
      }
    }catch(_){}
  }
  document.addEventListener("copy", onCopy, true);
  window.addEventListener("copy", onCopy, true);
  document.addEventListener("beforecopy", onCopy, true);
  // Red de seguridad (burbuja, corre DESPUES que los handlers de la pagina):
  // si Google escribio \[..\]/\(..\) crudo en el portapapeles, lo saneamos aqui.
  document.addEventListener("copy", (e)=>{
    try{
      const raw=e.clipboardData&&e.clipboardData.getData("text/plain");
      if(!raw||raw.indexOf("\\")===-1) return;
      const n=conv(raw);
      if(n&&n!==raw){
        e.clipboardData.setData("text/plain", n);
        try{ e.clipboardData.setData("text/html", n); }catch(_){}
        e.preventDefault();
      }
    }catch(_){}
  }, false);
  try{
    window.__NMC_G=window.__NMC_G||{};
    window.__NMC_G.version="1.1.3";
    window.__NMC_G.test=(s)=>conv(String(s));
  }catch(_){}
  try{ console.log("[NMC-G] activo v1.1.3 en "+location.href); }catch(_){}
})();
