(() => {
  "use strict";
  const api = typeof browser !== "undefined" ? browser : chrome;
  const cb = document.getElementById("autoConvert");

  api.storage.local.get({ autoConvert: true }).then((cfg) => {
    cb.checked = cfg.autoConvert !== false;
  });

  cb.addEventListener("change", () => {
    api.storage.local.set({ autoConvert: cb.checked });
  });
})();