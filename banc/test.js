// Banc d'essai — se lance hors de Google, avec Node :
//
//     node banc/test.js
//
// Les fichiers .gs sont chargés dans un contexte où SpreadsheetApp, Utilities et
// Session sont simulés, puis on rejoue des événements de la forme exacte que
// renvoie la Reports API. Cela ne remplace pas une exécution réelle — les quotas,
// les déclencheurs et le comportement de Sheets ne s'y voient pas — mais cela
// vérifie le dépouillement, qui est la seule chose que le tenant ne peut pas nous
// dire d'avance.
//
// C'est ce banc qui a révélé le cas « antérieur à la fenêtre » : un compte qui
// apparaît par un appel d'API sans autorisation sur la période.

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const P = path.join(__dirname, '..', 'apps-script') + '/';

// ---- faux classeur -------------------------------------------------------
class FauxFeuille {
  constructor(nom) { this.nom = nom; this.cells = []; this.cachee = false; }
  getName() { return this.nom; }
  setName(n) { this.nom = n; return this; }
  getLastRow() { return this.cells.length; }
  getLastColumn() { return this.cells.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(r, c, nr = 1, nc = 1) {
    const f = this;
    return {
      setValues(vals) {
        vals.forEach((row, i) => {
          const ligne = r + i - 1;
          f.cells[ligne] = f.cells[ligne] || [];
          row.forEach((v, j) => { f.cells[ligne][c + j - 1] = v; });
        });
        return this;
      },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = f.cells[r + i - 1] || [];
          const ligne = [];
          for (let j = 0; j < nc; j++) {
            ligne.push(row[c + j - 1] === undefined ? '' : row[c + j - 1]);
          }
          out.push(ligne);
        }
        return out;
      },
      setFontWeight() { return this; },
      setWrap() { return this; },
      setVerticalAlignment() { return this; },
      setValue(v) { return this.setValues([[v]]); },
      getValue() { return this.getValues()[0][0]; },
      setDataValidation() { return this; },
      createFilter() { return { remove() {} }; }
    };
  }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  getMaxRows() { return Math.max(1000, this.cells.length); }
  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.cells.length),
      Math.max(1, this.getLastColumn()));
  }
  clear() { this.cells = []; return this; }
  getFilter() { return null; }
  autoResizeColumns() { return this; }
  hideSheet() { this.cachee = true; return this; }
  showSheet() { this.cachee = false; return this; }
  isSheetHidden() { return this.cachee; }
  getValue() { return this.cells[0] ? this.cells[0][0] : ''; }
}

class FauxClasseur {
  constructor(feuilles = []) {
    this.feuilles = feuilles.map((n) => new FauxFeuille(n));
  }
  getSheets() { return this.feuilles; }
  getSheetByName(n) { return this.feuilles.find((f) => f.nom === n) || null; }
  insertSheet(n) { const f = new FauxFeuille(n); this.feuilles.push(f); return f; }
  deleteSheet(f) { this.feuilles = this.feuilles.filter((x) => x !== f); }
  setActiveSheet() { return this; }
  moveActiveSheet() { return this; }
  getUrl() { return 'https://docs.google.com/…/faux'; }
  getId() { return 'FAUX_ID'; }
}

let classeurActif = null;

const sandbox = {
  console, Date, Math, String, Object, Array, Number, Error, JSON, Set, Map,
  Boolean, RegExp,
  HtmlService: {
    createHtmlOutput: (html) => ({
      html,
      setTitle() { return this; },
      setWidth() { return this; },
      setHeight() { return this; },
      setXFrameOptionsMode(mode) {
        // Le vrai service refuse un mode nul : le faux doit refuser aussi,
        // sans quoi il valide du code qui échouera chez Google.
        if (mode === undefined || mode === null) {
          throw new Error('L\'argument mode ne doit pas être null.');
        }
        return this;
      }
    }),
    // L'énumération réelle ne comporte que ces deux valeurs.
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' }
  },
  encodeURIComponent,
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d).toISOString();
      return fmt === 'yyyy-MM-dd' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
    }
  },
  Session: {
    getScriptTimeZone: () => 'Europe/Paris',
    getActiveUser: () => ({ getEmail: () => 'rssi@exemple.fr' })
  },
  SpreadsheetApp: {
    getActive: () => classeurActif,
    flush: () => {},
    newDataValidation: () => ({
      requireValueInList() { return this; },
      setAllowInvalid() { return this; },
      build() { return {}; }
    })
  },
  PropertiesService: null,
  ScriptApp: null,
  AdminReports: null,
  AdminDirectory: null
};
vm.createContext(sandbox);

// Ordre de chargement : celui de clasp, et rien d'autre. Apps Script exécute le
// premier niveau de chaque fichier dans l'ordre où clasp les a poussés —
// alphabétique (localeCompare), sauf `filePushOrder` dans .clasp.json.
//
// Le banc tenait autrefois une liste à la main, où Langues.gs précédait
// Decision.gs : il passait, alors qu'en production Decision.gs lisait
// ORDRE_STATUTS_ avant sa déclaration. ReferenceError au chargement, et plus
// une seule fonction du projet ne répondait, de la v1.5.0 à la v1.7.0. La liste
// oubliait aussi Sonde.gs.
//
// `filePushOrder` est refusé plutôt que rejoué : un ordre imposé à la main se
// perd au premier fichier ajouté. Une dépendance de chargement se corrige dans
// le code.
const clasp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.clasp.json'), 'utf8'));
if (clasp.filePushOrder) {
  console.log('ÉCHEC  .clasp.json déclare filePushOrder : supprimer la dépendance de '
    + 'chargement dans le code plutôt que d\'imposer un ordre.');
  process.exit(1);
}
const ordreClasp = fs.readdirSync(P).filter((f) => /\.(gs|js)$/.test(f))
  .sort((a, b) => a.localeCompare(b));
for (const f of ordreClasp) {
  try {
    vm.runInContext(fs.readFileSync(P + f, 'utf8'), sandbox, { filename: f });
  } catch (e) {
    console.log(`ÉCHEC  ${f} ne se charge pas : ${e.message}`
      + `\n  ordre d'exécution chez Google : ${ordreClasp.join(', ')}`
      + '\n  En production, toute exécution échouerait au chargement du projet.');
    process.exit(1);
  }
}
// Les déclarations `const` de portée globale ne deviennent pas des propriétés de
// l'objet global : on va les chercher dans la portée lexicale du contexte.
const pris = (nom) => vm.runInContext(nom, sandbox);
const {
  famille_, domaine_, portees_, octets_, classer_, lignesDe_, agreger_,
  brutCourant_, etatPresume_, COLONNES_BRUT_,
  lireModele_, grouperAutorisants_, corpsCourriel_,
  lireDecisions_, decisionsSilencieuses_, COLONNES_DECISIONS_, libelleProfil_,
  jour_, enClair_, nettoyerFeuilleParDefaut_, entetesEn_, colonne_, chargerCatalogue_, classerPortee_, pireNiveau_, evaluer_,
  lireJetons_, etatJeton_, COLONNES_JETONS_, palmares_, SEUIL_VOLUME_30J_,
  GUIDE_, dossier_, ficheHtml_,
  preparerRevocations, COLONNES_REVOCATIONS_, STATUT_REVOCABLE_,
  pageAccueil_, pageFiche_, dateLisible_, datesLisibles_,
  etatDuTravail_, prochaineEtape_, VERSION_, ONGLETS_, COLONNES_,
  nomOnglet_, chercherOnglet_, ongletCanonique_,
  t_, TEXTES_, LANGUES_, langueValide_, langueDe_, reglages_, enClairLangue_,
  dateLisibleLangue_,
  estStatut_, nomStatut_, statutsEn_, ACTIONS_, STATUTS_LANGUE_,
  moissonner, entetesBrut_, resserrerBrut, inventorierJetons,
  comptesNonMesures_, COLONNES_ECHECS_, ilYaJours_,
  REPRISES_SANS_PROGRES_MAX_, fenetreRecenteEffective_, FENETRE_RECENTE_JOURS_,
  moissonnerDepuisMenu_
} = Object.fromEntries([
  'famille_', 'domaine_', 'portees_', 'octets_', 'classer_', 'lignesDe_',
  'agreger_', 'brutCourant_', 'etatPresume_', 'COLONNES_BRUT_',
  'lireModele_', 'grouperAutorisants_', 'corpsCourriel_',
  'lireDecisions_', 'decisionsSilencieuses_', 'COLONNES_DECISIONS_', 'libelleProfil_',
  'jour_', 'enClair_', 'nettoyerFeuilleParDefaut_', 'entetesEn_', 'colonne_', 'chargerCatalogue_', 'classerPortee_', 'pireNiveau_', 'evaluer_',
  'lireJetons_', 'etatJeton_', 'COLONNES_JETONS_', 'palmares_', 'SEUIL_VOLUME_30J_',
  'GUIDE_', 'dossier_', 'ficheHtml_',
  'preparerRevocations', 'COLONNES_REVOCATIONS_', 'STATUT_REVOCABLE_',
  'pageAccueil_', 'pageFiche_', 'dateLisible_', 'datesLisibles_',
  'etatDuTravail_', 'prochaineEtape_', 'VERSION_', 'ONGLETS_', 'COLONNES_',
  'nomOnglet_', 'chercherOnglet_', 'ongletCanonique_',
  't_', 'TEXTES_', 'LANGUES_', 'langueValide_', 'langueDe_', 'reglages_',
  'enClairLangue_', 'dateLisibleLangue_',
  'estStatut_', 'nomStatut_', 'statutsEn_', 'ACTIONS_', 'STATUTS_LANGUE_',
  'moissonner', 'entetesBrut_', 'resserrerBrut', 'inventorierJetons',
  'comptesNonMesures_', 'COLONNES_ECHECS_', 'ilYaJours_',
  'REPRISES_SANS_PROGRES_MAX_', 'fenetreRecenteEffective_', 'FENETRE_RECENTE_JOURS_',
  'moissonnerDepuisMenu_'
].map((n) => [n, pris(n)]));

