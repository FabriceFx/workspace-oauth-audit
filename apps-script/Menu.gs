/**
 * Menu du classeur — introduit en v0.2.
 *
 * Le script étant lié au classeur, `onOpen` est un déclencheur simple : le menu
 * apparaît de lui-même, sans rien à installer.
 *
 * CE QUE CE CHOIX ÉVITE
 *
 * Un projet autonome aurait dû poser un déclencheur installable, lequel
 * s'exécute sous l'identité de celui qui l'a posé — et non sous celle de la
 * personne qui ouvre le classeur. Toute personne à qui l'on partage le rapport
 * aurait alors pu, d'un clic, relire le journal d'audit avec des droits
 * d'administrateur. Ici, chaque action s'exécute sous l'identité de qui la
 * déclenche : un lecteur non administrateur se voit refuser l'accès par Google
 * lui-même. La bonne défense est celle qu'on n'a pas eu à coder.
 *
 * POURQUOI LE MENU COMMENCE PAR UNE ÉTAPE, ET NON PAR UNE LISTE
 *
 * Un menu rangé par étapes du traitement — collecter, suivre, solliciter —
 * suppose qu'on sache où l'on en est. Or c'est exactement ce qu'on oublie : le
 * journal a-t-il été relu depuis ? les profils sont-ils à jour ? reste-t-il un
 * plan d'envoi en attente ? Ranger par étapes déplaçait donc la charge sur
 * l'utilisateur, qui devait tenir l'état de tête.
 *
 * Le menu répond désormais lui-même, en première ligne, à la seule question
 * qu'on se pose en l'ouvrant. Le reste est rangé par **intention** — collecter,
 * écrire, révoquer — et la numérotation ne subsiste qu'à l'intérieur des
 * sous-menus où les gestes s'enchaînent vraiment : préparer, essayer, envoyer.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Applications tierces');

  // Le diagnostic lit le classeur ; s'il échoue pour une raison quelconque, le
  // menu doit tout de même apparaître. Un outil sans menu est un outil perdu.
  let entete = 'Par où commencer ?';
  try {
    entete = prochaineEtape_(etatDuTravail_(SpreadsheetApp.getActive())).libelle;
  } catch (e) {
    entete = 'Par où commencer ?';
  }
  menu.addItem(`▶  ${entete}`, 'menuEtapeSuivante');
  menu.addSeparator();

  menu.addSubMenu(ui.createMenu('Collecter les données')
    .addItem('Moissonner le journal d\'audit — 180 jours', 'menuMoissonner180')
    .addItem('Moissonner le journal d\'audit — 30 jours', 'menuMoissonner30')
    .addItem('Relever les profils des comptes (annuaire)', 'menuRafraichirComptes')
    .addItem('Relever les jetons actifs — long…', 'menuInventorier')
    .addSeparator()
    .addItem('Recalculer le rapport, sans rien recollecter', 'menuReagreger')
    .addSeparator()
    .addItem('Où en sont les collectes ?', 'menuOuEnEstOn')
    .addItem('Arrêter les collectes en cours', 'menuArreter'));

  menu.addSubMenu(ui.createMenu('Écrire aux autorisants')
    .addItem('1. Préparer le plan d\'envoi', 'menuPreparerSollicitations')
    .addItem('2. M\'envoyer un exemple', 'menuSollicitationExemple')
    .addItem('3. Envoyer pour de bon…', 'menuEnvoyerSollicitations'));

  menu.addSubMenu(ui.createMenu('Révoquer des accès')
    .addItem('1. Préparer le plan de révocation', 'menuPreparerRevocations')
    .addItem('2. Appliquer le plan…', 'menuAppliquerRevocations'));

  menu.addSeparator();
  menu.addItem('Fiche de l\'application sélectionnée', 'menuFiche');
  menu.addItem('Partager la vue de consultation', 'menuUrlConsultation');
  menu.addSubMenu(ui.createMenu('Onglets techniques')
    .addItem('Afficher l\'onglet brut', 'menuAfficherBrut')
    .addItem('Masquer l\'onglet brut', 'menuMasquerBrut'));

  menu.addSeparator();
  menu.addItem('Guide complet', 'menuGuide');
  menu.addItem('Aide — le déroulé en bref', 'menuAide');
  menu.addItem('À propos', 'menuAPropos');
  menu.addToUi();
}

// ------------------------------------------------------------- où en est-on

/**
 * Ce que le classeur permet de savoir de l'avancement.
 *
 * Uniquement à partir de ses onglets : rien n'est demandé à Google, et rien
 * n'est lu dans l'état des campagnes. `onOpen` est un déclencheur simple, dont
 * les droits sont volontairement étroits — il doit pouvoir échouer sans priver
 * l'utilisateur de son menu.
 */
