/**
 * Référentiel des décisions — v0.4.
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

const ONGLET_DECISIONS_ = 'Décisions';

const COLONNES_DECISIONS_ = [
  'client_id', 'Application', 'Statut', 'Motif', 'Décidé par', 'Le',
  'Revoir avant', 'Autorisants', 'Vue la première fois'
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
 */
const STATUTS_ = ['approuvée', 'tolérée', 'à instruire', 'à bloquer', 'bloquée'];

/** Statuts qui dispensent d'écrire aux autorisants. */
const STATUTS_SILENCIEUX_ = new Set(['approuvée', 'tolérée']);

const feuilleDecisions_ = (classeur) => {
  const existante = classeur.getSheetByName(ONGLET_DECISIONS_);
  if (existante) return existante;
  const f = classeur.insertSheet(ONGLET_DECISIONS_);
  f.getRange(1, 1, 1, COLONNES_DECISIONS_.length)
    .setValues([COLONNES_DECISIONS_])
    .setFontWeight('bold');
  f.setFrozenRows(1);
  return f;
};

/** Menu déroulant sur la colonne Statut : on ne classe pas en orthographe libre. */
const poserValidationStatut_ = (f) => {
  if (typeof SpreadsheetApp.newDataValidation !== 'function') return;
  const lignes = Math.max(1, f.getMaxRows() - 1);
  const regle = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUTS_, true)
    .setAllowInvalid(false)
    .build();
  f.getRange(2, COLONNES_DECISIONS_.indexOf('Statut') + 1, lignes, 1)
    .setDataValidation(regle);
};

/**
 * Lit le référentiel : client_id -> décision, avec son caractère exécutoire.
 * Une décision dont l'échéance est passée est lue, mais n'est plus en vigueur.
 */
const lireDecisions_ = (classeur) => {
  const f = classeur.getSheetByName(ONGLET_DECISIONS_);
  const decisions = new Map();
  if (!f || f.getLastRow() < 2) return decisions;
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCid = e.indexOf('client_id');
  const iStatut = e.indexOf('Statut');
  const iMotif = e.indexOf('Motif');
  const iPar = e.indexOf('Décidé par');
  const iLe = e.indexOf('Le');
  const iRevoir = e.indexOf('Revoir avant');
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
    if (d.enVigueur && STATUTS_SILENCIEUX_.has(d.statut)) silencieuses.add(d.cid.toLowerCase());
  }
  return silencieuses;
};

/**
 * Ajoute au référentiel les applications qu'il ne connaît pas encore, et
 * rafraîchit les seules colonnes descriptives — nom, nombre d'autorisants,
 * première apparition. Le jugement, lui, n'est jamais réécrit.
 */
const synchroniserDecisions_ = (classeur, apps) => {
  const f = feuilleDecisions_(classeur);
  const valeurs = f.getLastRow() >= 1 ? f.getDataRange().getValues() : [COLONNES_DECISIONS_];
  const e = valeurs[0];
  const iCid = e.indexOf('client_id');
  const iApp = e.indexOf('Application');
  const iAut = e.indexOf('Autorisants');
  const iVue = e.indexOf('Vue la première fois');

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
  poserValidationStatut_(f);
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
