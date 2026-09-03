/* ============================================================
   PROMO CODE — logique client générique (à intégrer dans le site)
   Fonctionne avec n'importe quel code créé plus tard dans JSONBin,
   sans modifier ce fichier.
   ============================================================ */

const PROMO_CHECK_ENDPOINT = "/api/check-promo"; // fonction serverless (check-promo.js)

// Etat interne : réinitialisé à chaque changement de code ou de total
let promoState = {
  validated: false,
  discount: 0,
  code: "",
};

function initPromoField() {
  const promoInput = document.getElementById("promoCodeInput");
  if (!promoInput) return;

  let debounceTimer;
  promoInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    resetPromoState();
    updatePromoUI("idle");
    debounceTimer = setTimeout(() => validatePromoCode(promoInput.value), 500);
  });

  // Si le total de la commande change après validation du code
  // (ex: client ajoute une pizza), revalide automatiquement.
  document.addEventListener("orderTotalChanged", () => {
    if (promoInput.value.trim()) {
      validatePromoCode(promoInput.value);
    }
  });
}

function resetPromoState() {
  promoState = { validated: false, discount: 0, code: "" };
}

async function validatePromoCode(rawCode) {
  const code = (rawCode || "").trim().toUpperCase();
  const phoneInput = document.getElementById("phoneInput");
  const phone = phoneInput ? normalizePhone(phoneInput.value) : "";

  if (!code) {
    updatePromoUI("idle");
    recalcOrderTotalWithPromo();
    return;
  }

  if (!phone || phone.length < 8) {
    updatePromoUI(
      "needs-phone",
      "Veuillez renseigner votre numéro de téléphone avant le code promo."
    );
    return;
  }

  const currentTotal = getOrderTotal(); // ta fonction existante de calcul du total
  updatePromoUI("checking");

  try {
    const res = await fetch(PROMO_CHECK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, orderTotal: currentTotal }),
    });
    const data = await res.json();

    if (data.eligible) {
      promoState = { validated: true, discount: data.discount, code };
      updatePromoUI("valid", `Code appliqué : -${data.discount}€ 🎉`);
    } else {
      resetPromoState();
      updatePromoUI(reasonToState(data.reason), reasonToMessage(data));
    }
  } catch (err) {
    console.error("Erreur vérification promo :", err);
    resetPromoState();
    updatePromoUI("error", "Impossible de vérifier le code pour le moment, réessayez.");
  }

  recalcOrderTotalWithPromo();
}

function reasonToState(reason) {
  const map = {
    invalid_code: "invalid",
    inactive_code: "invalid",
    expired_code: "invalid",
    below_min_order: "below-min",
    already_used: "already-used",
  };
  return map[reason] || "invalid";
}

function reasonToMessage(data) {
  const messages = {
    invalid_code: "Code promo invalide.",
    inactive_code: "Ce code promo n'est plus actif.",
    expired_code: "Ce code promo a expiré.",
    below_min_order: `Commande minimum de ${data.minOrder}€ requise pour ce code.`,
    already_used: "Ce code a déjà été utilisé avec ce numéro de téléphone.",
  };
  return messages[data.reason] || "Code promo invalide.";
}

function normalizePhone(value) {
  return (value || "").replace(/[\s.\-()]/g, "");
}

function recalcOrderTotalWithPromo() {
  const totalEl = document.getElementById("orderTotal"); // adapte l'id si besoin
  if (!totalEl) return;

  const baseTotal = getOrderTotal(); // ta fonction existante, sans la remise
  const finalTotal = promoState.validated
    ? Math.max(0, baseTotal - promoState.discount)
    : baseTotal;

  totalEl.textContent = `${finalTotal.toFixed(2)} €`;
}

function updatePromoUI(state, message = "") {
  const feedbackEl = document.getElementById("promoFeedback");
  if (!feedbackEl) return;

  const styles = {
    idle: { color: "#666", text: "" },
    checking: { color: "#666", text: "Vérification en cours…" },
    valid: { color: "#1a7f37", text: message },
    invalid: { color: "#c0392b", text: message },
    "already-used": { color: "#c0392b", text: message },
    "needs-phone": { color: "#c0392b", text: message },
    "below-min": { color: "#c0392b", text: message },
    error: { color: "#c0392b", text: message },
  };

  const s = styles[state] || styles.idle;
  feedbackEl.style.color = s.color;
  feedbackEl.textContent = s.text;
}

/**
 * IMPORTANT : à intégrer dans ta fonction d'envoi de commande existante,
 * juste avant l'envoi du message WhatsApp/SMS :
 *
 *   if (promoState.validated) {
 *     message += `\n\n🎟️ Code promo utilisé : ${promoState.code} (-${promoState.discount}€)`;
 *     const phone = normalizePhone(document.getElementById("phoneInput").value);
 *     await fetch(PROMO_CHECK_ENDPOINT, {
 *       method: "POST",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify({
 *         phone,
 *         code: promoState.code,
 *         orderTotal: getOrderTotal(),
 *         confirm: true,
 *       }),
 *     });
 *   }
 */

document.addEventListener("DOMContentLoaded", initPromoField);
