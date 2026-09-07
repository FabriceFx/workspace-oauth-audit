/**
 * Langues — introduites en v1.4.
 *
 * DEUX PUBLICS, DEUX BESOINS QUI N'ONT RIEN À VOIR
 *
 * L'administrateur a choisi cet outil : il en accepte la langue, et un réglage
 * unique lui suffit. Le destinataire d'un courriel de sollicitation, lui, n'a
 * rien choisi du tout — on lui écrit sans lui demander son avis, pour lui
 * reprocher poliment un accès qu'il a accordé. Lui écrire dans une langue qu'il
 * ne lit pas serait à la fois inefficace et discourtois.
 *
 * La langue des courriels se règle donc **par destinataire**, pas globalement :
 * une règle par domaine dans l'onglet Paramètres, une colonne modifiable dans le
 * plan d'envoi, et le réglage général en dernier recours.
 *
 * CE QUI EST TRADUIT, ET CE QUI NE L'EST PAS ENCORE
 *
 * v1.4 traduit ce qui **sort** du classeur : le courriel, la vue de
 * consultation, la fiche. Ce sont les surfaces lues par des gens qui n'ont pas
 * choisi l'outil.
 *
 * Le classeur lui-même — menu, dialogues, guide, noms d'onglets et de colonnes —
 * reste en français jusqu'à la v1.5. Ce n'est pas un oubli : les noms d'onglets
 * et les en-têtes de colonnes servent de clés de lecture en cinquante endroits,
 * et les traduire demande une couche de résolution qui accepte les deux langues,
 * sans quoi un classeur commencé en français cesserait de fonctionner le jour où
 * l'on bascule.
 */

const ONGLET_PARAMETRES_ = 'Paramètres';

const LANGUE_DEFAUT_ = 'fr';
const LANGUES_ = ['fr', 'en'];

const PARAMETRES_DEFAUT_ = [
  ['Paramètre', 'Valeur', 'Explication'],
  ['Langue de l\'outil', 'fr',
    'fr ou en. Ce que vous lisez dans le classeur et sur la vue de consultation.'],
  ['Langue par défaut des courriels', 'fr',
    'Utilisée quand aucune règle de domaine ne s\'applique.'],
  ['', '', ''],
  ['Langue par domaine', '',
    'Une ligne par domaine, sous celle-ci. Le domaine du destinataire décide.'],
  ['exemple.com', 'en', 'Exemple — remplacez ou supprimez cette ligne.']
];

const feuilleParametres_ = (classeur) => {
  const existante = chercherOnglet_(classeur, 'parametres');
  if (existante) return existante;
  const f = classeur.insertSheet(ONGLET_PARAMETRES_);
  f.getRange(1, 1, PARAMETRES_DEFAUT_.length, 3).setValues(PARAMETRES_DEFAUT_);
  f.getRange(1, 1, 1, 3).setFontWeight('bold');
  f.setFrozenRows(1);
  f.setColumnWidth(1, 240);
  f.setColumnWidth(3, 520);
  return f;
};

/** Une langue reconnue, ou celle par défaut : on ne devine pas. */
const langueValide_ = (valeur) => {
  const l = String(valeur || '').trim().toLowerCase();
  return LANGUES_.indexOf(l) >= 0 ? l : LANGUE_DEFAUT_;
};

const reglages_ = (classeur) => {
  const f = feuilleParametres_(classeur);
  const valeurs = f.getDataRange().getValues();
  const general = {};
  const parDomaine = new Map();
  let dansDomaines = false;

  for (const [cle, valeur] of valeurs.slice(1)) {
    const k = String(cle || '').trim();
    if (k.startsWith('Langue par domaine')) { dansDomaines = true; continue; }
    if (!k) continue;
    if (dansDomaines) parDomaine.set(k.toLowerCase(), langueValide_(valeur));
    else general[k] = valeur;
  }
  return {
    interface: langueValide_(general['Langue de l\'outil']),
    courriels: langueValide_(general['Langue par défaut des courriels']),
    parDomaine
  };
};

/**
 * La langue d'un destinataire : sa règle de domaine si elle existe, sinon le
 * défaut des courriels. Jamais une déduction à partir du nom ou du prénom.
 */
const langueDe_ = (courriel, params) => {
  const domaine = domaine_(courriel).toLowerCase();
  return params.parDomaine.get(domaine) || params.courriels;
};

// --------------------------------------------- onglets et colonnes, par langue

/**
 * Les onglets ont un identifiant interne stable et un nom par langue.
 *
 * C'EST CE QUI PERMET DE BASCULER SANS RIEN CASSER
 *
 * Les noms d'onglets et les en-têtes de colonnes servent de clés de lecture dans
 * tout le projet. Les traduire naïvement ferait qu'un classeur commencé en
 * français cesserait d'être lisible le jour où l'on passe à l'anglais.
 *
 * D'où trois règles :
 *   — on écrit toujours dans la langue courante ;
 *   — on lit en acceptant TOUTES les langues ;
 *   — quand un onglet existe sous un autre nom de langue, on le RENOMME au lieu
 *     d'en créer un second. Sans quoi l'onglet Décisions — le seul que rien ne
 *     reconstruit — serait abandonné avec tout le classement qu'il porte.
 */