let echecs = 0;
const verifier = (libelle, obtenu, attendu) => {
  if (JSON.stringify(obtenu) === JSON.stringify(attendu)) {
    console.log(`  ok     ${libelle}`);
    return;
  }
  echecs++;
  console.log(`  ÉCHEC  ${libelle}`
    + `\n    obtenu  ${JSON.stringify(obtenu)}`
    + `\n    attendu ${JSON.stringify(attendu)}`);
};

const J = 'https://www.googleapis.com/auth/';
// doGet ne se teste pas directement : il ouvre le classeur par son identifiant.
// On rejoue sa logique de repli, qui est la seule chose qui compte ici.
const doGetSimule = (cid) => {
  try { return pageFiche_(classeurActif, cid).html; }
  catch (e) { return pageAccueil_(classeurActif).html; }
};

console.log('\njour_ — Sheets rend des Date, pas des chaînes ISO');
// C'est le défaut qu'un envoi réel a révélé : « Thu May 14 » dans le courriel,
// et une période observée triée sur le nom du jour.
verifier('chaîne ISO', jour_('2026-05-14T08:00:00.000Z'), '2026-05-14');
verifier('objet Date', jour_(new Date('2026-05-14T08:00:00.000Z')), '2026-05-14');
verifier('vide', jour_(''), '');
verifier('ordre chronologique conservé',
  jour_(new Date('2026-05-14T00:00:00Z')) < jour_(new Date('2026-08-29T00:00:00Z')), true);

console.log('\nenClair_ — ce que lit le destinataire, pas l\'administrateur');
verifier('une famille', enClair_(['drive']), 'vos fichiers Drive');
verifier('deux familles', enClair_(['drive', 'gmail']),
  'vos fichiers Drive et votre messagerie');
verifier('trois familles', enClair_(['admin', 'script', 'spreadsheets']),
  'l\'administration du domaine, vos projets Apps Script et vos feuilles de calcul');
verifier('famille inconnue', enClair_(['zzz']), 'zzz (service Google)');
verifier('aucune famille', enClair_([]), 'accès non précisé par le journal');

console.log('\nCatalogue des portées');
const catalogue = chargerCatalogue_(new FauxClasseur([]));
const niveau = (p) => classerPortee_(p, catalogue).niveau;
verifier('drive complet est restreinte', niveau(`${J}drive`), 'restreinte');
verifier('drive.readonly aussi', niveau(`${J}drive.readonly`), 'restreinte');
// Le piège : drive.file ne donne accès qu'aux fichiers créés par l'application.
// La confondre avec drive punirait la portée la plus vertueuse.
verifier('drive.file reste basique', niveau(`${J}drive.file`), 'basique');
verifier('toute la famille Gmail est restreinte', niveau(`${J}gmail.send`), 'restreinte');
verifier('mail.google.com aussi', niveau('https://mail.google.com/'), 'restreinte');
verifier('openid est basique', niveau('openid'), 'basique');
verifier('une portée inconnue est tenue pour sensible',
  niveau(`${J}portee.inventee`), 'sensible');
verifier('… et signalée comme non cataloguée',
  classerPortee_(`${J}portee.inventee`, catalogue).connue, false);
verifier('admin.directory porte l\'administration du domaine',
  classerPortee_(`${J}admin.directory.user`, catalogue).administration, true);
verifier('drive, non', classerPortee_(`${J}drive`, catalogue).administration, false);
verifier('la clé la plus longue gagne',
  niveau(`${J}drive.metadata.readonly`), 'restreinte');

verifier('pireNiveau_ garde le plus grave',
  pireNiveau_('sensible', 'restreinte'), 'restreinte');
verifier('pireNiveau_ ignore le vide', pireNiveau_(null, 'basique'), 'basique');

console.log('\nevaluer_ — une priorité qui sait dire pourquoi');
const appFictive = (o) => ({
  niveauMax: 'basique', administration: false,
  autorisants: new Set(), aPrivileges: new Set(), suspendus: new Set(),
  porteesInconnues: new Set(), ...o
});
verifier('rien à signaler', evaluer_(appFictive({})).points, 0);
verifier('portée restreinte', evaluer_(appFictive({ niveauMax: 'restreinte' })).points, 3);
const cumul = evaluer_(appFictive({
  niveauMax: 'restreinte', administration: true,
  aPrivileges: new Set(['a@b.fr']), suspendus: new Set(['c@b.fr'])
}));
verifier('les motifs se cumulent', cumul.points, 10);
verifier('et chacun se lit', cumul.motifs.includes('portée restreinte (+3)'), true);
verifier('avec son compte', cumul.motifs.includes('1 compte(s) à privilèges (+2)'), true);
verifier('un seul autorisant ne pèse pas',
  evaluer_(appFictive({ autorisants: new Set(['a@b.fr']) })).points, 0);

console.log('\nVersion — un seul numéro, et il doit être vrai');
// Une version affichée et fausse est pire que pas de version : un déploiement
// Apps Script sert une copie figée, et c'est le seul moyen de savoir laquelle.
const versionDeposee = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
verifier('la constante du code vaut le fichier VERSION', VERSION_, versionDeposee);
verifier('et elle est bien formée', /^\d+\.\d+\.\d+$/.test(VERSION_), true);

// Les en-têtes annoncent une version d'INTRODUCTION, jamais une version courante.
const entetesFichiers = fs.readdirSync(P).filter((f) => f.endsWith('.gs'))
  .map((f) => ({ f, ligne: fs.readFileSync(P + f, 'utf8').split('\n')[1] }));
verifier('tous les fichiers ont un en-tête', entetesFichiers.length, 17);
const sansIntroduction = entetesFichiers
  .filter((e) => !/introduit\w* en v\d+\.\d+/.test(e.ligne));
verifier('chacun dit quand il est apparu',
  sansIntroduction.map((e) => e.f), []);
const pretendantEtreAJour = entetesFichiers
  .filter((e) => /— v\d+\.\d+\.?$/.test(e.ligne.trim()));
verifier('aucun ne prétend porter une version courante',
  pretendantEtreAJour.map((e) => e.f), []);

console.log('\nBascule de langue — un classeur français reste lisible');
// C'est LE risque du bilinguisme : les noms d'onglets et d'en-têtes servent de
// clés de lecture. Un classeur créé en français doit rester lisible en anglais,
// et l'onglet Décisions — que rien ne reconstruit — ne doit jamais être doublé.
const bilingue = (table) => Object.keys(table)
  .filter((id) => LANGUES_.some((l) => !table[id][l]));
verifier('chaque onglet a un nom dans les deux langues', bilingue(ONGLETS_), []);
verifier('chaque colonne aussi', bilingue(COLONNES_), []);

const enTetesFr = entetesEn_(['clientId', 'statut', 'revoirAvant'], 'fr');
const enTetesEn = entetesEn_(['clientId', 'statut', 'revoirAvant'], 'en');
verifier('les en-têtes diffèrent bien', enTetesFr[1] !== enTetesEn[1], true);
verifier('le résolveur lit les en-têtes français', colonne_(enTetesFr, 'statut'), 1);
verifier('… et les anglais', colonne_(enTetesEn, 'statut'), 1);
verifier('une colonne inconnue rend -1', colonne_(enTetesFr, 'inventee'), -1);

const bascule = new FauxClasseur(['Décisions', 'Synthèse']);
bascule.getSheetByName('Décisions').getRange(1, 1, 2, 2)
  .setValues([['client_id', 'Statut'], ['cidX', 'approuvée']]);
verifier('on retrouve l\'onglet sous son nom français',
  Boolean(chercherOnglet_(bascule, 'decisions')), true);
const renomme = ongletCanonique_(bascule, 'decisions', 'en');
verifier('il est RENOMMÉ, pas doublé', renomme.getName(), 'Decisions');
verifier('et le classeur n\'a pas gagné d\'onglet', bascule.getSheets().length, 2);
verifier('son contenu est intact', renomme.cells[1][1], 'approuvée');
verifier('on le retrouve ensuite sous son nom anglais',
  chercherOnglet_(bascule, 'decisions').getName(), 'Decisions');
verifier('et le nom français reste reconnu',
  nomOnglet_('decisions', 'fr'), 'Décisions');

console.log('\nLangues — le dictionnaire tient ses promesses');
const cles = Object.keys(TEXTES_);
verifier('le dictionnaire n\'est pas vide', cles.length > 60, true);
const incompletes = cles.filter((c) => LANGUES_.some((l) => !TEXTES_[c][l]));
verifier('chaque clé existe dans les deux langues', incompletes, []);
verifier('une clé absente se voit dans le rendu', t_('cle.inventee', 'fr'), '«cle.inventee»');
verifier('les substitutions se font par nom',
  t_('vue.premieres', 'fr', { n: 40, total: 212 }),
  'Les 40 premières sur 212. La liste complète est dans le classeur.');
