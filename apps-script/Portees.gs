/**
 * Catalogue de sensibilité des portées — v0.5.
 *
 * DEUX AXES, PARCE QU'UN SEUL MENTIRAIT
 *
 * Google classe ses portées en **restreintes**, **sensibles** et **basiques**.
 * S'appuyer sur sa nomenclature plutôt que sur une échelle maison évite d'avoir
 * à la défendre en comité : elle est publiée, opposable, et l'éditeur d'une
 * application la connaît déjà.
 *
 * Mais cette classification protège l'utilisateur final d'une application
 * publiée — pas le tenant. `admin.directory.user` n'y est pas « restreinte »,
 * alors qu'elle permet de créer et de supprimer des comptes. C'est pourquoi une
 * seconde colonne marque les portées qui donnent prise sur **l'administration
 * du domaine**, indépendamment du niveau de Google. Les deux se lisent ensemble.
 *
 * LE CATALOGUE EST UNE DONNÉE
 *
 * Il vit dans l'onglet « Catalogue portées », amendable sans déploiement. Le
 * code n'y met qu'un jeu de départ. Une portée absente du catalogue est traitée
 * comme **sensible** et signalée comme telle : sous-estimer un accès inconnu
 * serait la pire des erreurs, et un trou qu'on ne voit pas ne se comble jamais.
 *
 * RÈGLE DE CORRESPONDANCE
 *
 * Une entrée terminée par un point vaut préfixe — `…/auth/gmail.` couvre toute
 * la famille. Une entrée sans point final ne vaut que pour elle-même. Cette
 * distinction n'est pas un détail : `…/auth/drive` est restreinte, mais
 * `…/auth/drive.file`, qui ne donne accès qu'aux fichiers créés par
 * l'application, ne l'est pas. Les confondre reviendrait à punir la portée la
 * plus vertueuse.
 */

const ONGLET_CATALOGUE_ = 'Catalogue portées';

const COLONNES_CATALOGUE_ = ['Portée ou préfixe', 'Niveau', 'Administration', 'Note'];

const NIVEAUX_ = ['restreinte', 'sensible', 'basique'];

/** Niveau appliqué à une portée que le catalogue ne connaît pas. */
const NIVEAU_INCONNU_ = 'sensible';

const A = 'https://www.googleapis.com/auth/';

/**
 * Jeu de départ. Les portées restreintes reprennent la liste publiée par Google
 * pour la vérification OAuth ; à confronter à sa page de référence lors des
 * revues, Google la faisant évoluer.
 */
const CATALOGUE_DEFAUT_ = [
  COLONNES_CATALOGUE_,

  ['https://mail.google.com/', 'restreinte', '', 'Messagerie, accès complet'],
  [`${A}gmail.`, 'restreinte', '', 'Toute la famille Gmail'],
  [`${A}drive`, 'restreinte', '', 'Drive, accès complet'],
  [`${A}drive.readonly`, 'restreinte', '', 'Drive, lecture de tout'],
  [`${A}drive.metadata`, 'restreinte', '', 'Métadonnées de tout Drive'],
  [`${A}drive.metadata.readonly`, 'restreinte', '', 'Métadonnées, lecture'],
  [`${A}drive.activity`, 'restreinte', '', 'Activité Drive'],
  [`${A}drive.activity.readonly`, 'restreinte', '', 'Activité Drive, lecture'],
  [`${A}drive.scripts`, 'restreinte', '', 'Scripts liés aux fichiers Drive'],

  [`${A}admin.`, 'sensible', 'oui', 'Administration du domaine'],
  [`${A}cloud-identity.`, 'sensible', 'oui', 'Annuaire et groupes'],
  [`${A}apps.licensing`, 'sensible', 'oui', 'Licences Workspace'],
  [`${A}apps.groups.`, 'sensible', 'oui', 'Paramètres des groupes'],
  [`${A}apps.order`, 'sensible', 'oui', 'Commandes revendeur'],

  [`${A}calendar`, 'sensible', '', 'Agenda, accès complet'],
  [`${A}calendar.`, 'sensible', '', 'Famille Agenda'],
  [`${A}contacts`, 'sensible', '', 'Contacts'],
  [`${A}contacts.`, 'sensible', '', 'Famille Contacts'],
  [`${A}documents`, 'sensible', '', 'Docs'],
  [`${A}documents.`, 'sensible', '', 'Famille Docs'],
  [`${A}spreadsheets`, 'sensible', '', 'Sheets'],
  [`${A}spreadsheets.`, 'sensible', '', 'Famille Sheets'],
  [`${A}presentations`, 'sensible', '', 'Slides'],
  [`${A}presentations.`, 'sensible', '', 'Famille Slides'],
  [`${A}forms`, 'sensible', '', 'Forms'],
  [`${A}forms.`, 'sensible', '', 'Famille Forms'],
  [`${A}tasks`, 'sensible', '', 'Tasks'],
  [`${A}tasks.`, 'sensible', '', 'Famille Tasks'],
  [`${A}script.`, 'sensible', '', 'Projets Apps Script'],
  [`${A}apps_genai.`, 'sensible', '', 'Fonctions d\'intelligence artificielle'],
  [`${A}chat.`, 'sensible', '', 'Chat'],
  [`${A}devstorage.`, 'sensible', '', 'Cloud Storage'],

  [`${A}drive.file`, 'basique', '', 'Seulement les fichiers créés par l\'application'],
  [`${A}drive.appdata`, 'basique', '', 'Dossier de configuration de l\'application'],
  [`${A}drive.install`, 'basique', '', 'Association d\'ouverture'],
  [`${A}userinfo.email`, 'basique', '', 'Adresse de courriel'],
  [`${A}userinfo.profile`, 'basique', '', 'Nom et photo'],
  ['openid', 'basique', '', 'Identifiant de connexion'],
  [`${A}script.container.ui`, 'basique', '', 'Interface d\'un document']
];

