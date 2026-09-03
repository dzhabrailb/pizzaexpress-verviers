/* ============================================================
   /api/check-promo.js
   Fonction serverless Vercel — système générique de codes promo.

   Toute la configuration des promos (codes, réductions, montant
   minimum, dates de validité) est stockée dans JSONBin, PAS dans
   le code. Pour créer une nouvelle promo plus tard, il suffit
   d'éditer le JSON dans JSONBin (voir GUIDE-NOUVELLE-PROMO.md),
   sans toucher au code ni redéployer sur Vercel.

   Variables d'environnement à définir dans Vercel :
   - PROMO_JSONBIN_BIN_ID
   - PROMO_JSONBIN_API_KEY

   Structure attendue du JSONBin (record) :
   {
     "promos": {
       "BIENVENUE5": {
         "discount": 5,
         "minOrder": 20,
         "active": true,
         "expiresAt": "2026-12-31",
         "description": "Réduction nouveaux clients",
         "onePerPhone": true
       },
       "ETE10": {
         "discount": 10,
         "minOrder": 30,
         "active": true,
         "expiresAt": "2026-09-30",
         "description": "Promo d'été",
         "onePerPhone": true
       }
     },
     "usedCodes": {
       "BIENVENUE5": ["32470740855", "32498112233"],
       "ETE10": []
     }
   }

   Usages :
   1) POST { phone, code, orderTotal }
      -> vérifie l'éligibilité (ne marque rien), renvoie le montant
         de la réduction si éligible.
   2) POST { phone, code, orderTotal, confirm: true }
      -> vérifie ET marque le code comme utilisé (à appeler
         uniquement au moment où la commande est réellement envoyée).
   ============================================================ */

const JSONBIN_BASE_URL = "https://api.jsonbin.io/v3/b";
const JSONBIN_BIN_ID = process.env.PROMO_JSONBIN_BIN_ID;
const JSONBIN_API_KEY = process.env.PROMO_JSONBIN_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const { phone, code, orderTotal, confirm } = req.body || {};

    if (!phone || !code) {
      res.status(400).json({ error: "Numéro de téléphone et code requis" });
      return;
    }

    const normalizedPhone = String(phone).replace(/[\s.\-()]/g, "");
    const normalizedCode = String(code).trim().toUpperCase();
    const total = Number(orderTotal) || 0;

    const record = await getPromoRecord();
    const promos = record.promos || {};
    const usedCodes = record.usedCodes || {};

    const promo = promos[normalizedCode];

    // Code inexistant
    if (!promo) {
      res.status(200).json({ eligible: false, reason: "invalid_code" });
      return;
    }

    // Code désactivé manuellement
    if (promo.active === false) {
      res.status(200).json({ eligible: false, reason: "inactive_code" });
      return;
    }

    // Code expiré
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      res.status(200).json({ eligible: false, reason: "expired_code" });
      return;
    }

    // Montant minimum non atteint
    if (promo.minOrder && total < promo.minOrder) {
      res.status(200).json({
        eligible: false,
        reason: "below_min_order",
        minOrder: promo.minOrder,
      });
      return;
    }

    // Déjà utilisé par ce numéro (si onePerPhone activé, ce qui est
    // le comportement par défaut sauf mention contraire)
    const onePerPhone = promo.onePerPhone !== false;
    const usedList = usedCodes[normalizedCode] || [];
    if (onePerPhone && usedList.includes(normalizedPhone)) {
      res.status(200).json({ eligible: false, reason: "already_used" });
      return;
    }

    // Éligible : simple vérification, on ne marque rien encore
    if (!confirm) {
      res.status(200).json({
        eligible: true,
        discount: promo.discount,
        description: promo.description || "",
      });
      return;
    }

    // Confirmation de commande envoyée : on enregistre l'utilisation
    if (onePerPhone) {
      usedCodes[normalizedCode] = [...usedList, normalizedPhone];
      await savePromoRecord({ promos, usedCodes });
    }

    res.status(200).json({
      eligible: true,
      discount: promo.discount,
      recorded: onePerPhone,
    });
  } catch (err) {
    console.error("check-promo error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

async function getPromoRecord() {
  const response = await fetch(`${JSONBIN_BASE_URL}/${JSONBIN_BIN_ID}/latest`, {
    headers: { "X-Master-Key": JSONBIN_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`JSONBin GET échoué : ${response.status}`);
  }
  const data = await response.json();
  return data.record || { promos: {}, usedCodes: {} };
}

async function savePromoRecord(record) {
  const response = await fetch(`${JSONBIN_BASE_URL}/${JSONBIN_BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_API_KEY,
    },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`JSONBin PUT échoué : ${response.status}`);
  }
}