verifier('… dans les deux langues',
  t_('vue.premieres', 'en', { n: 40, total: 212 }),
  'The first 40 of 212. The full list is in the spreadsheet.');

console.log('\nLangues — la langue du destinataire, pas celle de l\'outil');
verifier('une langue inconnue retombe sur le défaut', langueValide_('de'), 'fr');
verifier('la casse ne compte pas', langueValide_(' EN '), 'en');
const reg = { courriels: 'fr', parDomaine: new Map([['filiale.co.uk', 'en']]) };
verifier('la règle de domaine décide', langueDe_('bob@filiale.co.uk', reg), 'en');
verifier('sinon le défaut s\'applique', langueDe_('alice@exemple.fr', reg), 'fr');

console.log('\nLangues — les accès dits à qui les lit');
verifier('en français', enClairLangue_(['drive', 'admin'], 'fr'),
  'vos fichiers Drive et l\'administration du domaine');
verifier('en anglais', enClairLangue_(['drive', 'admin'], 'en'),
  'your Drive files and domain administration');
verifier('une famille inconnue reste identifiable',
  enClairLangue_(['zzz'], 'en'), 'zzz (Google service)');
verifier('les dates suivent la langue',
  dateLisibleLangue_('2026-05-01', 'en'), '1 May 2026');
verifier('… et le français garde son ordinal',
  dateLisibleLangue_('2026-05-01', 'fr'), '1er mai 2026');

console.log('\nFonctions pures');
verifier('famille_ drive', famille_(`${J}drive.readonly`), 'drive');
verifier('famille_ admin', famille_(`${J}admin.directory.user.security`), 'admin');
verifier('famille_ userinfo', famille_(`${J}userinfo.email`), 'identité');
verifier('famille_ openid', famille_('openid'), 'identité');
verifier('domaine_', domaine_('a@b.com'), 'b.com');
verifier('domaine_ vide', domaine_(''), '(sans domaine)');
verifier('portees_ liste', portees_({ scope: ['a', 'b'] }), ['a', 'b']);
verifier('portees_ chaîne', portees_({ scope: 'a b' }), ['a', 'b']);
verifier('portees_ absente', portees_({}), []);
verifier('octets_ Mo', octets_(1024 * 1024 * 3), '3 Mo');
verifier('classer_ décroissant', classer_({ a: 1, b: 3, c: 2 }), [['b', 3], ['c', 2], ['a', 1]]);

console.log('\netatPresume_ — ce que le journal seul autorise à dire');
const couple = (o) => ({ autorisations: 0, revocations: 0, refus: 0, activites: 0, ...o });
verifier('autorisé, jamais révoqué', etatPresume_(couple({ autorisations: 1 })), 'présumé actif');
verifier('autorisé puis révoqué',
  etatPresume_(couple({ autorisations: 1, revocations: 1 })), 'révoqué depuis');
verifier('appels sans autorisation',
  etatPresume_(couple({ activites: 3 })), 'antérieur à la fenêtre');
verifier('révoqué seul', etatPresume_(couple({ revocations: 1 })), 'révoqué');
verifier('refusé seul', etatPresume_(couple({ refus: 2 })), 'refusé');
verifier('rien', etatPresume_(couple({})), '—');

console.log('\nbrutCourant_ — le classeur neuf et sa « Feuille 1 »');
classeurActif = new FauxClasseur(['Feuille 1']);
let brut = brutCourant_(classeurActif);
verifier('la feuille par défaut est renommée', brut.getName(), '_Brut');
verifier('aucune feuille orpheline ajoutée', classeurActif.getSheets().length, 1);
verifier('en-têtes posés en français',
  brut.getRange(1, 1, 1, COLONNES_BRUT_.length).getValues()[0],
  entetesEn_(COLONNES_BRUT_, 'fr'));
verifier('appel suivant : même onglet', brutCourant_(classeurActif).getName(), '_Brut');

classeurActif = new FauxClasseur(['Notes', 'Autre']);
brut = brutCourant_(classeurActif);
verifier('classeur déjà peuplé : on insère', classeurActif.getSheets().length, 3);
verifier('sans toucher aux feuilles existantes',
  classeurActif.getSheets().map((f) => f.getName()), ['Notes', 'Autre', '_Brut']);

console.log('\nnettoyerFeuilleParDefaut_ — la feuille qui traîne');
const c1 = new FauxClasseur(['Feuille 1', 'Synthèse']);
verifier('une « Feuille 1 » vide s\'en va', nettoyerFeuilleParDefaut_(c1), true);
verifier('et le classeur ne garde que le reste',
  c1.getSheets().map((f) => f.getName()), ['Synthèse']);

const c2 = new FauxClasseur(['Sheet1', 'Synthèse']);
verifier('la variante anglaise aussi', nettoyerFeuilleParDefaut_(c2), true);

const c3 = new FauxClasseur(['Feuille 1', 'Synthèse']);
c3.getSheets()[0].getRange(1, 1).setValues([['des notes']]);
verifier('mais jamais une feuille qui porte quelque chose',
  nettoyerFeuilleParDefaut_(c3), false);

const c4 = new FauxClasseur(['Feuille 1']);
verifier('ni la dernière feuille du classeur', nettoyerFeuilleParDefaut_(c4), false);

console.log('\nlignesDe_ — un événement du journal devient une ligne');
const ligne = lignesDe_({
  id: { time: '2026-09-03T08:12:00.000Z' },
  actor: { email: 'alice@exemple.fr' },
  events: [{
    name: 'authorize',
    parameters: [
      { name: 'app_name', value: 'NotebookLM' },
      { name: 'client_id', value: '123.apps.googleusercontent.com' },
      { name: 'client_type', value: 'WEB' },
      { name: 'scope', multiValue: [`${J}drive.readonly`, 'openid'] }
    ]
  }]
})[0];
verifier('horodatage', ligne[0], '2026-09-03T08:12:00.000Z');
verifier('compte', ligne[1], 'alice@exemple.fr');
verifier('domaine', ligne[2], 'exemple.fr');
verifier('evenement', ligne[3], 'authorize');
verifier('application', ligne[4], 'NotebookLM');
verifier('portees jointes', ligne[7], `${J}drive.readonly openid`);
verifier('largeur = nb colonnes', ligne.length, COLONNES_BRUT_.length);

console.log('\nagreger_ — sur un brut simulé');
classeurActif = new FauxClasseur(['Feuille 1']);
brut = brutCourant_(classeurActif);
// bob est administrateur délégué, carl est suspendu : l'annuaire l'a relevé
const comptes = classeurActif.insertSheet('_Comptes');
comptes.getRange(1, 1, 3, 5).setValues([
  ['Compte', 'Administrateur', 'Délégué', 'Suspendu', 'Relevé le'],
  ['bob@exemple.fr', '', 'oui', '', '2026-09-06'],
  ['carl@filiale.fr', '', '', 'oui', '2026-09-06']
]);
const D = (iso) => new Date(iso);
const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const vieux = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString();
const lignes = [
  // alice autorise Notebook (drive.readonly), puis le révoque
  [D('2026-08-01T10:00:00Z'), 'alice@exemple.fr', 'exemple.fr', 'authorize', 'NotebookLM', 'cid1', 'WEB', `${J}drive.readonly`, '', '', '', '', '', ''],
  [D('2026-08-20T10:00:00Z'), 'alice@exemple.fr', 'exemple.fr', 'revoke', 'NotebookLM', 'cid1', 'WEB', `${J}drive.readonly`, '', '', '', '', '', ''],
  // bob autorise Notebook et ne révoque jamais
  [D('2026-08-05T10:00:00Z'), 'bob@exemple.fr', 'exemple.fr', 'authorize', 'NotebookLM', 'cid1', 'WEB', `${J}drive.readonly`, '', '', '', '', '', ''],
  // bob se fait refuser SuperIA par la politique du tenant
  [D('2026-08-06T10:00:00Z'), 'bob@exemple.fr', 'exemple.fr', 'deny', 'SuperIA', 'cid2', 'WEB', `${J}gmail.readonly`, 'ADMIN_POLICY', '', '', '', '', ''],
  // carl : un appel d'API avec volume, sans autorisation visible sur la période
  [D(vieux), 'carl@filiale.fr', 'filiale.fr', 'activity', 'NotebookLM', 'cid1', 'WEB', '', '', '', 'drive', 'files.list', 5242880, 'DRIVE'],
  // un appel d'hier : il doit tomber dans la fenêtre courte, l'autre non
  [D(hier), 'carl@filiale.fr', 'filiale.fr', 'activity', 'NotebookLM', 'cid1', 'WEB', '', '', '', 'gmail', 'messages.list', 2097152, 'GMAIL']
];
brut.getRange(2, 1, lignes.length, COLONNES_BRUT_.length).setValues(lignes);

agreger_(classeurActif, { jours: 180 });

const onglet = (nom) => classeurActif.getSheetByName(nom);
const ligneOu = (feuille, col, valeur) =>
  feuille.cells.slice(1).find((r) => r[col] === valeur);

