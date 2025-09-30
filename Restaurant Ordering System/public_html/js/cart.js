// public_html/js/cart.js
(() => {
  console.log("✅ cart.js loaded");

  const KEY = "cart_v1";

  // ---- storage ----
  const getCart = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  };
  const saveCart = (items) => localStorage.setItem(KEY, JSON.stringify(items));

  // ---- mutate ----
  const addItem = ({ id, name, priceCents, qty = 1 }) => {
    const items = getCart();
    const i = items.findIndex(it => it.id === id);
    if (i >= 0) items[i].qty += qty;
    else items.push({ id, name, priceCents, qty });
    saveCart(items);
    console.log("Saved Cart:", items);
  };

  const updateQty = (id, qty) => {
    const items = getCart();
    const i = items.findIndex(it => it.id === id);
    if (i >= 0) {
      if (qty <= 0) items.splice(i, 1);
      else items[i].qty = qty;
      saveCart(items);
    }
  };

  const removeItem = (id) => saveCart(getCart().filter(it => it.id !== id));
  const clearCart  = () => saveCart([]);

  // ---- derived ----
  const count = () => getCart().reduce((s, it) => s + it.qty, 0);
  const formatCents = (c) => "$" + (c / 100).toFixed(2);
  const totals = () => {
    const items = getCart();
    const subtotalCents = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
    return { subtotalCents, totalCents: subtotalCents }; // add tax later if needed
  };

  // ---- toast (centered) ----
  const showToast = (msg, { ok = true } = {}) => {
    // full-screen overlay that centers children
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 flex items-center justify-center pointer-events-none z-50";

  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.className = (ok ? "bg-green-600" : "bg-red-600")
    + " text-white px-6 py-3 rounded shadow-lg text-lg font-semibold opacity-0 transition-opacity duration-200";
  overlay.appendChild(toast);

  document.body.appendChild(overlay);
  // fade in
  requestAnimationFrame(() => { toast.classList.remove("opacity-0"); toast.classList.add("opacity-100"); });
  // fade out + remove
  setTimeout(() => {
    toast.classList.remove("opacity-100");
    toast.classList.add("opacity-0");
    setTimeout(() => overlay.remove(), 180);
  }, 1300);
};

  // ---- header badge ----
  const updateCartCount = (elemId) => {
    const el = document.getElementById(elemId);
    if (el) el.textContent = count();
  };

  // ---- render full cart table on cart page ----
  const renderCart = ({ bodyId, subtotalId, totalId, countId, emptyStateId, boxId, totalsRowId } = {}) => {
    const items = getCart();
    if (countId) updateCartCount(countId);

    // toggle empty state blocks if supplied
    const hasItems = items.length > 0;
    if (emptyStateId) {
      const es = document.getElementById(emptyStateId);
      if (es) es.classList.toggle("hidden", hasItems);
    }
    if (boxId) {
      const bx = document.getElementById(boxId);
      if (bx) bx.classList.toggle("hidden", !hasItems);
    }
    if (totalsRowId) {
      const tr = document.getElementById(totalsRowId);
      if (tr) tr.classList.toggle("hidden", !hasItems);
    }

    // table body
    const tbody = document.getElementById(bodyId);
    if (tbody) {
      tbody.innerHTML = "";
      items.forEach(it => {
        const tr = document.createElement("tr");
        tr.dataset.id = it.id;
        tr.innerHTML = `
          <td class="py-2 px-3">${it.name}</td>
          <td class="py-2 px-3">${formatCents(it.priceCents)}</td>
          <td class="py-2 px-3">
            <div class="inline-flex items-center gap-2">
              <button class="dec bg-gray-200 px-2 rounded">-</button>
              <input class="qty w-16 border rounded px-2 py-1 text-center" type="number" min="0" value="${it.qty}">
              <button class="inc bg-gray-200 px-2 rounded">+</button>
            </div>
          </td>
          <td class="py-2 px-3 font-medium">${formatCents(it.priceCents * it.qty)}</td>
          <td class="py-2 px-3"><button class="remove text-red-600 hover:underline">Remove</button></td>
        `;
        tbody.appendChild(tr);
      });

      // delegate clicks
      tbody.onclick = (e) => {
        const btn = e.target;
        const tr = btn.closest("tr");
        if (!tr) return;
        const id = tr.dataset.id;
        if (btn.classList.contains("inc")) {
          const items = getCart();
          const i = items.findIndex(x => x.id === id);
          if (i >= 0) { items[i].qty += 1; saveCart(items); renderCart({ bodyId, subtotalId, totalId, countId, emptyStateId, boxId, totalsRowId }); }
        } else if (btn.classList.contains("dec")) {
          const items = getCart();
          const i = items.findIndex(x => x.id === id);
          if (i >= 0) {
            items[i].qty = Math.max(0, items[i].qty - 1);
            if (items[i].qty === 0) items.splice(i, 1);
            saveCart(items);
            renderCart({ bodyId, subtotalId, totalId, countId, emptyStateId, boxId, totalsRowId });
          }
        } else if (btn.classList.contains("remove")) {
          removeItem(id);
          renderCart({ bodyId, subtotalId, totalId, countId, emptyStateId, boxId, totalsRowId });
        }
      };

      // qty typed
      tbody.onchange = (e) => {
        const input = e.target;
        if (!input.classList.contains("qty")) return;
        const tr = input.closest("tr");
        const id = tr.dataset.id;
        let q = parseInt(input.value, 10);
        if (isNaN(q) || q < 0) q = 0;
        updateQty(id, q);
        renderCart({ bodyId, subtotalId, totalId, countId, emptyStateId, boxId, totalsRowId });
      };
    }

    // totals
    const { subtotalCents, totalCents } = totals();
    if (subtotalId) {
      const el = document.getElementById(subtotalId);
      if (el) el.textContent = formatCents(subtotalCents);
    }
    if (totalId) {
      const el = document.getElementById(totalId);
      if (el) el.textContent = formatCents(totalCents);
    }
  };

  // expose
  window.Cart = {
    getCart, saveCart, addItem, updateQty, removeItem, clearCart,
    count, totals, formatCents, showToast, updateCartCount, renderCart
  };
})();
