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
      setXFrameOptionsMode() { return this; }
    }),
    XFrameOptionsMode: { DENY: 'DENY' }
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
for (const f of ['Commun.gs', 'Journal.gs', 'Decision.gs', 'Comptes.gs',
  'Portees.gs', 'Volumetrie.gs', 'Inventaire.gs', 'Feuille.gs',
  'Sollicitation.gs', 'Revocation.gs', 'Guide.gs', 'Fiche.gs', 'WebApp.gs']) {
  vm.runInContext(fs.readFileSync(P + f, 'utf8'), sandbox, { filename: f });
}
// Les déclarations `const` de portée globale ne deviennent pas des propriétés de
// l'objet global : on va les chercher dans la portée lexicale du contexte.
const pris = (nom) => vm.runInContext(nom, sandbox);
const {
  famille_, domaine_, portees_, octets_, classer_, lignesDe_, agreger_,
  brutCourant_, etatPresume_, COLONNES_BRUT_,
  lireModele_, grouperAutorisants_, corpsCourriel_,
  lireDecisions_, decisionsSilencieuses_, COLONNES_DECISIONS_, libelleProfil_,
  jour_, enClair_, nettoyerFeuilleParDefaut_, chargerCatalogue_, classerPortee_, pireNiveau_, evaluer_,
  lireJetons_, etatJeton_, COLONNES_JETONS_, palmares_, SEUIL_VOLUME_30J_,
  GUIDE_, dossier_, ficheHtml_,
  preparerRevocations, COLONNES_REVOCATIONS_, STATUT_REVOCABLE_,
  pageAccueil_, pageFiche_
} = Object.fromEntries([
  'famille_', 'domaine_', 'portees_', 'octets_', 'classer_', 'lignesDe_',
  'agreger_', 'brutCourant_', 'etatPresume_', 'COLONNES_BRUT_',
  'lireModele_', 'grouperAutorisants_', 'corpsCourriel_',
  'lireDecisions_', 'decisionsSilencieuses_', 'COLONNES_DECISIONS_', 'libelleProfil_',
  'jour_', 'enClair_', 'nettoyerFeuilleParDefaut_', 'chargerCatalogue_', 'classerPortee_', 'pireNiveau_', 'evaluer_',
  'lireJetons_', 'etatJeton_', 'COLONNES_JETONS_', 'palmares_', 'SEUIL_VOLUME_30J_',
  'GUIDE_', 'dossier_', 'ficheHtml_',
  'preparerRevocations', 'COLONNES_REVOCATIONS_', 'STATUT_REVOCABLE_',
  'pageAccueil_', 'pageFiche_'
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
verifier('en-têtes posés', brut.getRange(1, 1, 1, COLONNES_BRUT_.length).getValues()[0],
  COLONNES_BRUT_);
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

const iStatut = COLONNES_DECISIONS_.indexOf('Statut') + 1;
const iMotif = COLONNES_DECISIONS_.indexOf('Motif') + 1;
const iRevoir = COLONNES_DECISIONS_.indexOf('Revoir avant') + 1;
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
  COLONNES_JETONS_,
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
verifier('règles séparées des paramètres', modele.regles.length, 7);
verifier('la première règle vise les projets sans titre',
  modele.regles[0].includes('Projet sans titre'), true);
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
const { html, texte } = corpsCourriel_('bob@exemple.fr', appsCourriel, modele);
verifier('le nom de l\'application figure', html.includes('Projet sans titre'), true);
verifier('le HTML injecté est neutralisé', html.includes('<script>alerte'), false);
verifier('… et rendu en texte échappé', html.includes('&lt;script&gt;alerte'), true);
verifier('le lien de révocation est donné',
  html.includes('myaccount.google.com/permissions'), true);
verifier('les sept règles sont dans le courriel',
  (html.match(/<li style="margin:6px 0">/g) || []).length, 7);
verifier('le délai est repris', html.includes('<strong>15 jours</strong>'), true);
verifier('la version texte existe aussi', texte.includes('Projet sans titre'), true);
verifier('la version texte porte les règles', texte.includes('Règles de nommage'), true);
verifier('les portées sont dites en clair, pas en jargon',
  html.includes('vos fichiers Drive et vos projets Apps Script'), true);
verifier('aucune famille technique ne subsiste dans le tableau',
  /<td[^>]*>drive<\/td>/.test(html), false);

console.log('\nRévocation — le référentiel commande, pas un filtre');
// On reconstitue un relevé de jetons et on éprouve ce qui entre dans le plan.
const releve2 = classeurActif.getSheetByName('_Jetons')
  || classeurActif.insertSheet('_Jetons');
releve2.clear();
releve2.getRange(1, 1, 3, COLONNES_JETONS_.length).setValues([
  COLONNES_JETONS_,
  ['bob@exemple.fr', 'cid1', 'NotebookLM', `${J}drive.readonly`, '', '', '2026-09-06'],
  ['dora@exemple.fr', 'cidZ', 'Vieil outil', `${J}gmail.readonly`, '', '', '2026-09-06']
]);
agreger_(classeurActif, { jours: 180 });

const dec2 = classeurActif.getSheetByName('Décisions');
const enTetesDec = dec2.cells[0];
const colDec = (nom) => enTetesDec.indexOf(nom) + 1;
const ligneDe = (cid) => dec2.cells.slice(1).findIndex((r) => r[0] === cid) + 2;

// aucune décision : le plan doit rester vide
preparerRevocations();
let plan = classeurActif.getSheetByName('Révocations');
verifier('sans décision, aucune révocation', plan.getLastRow() - 1, 0);

// une application approuvée n'est pas révocable non plus
dec2.getRange(ligneDe('cid1'), colDec('Statut')).setValue('approuvée');
preparerRevocations();
verifier('une application approuvée non plus',
  classeurActif.getSheetByName('Révocations').getLastRow() - 1, 0);

// seule « à bloquer », décision en vigueur, produit des lignes
dec2.getRange(ligneDe('cidZ'), colDec('Statut')).setValue(STATUT_REVOCABLE_);
dec2.getRange(ligneDe('cidZ'), colDec('Motif')).setValue('Éditeur inconnu');
dec2.getRange(ligneDe('cidZ'), colDec('Décidé par')).setValue('RSSI');
preparerRevocations();
plan = classeurActif.getSheetByName('Révocations');
verifier('« à bloquer » produit une ligne', plan.getLastRow() - 1, 1);
const iEtatPlan = COLONNES_REVOCATIONS_.indexOf('État');
verifier('à l\'état « à révoquer »', plan.cells[1][iEtatPlan], 'à révoquer');
verifier('sur le bon compte', plan.cells[1][0], 'dora@exemple.fr');
verifier('le motif de la décision suit',
  plan.cells[1][COLONNES_REVOCATIONS_.indexOf('Motif de la décision')], 'Éditeur inconnu');
verifier('et son auteur aussi',
  plan.cells[1][COLONNES_REVOCATIONS_.indexOf('Décidé par')], 'RSSI');

// une décision périmée ne commande plus rien
dec2.getRange(ligneDe('cidZ'), colDec('Revoir avant')).setValue('2020-01-01');
preparerRevocations();
verifier('une décision périmée ne commande plus rien',
  classeurActif.getSheetByName('Révocations').getLastRow() - 1, 0);
dec2.getRange(ligneDe('cidZ'), colDec('Revoir avant')).setValue('');
dec2.getRange(ligneDe('cid1'), colDec('Statut')).setValue('');

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

console.log('\nVue de consultation — ce qui sort, et surtout ce qui ne sort pas');
const accueil = pageAccueil_(classeurActif).html;
verifier('la synthèse est publiée', accueil.includes('Où en est le parc'), true);
verifier('la file de travail aussi', accueil.includes('À instruire'), true);
verifier('la priorité est expliquée sur la page',
  accueil.includes('somme de points, non une'), true);
verifier('la date de production est rappelée',
  accueil.includes('Données produites le'), true);
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

// dans le classeur, à l'inverse, l'administrateur voit tout
const ficheClasseur = ficheHtml_(dossier_(classeurActif, 'cid1'));
verifier('le classeur, lui, nomme les comptes',
  ficheClasseur.includes('bob@exemple.fr'), true);

// un identifiant inconnu ne doit rien apprendre à qui l'essaie
verifier('un client_id inventé ramène à l\'accueil',
  doGetSimule('cidInvente').includes('Où en est le parc'), true);

console.log(`\n${echecs ? `${echecs} échec(s)` : 'tout passe'}`);
process.exit(echecs ? 1 : 0);