const apps = onglet('Applications');
const notebook = ligneOu(apps, 0, 'NotebookLM');
verifier('Applications : 2 lignes', apps.getLastRow() - 1, 2);
verifier('NotebookLM — autorisants', notebook[8], 3);      // alice, bob, carl
verifier('NotebookLM — autorisations', notebook[11], 2);
verifier('NotebookLM — révocations', notebook[12], 1);
verifier('NotebookLM — appels', notebook[14], 2);
verifier('NotebookLM — volume', notebook[16], 5242880 + 2097152);
verifier('NotebookLM — familles', notebook[20], 'drive');

const syn = onglet('Synthèse');
const valeurSynthese = (libelle) => {
  const r = syn.cells.find((x) => String(x[0]).trim() === libelle);
  return r ? r[1] : undefined;
};
const aut = onglet('Autorisants');
verifier('Autorisants : 4 couples', aut.getLastRow() - 1, 4);
const alice = aut.cells.slice(1).find((r) => r[0] === 'alice@exemple.fr');
const bob = aut.cells.slice(1).find((r) => r[0] === 'bob@exemple.fr' && r[3] === 'NotebookLM');
const carl = aut.cells.slice(1).find((r) => r[0] === 'carl@filiale.fr');
verifier('alice — révoqué depuis', alice[10], 'révoqué depuis');
verifier('bob — présumé actif', bob[10], 'présumé actif');
verifier('carl — antérieur à la fenêtre', carl[10], 'antérieur à la fenêtre');
verifier('carl — appels comptés', carl[9], 2);
verifier('Synthèse — accès antérieurs', valeurSynthese('antérieur à la fenêtre'), 1);

console.log('\nÀ instruire — la file de travail');
const instruire = onglet('À instruire');
const notebookInstruire = ligneOu(instruire, 1, 'NotebookLM');
verifier('NotebookLM y figure', Boolean(notebookInstruire), true);
verifier('avec sa priorité', notebookInstruire[0], 7);   // restreinte +3, privilèges +2, suspendu +2
verifier('son niveau', notebookInstruire[3], 'restreinte');
verifier('et le détail du calcul',
  notebookInstruire[8].includes('portée restreinte (+3)'), true);
const superia = ligneOu(instruire, 1, 'SuperIA');
verifier('SuperIA aussi — gmail.readonly est restreinte', superia[3], 'restreinte');
verifier('la file est triée par priorité', instruire.cells[1][0] >= instruire.cells[2][0], true);

const port2 = onglet('Portées');
verifier('l\'onglet Portées porte le niveau',
  ligneOu(port2, 0, `${J}drive.readonly`)[1], 'restreinte');
verifier('et dit si la portée est au catalogue',
  ligneOu(port2, 0, `${J}drive.readonly`)[3], 'oui');

console.log('\nProfils — ce que l\'annuaire ajoute au journal');
verifier('libelleProfil_ délégué', libelleProfil_({ delegue: true }), 'délégué');
verifier('libelleProfil_ admin suspendu',
  libelleProfil_({ admin: true, suspendu: true }), 'administrateur, suspendu');
verifier('libelleProfil_ inconnu', libelleProfil_(undefined), '');
verifier('bob porte son profil dans Autorisants', bob[2], 'délégué');
verifier('carl aussi', carl[2], 'suspendu');
verifier('NotebookLM — autorisants à privilèges', notebook[9], 1);
verifier('NotebookLM — autorisants suspendus', notebook[10], 1);

console.log('\nDécisions — le classement survit au rafraîchissement');
const dec = classeurActif.getSheetByName('Décisions');
verifier('les applications sont inscrites au référentiel', dec.getLastRow() - 1, 2);
verifier('et sans statut au départ', notebook[2], 'non classée');

const iStatut = COLONNES_DECISIONS_.indexOf('statut') + 1;
const iMotif = COLONNES_DECISIONS_.indexOf('motif') + 1;
const iRevoir = COLONNES_DECISIONS_.indexOf('revoirAvant') + 1;
const ligneNotebook = dec.cells.slice(1).findIndex((r) => r[0] === 'cid1') + 2;
dec.getRange(ligneNotebook, iStatut).setValue('approuvée');
dec.getRange(ligneNotebook, iMotif).setValue('Outil validé par le RSSI');
dec.getRange(ligneNotebook, iRevoir).setValue('2027-01-01');

let decisions = lireDecisions_(classeurActif);
verifier('décision relue', decisions.get('cid1').statut, 'approuvée');
verifier('en vigueur', decisions.get('cid1').enVigueur, true);
verifier('non périmée', decisions.get('cid1').expiree, false);
verifier('elle fait taire la sollicitation',
  [...decisionsSilencieuses_(classeurActif)], ['cid1']);

// on remoissonne : le jugement doit survivre
agreger_(classeurActif, { jours: 180 });
const notebook2 = ligneOu(onglet('Applications'), 0, 'NotebookLM');
verifier('le statut survit à l\'agrégation', notebook2[2], 'approuvée');
verifier('le motif n\'a pas été réécrit',
  lireDecisions_(classeurActif).get('cid1').motif, 'Outil validé par le RSSI');
verifier('aucune ligne dupliquée au référentiel', dec.getLastRow() - 1, 2);

// une échéance dépassée rend la décision caduque
dec.getRange(ligneNotebook, iRevoir).setValue('2026-01-01');
decisions = lireDecisions_(classeurActif);
verifier('décision périmée', decisions.get('cid1').expiree, true);
verifier('et donc plus en vigueur', decisions.get('cid1').enVigueur, false);
verifier('elle ne fait plus taire personne',
  decisionsSilencieuses_(classeurActif).size, 0);
agreger_(classeurActif, { jours: 180 });
verifier('le rapport le dit',
  ligneOu(onglet('Applications'), 0, 'NotebookLM')[2], 'approuvée (périmée)');
dec.getRange(ligneNotebook, iRevoir).setValue('2027-01-01');

const port = onglet('Portées');
verifier('Portées : 2', port.getLastRow() - 1, 2);
const drive = ligneOu(port, 0, `${J}drive.readonly`);
verifier('drive.readonly — 1 application', drive[5], 1);
verifier('drive.readonly — 2 comptes', drive[6], 2);

verifier('Synthèse — événements', valeurSynthese('Événements'), 6);
verifier('Synthèse — comptes distincts', valeurSynthese('Comptes distincts'), 3);
verifier('Synthèse — applications', valeurSynthese('Applications distinctes'), 2);
verifier('Synthèse — période', valeurSynthese('Période observée'),
  `${jour_(new Date(vieux))} → ${jour_(new Date(hier))}`);
verifier('première vue lisible', notebook[22], jour_(new Date(vieux)));
verifier('dernière vue lisible', notebook[23], jour_(new Date(hier)));
verifier('Synthèse — motif de refus', valeurSynthese('ADMIN_POLICY'), 1);
verifier('Synthèse — volume cumulé', valeurSynthese('Volume cumulé'), '7 Mo');
verifier('_Brut masqué', brut.cachee, true);

console.log('\nVolumétrie — deux fenêtres, parce qu\'une seule induirait en erreur');
const vol = onglet('Volumétrie');
verifier('un service par ligne', vol.getLastRow() - 1, 2);
const ligneDrive = ligneOu(vol, 2, 'DRIVE');
const ligneGmail = ligneOu(vol, 2, 'GMAIL');
verifier('l\'appel Drive est compté', ligneDrive[5], 5242880);
verifier('mais hors de la fenêtre courte', ligneDrive[8], 0);
verifier('l\'appel d\'hier y est', ligneGmail[8], 2097152);
verifier('la part du total est donnée', ligneDrive[9] > 0, true);
verifier('Synthèse — volume cumulé', valeurSynthese('Volume cumulé'), '7 Mo');
verifier('Synthèse — volume sur 30 jours', valeurSynthese('Volume sur 30 jours'), '2 Mo');
verifier('le palmarès ne retient que la fenêtre courte',
  palmares_(new Map([['a', { nom: 'X', octets30: 0 }]])).length, 0);

const appsVol = onglet('Applications');
const notebookVol = ligneOu(appsVol, 0, 'NotebookLM');
verifier('l\'application porte son volume lisible', notebookVol[15], '7 Mo');
verifier('et celui des 30 derniers jours', notebookVol[17], '2 Mo');
verifier('le seuil de la file de travail est franc', SEUIL_VOLUME_30J_, 1073741824);

console.log('\nInventaire — un fait, tenu à part d\'une présomption');
verifier('sans relevé, la colonne reste vide',
  etatJeton_({ jetonActif: false }, false), '');
verifier('avec relevé, un jeton présent est un fait',
  etatJeton_({ jetonActif: true }, true), 'actif');
verifier('et son absence aussi', etatJeton_({ jetonActif: false }, true), 'clos');
verifier('aucun relevé : lireJetons_ rend null, pas une liste vide',
  lireJetons_(new FauxClasseur([])), null);

console.log('\nInventaire — croisé avec le journal');
// dora n'apparaît nulle part au journal : son jeton est le seul indice qu'elle
// a autorisé « Vieil outil », il y a plus de six mois.
const releve = classeurActif.insertSheet('_Jetons');
releve.getRange(1, 1, 3, COLONNES_JETONS_.length).setValues([
  entetesEn_(COLONNES_JETONS_, 'fr'),
  ['bob@exemple.fr', 'cid1', 'NotebookLM', `${J}drive.readonly`, '', '', '2026-09-06'],
  ['dora@exemple.fr', 'cidZ', 'Vieil outil', `${J}gmail.readonly`, '', '', '2026-09-06']
]);
agreger_(classeurActif, { jours: 180 });