const etatDuTravail_ = (classeur) => {
  const remplie = (id) => {
    const f = classeur && chercherOnglet_(classeur, id);
    return Boolean(f) && f.getLastRow() > 1;
  };
  // Les états sont des données, pas des libellés : on les reconnaît dans toutes
  // les langues où ils ont pu être écrits.
  const compter = (id, idColonne, valeurs) => {
    const f = classeur && chercherOnglet_(classeur, id);
    if (!f || f.getLastRow() < 2) return 0;
    const v = f.getDataRange().getValues();
    const i = colonne_(v[0], idColonne);
    if (i < 0) return 0;
    return v.slice(1).filter((l) => valeurs.indexOf(String(l[i]).trim()) >= 0).length;
  };
  const nonClassees = () => {
    const f = classeur && chercherOnglet_(classeur, 'decisions');
    if (!f || f.getLastRow() < 2) return 0;
    const v = f.getDataRange().getValues();
    const i = colonne_(v[0], 'statut');
    return v.slice(1).filter((l) => l[0] && !String(l[i]).trim()).length;
  };

  return {
    journal: remplie('brut'),
    profils: remplie('comptes'),
    jetons: remplie('jetons'),
    aInstruire: remplie('aInstruire'),
    nonClassees: nonClassees(),
    envoisEnAttente: compter('sollicitations', 'etat', ETATS_A_ENVOYER_),
    revocationsEnAttente: compter('revocations', 'etat', ETATS_A_REVOQUER_)
  };
};

/**
 * La prochaine chose à faire, et pourquoi.
 *
 * L'ordre traduit une règle simple : on finit ce qu'on a commencé avant
 * d'entreprendre autre chose. Un plan préparé puis laissé en plan est ce qui se
 * perd le plus facilement — rien ne le rappelle à personne.
 */
const prochaineEtape_ = (etat) => {
  if (!etat.journal) {
    return {
      libelle: 'Commencer : moissonner le journal d\'audit',
      pourquoi: 'Le classeur est vide. Le journal est la source la moins coûteuse, '
        + 'et il donne à lui seul un rapport complet.',
      action: () => moissonnerDepuisMenu_(180)
    };
  }
  if (etat.revocationsEnAttente) {
    return {
      libelle: `Terminer : ${etat.revocationsEnAttente} révocation(s) préparée(s)`,
      pourquoi: 'Un plan de révocation attend d\'être appliqué. Relisez-le, puis '
        + 'appliquez-le — ou videz l\'onglet si vous avez changé d\'avis.',
      action: () => ouvrir_('revocations')
    };
  }
  if (etat.envoisEnAttente) {
    return {
      libelle: `Terminer : ${etat.envoisEnAttente} courriel(s) à envoyer`,
      pourquoi: 'Un plan de sollicitation attend. Relisez-le, envoyez-vous un '
        + 'exemple, puis envoyez pour de bon.',
      action: () => ouvrir_('sollicitations')
    };
  }
  if (!etat.profils) {
    return {
      libelle: 'Relever les profils des comptes',
      pourquoi: 'Sans l\'annuaire, on ignore quels autorisants sont administrateurs '
        + 'ou suspendus — et c\'est ce qui change la lecture du rapport. C\'est rapide.',
      action: rafraichirComptes
    };
  }
  if (!etat.jetons) {
    return {
      libelle: 'Relever les jetons actifs (c\'est long)',
      pourquoi: 'Le journal ne remonte qu\'à 180 jours. Seul l\'inventaire montre '
        + 'les accès accordés avant, que personne n\'a revus depuis. Une requête par '
        + 'compte, avec reprise automatique.',
      action: inventorierDepuisMenu_
    };
  }
  if (etat.nonClassees) {
    return {
      libelle: `Classer : ${etat.nonClassees} application(s) sans décision`,
      pourquoi: 'Tout est collecté. Ouvrez « À instruire », déjà trié par priorité, '
        + 'et inscrivez un statut dans l\'onglet Décisions — sans oublier l\'échéance '
        + '« Revoir avant ».',
      action: () => ouvrir_(etat.aInstruire ? 'aInstruire' : 'decisions')
    };
  }
  return {
    libelle: 'Tout est classé — relancer une collecte',
    pourquoi: 'Rien n\'attend. Un nouveau moissonnage fera apparaître ce qui a '
      + 'changé depuis, et les décisions arrivées à échéance reviendront d\'elles-mêmes '
      + 'dans la file de travail.',
    action: () => moissonnerDepuisMenu_(180)
  };
};

