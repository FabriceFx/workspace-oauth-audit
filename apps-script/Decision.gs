/**
 * Référentiel des décisions — introduit en v0.4.
 *
 * Le classement des applications ne vit pas dans le rapport : il vit ici. Tout
 * le reste du classeur est reconstruit à chaque moissonnage, cet onglet-là ne
 * l'est jamais. On ne peut pas classer ce qui s'efface.
 *
 * La synchronisation ne fait qu'une chose : ajouter les applications nouvelles,
 * avec un statut vide. Elle ne touche jamais un statut, un motif, un décideur
 * ni une échéance déjà inscrits — le jugement appartient à l'administrateur, le
 * code n'en produit pas.
 *
 * UNE DÉCISION A UNE DATE DE PÉREMPTION
 *
 * Une application approuvée en 2026 ne l'est pas pour toujours : elle change de
 * mains, de portées, d'éditeur. La colonne « Revoir avant » rend la décision
 * caduque à son échéance — l'application repasse alors dans la file de travail
 * et redevient sollicitable. Une approbation sans échéance est une approbation
 * définitive, ce qui n'existe pas en gouvernance des accès.
 */


const COLONNES_DECISIONS_ = [
  'clientId', 'application', 'statut', 'motif', 'decidePar', 'le',
  'revoirAvant', 'autorisants', 'vuePremiereFois'
];

/**
 * Les cinq statuts, et ce qu'ils engagent.
 *
 *   approuvée    usage légitime et connu ; ne sollicite plus personne
 *   tolérée      pas souhaitable, pas assez grave pour agir ; ne sollicite plus
 *   à instruire  on ne sait pas encore ; reste dans la file de travail
 *   à bloquer    décidé, pas encore appliqué en console
 *   bloquée      appliqué
 *
 * Un statut vide vaut « non classée » : c'est l'état de départ, et c'est celui
 * qu'il faut faire décroître.
 *
 * Le vocabulaire lui-même vit dans STATUTS_LANGUE_ (Langues.gs) : la liste
 * déroulante s'écrit dans la langue de l'interface, mais un statut lu se
 * reconnaît dans les deux — un classeur classé en français ne perd pas ses
 * décisions en basculant en anglais. D'où : jamais de comparaison de chaîne sur
 * un statut, toujours estStatut_.
 */
const STATUTS_ = ORDRE_STATUTS_;

/** Statuts qui dispensent d'écrire aux autorisants. */
const STATUTS_SILENCIEUX_ = ['approuvee', 'toleree'];

/**
 * L'onglet des décisions n'est jamais reconstruit — mais ses en-têtes peuvent
 * avoir été écrits dans une autre langue. On les réaligne alors sur la langue
 * courante sans toucher aux lignes : le classement survit à la bascule.
 */
const feuilleDecisions_ = (classeur, lg) => {
  const langue = lg || LANGUE_DEFAUT_;
  const existante = ongletCanonique_(classeur, 'decisions', langue);
  const entetes = entetesEn_(COLONNES_DECISIONS_, langue);
  if (existante) {
    existante.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
    return existante;
  }
  const f = classeur.insertSheet(nomOnglet_('decisions', langue));
  f.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
  f.setFrozenRows(1);
  return f;
};

/** Menu déroulant sur la colonne Statut : on ne classe pas en orthographe libre. */
const poserValidationStatut_ = (f, lg) => {
  if (typeof SpreadsheetApp.newDataValidation !== 'function') return;
  const lignes = Math.max(1, f.getMaxRows() - 1);
  const regle = SpreadsheetApp.newDataValidation()
    .requireValueInList(statutsEn_(lg || LANGUE_DEFAUT_), true)
    .setAllowInvalid(false)
    .build();
  f.getRange(2, COLONNES_DECISIONS_.indexOf('statut') + 1, lignes, 1)
    .setDataValidation(regle);
};

/**
 * Lit le référentiel : client_id -> décision, avec son caractère exécutoire.
 * Une décision dont l'échéance est passée est lue, mais n'est plus en vigueur.
 */
