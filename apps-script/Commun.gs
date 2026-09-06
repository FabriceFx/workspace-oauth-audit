/**
 * Constantes et fonctions partagées.
 *
 * Convention du projet : les points d'entrée sont des `function` déclarées —
 * l'éditeur Apps Script ne propose qu'elles au menu d'exécution — et tout
 * l'interne est écrit en `const nom_ = (…) => …`, donc invisible de ce menu.
 * La séparation public/privé se lit ainsi dans la forme même du code.
 */

/**
 * Marge de sécurité sous le plafond d'exécution, en millisecondes.
 *
 * La table des quotas Apps Script annonce aujourd'hui 6 minutes par exécution,
 * pour les comptes grand public comme pour les comptes Workspace — les 30 minutes
 * historiquement accordées aux seconds ont été retirées. Le moissonnage reprend
 * là où il s'est arrêté, donc ce chiffre ne conditionne que le nombre de
 * reprises, jamais le résultat. Si votre tenant vous accorde davantage, montez
 * cette valeur : le moissonnage se fera en moins de passes, sans autre
 * changement.
 */
const BUDGET_MS = 4.5 * 60 * 1000;

/** Quota Admin SDK Directory : 2 400 requêtes/minute/utilisateur/projet. */
const QUOTA_DIRECTORY_PAR_MIN = 2400;

const ONGLET_BRUT_ = '_Brut';

const COLONNES_BRUT_ = [
  'horodatage', 'compte', 'domaine', 'evenement', 'application', 'client_id',
  'client_type', 'portees', 'motif_refus', 'demandeur', 'api', 'methode',
  'octets', 'produit'
];

/**
 * Compte rendu en cours.
 *
 * Objet constant muté en place, plutôt que deux variables réassignées : en V8,
 * les liaisons `let` de portée globale traversent mal les fichiers d'un même
 * projet, alors qu'un objet partagé, lui, se comporte partout pareil.
 *
 * `destination` vaut 'console' depuis l'éditeur et 'ui' depuis le menu du
 * classeur — un utilisateur du classeur ne voit pas le journal d'exécution.
 */
const CR_ = { lignes: [], destination: 'console' };

const dire_ = (ligne = '') => { CR_.lignes.push(String(ligne)); };

const echapper_ = (texte) => String(texte ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const vider_ = (titre = 'Applications tierces') => {
  const texte = CR_.lignes.join('\n');
  CR_.lignes = [];
  if (CR_.destination !== 'ui') {
    console.log(texte);
    return;
  }
  // Un dialogue plutôt qu'une alerte : les comptes rendus dépassent vite ce
  // qu'une alerte affiche, et on veut pouvoir les copier.
  const html = HtmlService
    .createHtmlOutput(`<pre style="font:12px/1.45 ui-monospace,Menlo,Consolas,`
      + `monospace;white-space:pre-wrap;margin:0">${echapper_(texte)}</pre>`)
    .setWidth(720)
    .setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, titre);
};

/** Aplatit les paramètres d'un événement en objet nom -> valeur. */
const parametres_ = (evenement) => {
  const out = {};
  for (const p of evenement.parameters || []) {
    if (p.value !== undefined) out[p.name] = p.value;
    else if (p.intValue !== undefined) out[p.name] = Number(p.intValue);
    else if (p.boolValue !== undefined) out[p.name] = p.boolValue;
    else if (p.multiValue !== undefined) out[p.name] = p.multiValue;
    else if (p.multiMessageValue !== undefined) out[p.name] = p.multiMessageValue;
  }
  return out;
};

const octets_ = (n) => {
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
  return `${Math.round(v * 10) / 10} ${unites[i]}`;
};

const ilYaJours_ = (jours) =>
  new Date(Date.now() - jours * 24 * 3600 * 1000).toISOString();

/** Trie un objet {clé: nombre} en liste [clé, nombre] décroissante. */
const classer_ = (compteur) => Object.entries(compteur).sort((a, b) => b[1] - a[1]);

/** Domaine d'une adresse, ou '(sans domaine)'. */
const domaine_ = (email) =>
  (email && email.indexOf('@') > 0) ? email.split('@')[1] : '(sans domaine)';

/** Normalise le paramètre « scope », tantôt liste tantôt chaîne. */
const portees_ = ({ scope }) => {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope;
  return String(scope).split(/[\s,]+/).filter(Boolean);
};

/**
 * Journée d'un horodatage, au format yyyy-MM-dd, quelle que soit sa forme.
 *
 * Indispensable, et pas seulement cosmétique : Sheets convertit en objets Date
 * les chaînes ISO qu'on lui écrit, si bien qu'à la relecture `String(valeur)`
 * rend « Thu May 14 2026 02:00:00 GMT+0200 ». Outre l'affichage en anglais, ces
 * chaînes se comparent alphabétiquement sur le nom du jour — la période observée
 * et les premières/dernières apparitions étaient donc fausses, silencieusement.
 */
