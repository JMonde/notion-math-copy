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
  function convertGoogleMath(t){
    if(!t||t.indexOf("\\")===-1) return "";
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
    const r=parts.join("");
    return r!==t?r:"";
  }
  function texOfFrag(el){
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
  function serializeFrag(){
    try{
      const s0=window.getSelection();
      if(!s0||!s0.rangeCount||s0.isCollapsed) return "";
      const frag=s0.getRangeAt(0).cloneContents();
      const d=document.createElement("div");
      d.appendChild(frag);
      // Mate: KaTeX / MathJax / MathML -> $...$ / $$...$$
      d.querySelectorAll(".katex-display, mjx-container[display='true']").forEach((el)=>{
        const t=texOfFrag(el);
        if(!t) return;
        el.replaceWith(document.createTextNode("$$"+t.replace(/\s+/g," ").trim()+"$$"));
      });
      d.querySelectorAll(".katex, mjx-container, math, [data-tex], [data-latex]").forEach((el)=>{
        if(el.textContent&&el.textContent.indexOf("$$")!==-1) return;
        const t=texOfFrag(el);
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
      return blockText(d);
    }catch(_){ return ""; }
  }
  function getSelText(){
    const f=serializeFrag();
    if(f) return f;
    const s=window.getSelection();
    if(!s||s.isCollapsed) return "";
    return s.toString()||"";
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
  function buildOut(){
    const raw=getSelText();
    if(!raw) return "";
    const conv=convertGoogleMath(raw);
    if(conv) return conv;
    // Sin mate pero con formato real (negrita, codigo, enlaces): conservarlo
    if(hasMdFmt(raw)&&raw!==plainSelText()) return raw;
    return "";
  }
  async function writeClip(text){
    try{
      await navigator.clipboard.writeText(text);
      setTimeout(()=>navigator.clipboard.writeText(text).catch(()=>{}),300);
      return true;
    }catch(_){
      const ta=document.createElement("textarea");
      ta.value=text;
      ta.style.cssText="position:fixed;top:-9999px";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      let ok=false;
      try{ ok=document.execCommand("copy"); }catch(_){}
      ta.remove();
      return ok;
    }
  }
  function toast(m){
    let t=document.querySelector(".nmc-toast");
    if(!t){ t=document.createElement("div"); t.className="nmc-toast"; document.body.appendChild(t); }
    t.textContent=m; t.classList.add("show");
    clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2200);
  }
  function handleCopy(e, isKey){
    const out=buildOut();
    if(!out) return false;
    if(e && e.clipboardData){
      try{
        e.clipboardData.setData("text/plain", out);
        try{ e.clipboardData.setData("text/html", out); }catch(_){}
        e.preventDefault();
        e.stopImmediatePropagation();
      }catch(_){}
      setTimeout(()=>{ try{ navigator.clipboard.writeText(out).catch(()=>{}); }catch(_){} }, 50);
      setTimeout(()=>{ try{ navigator.clipboard.writeText(out).catch(()=>{}); }catch(_){} }, 350);
    } else if(isKey){
      writeClip(out);
    }
    toast("Copiado con formato ✓");
    return true;
  }
  document.addEventListener("copy",(e)=>{ try{ handleCopy(e,false); }catch(_){} },true);
  // Red de seguridad (burbuja): si la pagina escribio LaTeX crudo, sanearlo.
  document.addEventListener("copy",(e)=>{
    try{
      const raw=e.clipboardData&&e.clipboardData.getData("text/plain");
      if(!raw||raw.indexOf("\\")===-1) return;
      const c2=convertGoogleMath(raw);
      if(c2){
        e.clipboardData.setData("text/plain", c2);
        try{ e.clipboardData.setData("text/html", c2); }catch(_){}
        e.preventDefault();
      }
    }catch(_){}
  },false);
  document.addEventListener("beforecopy",(e)=>{ try{ handleCopy(e,false); }catch(_){} },true);
  document.addEventListener("keydown",(e)=>{
    if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=="c") return;
    const out=buildOut();
    if(!out) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    writeClip(out).then(ok=>toast(ok?"Copiado con formato ✓":"Fallo al copiar"));
    setTimeout(()=>handleCopy(null,false), 10);
  },true);
})();