const apps3 = onglet('Applications');
verifier('l\'application inconnue du journal apparaît',
  Boolean(ligneOu(apps3, 0, 'Vieil outil')), true);
const aut3 = onglet('Autorisants');
const bobJeton = aut3.cells.slice(1).find((r) => r[0] === 'bob@exemple.fr' && r[3] === 'NotebookLM');
const aliceJeton = aut3.cells.slice(1).find((r) => r[0] === 'alice@exemple.fr');
verifier('bob : jeton actif', bobJeton[5], 'actif');
verifier('alice : jeton clos, ce que le journal laissait déjà entendre',
  aliceJeton[5], 'clos');

const dormants = onglet('Dormants');
verifier('un seul accès dormant', dormants.getLastRow() - 1, 1);
verifier('c\'est dora', dormants.cells[1][0], 'dora@exemple.fr');
verifier('sur Vieil outil', dormants.cells[1][3], 'Vieil outil');
verifier('bob n\'y est pas : son autorisation est au journal',
  Boolean(ligneOu(dormants, 0, 'bob@exemple.fr')), false);
verifier('Synthèse — jetons actifs', valeurSynthese('jetons actifs relevés'), 2);
verifier('Synthèse — dormants', valeurSynthese('dont accès dormants'), 1);

const port3 = onglet('Portées');
verifier('une portée connue du seul inventaire figure au rapport',
  Boolean(ligneOu(port3, 0, `${J}gmail.readonly`)), true);
verifier('avec son niveau', ligneOu(port3, 0, `${J}gmail.readonly`)[1], 'restreinte');

const vieil = ligneOu(onglet('À instruire'), 1, 'Vieil outil');
verifier('l\'accès dormant pèse dans la file',
  vieil[8].includes('jeton(s) actif(s) sans autorisation au journal (+2)'), true);

// on retire le relevé : le classeur doit redevenir muet sur les jetons
classeurActif.feuilles = classeurActif.feuilles.filter((f) => f.nom !== '_Jetons');
agreger_(classeurActif, { jours: 180 });
verifier('sans relevé, plus de colonne Jeton remplie',
  onglet('Autorisants').cells[1][5], '');

console.log('\nSollicitation — le référentiel');
const modele = lireModele_(classeurActif);
verifier('objet lu', String(modele.params.Objet).startsWith('Applications tierces'), true);
verifier('délai lu', modele.params['Délai de réponse (jours)'], 15);
verifier('règles françaises séparées des paramètres', modele.regles.fr.length, 7);
verifier('règles anglaises aussi', modele.regles.en.length, 7);
verifier('la première règle vise les projets sans titre',
  modele.regles.fr[0].includes('Projet sans titre'), true);
verifier('… et son équivalent anglais',
  modele.regles.en[0].includes('Untitled project'), true);
verifier('les règles ne polluent pas les paramètres', modele.params['1'], undefined);

console.log('\nSollicitation — qui est retenu, qui est écarté');
// Autorisants a été produit plus haut par agreger_ : alice a révoqué, bob est
// actif, carl est antérieur à la fenêtre, et SuperIA a été refusée à bob.
dec.getRange(ligneNotebook, iStatut).setValue('');
let groupes = grouperAutorisants_(classeurActif);
verifier('deux comptes retenus', [...groupes.parCompte.keys()].sort(),
  ['bob@exemple.fr', 'carl@filiale.fr']);
verifier('alice écartée : elle a révoqué', groupes.parCompte.has('alice@exemple.fr'), false);
verifier('bob : une seule application', groupes.parCompte.get('bob@exemple.fr').apps.length, 1);
verifier('bob : SuperIA écartée car refusée',
  groupes.parCompte.get('bob@exemple.fr').apps[0].nom, 'NotebookLM');
verifier('familles conservées en liste',
  groupes.parCompte.get('bob@exemple.fr').apps[0].familles, ['drive']);
verifier('date d\'autorisation lisible',
  groupes.parCompte.get('bob@exemple.fr').apps[0].depuis, '2026-08-05');

// l'application jugée approuvée ne sollicite plus personne
dec.getRange(ligneNotebook, iStatut).setValue('approuvée');
groupes = grouperAutorisants_(classeurActif);
verifier('application approuvée : plus personne à solliciter', groupes.parCompte.size, 0);
verifier('et le décompte des écartés le dit', groupes.ecartesApprouvees, 2);
dec.getRange(ligneNotebook, iStatut).setValue('');

console.log('\nSollicitation — deux identifiants, un seul nom');
// Cas relevé sur un envoi réel : « workspace-console » figurait deux fois, avec
// deux client_id et deux jeux de portées. Le destinataire ne peut pas les
// distinguer ; on lui en présente une seule ligne, portées réunies.
const autorisants = classeurActif.getSheetByName('Autorisants');
const enTetes = autorisants.cells[0];
const modele2 = new Array(enTetes.length).fill('');
const pose = (nom, valeur) => { modele2[enTetes.indexOf(nom)] = valeur; };
pose('Compte', 'dora@exemple.fr');
pose('Domaine', 'exemple.fr');
pose('Application', 'workspace-console');
pose('État présumé', 'présumé actif');
pose('Première', new Date('2026-04-02T00:00:00Z'));
pose('client_id', 'cidA');
pose('Portées', `${J}drive.readonly ${J}admin.directory.user.readonly`);
autorisants.getRange(autorisants.getLastRow() + 1, 1, 1, enTetes.length).setValues([modele2]);
pose('client_id', 'cidB');
pose('Première', new Date('2026-02-10T00:00:00Z'));
pose('Portées', `${J}calendar.readonly`);
autorisants.getRange(autorisants.getLastRow() + 1, 1, 1, enTetes.length).setValues([modele2]);

const groupesDora = grouperAutorisants_(classeurActif).parCompte.get('dora@exemple.fr');
verifier('une seule ligne pour les deux identifiants', groupesDora.apps.length, 1);
verifier('portées réunies', groupesDora.apps[0].familles.sort(),
  ['admin', 'calendar', 'drive']);
verifier('la plus ancienne date est retenue', groupesDora.apps[0].depuis, '2026-02-10');

console.log('\nSollicitation — le courriel');
const appsCourriel = [
  { nom: 'Projet sans titre', familles: ['drive', 'script'], depuis: '2026-05-02' },
  { nom: 'Outil <script>alerte</script>', familles: ['gmail'], depuis: '2026-01-09' }
];
const { html, texte } = corpsCourriel_('bob@exemple.fr', appsCourriel, modele, 'fr');
verifier('le nom de l\'application figure', html.includes('Projet sans titre'), true);
verifier('le HTML injecté est neutralisé', html.includes('<script>alerte'), false);
verifier('… et rendu en texte échappé', html.includes('&lt;script&gt;alerte'), true);
verifier('le lien de révocation est donné',
  html.includes('myaccount.google.com/permissions'), true);
verifier('les sept règles sont dans le courriel',
  (html.match(/<li style="margin:6px 0">/g) || []).length, 7);
verifier('les portées sont dites en clair, pas en jargon',
  html.includes('vos fichiers Drive et vos projets Apps Script'), true);
verifier('le délai est repris', html.includes('<strong>15 jours</strong>'), true);
verifier('la version texte existe aussi', texte.includes('Projet sans titre'), true);
verifier('la version texte porte les règles',
  texte.includes('règles de nommage à appliquer'), true);
verifier('aucune famille technique ne subsiste dans le tableau',
  /<td[^>]*>drive<\/td>/.test(html), false);

console.log('\nCourriel — le même, en anglais');
const anglais = corpsCourriel_('bob@filiale.co.uk', appsCourriel, modele, 'en');
verifier('l\'objet est traduit', anglais.objet.startsWith('Third-party apps'), true);
verifier('le corps aussi', anglais.html.includes('Hello,'), true);
verifier('les accès sont dits en anglais',
  anglais.html.includes('your Drive files and your Apps Script projects'), true);
verifier('les règles de nommage sont les anglaises',
  anglais.html.includes('Untitled project'), true);
verifier('… et plus les françaises',
  anglais.html.includes('Jamais « Projet sans titre »'), false);
verifier('les dates sont anglaises', anglais.html.includes('2 May 2026'), true);
verifier('la version texte suit', anglais.texte.includes('Hello,'), true);
verifier('aucun résidu de français dans le corps anglais',
  /Merci de nous répondre|Bonjour,|Ce que nous vous demandons/.test(anglais.html), false);

console.log('\nRévocation — le référentiel commande, pas un filtre');
// On reconstitue un relevé de jetons et on éprouve ce qui entre dans le plan.
const releve2 = classeurActif.getSheetByName('_Jetons')
  || classeurActif.insertSheet('_Jetons');
releve2.clear();
releve2.getRange(1, 1, 3, COLONNES_JETONS_.length).setValues([
  entetesEn_(COLONNES_JETONS_, 'fr'),
  ['bob@exemple.fr', 'cid1', 'NotebookLM', `${J}drive.readonly`, '', '', '2026-09-06'],
  ['dora@exemple.fr', 'cidZ', 'Vieil outil', `${J}gmail.readonly`, '', '', '2026-09-06']
]);
agreger_(classeurActif, { jours: 180 });

