/*
 * Drives the decorative hero field: provider cards and ghosts soften into a
 * blur away from the pointer and sharpen near it, the blur blobs slowly chase
 * the pointer on their own drift, and ghost eyes track the pointer. The CSS
 * drift keyframes keep everything moving when no pointer exists; this module
 * only adds pointer responsiveness on fine-pointer, motion-allowing clients.
 */

const field = document.querySelector<HTMLElement>(".ghostget-field");

if (
  field !== null
  && typeof matchMedia === "function"
  && matchMedia("(pointer: fine)").matches
  && !matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  const proxElements = [...field.querySelectorAll<HTMLElement>("[data-gg-prox]")];
  const spirits = [...field.querySelectorAll<HTMLElement>("[data-gg-spirit]")];
  const blobPulls: Readonly<Record<string, number>> = { blue: 0.1, coral: 0.07, violet: 0.16 };
  const blobs = [...field.querySelectorAll<HTMLElement>("[data-gg-blob]")].map((element) => {
    const hue = /ghostget-blob--(\w+)/u.exec(element.className)?.[1] ?? "";
    return { element, pull: blobPulls[hue] ?? 0.12, x: 0, y: 0 };
  });

  let pointerX = 0;
  let pointerY = 0;
  let pointerSeen = false;
  let frameId = 0;

  const settle = () => {
    pointerSeen = false;
    for (const element of proxElements) element.style.setProperty("--prox", "0");
    for (const spirit of spirits) {
      spirit.style.setProperty("--gx", "0px");
      spirit.style.setProperty("--gy", "0px");
    }
    for (const blob of blobs) {
      blob.x = 0;
      blob.y = 0;
      blob.element.style.setProperty("--bx", "0px");
      blob.element.style.setProperty("--by", "0px");
    }
  };

  const step = () => {
    frameId = 0;
    if (!pointerSeen) return;
    const radius = Math.max(240, Math.min(420, window.innerWidth * 0.26));
    let moving = false;
    for (const element of proxElements) {
      const rect = element.getBoundingClientRect();
      const dx = pointerX - (rect.left + rect.width / 2);
      const dy = pointerY - (rect.top + rect.height / 2);
      const prox = Math.max(0, 1 - Math.hypot(dx, dy) / radius);
      element.style.setProperty("--prox", prox.toFixed(3));
    }
    for (const spirit of spirits) {
      const rect = spirit.getBoundingClientRect();
      const dx = pointerX - (rect.left + rect.width / 2);
      const dy = pointerY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(3.2, distance / 30);
      spirit.style.setProperty("--gx", `${((dx / distance) * reach).toFixed(2)}px`);
      spirit.style.setProperty("--gy", `${((dy / distance) * reach).toFixed(2)}px`);
    }
    for (const blob of blobs) {
      const rect = blob.element.getBoundingClientRect();
      const targetX = (pointerX - (rect.left + rect.width / 2)) * blob.pull;
      const targetY = (pointerY - (rect.top + rect.height / 2)) * blob.pull;
      blob.x += (targetX - blob.x) * 0.035;
      blob.y += (targetY - blob.y) * 0.035;
      if (Math.abs(targetX - blob.x) > 0.5 || Math.abs(targetY - blob.y) > 0.5) moving = true;
      blob.element.style.setProperty("--bx", `${blob.x.toFixed(1)}px`);
      blob.element.style.setProperty("--by", `${blob.y.toFixed(1)}px`);
    }
    if (pointerSeen || moving) frameId = requestAnimationFrame(step);
  };

  window.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerSeen = true;
    if (frameId === 0) frameId = requestAnimationFrame(step);
  }, { passive: true });

  document.documentElement.addEventListener("pointerleave", settle, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") settle();
  });
}
