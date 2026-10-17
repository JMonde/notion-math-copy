(() => {
  "use strict";
  function conv(t){
    if(!t||t.indexOf("\\")===-1) return t;
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
    return parts.join("");
  }
  function patchWriteText(){
    try{
      const c=navigator.clipboard;
      if(!c||c._nmcPatched) return;
      const orig=c.writeText.bind(c);
      c.writeText=async (txt)=>{
        const n=conv(txt);
        if(n!==txt) txt=n;
        return orig(txt);
      };
      c._nmcPatched=true;
    }catch(_){}
  }
  patchWriteText(); setInterval(patchWriteText,1500);
  function selText(){
    try{
      const s=window.getSelection();
      if(s&&!s.isCollapsed&&s.toString()) return s.toString();
      if(s&&s.rangeCount){
        const c=s.getRangeAt(0).cloneContents();
        const d=document.createElement("div");
        d.appendChild(c);
        return d.innerText||d.textContent||"";
      }
    }catch(_){}
    return "";
  }
  function onCopy(e){
    try{
      const raw=selText() || (e.clipboardData?e.clipboardData.getData("text/plain"):"");
      if(!raw||raw.indexOf("\\")===-1) return;
      const n=conv(raw);
      if(!n||n===raw) return;
      if(e.clipboardData){
        e.clipboardData.setData("text/plain", n);
        try{ e.clipboardData.setData("text/html", n); }catch(_){}
        e.preventDefault();
        e.stopImmediatePropagation();
        setTimeout(()=>{ try{ navigator.clipboard.writeText(n).catch(()=>{});}catch(_){} },80);
        setTimeout(()=>{ try{ navigator.clipboard.writeText(n).catch(()=>{});}catch(_){} },380);
      }
    }catch(_){}
  }
  document.addEventListener("copy", onCopy, true);
  window.addEventListener("copy", onCopy, true);
  document.addEventListener("beforecopy", onCopy, true);
})();
