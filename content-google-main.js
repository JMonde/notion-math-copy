(() => {
  "use strict";
  function conv(t){
    if(!t||t.indexOf("\\")===-1) return t;
    let r=t;
    r=r.replace(/\\\(\s*/g,"$$$$").replace(/\s*\\\)/g,"$$$$");
    r=r.replace(/\\\[\s*/g,"$$$$").replace(/\s*\\\]/g,"$$$$");
    r=r.replace(/\$\$\s*([^$]+?)\s*\$\$/g,(_,m)=>"$$"+m.trim()+"$$");
    return r;
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