const ONGLETS_ = {
  brut: { fr: '_Brut', en: '_Raw' },
  parc: { fr: '_Parc', en: '_Estate' },
  echecs: { fr: '_Échecs', en: '_Failures' },
  brutTemp: { fr: '_Brut (resserrage)', en: '_Raw (trimming)' },
  jetons: { fr: '_Jetons', en: '_Tokens' },
  comptes: { fr: '_Comptes', en: '_Accounts' },
  synthese: { fr: 'Synthèse', en: 'Summary' },
  aInstruire: { fr: 'À instruire', en: 'To review' },
  applications: { fr: 'Applications', en: 'Applications' },
  autorisants: { fr: 'Autorisants', en: 'Authorisers' },
  dormants: { fr: 'Dormants', en: 'Dormant accesses' },
  portees: { fr: 'Portées', en: 'Scopes' },
  volumetrie: { fr: 'Volumétrie', en: 'Data volume' },
  decisions: { fr: 'Décisions', en: 'Decisions' },
  catalogue: { fr: 'Catalogue portées', en: 'Scope catalogue' },
  modele: { fr: 'Modèle', en: 'Email template' },
  sollicitations: { fr: 'Sollicitations', en: 'Outreach' },
  revocations: { fr: 'Révocations', en: 'Revocations' },
  parametres: { fr: 'Paramètres', en: 'Settings' },
  guide: { fr: 'Guide', en: 'Guide' }
};

/** Les en-têtes de colonnes, même principe et mêmes règles. */
const COLONNES_ = {
  horodatage: { fr: 'horodatage', en: 'timestamp' },
  compteMin: { fr: 'compte', en: 'account' },
  domaineMin: { fr: 'domaine', en: 'domain' },
  evenement: { fr: 'evenement', en: 'event' },
  applicationMin: { fr: 'application', en: 'application' },
  clientId: { fr: 'client_id', en: 'client_id' },
  clientType: { fr: 'client_type', en: 'client_type' },
  porteesMin: { fr: 'portees', en: 'scopes' },
  motifRefus: { fr: 'motif_refus', en: 'rejection_reason' },
  demandeurMin: { fr: 'demandeur', en: 'requester' },
  api: { fr: 'api', en: 'api' },
  methode: { fr: 'methode', en: 'method' },
  octetsMin: { fr: 'octets', en: 'bytes' },
  produit: { fr: 'produit', en: 'product' },
  anonyme: { fr: 'anonyme', en: 'anonymous' },
  natif: { fr: 'natif', en: 'native' },
  releveLe: { fr: 'releve_le', en: 'collected_on' },
  motifEchec: { fr: 'motif_echec', en: 'failure_reason' },
  tentatives: { fr: 'tentatives', en: 'attempts' },

  compte: { fr: 'Compte', en: 'Account' },
  domaine: { fr: 'Domaine', en: 'Domain' },
  profil: { fr: 'Profil', en: 'Profile' },
  application: { fr: 'Application', en: 'Application' },
  statut: { fr: 'Statut', en: 'Status' },
  revoirAvant: { fr: 'Revoir avant', en: 'Review before' },
  priorite: { fr: 'Priorité', en: 'Priority' },
  niveauMax: { fr: 'Niveau max', en: 'Highest severity' },
  administration: { fr: 'Administration', en: 'Administration' },
  type: { fr: 'Type', en: 'Type' },
  autorisants: { fr: 'Autorisants', en: 'Authorisers' },
  dontPrivileges: { fr: 'dont à privilèges', en: 'of which privileged' },
  dontSuspendus: { fr: 'dont suspendus', en: 'of which suspended' },
  autorisations: { fr: 'Autorisations', en: 'Authorisations' },
  revocations: { fr: 'Révocations', en: 'Revocations' },
  refus: { fr: 'Refus', en: 'Denials' },
  appels: { fr: 'Appels', en: 'Calls' },
  volume: { fr: 'Volume', en: 'Volume' },
  volumeOctets: { fr: 'Volume (o)', en: 'Volume (bytes)' },
  portees: { fr: 'Portées', en: 'Scopes' },
  familles: { fr: 'Familles', en: 'Families' },
  motifs: { fr: 'Motifs', en: 'Reasons' },
  premiereVue: { fr: 'Première vue', en: 'First seen' },
  derniereVue: { fr: 'Dernière vue', en: 'Last seen' },
  jeton: { fr: 'Jeton', en: 'Token' },
  etatPresume: { fr: 'État présumé', en: 'Presumed state' },
  demandePar: { fr: 'Demandé par', en: 'Requested by' },
  premiere: { fr: 'Première', en: 'First' },
  derniere: { fr: 'Dernière', en: 'Last' },
  indicateur: { fr: 'Indicateur', en: 'Indicator' },
  valeur: { fr: 'Valeur', en: 'Value' },
  motif: { fr: 'Motif', en: 'Reason' },
  decidePar: { fr: 'Décidé par', en: 'Decided by' },
  le: { fr: 'Le', en: 'On' },
  vuePremiereFois: { fr: 'Vue la première fois', en: 'First seen on' },
  porteeOuPrefixe: { fr: 'Portée ou préfixe', en: 'Scope or prefix' },
  niveau: { fr: 'Niveau', en: 'Severity' },
  auCatalogue: { fr: 'Au catalogue ?', en: 'In catalogue?' },
  famille: { fr: 'Famille', en: 'Family' },
  comptes: { fr: 'Comptes', en: 'Accounts' },
  occurrences: { fr: 'Occurrences', en: 'Occurrences' },
  service: { fr: 'Service', en: 'Service' },
  partDuTotal: { fr: 'Part du total', en: 'Share of total' },
  dernierAppel: { fr: 'Dernier appel', en: 'Last call' },
  administrateur: { fr: 'Administrateur', en: 'Administrator' },
  delegue: { fr: 'Délégué', en: 'Delegated' },
  suspendu: { fr: 'Suspendu', en: 'Suspended' },
  langue: { fr: 'Langue', en: 'Language' },
  detail: { fr: 'Détail', en: 'Detail' },
  etat: { fr: 'État', en: 'State' },
  prepareLe: { fr: 'Préparé le', en: 'Prepared on' },
  envoyeLe: { fr: 'Envoyé le', en: 'Sent on' },
  relances: { fr: 'Relances', en: 'Reminders' },
  reponse: { fr: 'Réponse', en: 'Reply' },
  motifDecision: { fr: 'Motif de la décision', en: 'Decision reason' },
  appliqueLe: { fr: 'Appliqué le', en: 'Applied on' },
  resultat: { fr: 'Résultat', en: 'Result' },
  parametre: { fr: 'Paramètre', en: 'Setting' },
  explication: { fr: 'Explication', en: 'Explanation' },
  note: { fr: 'Note', en: 'Note' },
  guide: { fr: 'Guide d\'utilisation', en: 'User guide' },
  applications: { fr: 'Applications', en: 'Applications' },
  // La fenêtre courte vaut 30 jours (FENETRE_RECENTE_JOURS_) ; l'inscrire ici
  // en toutes lettres évite un gabarit à substituer dans un en-tête de colonne,
  // que Sheets afficherait tel quel si la substitution manquait.
  volumeRecent: { fr: 'Volume 30 j', en: 'Volume 30 d' },
  appelsRecents: { fr: 'Appels 30 j', en: 'Calls 30 d' },
  volumeRecentOctets: { fr: 'Volume 30 j (o)', en: 'Volume 30 d (bytes)' }
};