const lireDecisions_ = (classeur) => {
  const f = chercherOnglet_(classeur, 'decisions');
  const decisions = new Map();
  if (!f || f.getLastRow() < 2) return decisions;
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCid = colonne_(e, 'clientId');
  const iStatut = colonne_(e, 'statut');
  const iMotif = colonne_(e, 'motif');
  const iPar = colonne_(e, 'decidePar');
  const iLe = colonne_(e, 'le');
  const iRevoir = colonne_(e, 'revoirAvant');
  const aujourdhui = jour_(new Date());

  for (const l of valeurs.slice(1)) {
    const cid = String(l[iCid] || '').trim();
    if (!cid) continue;
    const statut = String(l[iStatut] || '').trim();
    const revoirAvant = jour_(l[iRevoir]);
    const expiree = Boolean(statut) && Boolean(revoirAvant) && revoirAvant < aujourdhui;
    decisions.set(cid, {
      cid,
      statut,
      motif: String(l[iMotif] || ''),
      par: String(l[iPar] || ''),
      le: jour_(l[iLe]),
      revoirAvant,
      expiree,
      enVigueur: Boolean(statut) && !expiree
    });
  }
  return decisions;
};

/** Applications qui, décision en vigueur à l'appui, ne sollicitent plus personne. */
const decisionsSilencieuses_ = (classeur) => {
  const silencieuses = new Set();
  for (const d of lireDecisions_(classeur).values()) {
    if (d.enVigueur && STATUTS_SILENCIEUX_.some((id) => estStatut_(d.statut, id))) {
      silencieuses.add(d.cid.toLowerCase());
    }
  }
  return silencieuses;
};

/**
 * Ajoute au référentiel les applications qu'il ne connaît pas encore, et
 * rafraîchit les seules colonnes descriptives — nom, nombre d'autorisants,
 * première apparition. Le jugement, lui, n'est jamais réécrit.
 */
const synchroniserDecisions_ = (classeur, apps, lg) => {
  const f = feuilleDecisions_(classeur, lg);
  const valeurs = f.getLastRow() >= 1 ? f.getDataRange().getValues()
    : [entetesEn_(COLONNES_DECISIONS_, lg || LANGUE_DEFAUT_)];
  const e = valeurs[0];
  const iCid = colonne_(e, 'clientId');
  const iApp = colonne_(e, 'application');
  const iAut = colonne_(e, 'autorisants');
  const iVue = colonne_(e, 'vuePremiereFois');

  const lignesExistantes = new Map();
  valeurs.slice(1).forEach((l, i) => {
    const cid = String(l[iCid] || '').trim();
    if (cid) lignesExistantes.set(cid, i + 1);
  });

  const nouvelles = [];
  let majExistantes = false;

  for (const a of apps.values()) {
    const idx = lignesExistantes.get(a.cid);
    if (idx !== undefined) {
      valeurs[idx][iApp] = a.nom;
      valeurs[idx][iAut] = a.autorisants.size;
      valeurs[idx][iVue] = jour_(a.premiere);
      majExistantes = true;
      continue;
    }
    const nouvelle = new Array(COLONNES_DECISIONS_.length).fill('');
    nouvelle[iCid] = a.cid;
    nouvelle[iApp] = a.nom;
    nouvelle[iAut] = a.autorisants.size;
    nouvelle[iVue] = jour_(a.premiere);
    nouvelles.push(nouvelle);
  }

  // Mise à jour en lot des lignes existantes
  if (majExistantes && valeurs.length > 1) {
    f.getRange(2, 1, valeurs.length - 1, COLONNES_DECISIONS_.length)
      .setValues(valeurs.slice(1));
  }

  // Ajout en lot des nouvelles applications
  if (nouvelles.length) {
    f.getRange(f.getLastRow() + 1, 1, nouvelles.length, COLONNES_DECISIONS_.length)
      .setValues(nouvelles);
  }
  poserValidationStatut_(f, lg);
  f.autoResizeColumns(1, COLONNES_DECISIONS_.length);
  return { nouvelles: nouvelles.length, connues: lignesExistantes.size };
};

/**
 * Compte rendu du classement : combien d'applications sont jugées, combien
 * restent, combien ont une décision périmée.
 */
const bilanDecisions_ = (classeur, apps) => {
  const decisions = lireDecisions_(classeur);
  const bilan = { nonClassees: 0, expirees: 0, parStatut: {} };
  for (const cid of apps.keys()) {
    const d = decisions.get(cid);
    if (!d || !d.statut) { bilan.nonClassees++; continue; }
    if (d.expiree) bilan.expirees++;
    bilan.parStatut[d.statut] = (bilan.parStatut[d.statut] || 0) + 1;
  }
  return bilan;
};