const jour_ = (valeur) => {
  if (!valeur) return '';
  if (valeur instanceof Date) {
    return Utilities.formatDate(valeur, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const texte = String(valeur);
  if (/^\d{4}-\d{2}-\d{2}/.test(texte)) return texte.slice(0, 10);
  const d = new Date(texte);
  return isNaN(d.getTime()) ? texte.slice(0, 10)
    : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
};

/**
 * Famille d'une portée, déduite de son chemin — « drive », « gmail », « admin »…
 * Ce n'est pas un niveau de sensibilité : le catalogue arrive en v0.5.
 */
const famille_ = (portee) => {
  const m = String(portee).match(/auth\/([a-z0-9_.-]+)/i);
  if (!m) return String(portee).startsWith('openid') ? 'identité' : 'autre';
  const t = m[1].split('.')[0];
  return t === 'userinfo' ? 'identité' : t;
};

/**
 * Ce à quoi une famille de portées donne accès, dit à celui qui va le lire.
 *
 * L'onglet Applications garde les familles techniques : l'administrateur les
 * connaît, et elles se filtrent. Le courriel, lui, s'adresse à quelqu'un pour
 * qui « spreadsheets, script, cloud-identity » ne veut rien dire — et à qui
 * l'on demande précisément de juger si cet accès se justifie.
 */
const LIBELLES_FAMILLES_ = {
  drive: 'vos fichiers Drive',
  gmail: 'votre messagerie',
  calendar: 'votre agenda',
  documents: 'vos documents Docs',
  spreadsheets: 'vos feuilles de calcul',
  presentations: 'vos présentations',
  forms: 'vos formulaires',
  script: 'vos projets Apps Script',
  admin: 'l\'administration du domaine',
  'cloud-identity': 'l\'annuaire de l\'organisation',
  apps: 'les services Google Workspace',
  apps_genai: 'les fonctions d\'intelligence artificielle',
  contacts: 'vos contacts',
  tasks: 'vos tâches',
  identité: 'votre identité (nom et adresse)',
  autre: 'd\'autres services Google'
};

const enClair_ = (familles) => {
  const libelles = familles
    .map((f) => LIBELLES_FAMILLES_[f] || `${f} (service Google)`)
    .filter((v, i, t) => t.indexOf(v) === i);
  if (!libelles.length) return 'accès non précisé par le journal';
  if (libelles.length === 1) return libelles[0];
  return `${libelles.slice(0, -1).join(', ')} et ${libelles[libelles.length - 1]}`;
};

/**
 * Le classeur qui porte le rapport : celui auquel ce script est lié.
 *
 * Le projet est volontairement lié à un classeur plutôt qu'autonome. Le rapport
 * vit alors là où on le consulte, `onOpen()` y pose le menu nativement, et
 * chaque action s'exécute sous l'identité de qui la déclenche — non sous celle
 * du poseur d'un déclencheur, ce qui aurait prêté ses droits d'administrateur à
 * toute personne ayant accès au classeur.
 */
const classeurCourant_ = () => {
  const classeur = SpreadsheetApp.getActive();
  if (!classeur) {
    throw new Error('Ce script doit être lié à un classeur : ouvrez le classeur, '
      + 'Extensions > Apps Script, et exécutez-le de là.');
  }
  return classeur;
};

/**
 * Rend l'onglet brut, en le créant au besoin.
 *
 * Le cas courant au premier lancement est un classeur neuf avec sa seule
 * « Feuille 1 » vide : on la renomme plutôt que d'en ajouter une et de laisser
 * une feuille orpheline derrière soi.
 */
const brutCourant_ = (classeur) => {
  const existant = classeur.getSheetByName(ONGLET_BRUT_);
  if (existant) return existant;

  const feuilles = classeur.getSheets();
  const seuleEtVide = feuilles.length === 1 && feuilles[0].getLastRow() === 0;
  const brut = seuleEtVide ? feuilles[0].setName(ONGLET_BRUT_)
                           : classeur.insertSheet(ONGLET_BRUT_);
  return entetesBrut_(brut);
};

/**
 * Les noms que Google donne à la feuille créée d'office avec un classeur.
 * Selon la langue du compte, et selon qu'il y ait une espace ou non.
 */
const FEUILLES_PAR_DEFAUT_ = /^(feuille|sheet)\s?1$/i;

/**
 * Supprime la feuille par défaut si elle est restée vide.
 *
 * `brutCourant_` la renomme quand elle est seule dans un classeur neuf, mais ce
 * cas ne couvre pas tout : dès qu'un autre onglet existe déjà — un référentiel
 * créé avant le premier moissonnage —, elle survit et traîne indéfiniment.
 * Le ménage se fait donc aussi à la fin, quand on sait ce que le classeur
 * contient vraiment.
 *
 * Deux garde-fous : on ne supprime que si la feuille est **vide**, et jamais la
 * dernière du classeur, qu'un classeur ne peut pas perdre.
 */
const nettoyerFeuilleParDefaut_ = (classeur) => {
  const feuilles = classeur.getSheets();
  if (feuilles.length < 2) return false;
  const cible = feuilles.find((f) => FEUILLES_PAR_DEFAUT_.test(f.getName())
    && f.getLastRow() === 0 && f.getLastColumn() === 0);
  if (!cible) return false;
  classeur.deleteSheet(cible);
  return true;
};

const entetesBrut_ = (brut) => {
  brut.getRange(1, 1, 1, COLONNES_BRUT_.length)
    .setValues([COLONNES_BRUT_])
    .setFontWeight('bold');
  brut.setFrozenRows(1);
  return brut;
};