const chargerCatalogue_ = (classeur) => {
  let f = classeur.getSheetByName(ONGLET_CATALOGUE_);
  if (!f) {
    f = classeur.insertSheet(ONGLET_CATALOGUE_);
    f.getRange(1, 1, CATALOGUE_DEFAUT_.length, COLONNES_CATALOGUE_.length)
      .setValues(CATALOGUE_DEFAUT_);
    f.getRange(1, 1, 1, COLONNES_CATALOGUE_.length).setFontWeight('bold');
    f.setFrozenRows(1);
    f.autoResizeColumns(1, COLONNES_CATALOGUE_.length);
  }
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCle = e.indexOf('Portée ou préfixe');
  const iNiveau = e.indexOf('Niveau');
  const iAdmin = e.indexOf('Administration');

  const entrees = [];
  for (const l of valeurs.slice(1)) {
    const cle = String(l[iCle] || '').trim();
    if (!cle) continue;
    entrees.push({
      cle,
      prefixe: cle.endsWith('.'),
      niveau: String(l[iNiveau] || NIVEAU_INCONNU_).trim(),
      administration: String(l[iAdmin] || '').trim().toLowerCase() === 'oui'
    });
  }
  // La plus longue clé gagne : drive.readonly l'emporte sur drive.
  entrees.sort((a, b) => b.cle.length - a.cle.length);
  return entrees;
};

/**
 * Classe une portée. `connue` dit si le catalogue la couvre : une portée
 * inconnue est traitée comme sensible, mais on ne prétend pas l'avoir jugée.
 */
const classerPortee_ = (portee, catalogue) => {
  const p = String(portee).trim();
  for (const e of catalogue) {
    const touche = e.prefixe ? p.startsWith(e.cle) : p === e.cle;
    if (touche) return { niveau: e.niveau, administration: e.administration, connue: true };
  }
  return { niveau: NIVEAU_INCONNU_, administration: false, connue: false };
};

/** Le plus grave de deux niveaux. */
const pireNiveau_ = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return NIVEAUX_.indexOf(a) <= NIVEAUX_.indexOf(b) ? a : b;
};

/**
 * Ce qui appelle l'instruction d'une application, et ce que chaque motif pèse.
 *
 * Aucun de ces chiffres n'a de vertu scientifique : ce sont des poids relatifs,
 * choisis pour que l'ordre de lecture soit défendable. C'est pourquoi la colonne
 * Motifs les affiche un par un. Un rang qui ne sait pas dire pourquoi il est ce
 * qu'il est ne survit pas à la première contestation en réunion.
 */
const SEUIL_DIFFUSION_ = 10;

const evaluer_ = (app) => {
  const motifs = [];
  let points = 0;
  const ajouter = (poids, libelle) => { points += poids; motifs.push(`${libelle} (+${poids})`); };

  if (app.niveauMax === 'restreinte') ajouter(3, 'portée restreinte');
  if (app.administration) ajouter(3, 'administration du domaine');
  if (app.aPrivileges.size) {
    ajouter(2, `autorisée par ${app.aPrivileges.size} compte(s) à privilèges`);
  }
  if (app.suspendus.size) {
    ajouter(2, `autorisée par ${app.suspendus.size} compte(s) suspendu(s)`);
  }
  if (app.autorisants.size >= SEUIL_DIFFUSION_) {
    ajouter(1, `${app.autorisants.size} autorisants`);
  }
  // Des jetons vivants, et aucune autorisation sur la fenêtre : l'accès a été
  // accordé avant, et personne ne l'a revu depuis.
  if (app.jetons && app.jetons.size && !app.autorisations) {
    ajouter(2, `${app.jetons.size} jeton(s) actif(s) sans autorisation au journal`);
  }
  // Ce qu'une application a réellement extrait pèse plus lourd que ce qu'elle
  // aurait le droit d'extraire : le premier est un fait, le second une capacité.
  if (app.octets30 >= SEUIL_VOLUME_30J_) {
    ajouter(2, `${octets_(app.octets30)} extraits sur ${FENETRE_RECENTE_JOURS_} jours`);
  }
  if (app.porteesInconnues.size) {
    ajouter(1, `${app.porteesInconnues.size} portée(s) hors catalogue`);
  }
  return { points, motifs: motifs.join(' · ') };
};

const COLONNES_INSTRUIRE_ = [
  'Priorité', 'Application', 'client_id', 'Niveau max', 'Administration',
  'Autorisants', 'dont à privilèges', 'dont suspendus', 'Motifs',
  'Première vue', 'Dernière vue'
];

/**
 * La file de travail : ce qui appelle un examen et n'a pas encore été jugé.
 *
 * Une application dont la décision est en vigueur en sort ; une application dont
 * la décision a expiré y revient. C'est tout l'intérêt d'une échéance.
 */
const ecrireAInstruire_ = (classeur, apps, decisions) => {
  const f = onglet_(classeur, 'À instruire', COLONNES_INSTRUIRE_);
  const lignes = [...apps.values()]
    .filter((a) => {
      const d = decisions.get(a.cid);
      if (d && d.enVigueur) return false;
      return a.evaluation.points > 0;
    })
    .map((a) => [
      a.evaluation.points, a.nom, a.cid, a.niveauMax, a.administration ? 'oui' : '',
      a.autorisants.size, a.aPrivileges.size, a.suspendus.size, a.evaluation.motifs,
      a.premiere, a.derniere
    ])
    .sort((x, y) => (y[0] - x[0]) || (y[5] - x[5]));
  poser_(f, lignes, true);
  return lignes.length;
};
