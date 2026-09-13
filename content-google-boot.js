(() => {
  try {
    if (document.getElementById("nmc-google-main")) return;
    const s = document.createElement("script");
    s.id = "nmc-google-main";
    s.src = chrome.runtime.getURL("content-google-main.js");
    (document.head || document.documentElement).appendChild(s);
  } catch (_) {}
})();
