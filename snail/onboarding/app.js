(() => {
  "use strict";

  const status = document.querySelector("#copy-status");
  document.querySelectorAll(".code-block").forEach((block) => {
    const code = block.querySelector("code");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = "Copy";
    button.setAttribute("aria-label", `Copy ${code.dataset.copyLabel}`);
    button.addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = "Copied";
        status.textContent = `${code.dataset.copyLabel} copied.`;
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Select";
        status.textContent =
          "Clipboard unavailable. The command is selected; use your browser’s Copy command.";
      }
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 2200);
    });
    block.append(button);
  });

  const picker = document.querySelector(".node-picker");
  const select = document.querySelector("#node-select");
  picker.hidden = false;
  select.addEventListener("change", () => {
    document.querySelector("#node-command").textContent =
      `ssh your_username@node${select.value}-ccn2cluster.stanford.edu`;
  });

  const links = [...document.querySelectorAll(".contents a")];
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries.find((entry) => entry.isIntersecting);
        if (!current) return;
        links.forEach((link) => {
          if (link.hash === `#${current.target.id}`)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-5% 0px -65% 0px", threshold: 0 },
    );
    document
      .querySelectorAll(".chapter")
      .forEach((section) => observer.observe(section));
  }
})();