const dec2 = classeurActif.getSheetByName('Décisions');
const enTetesDec = dec2.cells[0];
const colDec = (id) => colonne_(enTetesDec, id) + 1;
const ligneDe = (cid) => dec2.cells.slice(1).findIndex((r) => r[0] === cid) + 2;

// aucune décision : le plan doit rester vide
preparerRevocations();
let plan = classeurActif.getSheetByName('Révocations');
verifier('sans décision, aucune révocation', plan.getLastRow() - 1, 0);

// une application approuvée n'est pas révocable non plus
dec2.getRange(ligneDe('cid1'), colDec('statut')).setValue('approuvée');
preparerRevocations();
verifier('une application approuvée non plus',
  classeurActif.getSheetByName('Révocations').getLastRow() - 1, 0);

// seule « à bloquer », décision en vigueur, produit des lignes
dec2.getRange(ligneDe('cidZ'), colDec('statut'))
  .setValue(nomStatut_(STATUT_REVOCABLE_, 'fr'));
dec2.getRange(ligneDe('cidZ'), colDec('motif')).setValue('Éditeur inconnu');
dec2.getRange(ligneDe('cidZ'), colDec('decidePar')).setValue('RSSI');
preparerRevocations();
plan = classeurActif.getSheetByName('Révocations');
verifier('« à bloquer » produit une ligne', plan.getLastRow() - 1, 1);
const iEtatPlan = COLONNES_REVOCATIONS_.indexOf('etat');
verifier('à l\'état « à révoquer »', plan.cells[1][iEtatPlan], 'à révoquer');
verifier('sur le bon compte', plan.cells[1][0], 'dora@exemple.fr');
verifier('le motif de la décision suit',
  plan.cells[1][COLONNES_REVOCATIONS_.indexOf('motifDecision')], 'Éditeur inconnu');
verifier('et son auteur aussi',
  plan.cells[1][COLONNES_REVOCATIONS_.indexOf('decidePar')], 'RSSI');

// une décision périmée ne commande plus rien
dec2.getRange(ligneDe('cidZ'), colDec('revoirAvant')).setValue('2020-01-01');
preparerRevocations();
verifier('une décision périmée ne commande plus rien',
  classeurActif.getSheetByName('Révocations').getLastRow() - 1, 0);
dec2.getRange(ligneDe('cidZ'), colDec('revoirAvant')).setValue('');
dec2.getRange(ligneDe('cid1'), colDec('statut')).setValue('');

console.log('\nMenu — il répond lui-même à « et maintenant ? »');
const etape = (o) => prochaineEtape_({
  journal: false, profils: false, jetons: false, aInstruire: false,
  nonClassees: 0, envoisEnAttente: 0, revocationsEnAttente: 0, ...o
}).libelle;
verifier('classeur vide', etape({}), 'Commencer : moissonner le journal d\'audit');
verifier('journal seul', etape({ journal: true }), 'Relever les profils des comptes');
verifier('journal et profils', etape({ journal: true, profils: true }),
  'Relever les jetons actifs (c\'est long)');
verifier('tout collecté, rien classé',
  etape({ journal: true, profils: true, jetons: true, nonClassees: 12 }),
  'Classer : 12 application(s) sans décision');
verifier('tout classé',
  etape({ journal: true, profils: true, jetons: true }),
  'Tout est classé — relancer une collecte');

// On finit ce qu'on a commencé : un plan en attente passe devant tout le reste,
// parce que rien d'autre ne le rappellera.
verifier('un envoi préparé passe devant une collecte manquante',
  etape({ journal: true, envoisEnAttente: 7 }), 'Terminer : 7 courriel(s) à envoyer');
verifier('une révocation préparée passe même devant l\'envoi',
  etape({ journal: true, envoisEnAttente: 7, revocationsEnAttente: 3 }),
  'Terminer : 3 révocation(s) préparée(s)');
verifier('chaque étape dit pourquoi',
  prochaineEtape_({ journal: false }).pourquoi.length > 40, true);

console.log('\nMenu — le diagnostic lit le classeur réel');
const travail = etatDuTravail_(classeurActif);
verifier('il voit le journal moissonné', travail.journal, true);
verifier('il voit les profils relevés', travail.profils, true);
verifier('il compte les applications non classées', travail.nonClassees >= 1, true);
verifier('un classeur vide ne le fait pas échouer',
  etatDuTravail_(new FauxClasseur([])).journal, false);

console.log('\nGuide — l\'outil s\'explique là où on l\'utilise');
const sujets = GUIDE_.map(([titre]) => titre);
verifier('le guide couvre le déroulé',
  sujets.some((t) => t.includes('déroulé')), true);
verifier('… les deux sources', sujets.some((t) => t.includes('Deux sources')), true);
verifier('… les colonnes qui trompent',
  sujets.some((t) => t.includes('trompe')), true);
verifier('… le vocabulaire', sujets.some((t) => t.includes('vocabulaire')), true);
verifier('… et ce que l\'outil ne sait pas faire',
  sujets.some((t) => t.includes('ne peut pas')), true);
verifier('chaque section porte du texte',
  GUIDE_.every(([, paras]) => paras.length > 0 && paras.every((x) => x.length > 40)), true);

console.log('\nFiche — ce qui circule hors du classeur');
// Le classeur d'essai porte NotebookLM : restreinte, comptes à privilèges et
// suspendus, volumétrie sur deux services.
const dossierNotebook = dossier_(classeurActif, 'cid1');
verifier('le dossier trouve l\'application', dossierNotebook.nom, 'NotebookLM');
verifier('avec ses autorisants', dossierNotebook.autorisants.length >= 3, true);
verifier('ses services', dossierNotebook.services.length, 2);
verifier('et ses portées', dossierNotebook.portees.includes(`${J}drive.readonly`), true);

const htmlFiche = ficheHtml_(dossierNotebook);
verifier('la fiche nomme l\'application', htmlFiche.includes('NotebookLM'), true);
verifier('elle donne le client_id', htmlFiche.includes('cid1'), true);
verifier('elle explique la gravité',
  htmlFiche.includes('Portée restreinte au sens de Google'), true);
verifier('elle rappelle ce que vaut chaque colonne',
  htmlFiche.includes('« non mesuré », jamais « rien trouvé »'), true);
verifier('elle porte un bouton d\'impression', htmlFiche.includes('window.print()'), true);

// une application dont le nom porte du HTML ne doit pas s'exécuter dans le dialogue
const dossierPiege = { ...dossierNotebook, nom: '<img onerror=alert(1)>' };
verifier('le nom est échappé',
  ficheHtml_(dossierPiege).includes('<img onerror'), false);
verifier('… et rendu lisible',
  ficheHtml_(dossierPiege).includes('&lt;img onerror'), true);
verifier('les guillemets doubles et simples sont échappés',
  pris('echapper_')('test "double" et \'simple\''),
  'test &quot;double&quot; et &#39;simple&#39;');

console.log('\nDates — stockées pour trier, affichées pour être lues');
verifier('une date simple', dateLisible_('2026-09-06'), '6 septembre 2026');
verifier('le premier du mois prend son rang', dateLisible_('2026-05-01'), '1er mai 2026');
verifier('avec l\'heure', dateLisible_('2026-09-06 09:31'), '6 septembre 2026 à 09 h 31');
verifier('un mois accentué', dateLisible_('2026-02-14'), '14 février 2026');
verifier('ce qui n\'est pas une date ne bouge pas', dateLisible_('7 Mo'), '7 Mo');
verifier('ni un nombre', dateLisible_(52), '52');
verifier('une période entière est convertie',
  datesLisibles_('2026-05-29 → 2026-09-05'), '29 mai 2026 → 5 septembre 2026');
verifier('même noyée dans une phrase',
  datesLisibles_('Vue du 2026-08-01 au 2026-08-20 inclus'),
  'Vue du 1er août 2026 au 20 août 2026 inclus');

console.log('\nVue de consultation — ce qui sort, et surtout ce qui ne sort pas');
const accueil = pageAccueil_(classeurActif).html;
verifier('la synthèse est publiée', accueil.includes('Où en est le parc'), true);
verifier('la file de travail aussi', accueil.includes('À instruire'), true);
verifier('la priorité est expliquée sur la page',
  accueil.includes('somme de points, non une'), true);
verifier('la date de production est rappelée',
  accueil.includes('Données produites le'), true);
// « Généré le » est l'heure de l'agrégation, donc celle du banc : la date
// attendue écrite en dur (« 6 septembre 2026 ») n'a été juste qu'un seul jour,
// et ce cas échouait depuis le 7 septembre.
const produiteLe = dateLisible_(sandbox.Utilities.formatDate(new Date(),
  sandbox.Session.getScriptTimeZone(), 'yyyy-MM-dd'));
verifier('et elle est écrite en français', accueil.includes(produiteLe), true);
verifier('aucune date ISO ne subsiste sur la page',
  /\d{4}-\d{2}-\d{2}/.test(accueil), false);
verifier('le lecteur sait qu\'il est identifié',
  accueil.includes('rssi@exemple.fr'), true);

// Le point qui compte : aucune adresse de compte autorisant ne doit sortir.
const ficheWeb = pageFiche_(classeurActif, 'cid1').html;
verifier('la fiche publiée nomme l\'application', ficheWeb.includes('NotebookLM'), true);
verifier('elle donne les portées', ficheWeb.includes('drive.readonly'), true);
verifier('elle compte les autorisants', ficheWeb.includes('Autorisants'), true);
verifier('mais ne nomme AUCUN compte', ficheWeb.includes('bob@exemple.fr'), false);
verifier('ni un autre', ficheWeb.includes('carl@filiale.fr'), false);
verifier('et elle dit pourquoi',
  ficheWeb.includes('ne sont pas publiés sur cette page'), true);