const nomOnglet_ = (id, lg) => (ONGLETS_[id] || {})[lg] || (ONGLETS_[id] || {})[LANGUE_DEFAUT_] || id;

const nomColonne_ = (id, lg) => (COLONNES_[id] || {})[lg] || (COLONNES_[id] || {})[LANGUE_DEFAUT_] || id;

/** Tous les noms qu'un identifiant peut porter, toutes langues confondues. */
const nomsPossibles_ = (table, id) => {
  const e = table[id];
  if (!e) return [id];
  return LANGUES_.map((l) => e[l]).filter((v, i, t) => v && t.indexOf(v) === i);
};

/** Retrouve un onglet quelle que soit la langue sous laquelle il a été créé. */
const chercherOnglet_ = (classeur, id) => {
  if (!classeur) return null;
  for (const nom of nomsPossibles_(ONGLETS_, id)) {
    const f = classeur.getSheetByName(nom);
    if (f) return f;
  }
  return null;
};

/**
 * L'onglet, sous son nom dans la langue courante — renommé si besoin.
 * Renommer plutôt que recréer : sinon le classement de l'onglet Décisions,
 * que rien ne reconstruit, serait abandonné à chaque bascule de langue.
 */
const ongletCanonique_ = (classeur, id, lg) => {
  const voulu = nomOnglet_(id, lg);
  const f = chercherOnglet_(classeur, id);
  if (f && f.getName() !== voulu) f.setName(voulu);
  return f;
};

/** L'index d'une colonne, quelle que soit la langue de son en-tête. */
const colonne_ = (entetes, id) => {
  for (const nom of nomsPossibles_(COLONNES_, id)) {
    const i = entetes.indexOf(nom);
    if (i >= 0) return i;
  }
  return -1;
};

/** Des identifiants de colonnes vers les libellés d'une langue. */
const entetesEn_ = (ids, lg) => ids.map((id) => nomColonne_(id, lg));

/**
 * Valeurs d'état inscrites dans les plans. Ce sont des DONNÉES, pas des
 * libellés : on les reconnaît dans toutes les langues où elles ont pu être
 * écrites, sans jamais réécrire un plan déjà produit.
 */
const ETATS_A_ENVOYER_ = ['à envoyer', 'to send'];
const ETATS_A_REVOQUER_ = ['à révoquer', 'to revoke'];

/**
 * Les cinq statuts du référentiel des décisions. Ce sont eux aussi des données
 * — un administrateur les a tapés — et non des libellés qu'on réécrit : la
 * liste déroulante s'affiche dans la langue courante, mais la lecture reconnaît
 * les deux langues. Un classeur classé en français bascule donc en anglais sans
 * perdre une seule décision.
 *
 * Ne JAMAIS comparer un statut par égalité de chaîne : passer par estStatut_.
 */
const STATUTS_LANGUE_ = {
  approuvee: { fr: 'approuvée', en: 'approved' },
  toleree: { fr: 'tolérée', en: 'tolerated' },
  aInstruire: { fr: 'à instruire', en: 'to review' },
  aBloquer: { fr: 'à bloquer', en: 'to block' },
  bloquee: { fr: 'bloquée', en: 'blocked' }
};

const ORDRE_STATUTS_ = ['approuvee', 'toleree', 'aInstruire', 'aBloquer', 'bloquee'];

const nomStatut_ = (id, lg) => (STATUTS_LANGUE_[id] || {})[lg]
  || (STATUTS_LANGUE_[id] || {})[LANGUE_DEFAUT_] || id;

/** La liste déroulante, dans la langue de l'interface. */
const statutsEn_ = (lg) => ORDRE_STATUTS_.map((id) => nomStatut_(id, lg));

/** Une valeur lue dans le classeur est-elle ce statut, quelle qu'en soit la langue ? */
const estStatut_ = (valeur, id) => {
  const t = STATUTS_LANGUE_[id];
  if (!t) return false;
  const v = String(valeur || '').trim().toLowerCase();
  return LANGUES_.some((l) => t[l] && v === t[l].toLowerCase());
};

// ------------------------------------------------------------- dictionnaire