const ouvrir_ = (id) => {
  const classeur = classeurCourant_();
  const f = chercherOnglet_(classeur, id);
  if (f) classeur.setActiveSheet(f.showSheet());
  return f;
};

/**
 * L'entrée de tête. Elle annonce ce qu'elle va faire et pourquoi avant de le
 * faire : un menu qui décide à votre place sans le dire serait pire que le menu
 * qu'il remplace.
 */
function menuEtapeSuivante() {
  const ui = SpreadsheetApp.getUi();
  const etape = prochaineEtape_(etatDuTravail_(classeurCourant_()));
  if (ui.alert(etape.libelle, `${etape.pourquoi}\n\nContinuer ?`,
    ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  etape.action();
}

/** Les deux collectes dans un seul dialogue, pas deux qui s'effacent. */
function menuOuEnEstOn() {
  depuisMenu_('Collectes', () => {
    dire_('LE JOURNAL');
    direEtatMoisson_();
    dire_('');
    dire_('LES JETONS');
    direEtatInventaire_();
    vider_('Où en sont les collectes');
  });
}

function menuArreter() {
  depuisMenu_('Collectes', () => {
    direAnnulerMoisson_();
    direAnnulerInventaire_();
    vider_('Collectes arrêtées');
  });
}

// -------------------------------------------------------------------- actions

/**
 * Exécute une action du menu : sortie vers un dialogue plutôt que vers le
 * journal d'exécution, et erreur rendue lisible plutôt que rouge.
 */
const depuisMenu_ = (titre, action) => {
  CR_.destination = 'ui';
  try {
    action();
  } catch (e) {
    CR_.lignes = [];
    dire_(`${e.message || e}`);
    dire_('');
    dire_('Si le message parle de droits ou d\'autorisation : la lecture du journal');
    dire_('d\'audit demande un rôle d\'administrateur, et chaque action s\'exécute');
    dire_('sous votre propre identité. Un lecteur du rapport ne peut donc pas le');
    dire_('rafraîchir — c\'est voulu.');
    vider_(`${titre} — échec`);
  } finally {
    CR_.destination = 'console';
  }
};

function menuMoissonner180() { moissonnerDepuisMenu_(180); }
function menuMoissonner30() { moissonnerDepuisMenu_(30); }

/**
 * Le moissonnage écrit dans l'onglet brut du classeur. Une campagne déjà en
 * cours se poursuit ; sinon on repart de zéro, et le brut est vidé — deux
 * fenêtres empilées dans un même onglet produiraient un rapport faux sans le
 * dire.
 */
const moissonnerDepuisMenu_ = (jours) => {
  const ui = SpreadsheetApp.getUi();

  if (lireEtat_()) {
    ui.alert('Campagne en cours',
      'Une campagne est déjà en cours et va se poursuivre. Consultez « Où en sont '
      + 'les collectes ? », ou arrêtez-la avant d\'en lancer une autre.',
      ui.ButtonSet.OK);
    return;
  }
  const classeur = classeurCourant_();
  const brut = chercherOnglet_(classeur, 'brut');
  const remplacement = brut && brut.getLastRow() > 1;
  const question = remplacement
    ? `Le journal des ${jours} derniers jours va être relu, et le contenu actuel `
      + 'de ce classeur remplacé.\n\nContinuer ?'
    : `Le journal des ${jours} derniers jours va être lu et déposé dans ce `
      + 'classeur.\n\nContinuer ?';
  if (ui.alert('Moissonner le journal', question, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
    return;
  }
  if (brut) entetesBrut_(brut.showSheet().clear());

  depuisMenu_('Moissonnage', () => moissonner(jours));
};

function menuInventorier() { inventorierDepuisMenu_(); }

const inventorierDepuisMenu_ = () => {
  const ui = SpreadsheetApp.getUi();
  if (!lireEtatInventaire_()) {
    const question = 'Le relevé interroge l\'annuaire compte par compte : une '
      + 'requête par compte, reprise automatiquement jusqu\'au bout.\n\nLe relevé '
      + 'précédent sera remplacé — les mêler ferait passer pour actifs des jetons '
      + 'révoqués depuis.\n\nContinuer ?';
    if (ui.alert('Relever les jetons actifs', question,
      ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  }
  depuisMenu_('Inventaire', inventorierJetons);
};

function menuReagreger() { depuisMenu_('Rapport', reagreger); }
function menuRafraichirComptes() { depuisMenu_('Profils des comptes', rafraichirComptes); }

function menuPreparerSollicitations() { depuisMenu_('Plan d\'envoi', preparerSollicitations); }
function menuSollicitationExemple() { depuisMenu_('Exemple', envoyerSollicitationExemple); }
function menuEnvoyerSollicitations() { depuisMenu_('Envoi', envoyerSollicitations); }

function menuPreparerRevocations() { depuisMenu_('Plan de révocation', preparerRevocations); }
function menuAppliquerRevocations() { depuisMenu_('Révocations', appliquerRevocations); }

function menuFiche() { depuisMenu_('Fiche', fiche); }
function menuGuide() { depuisMenu_('Guide', guide); }
function menuAide() { depuisMenu_('Aide', aide); }
function menuUrlConsultation() { depuisMenu_('Vue de consultation', urlConsultation); }

function menuAfficherBrut() {
  const classeur = classeurCourant_();
  const f = chercherOnglet_(classeur, 'brut');
  if (!f) {
    SpreadsheetApp.getUi().alert('Onglet brut absent',
      `Ce classeur ne contient pas d'onglet ${ONGLET_BRUT_} : le journal n'a pas `
      + 'encore été moissonné.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  classeur.setActiveSheet(f.showSheet());
}

function menuMasquerBrut() {
  const f = chercherOnglet_(classeurCourant_(), 'brut');
  if (f) f.hideSheet();
}

function menuAPropos() {
  depuisMenu_('À propos', () => {
    dire_(`Audit des applications tierces et de l'IA fantôme — version ${VERSION_}`);
    dire_('');
    dire_('Un déploiement Apps Script sert une copie FIGÉE du code : si ce numéro');
    dire_('ne correspond pas à ce que vous venez de pousser, c\'est qu\'il faut');
    dire_('créer une nouvelle version du déploiement.');
    dire_('');
    dire_('Ce classeur est le livrable : son partage est le contrôle d\'accès.');
    dire_('L\'onglet brut est la pièce justificative — un événement du journal');
    dire_('d\'audit par ligne. Il est masqué par défaut, jamais supprimé.');
    dire_('');
    dire_('La colonne « État présumé » de l\'onglet Autorisants ne dit rien de');
    dire_('certain : le journal ne connaît que la fenêtre demandée. La valeur');
    dire_('« antérieur à la fenêtre » signale une application qui appelle les API');
    dire_('sans autorisation visible sur la période — donc accordée avant, et');
    dire_('jamais revue depuis.');
    dire_('');
    dire_('Le guide complet est dans l\'onglet « Guide » : menu > Guide complet.');
    dire_('');
    dire_('Développeur : Fabrice Faucheux (https://faucheux.bzh)');
    dire_('Licence Elastic 2.0.');
    vider_('À propos');
  });
}