verifier('pas de bouton d\'impression hors du classeur',
  ficheWeb.includes('window.print()'), false);
verifier('la fiche publiée date en français',
  /\d{4}-\d{2}-\d{2}/.test(ficheWeb), false);

// Le classeur, lui, garde l'ISO : c'est le seul format qui se trie en texte.
verifier('le classeur conserve les dates triables',
  /^\d{4}-\d{2}-\d{2}$/.test(String(onglet('Applications').cells[1][22])), true);

// dans le classeur, à l'inverse, l'administrateur voit tout
const ficheClasseur = ficheHtml_(dossier_(classeurActif, 'cid1'));
verifier('le classeur, lui, nomme les comptes',
  ficheClasseur.includes('bob@exemple.fr'), true);

// un identifiant inconnu ne doit rien apprendre à qui l'essaie
verifier('un client_id inventé ramène à l\'accueil',
  doGetSimule('cidInvente').includes('Où en est le parc'), true);


// ===========================================================================
// Les cas qui auraient attrapé les défauts de la v1.5. Chacun correspond à un
// défaut réellement introduit, et échoue si on le réintroduit.
// ===========================================================================

console.log('\nMenu — aucune étape ne désigne une action qui n\'existe pas');
// Un actionName mal orthographié ne casse rien à la lecture : il fait un bouton
// qui ne fait rien, en silence. Seule cette vérification le voit.
const etatsPossibles = [
  {},
  { journal: true },
  { journal: true, profils: true },
  { journal: true, profils: true, jetons: true },
  { journal: true, profils: true, jetons: true, nonClassees: 3 },
  { journal: true, profils: true, jetons: true, nonClassees: 3, aInstruire: true },
  { journal: true, aBloquer: 2 },
  { journal: true, envoisEnAttente: 4 },
  { journal: true, revocationsEnAttente: 5 }
];
const base = {
  journal: false, profils: false, jetons: false, aInstruire: false,
  nonClassees: 0, aBloquer: 0, envoisEnAttente: 0, revocationsEnAttente: 0
};
const nomsRendus = etatsPossibles
  .map((o) => prochaineEtape_({ ...base, ...o }).actionName);
verifier('chaque étape nomme une action de la table',
  nomsRendus.filter((n) => !ACTIONS_[n]), []);
verifier('… et toutes les branches sont couvertes',
  new Set(nomsRendus).size >= 6, true);
verifier('une action inconnue est refusée, pas ignorée',
  (() => { try { pris('executerAction_ui')('nExistePas'); return false; }
    catch (e) { return /inconnue/.test(e.message); } })(), true);
verifier('chaque action dit si elle ouvre son propre dialogue',
  Object.keys(ACTIONS_).filter((n) => typeof ACTIONS_[n].dialogue !== 'boolean'), []);

console.log('\nStatuts — le classeur est classé dans une langue, lu dans les deux');
verifier('le libellé français est reconnu', estStatut_('à bloquer', 'aBloquer'), true);
verifier('le libellé anglais aussi', estStatut_('to block', 'aBloquer'), true);
verifier('les espaces et la casse ne trompent pas',
  estStatut_('  À Bloquer ', 'aBloquer'), true);
verifier('un autre statut ne passe pas', estStatut_('approuvée', 'aBloquer'), false);
verifier('un statut vide non plus', estStatut_('', 'aBloquer'), false);
verifier('la liste déroulante suit la langue',
  statutsEn_('en').indexOf('to block') >= 0, true);
verifier('… et reste complète', statutsEn_('fr').length,
  Object.keys(STATUTS_LANGUE_).length);

console.log('\nAssistant — la proposition de blocage sait s\'arrêter');
// Sans sortie, l'assistant reproposait indéfiniment de préparer un plan déjà
// préparé : le statut « à bloquer », lui, ne change pas quand le plan est appliqué.
const faireClasseurBlocage = (planifie) => {
  const c = new FauxClasseur([]);
  const d = c.insertSheet('Décisions');
  d.getRange(1, 1, 2, COLONNES_DECISIONS_.length).setValues([
    entetesEn_(COLONNES_DECISIONS_, 'fr'),
    ['cidX', 'Vieil outil', 'à bloquer', '', '', '', '', '', '']
  ]);
  const r = c.insertSheet('Révocations');
  const lignesPlan = [entetesEn_(COLONNES_REVOCATIONS_, 'fr')];
  if (planifie) {
    lignesPlan.push(['bob@exemple.fr', 'exemple.fr', '', 'Vieil outil', 'cidX',
      '', 'rssi', '', 'révoqué', '2026-09-01', '2026-09-01', 'ok']);
  }
  r.getRange(1, 1, lignesPlan.length, COLONNES_REVOCATIONS_.length).setValues(lignesPlan);
  return c;
};
verifier('sans plan, le blocage est proposé',
  etatDuTravail_(faireClasseurBlocage(false)).aBloquer, 1);
verifier('une fois le plan appliqué, il ne l\'est plus',
  etatDuTravail_(faireClasseurBlocage(true)).aBloquer, 0);
verifier('… et l\'étape suivante n\'est plus le blocage',
  prochaineEtape_({ ...base, journal: true, profils: true, jetons: true,
    aBloquer: 0 }).actionName === 'preparerRevocations', false);

console.log('\nLangues — le menu et l\'assistant parlent la langue réglée');
verifier('l\'étape est traduite',
  prochaineEtape_({ ...base }, 'en').libelle, t_('etape.commencer', 'en'));
verifier('… et son pourquoi aussi',
  prochaineEtape_({ ...base }, 'en').pourquoi, t_('etape.commencer.pourquoi', 'en'));
verifier('rien ne reste en français dans l\'étape anglaise',
  /journal d'audit|Terminer|Classer/.test(prochaineEtape_({ ...base }, 'en').libelle), false);
const panneauEn = pris('htmlAssistant_')('en');
verifier('le panneau latéral est traduit', panneauEn.includes('Progress'), true);
verifier('… sans libellé français oublié',
  /Avancement|Actualiser l|Jetons actifs/.test(panneauEn), false);
verifier('le panneau ne sonde plus le classeur',
  /setInterval/.test(panneauEn), false);

console.log('\nMoissonnage — une campagne neuve ne s\'empile pas sur la précédente');
// Le défaut : moissonner écrit en ajout à partir de getLastRow(). Sans vidage,
// la seconde campagne doublait les volumes et avançait la première apparition,
// sans qu'aucune erreur ne s'affiche.
const proprietes = new Map();
sandbox.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (proprietes.has(k) ? proprietes.get(k) : null),
    setProperty: (k, v) => { proprietes.set(k, v); },
    deleteProperty: (k) => { proprietes.delete(k); }
  })
};
sandbox.ScriptApp = {
  getProjectTriggers: () => [],
  newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => {} }) }) })
};
sandbox.AdminReports = {
  Activities: {
    list: () => ({
      items: [{
        id: { time: '2026-09-01T10:00:00.000Z' },
        actor: { email: 'bob@exemple.fr' },
        events: [{
          name: 'authorize',
          parameters: [
            { name: 'app_name', value: 'NotebookLM' },
            { name: 'client_id', value: 'cidA' },
            { name: 'scope', multiValue: [`${J}drive.readonly`] }
          ]
        }]
      }]
    })
  }
};

const memoireClasseur = classeurActif;
classeurActif = new FauxClasseur(['Feuille 1']);
moissonner(30);
const brutApres1 = chercherOnglet_(classeurActif, 'brut').getLastRow();
moissonner(30);
const brutApres2 = chercherOnglet_(classeurActif, 'brut').getLastRow();
verifier('la première campagne écrit sa ligne', brutApres1, 2);
verifier('la seconde REMPLACE au lieu d\'empiler', brutApres2, brutApres1);
verifier('et les en-têtes survivent au vidage',
  chercherOnglet_(classeurActif, 'brut').cells[0][0],
  entetesEn_(COLONNES_BRUT_, 'fr')[0]);

// Une reprise, elle, ne doit surtout pas vider : elle continue la même campagne.
proprietes.set('moisson', JSON.stringify({
  jours: 30, debut: '2026-08-08T00:00:00.000Z', lancee: '2026-09-01T00:00:00.000Z',
  pageToken: null, pages: 1, evenements: 1, lignes: 1, reprises: 0
}));
moissonner();
verifier('une reprise ajoute, elle ne vide pas',
  chercherOnglet_(classeurActif, 'brut').getLastRow(), brutApres1 + 1);
classeurActif = memoireClasseur;


// ===========================================================================
// Les trois défauts de robustesse à l'échelle : garde-fou de reprise, comptes
// non mesurés, impasse d'agrégation.
// ===========================================================================

let declencheursPoses = 0;
const scriptAppCompteur = {
  getProjectTriggers: () => [],
  newTrigger: () => ({
    timeBased: () => ({ after: () => ({ create: () => { declencheursPoses++; } }) })
  })
};

