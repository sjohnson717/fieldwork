// Scrolls a record that System Health's Open pointed at into view, once the
// page holding it has rendered. Found by a data attribute rather than a ref,
// because the rows live inside lists and drag handles that own their own refs.
//
// Called as loading finishes, before React has drawn the list, so it looks
// again every 50ms for up to two seconds rather than once.
export const scrollToRecord = (attr, id, triesLeft = 40) => {
  if (!id) return;
  setTimeout(() => {
    const el = document.querySelector(`[${attr}="${CSS.escape(id)}"]`);
    if (el) el.scrollIntoView({ block: "center" });
    else if (triesLeft > 0) scrollToRecord(attr, id, triesLeft - 1);
  }, 50);
};

// The ring a pointed-at record wears until the page is left.
export const FOCUS_RING = "ring-2 ring-[#3366FF] ring-offset-2";