/**
 * Le dictionnaire est plat et ses clés sont explicites : `courriel.objet` se
 * lit mieux qu'un numéro, et une clé manquante saute aux yeux dans le rendu au
 * lieu de disparaître silencieusement.
 */
const TEXTES_ = {
  'courriel.objet': {
    fr: 'Applications tierces connectées à votre compte Google — pouvez-vous nous éclairer ?',
    en: 'Third-party apps connected to your Google account — can you help us understand?'
  },
  'courriel.bonjour': { fr: 'Bonjour,', en: 'Hello,' },
  'courriel.intro': {
    fr: 'Nous passons en revue les applications tierces connectées aux comptes '
      + 'Google de l\'organisation. Votre compte apparaît comme ayant autorisé les '
      + 'applications ci-dessous.',
    en: 'We are reviewing the third-party applications connected to the '
      + 'organisation\'s Google accounts. Your account appears to have authorised '
      + 'the applications listed below.'
  },
  'courriel.colonne.application': { fr: 'Application', en: 'Application' },
  'courriel.colonne.acces': { fr: 'Accède à', en: 'Can access' },
  'courriel.colonne.depuis': { fr: 'Autorisée depuis', en: 'Authorised since' },
  'courriel.demande': {
    fr: 'Ce que nous vous demandons', en: 'What we are asking you'
  },
  'courriel.demande.pourChacune': { fr: ', pour chacune :', en: ', for each one:' },
  'courriel.demande.1': {
    fr: 'à quoi elle vous sert, en une phrase ;',
    en: 'what you use it for, in one sentence;'
  },
  'courriel.demande.2': {
    fr: 'si elle vous est encore nécessaire aujourd\'hui ;',
    en: 'whether you still need it today;'
  },
  'courriel.demande.3': {
    fr: 'si d\'autres personnes s\'en servent, et lesquelles.',
    en: 'whether anyone else uses it, and who.'
  },
  'courriel.retirer.titre': {
    fr: 'Si vous ne la reconnaissez pas, ou si elle ne vous sert plus',
    en: 'If you do not recognise it, or no longer need it'
  },
  'courriel.retirer.corps': {
    fr: ', vous pouvez retirer son accès vous-même, en quelques secondes et sans '
      + 'nous attendre : ',
    en: ', you can remove its access yourself, in seconds and without waiting for '
      + 'us: '
  },
  'courriel.retirer.suite': {
    fr: '. Dites-le-nous simplement, pour que nous n\'ayons pas à revenir vers vous.',
    en: '. Just let us know, so that we do not have to come back to you.'
  },
  'courriel.encadre': {
    fr: 'Une autorisation accordée ne s\'arrête jamais d\'elle-même : elle reste '
      + 'valable jusqu\'à ce que quelqu\'un la retire. C\'est pourquoi nous les '
      + 'passons en revue. Une application autorisée « pour essayer » il y a deux '
      + 'ans a toujours accès aujourd\'hui.',
    en: 'An authorisation never expires on its own: it remains valid until someone '
      + 'removes it. That is why we review them. An application authorised "just to '
      + 'try it" two years ago still has access today.'
  },
  'courriel.regles.intro': {
    fr: 'Si l\'une de ces applications est un projet Apps Script que vous avez '
      + 'créé, voici les règles de nommage à appliquer. Un projet mal nommé est un '
      + 'accès que personne ne peut rattacher à un usage — et c\'est aujourd\'hui '
      + 'le premier obstacle à cette revue.',
    en: 'If one of these applications is an Apps Script project you created, here '
      + 'are the naming rules to follow. A badly named project is an access that no '
      + 'one can tie to a purpose — and that is currently the main obstacle to this '
      + 'review.'
  },
  'courriel.delai': {
    fr: 'Merci de nous répondre sous', en: 'Please reply within'
  },
  'courriel.delai.jours': { fr: 'jours', en: 'days' },
  'courriel.delai.a': { fr: ', à', en: ', to' },
  'courriel.delai.reponse': {
    fr: ', par simple réponse à ce message',
    en: ', simply by replying to this message'
  },
  'courriel.sansReponse': {
    fr: 'Sans réponse, les accès concernés seront réexaminés et pourront être '
      + 'retirés.',
    en: 'Without a reply, the accesses concerned will be reviewed again and may be '
      + 'removed.'
  },
  'courriel.signature': {
    fr: 'L\'équipe sécurité du système d\'information',
    en: 'Information security team'
  },

  'menu.titre': { fr: 'Applications tierces', en: 'Third-party apps' },
  'menu.collecter': { fr: 'Collecter les données', en: 'Collect data' },
  'menu.moissonner180': {
    fr: 'Moissonner le journal d\'audit — 180 jours',
    en: 'Harvest the audit log — 180 days'
  },
  'menu.moissonner30': {
    fr: 'Moissonner le journal d\'audit — 30 jours',
    en: 'Harvest the audit log — 30 days'
  },
  'menu.profils': {
    fr: 'Relever les profils des comptes (annuaire)',
    en: 'Collect account profiles (directory)'
  },
  'menu.jetons': {
    fr: 'Relever les jetons actifs — long…', en: 'Collect active tokens — slow…'
  },
  'menu.recalculer': {
    fr: 'Recalculer le rapport, sans rien recollecter',
    en: 'Rebuild the report, collecting nothing'
  },
  'menu.ouEnEst': { fr: 'Où en sont les collectes ?', en: 'How are collections going?' },
  'menu.arreter': {
    fr: 'Arrêter les collectes en cours', en: 'Stop the running collections'
  },
  'menu.ecrire': { fr: 'Écrire aux autorisants', en: 'Write to authorisers' },
  'menu.preparerEnvoi': { fr: '1. Préparer le plan d\'envoi', en: '1. Prepare the send plan' },
  'menu.exemple': { fr: '2. M\'envoyer un exemple', en: '2. Send me a sample' },
  'menu.envoyer': { fr: '3. Envoyer pour de bon…', en: '3. Send for real…' },
  'menu.revoquer': { fr: 'Révoquer des accès', en: 'Revoke accesses' },
  'menu.preparerRevocation': {
    fr: '1. Préparer le plan de révocation', en: '1. Prepare the revocation plan'
  },
  'menu.appliquer': { fr: '2. Appliquer le plan…', en: '2. Apply the plan…' },
  'menu.fiche': {
    fr: 'Fiche de l\'application sélectionnée', en: 'Record for the selected application'
  },
  'menu.vue': { fr: 'Partager la vue de consultation', en: 'Share the read-only view' },
  'menu.technique': { fr: 'Onglets techniques', en: 'Technical tabs' },
  'menu.afficherBrut': { fr: 'Afficher l\'onglet brut', en: 'Show the raw tab' },
  'menu.masquerBrut': { fr: 'Masquer l\'onglet brut', en: 'Hide the raw tab' },
  'menu.resserrer': {
    fr: 'Resserrer l\'onglet brut sur 30 jours…',
    en: 'Trim the raw tab to 30 days…'
  },
  'menu.guide': { fr: 'Guide complet', en: 'Full guide' },
  'menu.aide': { fr: 'Aide — le déroulé en bref', en: 'Help — the sequence in brief' },
  'menu.aPropos': { fr: 'À propos', en: 'About' },

  'etape.commencer': {
    fr: 'Commencer : moissonner le journal d\'audit',
    en: 'Start here: harvest the audit log'
  },
  'etape.commencer.pourquoi': {
    fr: 'Le classeur est vide. Le journal est la source la moins coûteuse, et il '
      + 'donne à lui seul un rapport complet.',
    en: 'The spreadsheet is empty. The log is the cheapest source, and on its own '
      + 'it yields a complete report.'
  },
  'etape.revocations': {
    fr: 'Terminer : {n} révocation(s) préparée(s)',
    en: 'Finish: {n} revocation(s) prepared'
  },
  'etape.revocations.pourquoi': {
    fr: 'Un plan de révocation attend d\'être appliqué. Relisez-le, puis '
      + 'appliquez-le — ou videz l\'onglet si vous avez changé d\'avis.',
    en: 'A revocation plan is waiting to be applied. Review it, then apply it — or '
      + 'clear the tab if you have changed your mind.'
  },
  'etape.envois': {
    fr: 'Terminer : {n} courriel(s) à envoyer', en: 'Finish: {n} email(s) to send'
  },
  'etape.envois.pourquoi': {
    fr: 'Un plan de sollicitation attend. Relisez-le, envoyez-vous un exemple, puis '
      + 'envoyez pour de bon.',
    en: 'An outreach plan is waiting. Review it, send yourself a sample, then send '
      + 'for real.'
  },
  'etape.profils': {
    fr: 'Relever les profils des comptes', en: 'Collect account profiles'
  },
  'etape.profils.pourquoi': {
    fr: 'Sans l\'annuaire, on ignore quels autorisants sont administrateurs ou '
      + 'suspendus — et c\'est ce qui change la lecture du rapport. C\'est rapide.',
    en: 'Without the directory we cannot tell which authorisers are administrators '
      + 'or suspended — and that is what changes how the report reads. It is quick.'
  },
  'etape.jetons': {
    fr: 'Relever les jetons actifs (c\'est long)',
    en: 'Collect active tokens (this takes a while)'
  },
  'etape.jetons.pourquoi': {
    fr: 'Le journal ne remonte qu\'à 180 jours. Seul l\'inventaire montre les accès '
      + 'accordés avant, que personne n\'a revus depuis. Une requête par compte, '
      + 'avec reprise automatique.',
    en: 'The log only reaches back 180 days. Only the inventory reveals accesses '
      + 'granted before that, which nobody has reviewed since. One request per '
      + 'account, resuming on its own.'
  },
  'etape.classer': {
    fr: 'Classer : {n} application(s) sans décision',
    en: 'Classify: {n} application(s) with no decision'
  },
  'etape.classer.pourquoi': {
    fr: 'Tout est collecté. Ouvrez « À instruire », déjà trié par priorité, et '
      + 'inscrivez un statut dans l\'onglet Décisions — sans oublier l\'échéance '
      + '« Revoir avant ».',
    en: 'Everything is collected. Open "To review", already sorted by priority, and '
      + 'record a status in the Decisions tab — without forgetting the "Review '
      + 'before" date.'
  },
  'etape.rien': {
    fr: 'Tout est classé — relancer une collecte',
    en: 'Everything is classified — run a new collection'
  },
  'etape.rien.pourquoi': {
    fr: 'Rien n\'attend. Un nouveau moissonnage fera apparaître ce qui a changé '
      + 'depuis, et les décisions arrivées à échéance reviendront d\'elles-mêmes '
      + 'dans la file de travail.',
    en: 'Nothing is pending. A new harvest will surface what has changed since, and '
      + 'decisions that have reached their review date will return to the queue on '
      + 'their own.'
  },
  'etape.continuer': { fr: 'Continuer ?', en: 'Continue?' },

  'etape.bloquer': {
    fr: 'Préparer le plan de révocation',
    en: 'Prepare the revocation plan'
  },
  'etape.bloquer.pourquoi': {
    fr: '{n} application(s) sont jugées « {statut} » sans qu\'un plan les couvre. '
      + 'L\'outil procède en deux temps : il dresse d\'abord la liste des jetons '
      + 'touchés, que vous relisez, avant que rien ne soit supprimé.',
    en: '{n} application(s) are judged \u00ab {statut} \u00bb without a plan covering them. '
      + 'The tool works in two steps: it first lists the tokens involved, which you '
      + 'review, before anything is deleted.'
  },

  'confirm.campagne.titre': { fr: 'Campagne en cours', en: 'Harvest in progress' },
  'confirm.campagne.corps': {
    fr: 'Une campagne est déjà en cours et va se poursuivre. Consultez « Où en '
      + 'sont les collectes ? », ou arrêtez-la avant d\'en lancer une autre.',
    en: 'A harvest is already running and will continue. See \u00ab How are '
      + 'collections going? \u00bb, or stop it before starting another.'
  },
  'confirm.moisson.titre': { fr: 'Moissonner le journal', en: 'Harvest the audit log' },
  'confirm.moisson.remplace': {
    fr: 'Le journal des {n} derniers jours va être relu, et le contenu actuel de '
      + 'l\'onglet brut remplacé.\n\nContinuer ?',
    en: 'The last {n} days of the audit log will be re-read, and the current '
      + 'contents of the raw tab replaced.\n\nContinue?'
  },
  'confirm.moisson.neuf': {
    fr: 'Le journal des {n} derniers jours va être lu et déposé dans ce '
      + 'classeur.\n\nContinuer ?',
    en: 'The last {n} days of the audit log will be read and written into this '
      + 'workbook.\n\nContinue?'
  },
  'confirm.resserrer.titre': { fr: 'Resserrer l\'onglet brut', en: 'Trim the raw tab' },
  'confirm.resserrer.corps': {
    fr: 'L\'onglet brut compte {lignes} lignes. Celles antérieures au {seuil} vont '
      + 'être SUPPRIMÉES du classeur — elles ne sont pas archivées ailleurs, et '
      + 'seul un nouveau moissonnage les ramènerait.\n\n'
      + 'À faire quand l\'agrégation annonce qu\'elle ne tient pas en une '
      + 'exécution : elle ne se reprend pas, il faut donc lui donner moins à '
      + 'lire.\n\nL\'opération écrit à côté et ne remplace qu\'à la fin : une '
      + 'interruption laisse le brut intact.\n\nContinuer ?',
    en: 'The raw tab holds {lignes} rows. Those older than {seuil} will be DELETED '
      + 'from the workbook — they are not archived anywhere else, and only a new '
      + 'harvest would bring them back.\n\n'
      + 'Do this when aggregation reports it cannot fit in one execution: it '
      + 'cannot resume, so it must be given less to read.\n\nThe operation writes '
      + 'alongside and only swaps at the end: an interruption leaves the raw tab '
      + 'intact.\n\nContinue?'
  },
  'confirm.inventaire.titre': { fr: 'Relever les jetons actifs', en: 'Collect active tokens' },
  'confirm.inventaire.corps': {
    fr: 'Le relevé interroge l\'annuaire compte par compte : une requête par '
      + 'compte, reprise automatiquement jusqu\'au bout.\n\nLe relevé précédent '
      + 'sera remplacé — les mêler ferait passer pour actifs des jetons révoqués '
      + 'depuis.\n\nContinuer ?',
    en: 'The inventory queries the directory account by account: one request per '
      + 'account, resumed automatically until it completes.\n\nThe previous '
      + 'inventory will be replaced — merging them would make tokens revoked since '
      + 'look active.\n\nContinue?'
  },
  'dialogue.fermer': { fr: 'Fermer', en: 'Close' },
  'dialogue.annuler': { fr: 'Annuler', en: 'Cancel' },
  'dialogue.confirmer': { fr: 'Confirmer', en: 'Confirm' },
  'dialogue.rienNeSeraFait': {
    fr: 'Fermer cette fenêtre n\'exécute rien.',
    en: 'Closing this window does nothing.'
  },
  'dialogue.attention': { fr: 'Attention', en: 'Warning' },
  'dialogue.erreur': { fr: 'Erreur', en: 'Error' },

  'menu.assistant': { fr: 'Ouvrir l\'assistant', en: 'Open the assistant' },
  'assistant.titre': { fr: 'Assistant', en: 'Assistant' },
  'assistant.chargement': { fr: 'Lecture de l\'état du classeur…', en: 'Reading the workbook state…' },
  'assistant.patienter': {
    fr: 'Un instant : l\'assistant regarde ce qui est collecté et ce qui reste à faire.',
    en: 'One moment: the assistant is checking what has been collected and what remains.'
  },
  'assistant.continuer': { fr: 'Continuer', en: 'Continue' },
  'assistant.aJour': { fr: 'Rien à faire', en: 'Nothing to do' },
  'assistant.avancement': { fr: 'Avancement', en: 'Progress' },
  'assistant.journal': { fr: 'Journal d\'audit', en: 'Audit log' },
  'assistant.profils': { fr: 'Profils de l\'annuaire', en: 'Directory profiles' },
  'assistant.jetons': { fr: 'Jetons actifs', en: 'Active tokens' },
  'assistant.aInstruire': { fr: 'À instruire', en: 'To review' },
  'assistant.aClasser': { fr: '{n} application(s) à classer', en: '{n} application(s) to classify' },
  'assistant.toutClasse': { fr: 'Tout est classé', en: 'Everything is classified' },
  'assistant.actualiser': { fr: 'Actualiser l\'état', en: 'Refresh' },
  'assistant.pasDeSondage': {
    fr: 'L\'état n\'est relu que sur demande : interroger le classeur en boucle '
      + 'coûterait du quota pour rien.',
    en: 'The state is re-read on demand only: polling the workbook would burn quota '
      + 'for nothing.'
  },


  'acces.drive': { fr: 'vos fichiers Drive', en: 'your Drive files' },
  'acces.gmail': { fr: 'votre messagerie', en: 'your mailbox' },
  'acces.calendar': { fr: 'votre agenda', en: 'your calendar' },
  'acces.documents': { fr: 'vos documents Docs', en: 'your Docs documents' },
  'acces.spreadsheets': { fr: 'vos feuilles de calcul', en: 'your spreadsheets' },
  'acces.presentations': { fr: 'vos présentations', en: 'your presentations' },
  'acces.forms': { fr: 'vos formulaires', en: 'your forms' },
  'acces.script': { fr: 'vos projets Apps Script', en: 'your Apps Script projects' },
  'acces.admin': { fr: 'l\'administration du domaine', en: 'domain administration' },
  'acces.cloud-identity': {
    fr: 'l\'annuaire de l\'organisation', en: 'the organisation directory'
  },
  'acces.apps': { fr: 'les services Google Workspace', en: 'Google Workspace services' },
  'acces.apps_genai': {
    fr: 'les fonctions d\'intelligence artificielle', en: 'artificial intelligence features'
  },
  'acces.contacts': { fr: 'vos contacts', en: 'your contacts' },
  'acces.tasks': { fr: 'vos tâches', en: 'your tasks' },
  'acces.identité': {
    fr: 'votre identité (nom et adresse)', en: 'your identity (name and address)'
  },
  'acces.autre': { fr: 'd\'autres services Google', en: 'other Google services' },
  'acces.inconnu': { fr: '(service Google)', en: '(Google service)' },
  'acces.aucun': {
    fr: 'accès non précisé par le journal', en: 'access not specified by the log'
  },
  'acces.et': { fr: 'et', en: 'and' },

  'vue.titre': {
    fr: 'Applications tierces connectées au domaine',
    en: 'Third-party applications connected to the domain'
  },
  'vue.sousTitre': {
    fr: 'Vue de consultation, en lecture seule.', en: 'Read-only overview.'
  },
  'vue.parc': { fr: 'Où en est le parc', en: 'Where the estate stands' },
  'vue.aInstruire': {
    fr: 'À instruire — ce qui appelle un examen',
    en: 'To review — what calls for examination'
  },
  'vue.colonne.priorite': { fr: 'Priorité', en: 'Priority' },
  'vue.colonne.application': { fr: 'Application', en: 'Application' },
  'vue.colonne.gravite': { fr: 'Gravité', en: 'Severity' },
  'vue.colonne.autorisants': { fr: 'Autorisants', en: 'Authorisers' },
  'vue.colonne.pourquoi': { fr: 'Pourquoi', en: 'Why' },
  'vue.premieres': {
    fr: 'Les {n} premières sur {total}. La liste complète est dans le classeur.',
    en: 'The first {n} of {total}. The full list is in the spreadsheet.'
  },
  'vue.rienAInstruire': {
    fr: 'Rien à instruire : soit tout est classé, soit aucune collecte n\'a encore '
      + 'eu lieu.',
    en: 'Nothing to review: either everything is classified, or no collection has '
      + 'run yet.'
  },
  'vue.avertPriorite.titre': {
    fr: 'Comment lire la priorité.', en: 'How to read the priority.'
  },
  'vue.avertPriorite.corps': {
    fr: 'C\'est une somme de points, non une note sur 100 : chaque motif pèse un '
      + 'poids choisi à la main, et la colonne « Pourquoi » en donne le détail. '
      + 'Elle sert à ordonner le travail, pas à trancher à la place de qui décide.',
    en: 'It is a sum of points, not a score out of 100: each reason carries a '
      + 'hand-picked weight, and the "Why" column spells them out. It orders the '
      + 'work; it does not decide in place of whoever decides.'
  },
  'vue.produitesLe': { fr: 'Données produites le', en: 'Data produced on' },
  'vue.neRafraichitRien': {
    fr: '— cette page ne rafraîchit rien, elle relit le dernier rapport. Un chiffre '
      + 'lu ici n\'est pas l\'état du tenant à l\'instant présent, mais celui de la '
      + 'dernière collecte.',
    en: '— this page refreshes nothing; it re-reads the latest report. A figure '
      + 'shown here is not the state of the tenant right now, but that of the last '
      + 'collection.'
  },
  'vue.vousConsultez': { fr: 'Vous consultez en tant que', en: 'You are viewing as' },
  'vue.pourAgir': {
    fr: 'Pour agir — collecter, solliciter, révoquer — il faut le classeur et des '
      + 'droits d\'administrateur.',
    en: 'To act — collect, contact, revoke — you need the spreadsheet and '
      + 'administrator rights.'
  },
  'vue.retour': { fr: '← Retour', en: '← Back' },
  'vue.outilVersion': {
    fr: 'Outil d\'audit des applications tierces, version',
    en: 'Third-party application audit tool, version'
  },

  'fiche.statut': { fr: 'Statut', en: 'Status' },
  'fiche.sansDecision': {
    fr: 'Aucune décision inscrite au référentiel.',
    en: 'No decision recorded in the register.'
  },
  'fiche.revoirAvant': { fr: 'Revoir avant', en: 'Review before' },
  'fiche.revoirAvant.note': {
    fr: 'Passée cette date, la décision est caduque et l\'application revient dans '
      + 'la file.',
    en: 'After this date the decision lapses and the application returns to the '
      + 'queue.'
  },
  'fiche.priorite': { fr: 'Priorité', en: 'Priority' },
  'fiche.rienNeSignale': { fr: 'Rien ne la signale.', en: 'Nothing flags it.' },
  'fiche.graviteMax': { fr: 'Gravité maximale', en: 'Highest severity' },
  'fiche.administration': { fr: 'Administration du domaine', en: 'Domain administration' },
  'fiche.administration.note': {
    fr: 'L\'application détient une portée qui donne prise sur le tenant lui-même.',
    en: 'The application holds a scope that grants leverage over the tenant itself.'
  },
  'fiche.autorisants': { fr: 'Autorisants', en: 'Authorisers' },
  'fiche.autorisants.note': {
    fr: 'dont {p} à privilèges et {s} suspendu(s)',
    en: 'of which {p} privileged and {s} suspended'
  },
  'fiche.volume': { fr: 'Volume extrait', en: 'Data extracted' },
  'fiche.volume.note': { fr: 'dont {v} sur {j} jours', en: 'of which {v} over {j} days' },
  'fiche.observee': { fr: 'Observée du', en: 'Observed from' },
  'fiche.observee.au': { fr: 'au', en: 'to' },
  'fiche.observee.note': {
    fr: 'Bornes observées dans le journal d\'audit, qui ne remonte pas au-delà de '
      + '180 jours.',
    en: 'Bounds observed in the audit log, which does not reach beyond 180 days.'
  },
  'fiche.portees': { fr: 'Portées obtenues', en: 'Scopes granted' },
  'fiche.portees.aucune': { fr: 'Aucune portée relevée.', en: 'No scope recorded.' },
  'fiche.portees.nonClassee': { fr: 'non classée', en: 'unclassified' },
  'fiche.portees.administration': {
    fr: ', administration du domaine', en: ', domain administration'
  },
  'fiche.lu': { fr: 'Ce qu\'elle a réellement lu', en: 'What it actually read' },
  'fiche.appels': { fr: 'appels', en: 'calls' },
  'fiche.comptes': { fr: 'Comptes concernés', en: 'Accounts concerned' },
  'fiche.comptes.compte': { fr: 'Compte', en: 'Account' },
  'fiche.comptes.profil': { fr: 'Profil', en: 'Profile' },
  'fiche.comptes.jeton': { fr: 'Jeton', en: 'Token' },
  'fiche.comptes.journal': { fr: 'Journal', en: 'Log' },
  'fiche.comptes.suite': {
    fr: '…et {n} autres. La liste complète est dans l\'onglet Autorisants.',
    en: '…and {n} more. The full list is in the Authorisers tab.'
  },
  'fiche.comptes.nonPublies': {
    fr: 'Les comptes concernés ne sont pas publiés sur cette page : ils figurent '
      + 'dans le classeur, auquel seuls les administrateurs ont accès.',
    en: 'The accounts concerned are not published on this page: they are in the '
      + 'spreadsheet, which only administrators can open.'
  },
  'fiche.pied': {
    fr: '« Jeton » est un constat : l\'accès existe encore, ou non, au jour du '
      + 'relevé. « Journal » est une supposition tirée des 180 derniers jours. Une '
      + 'valeur vide signifie « non mesuré », jamais « rien trouvé ».',
    en: '"Token" is an observation: the access still exists, or not, as of the '
      + 'census date. "Log" is an inference drawn from the last 180 days. An empty '
      + 'value means "not measured", never "nothing found".'
  },
  'fiche.imprimer': { fr: 'Imprimer / PDF', en: 'Print / PDF' },

  'niveau.restreinte': { fr: 'restreinte', en: 'restricted' },
  'niveau.sensible': { fr: 'sensible', en: 'sensitive' },
  'niveau.basique': { fr: 'basique', en: 'basic' },
  'note.restreinte': {
    fr: 'Portée restreinte au sens de Google : accès complet ou en lecture à Gmail '
      + 'ou à tout Drive.',
    en: 'Restricted scope in Google\'s sense: full or read access to Gmail or to '
      + 'all of Drive.'
  },
  'note.sensible': {
    fr: 'Portée sensible : accès à des données personnelles, sans atteindre le '
      + 'niveau restreint.',
    en: 'Sensitive scope: access to personal data, short of the restricted level.'
  },
  'note.basique': {
    fr: 'Portée basique : identité, ou fichiers créés par l\'application elle-même.',
    en: 'Basic scope: identity, or files created by the application itself.'
  }
};