console.log('\nReprise — une erreur permanente ne boucle pas indéfiniment');
// Le défaut : sur erreur, la campagne se reprogramme à la minute suivante,
// sans plafond. Une cause permanente produit 1 440 exécutions par jour.
proprietes.clear();
declencheursPoses = 0;
sandbox.ScriptApp = scriptAppCompteur;
sandbox.AdminReports = { Activities: { list: () => { throw new Error('403 — rôle insuffisant'); } } };
classeurActif = new FauxClasseur(['Feuille 1']);
// 1 lancement + 4 reprises : la dernière doit abandonner au lieu de replanifier.
for (let i = 0; i < 2 + REPRISES_SANS_PROGRES_MAX_; i++) {
  try { moissonner(30); } catch (e) { /* l'échec est attendu */ }
}
verifier('la campagne bloquée finit par s\'abandonner',
  proprietes.has('moisson'), false);
verifier('… et cesse de programmer des reprises',
  declencheursPoses, 1 + REPRISES_SANS_PROGRES_MAX_);
// Une campagne qui PROGRESSE, elle, ne doit surtout pas être abandonnée.
proprietes.clear();
declencheursPoses = 0;
let page = 0;
sandbox.AdminReports = {
  Activities: {
    list: () => {
      page++;
      return {
        items: [{
          id: { time: '2026-09-01T10:00:00.000Z' },
          actor: { email: 'bob@exemple.fr' },
          events: [{ name: 'authorize', parameters: [
            { name: 'app_name', value: 'NotebookLM' },
            { name: 'client_id', value: 'cidA' },
            { name: 'scope', multiValue: [`${J}drive.readonly`] }] }]
        }],
        nextPageToken: page < 4 ? `p${page}` : null
      };
    }
  }
};
classeurActif = new FauxClasseur(['Feuille 1']);
moissonner(30);
verifier('une campagne qui avance va jusqu\'au bout',
  chercherOnglet_(classeurActif, 'brut').getLastRow(), 5);

console.log('\nInventaire — un compte non lu n\'est pas un compte sans jeton');
// Le défaut : l'échec était compté, jamais nommé ; le compte disparaissait de
// l'onglet des jetons, où son absence se lit « aucun jeton ».
const jetonDe = (cid) => ({ items: [{ clientId: cid, displayText: 'Appli A',
  scopes: [`${J}drive.readonly`], anonymous: false, nativeApp: false }] });
proprietes.clear();
sandbox.ScriptApp = scriptAppCompteur;
sandbox.AdminDirectory = {
  Users: { list: () => ({ users: [
    { primaryEmail: 'ok@exemple.fr' },
    { primaryEmail: 'ko@exemple.fr' },
    { primaryEmail: 'flottant@exemple.fr' }] }) },
  Tokens: {
    list: (compte) => {
      if (compte === 'ko@exemple.fr') throw new Error('503 — service indisponible');
      // Celui-ci échoue au premier passage et réussit au second : c'est le cas
      // majoritaire sur un grand parc, et la reprise doit l'effacer.
      if (compte === 'flottant@exemple.fr') {
        sandbox.AdminDirectory.Tokens.list = (c) =>
          (c === 'ko@exemple.fr' ? (() => { throw new Error('503'); })() : jetonDe('cidB'));
        throw new Error('429 — trop de requêtes');
      }
      return jetonDe('cidA');
    }
  }
};
classeurActif = new FauxClasseur(['Feuille 1']);
inventorierJetons();

const feuilleEchecs = chercherOnglet_(classeurActif, 'echecs');
verifier('les comptes en échec sont NOMMÉS, pas seulement comptés',
  Boolean(feuilleEchecs), true);
const echecsLus = feuilleEchecs.getDataRange().getValues();
const iCompteEchec = colonne_(echecsLus[0], 'compteMin');
const nommes = echecsLus.slice(1).map((l) => l[iCompteEchec]).sort();
verifier('… les deux qui ont échoué au premier passage',
  nommes, ['flottant@exemple.fr', 'ko@exemple.fr']);
const nonMesures = comptesNonMesures_(classeurActif);
verifier('celui qui a réussi au second passage n\'est plus non mesuré',
  nonMesures.has('flottant@exemple.fr'), false);
verifier('celui qui résiste, si', nonMesures.has('ko@exemple.fr'), true);
verifier('et ses jetons ne sont pas dans le relevé',
  chercherOnglet_(classeurActif, 'jetons').getDataRange().getValues()
    .slice(1).some((l) => l[0] === 'ko@exemple.fr'), false);

// LE POINT QUI COMPTE : le rapport ne doit pas le déclarer « clos ».
verifier('un compte non mesuré n\'a PAS d\'état de jeton',
  etatJeton_({ compte: 'ko@exemple.fr', jetonNonMesure: true, jetonActif: false }, true), '');
verifier('un compte mesuré sans jeton, lui, est bien « clos »',
  etatJeton_({ compte: 'ok@exemple.fr', jetonActif: false }, true), 'clos');
verifier('et sans inventaire du tout, la colonne reste vide',
  etatJeton_({ compte: 'ok@exemple.fr', jetonActif: false }, false), '');

console.log('\nResserrage — la sortie de l\'impasse d\'agrégation');
// L'agrégation n'est pas reprenable : quand le brut est trop gros, relancer
// repart de la ligne 2 et échoue pareil. Le resserrage, lui, n'accumule rien.
proprietes.clear();
sandbox.ScriptApp = scriptAppCompteur;
classeurActif = new FauxClasseur(['Feuille 1']);
const brutARessserrer = brutCourant_(classeurActif, 'fr');
const dateRecente = new Date(Date.now() - 5 * 86400000);
const dateAncienne = new Date(Date.now() - 120 * 86400000);
// De vrais objets Date, comme Sheets en rend : c'est le seul essai qui prouve
// que le filtre passe par jour_ et non par une comparaison de chaînes.
brutARessserrer.getRange(2, 1, 3, COLONNES_BRUT_.length).setValues([
  [dateRecente, 'bob@exemple.fr', 'exemple.fr', 'authorize', 'Récente', 'cidR', '', '', '', '', '', '', '', ''],
  [dateAncienne, 'bob@exemple.fr', 'exemple.fr', 'authorize', 'Ancienne', 'cidV', '', '', '', '', '', '', '', ''],
  [dateRecente, 'ana@exemple.fr', 'exemple.fr', 'activity', 'Récente', 'cidR', '', '', '', '', '', '', '', '']
]);
resserrerBrut(30);
const brutResserre = chercherOnglet_(classeurActif, 'brut');
verifier('l\'onglet garde son nom', brutResserre.getName(), nomOnglet_('brut', 'fr'));
verifier('les en-têtes sont intacts',
  brutResserre.cells[0][0], entetesEn_(COLONNES_BRUT_, 'fr')[0]);
verifier('seules les lignes dans la fenêtre restent', brutResserre.getLastRow(), 3);
verifier('la ligne de 120 jours est écartée',
  brutResserre.getDataRange().getValues().slice(1).some((l) => l[4] === 'Ancienne'), false);
verifier('les récentes sont gardées',
  brutResserre.getDataRange().getValues().slice(1).filter((l) => l[4] === 'Récente').length, 2);
verifier('l\'onglet de travail a disparu',
  Boolean(chercherOnglet_(classeurActif, 'brutTemp')), false);
verifier('et l\'état ne traîne pas', proprietes.has('resserrage'), false);
verifier('le menu sait le lancer', Boolean(ACTIONS_.menuResserrerBrut30), true);
classeurActif = memoireClasseur;


console.log('\nFenêtre courte — on annonce ce que le journal couvre, pas ce qu\'on visait');
// Le piège d'une fenêtre de 7 jours : titrer « volume sur 30 jours » un chiffre
// calculé sur 7. Le nombre serait juste, l'étiquette fausse, et le lecteur en
// conclurait que l'application consomme peu.
const ilYa = (j) => jour_(new Date(Date.now() - j * 86400000));
verifier('un journal de 180 jours garde la fenêtre pleine',
  fenetreRecenteEffective_(ilYa(180)), FENETRE_RECENTE_JOURS_);
verifier('un journal de 30 jours aussi',
  fenetreRecenteEffective_(ilYa(30)), FENETRE_RECENTE_JOURS_);
verifier('un journal de 7 jours la ramène à 7',
  fenetreRecenteEffective_(ilYa(7)), 7);
verifier('un journal d\'un jour ne descend pas à zéro',
  fenetreRecenteEffective_(ilYa(0)), 1);
verifier('sans donnée, on reste sur la fenêtre nominale',
  fenetreRecenteEffective_(''), FENETRE_RECENTE_JOURS_);
verifier('une valeur illisible ne fait pas échouer le rapport',
  fenetreRecenteEffective_('pas une date'), FENETRE_RECENTE_JOURS_);
// Et le motif de priorité doit citer la fenêtre réelle.
verifier('le motif de volume cite la fenêtre effective',
  evaluer_(appFictive({ octets30: SEUIL_VOLUME_30J_ + 1 }), 7).motifs.includes('sur 7 jours'),
  true);

console.log('\nMoissonnage — chaque fenêtre du menu a son action');
// Le ternaire à deux branches devenait faux dès la troisième fenêtre : le nom
// se construit désormais, et la table doit le connaître.
verifier('les trois fenêtres sont servies',
  [7, 30, 180].filter((j) => !ACTIONS_[`menuMoissonner${j}`]), []);

console.log(`\n${echecs ? `${echecs} échec(s)` : 'tout passe'}`);
process.exit(echecs ? 1 : 0);
