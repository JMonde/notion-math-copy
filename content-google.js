(() => {
  "use strict";
  function convertGoogleMath(t){
    if(!t||t.indexOf("\\")===-1) return "";
    const parts=t.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
    for(let i=0;i<parts.length;i+=2){
      let r=parts[i];
      if(!r||r.indexOf("\\")===-1) continue;
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
  function getSelText(){
    const s=window.getSelection();
    if(!s||s.isCollapsed) return "";
    let txt=s.toString();
    if(txt) return txt;
    try{
      const r=s.getRangeAt(0);
      const frag=r.cloneContents();
      const d=document.createElement("div");
      d.appendChild(frag);
      return d.innerText||d.textContent||"";
    }catch(_){ return ""; }
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
    const raw=getSelText();
    const conv=convertGoogleMath(raw);
    if(!conv) return false;
    if(e && e.clipboardData){
      try{
        e.clipboardData.setData("text/plain", conv);
        try{ e.clipboardData.setData("text/html", conv); }catch(_){}
        e.preventDefault();
        e.stopImmediatePropagation();
      }catch(_){}
      setTimeout(()=>{ try{ navigator.clipboard.writeText(conv).catch(()=>{}); }catch(_){} }, 50);
      setTimeout(()=>{ try{ navigator.clipboard.writeText(conv).catch(()=>{}); }catch(_){} }, 350);
    } else if(isKey){
      writeClip(conv);
    }
    toast("LaTeX → $$ $$ ✓");
    return true;
  }
  document.addEventListener("copy",(e)=>{ try{ handleCopy(e,false); }catch(_){} },true);
  document.addEventListener("beforecopy",(e)=>{ try{ handleCopy(e,false); }catch(_){} },true);
  document.addEventListener("keydown",(e)=>{
    if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=="c") return;
    const raw=getSelText();
    const conv=convertGoogleMath(raw);
    if(!conv) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    writeClip(conv).then(ok=>toast(ok?"LaTeX → $$ $$ ✓":"Fallo al copiar"));
    setTimeout(()=>handleCopy(null,false), 10);
  },true);
})();