/**
 * Traduit une clé. Les substitutions se font par `{nom}`, ce qui évite les
 * concaténations dont l'ordre des mots diffère d'une langue à l'autre.
 *
 * Une clé absente est rendue telle quelle, entre chevrons : elle se voit dans le
 * rendu au lieu de produire un blanc que personne ne remarque.
 */
const t_ = (cle, langue, valeurs) => {
  const entree = TEXTES_[cle];
  if (!entree) return `«${cle}»`;
  let texte = entree[langue] || entree[LANGUE_DEFAUT_];
  if (valeurs) {
    for (const nom of Object.keys(valeurs)) {
      texte = texte.split(`{${nom}}`).join(String(valeurs[nom]));
    }
  }
  return texte;
};

/** Ce à quoi une famille de portées donne accès, dit à qui va le lire. */
const enClairLangue_ = (familles, langue) => {
  const libelles = familles
    .map((f) => (TEXTES_[`acces.${f}`]
      ? t_(`acces.${f}`, langue)
      : `${f} ${t_('acces.inconnu', langue)}`))
    .filter((v, i, tab) => tab.indexOf(v) === i);
  if (!libelles.length) return t_('acces.aucun', langue);
  if (libelles.length === 1) return libelles[0];
  return `${libelles.slice(0, -1).join(', ')} ${t_('acces.et', langue)} `
    + `${libelles[libelles.length - 1]}`;
};
