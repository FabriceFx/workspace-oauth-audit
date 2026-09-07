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

  // Le menu doit apparaître quoi qu'il arrive : un outil sans menu est un outil
  // perdu. La langue se lit dans l'onglet Paramètres, qui peut manquer — on
  // retombe alors sur le français plutôt que d'échouer sans rien afficher.
  let lg = LANGUE_DEFAUT_;
  try {
    lg = reglages_(SpreadsheetApp.getActive()).interface;
  } catch (e) {
    lg = LANGUE_DEFAUT_;
  }
  const T = (cle) => t_(cle, lg);

  const menu = ui.createMenu(T('menu.titre'));

  menu.addItem(`✨  ${T('menu.assistant')}`, 'menuOuvrirAssistant');
  menu.addSeparator();

  menu.addSubMenu(ui.createMenu(T('menu.collecter'))
    .addItem(T('menu.moissonner7'), 'menuMoissonner7')
    .addItem(T('menu.moissonner180'), 'menuMoissonner180')
    .addItem(T('menu.moissonner30'), 'menuMoissonner30')
    .addItem(T('menu.profils'), 'menuRafraichirComptes')
    .addItem(T('menu.jetons'), 'menuInventorier')
    .addSeparator()
    .addItem(T('menu.recalculer'), 'menuReagreger')
    .addSeparator()
    .addItem(T('menu.ouEnEst'), 'menuOuEnEstOn')
    .addItem(T('menu.arreter'), 'menuArreter'));

  menu.addSubMenu(ui.createMenu(T('menu.ecrire'))
    .addItem(T('menu.preparerEnvoi'), 'menuPreparerSollicitations')
    .addItem(T('menu.exemple'), 'menuSollicitationExemple')
    .addItem(T('menu.envoyer'), 'menuEnvoyerSollicitations'));

  menu.addSubMenu(ui.createMenu(T('menu.revoquer'))
    .addItem(T('menu.preparerRevocation'), 'menuPreparerRevocations')
    .addItem(T('menu.appliquer'), 'menuAppliquerRevocations'));

  menu.addSeparator();
  menu.addItem(T('menu.fiche'), 'menuFiche');
  menu.addItem(T('menu.vue'), 'menuUrlConsultation');
  menu.addSubMenu(ui.createMenu(T('menu.technique'))
    .addItem(T('menu.afficherBrut'), 'menuAfficherBrut')
    .addItem(T('menu.masquerBrut'), 'menuMasquerBrut')
    .addSeparator()
    .addItem(T('menu.resserrer'), 'menuResserrerBrut'));

  menu.addSeparator();
  menu.addItem(T('menu.guide'), 'menuGuide');
  menu.addItem(T('menu.aide'), 'menuAide');
  menu.addItem(T('menu.aPropos'), 'menuAPropos');
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
 *
 * UNE SEULE LECTURE PAR ONGLET. Ce diagnostic tourne à chaque ouverture du
 * classeur et à chaque rafraîchissement de l'assistant ; sur un parc de
 * plusieurs milliers de comptes, relire deux fois le même onglet se paie en
 * quota d'exécution pour rien.
 */
const etatDuTravail_ = (classeur) => {
  const remplie = (id) => {
    const f = classeur && chercherOnglet_(classeur, id);
    return Boolean(f) && f.getLastRow() > 1;
  };
  const lire = (id) => {
    const f = classeur && chercherOnglet_(classeur, id);
    if (!f || f.getLastRow() < 2) return { entetes: [], lignes: [] };
    const v = f.getDataRange().getValues();
    return { entetes: v[0], lignes: v.slice(1) };
  };
  // Les états sont des données, pas des libellés : on les reconnaît dans toutes
  // les langues où ils ont pu être écrits.
  const compter = (t, idColonne, valeurs) => {
    const i = colonne_(t.entetes, idColonne);
    if (i < 0) return 0;
    return t.lignes.filter((l) => valeurs.indexOf(String(l[i]).trim()) >= 0).length;
  };
  const cles = (t, idColonne) => {
    const i = colonne_(t.entetes, idColonne);
    if (i < 0) return new Set();
    return new Set(t.lignes
      .map((l) => String(l[i] || '').trim().toLowerCase()).filter(Boolean));
  };

  const decisions = lire('decisions');
  const revocations = lire('revocations');
  const sollicitations = lire('sollicitations');

  const iStatut = colonne_(decisions.entetes, 'statut');
  const iCid = colonne_(decisions.entetes, 'clientId');

  const nonClassees = iStatut < 0 ? 0
    : decisions.lignes.filter((l) => l[0] && !String(l[iStatut]).trim()).length;

  /*
   * Une décision « à bloquer » n'appelle un plan que tant qu'AUCUN plan ne la
   * couvre. Sans cette condition, l'assistant boucle : le statut ne change pas
   * tout seul quand le plan est appliqué, si bien qu'il reproposerait
   * indéfiniment de préparer un plan déjà préparé et déjà exécuté. Le plan
   * appliqué reste dans son onglet — c'est lui la trace, et c'est lui qui
   * ferme la boucle. Vider l'onglet des révocations rouvre donc la proposition,
   * ce qui est le comportement voulu : on redemande alors un plan à jour.
   */
  const planifies = cles(revocations, 'clientId');
  const aBloquer = (iStatut < 0 || iCid < 0) ? 0
    : decisions.lignes.filter((l) => estStatut_(l[iStatut], 'aBloquer')
      && !planifies.has(String(l[iCid] || '').trim().toLowerCase())).length;

  return {
    journal: remplie('brut'),
    profils: remplie('comptes'),
    jetons: remplie('jetons'),
    aInstruire: remplie('aInstruire'),
    nonClassees,
    aBloquer,
    envoisEnAttente: compter(sollicitations, 'etat', ETATS_A_ENVOYER_),
    revocationsEnAttente: compter(revocations, 'etat', ETATS_A_REVOQUER_)
  };
};

/**
 * La prochaine chose à faire, et pourquoi.
 *
 * L'ordre traduit une règle simple : on finit ce qu'on a commencé avant
 * d'entreprendre autre chose. Un plan préparé puis laissé en plan est ce qui se
 * perd le plus facilement — rien ne le rappelle à personne.
 *
 * `actionName` désigne une entrée de ACTIONS_ (Commun.gs), et non une fonction :
 * une fermeture ne traverse pas `google.script.run`. Le banc vérifie que chaque
 * nom rendu ici existe bien dans la table — un nom mal orthographié ferait
 * sinon un bouton qui ne fait rien, sans rien dire.
 */
const prochaineEtape_ = (etat, lg) => {
  const langue = lg || LANGUE_DEFAUT_;
  const T = (cle, valeurs) => t_(cle, langue, valeurs);

  if (!etat.journal) {
    return {
      libelle: T('etape.commencer'),
      pourquoi: T('etape.commencer.pourquoi'),
      actionName: 'demanderMoisson180'
    };
  }
  if (etat.revocationsEnAttente) {
    return {
      libelle: T('etape.revocations', { n: etat.revocationsEnAttente }),
      pourquoi: T('etape.revocations.pourquoi'),
      actionName: 'ouvrirRevocations'
    };
  }
  if (etat.envoisEnAttente) {
    return {
      libelle: T('etape.envois', { n: etat.envoisEnAttente }),
      pourquoi: T('etape.envois.pourquoi'),
      actionName: 'ouvrirSollicitations'
    };
  }
  if (etat.aBloquer) {
    return {
      libelle: T('etape.bloquer'),
      pourquoi: T('etape.bloquer.pourquoi',
        { n: etat.aBloquer, statut: nomStatut_('aBloquer', langue) }),
      actionName: 'preparerRevocations'
    };
  }
  if (!etat.profils) {
    return {
      libelle: T('etape.profils'),
      pourquoi: T('etape.profils.pourquoi'),
      actionName: 'menuRafraichirComptes'
    };
  }
  if (!etat.jetons) {
    return {
      libelle: T('etape.jetons'),
      pourquoi: T('etape.jetons.pourquoi'),
      actionName: 'demanderInventaire'
    };
  }
  if (etat.nonClassees) {
    return {
      libelle: T('etape.classer', { n: etat.nonClassees }),
      pourquoi: T('etape.classer.pourquoi'),
      actionName: etat.aInstruire ? 'ouvrirAInstruire' : 'ouvrirDecisions'
    };
  }
  return {
    libelle: T('etape.rien'),
    pourquoi: T('etape.rien.pourquoi'),
    actionName: 'demanderMoisson180'
  };
};

const ouvrir_ = (id) => {
  const classeur = classeurCourant_();
  const f = chercherOnglet_(classeur, id);
  if (f) classeur.setActiveSheet(f.showSheet());
  return f;
};

function menuOuvrirAssistant() { afficherAssistant(); }

/**
 * L'état courant, pour le script client du panneau latéral.
 *
 * Il porte AUSSI ses libellés : le panneau est une constante HTML, il ne peut
 * pas appeler le dictionnaire lui-même. Tout ce qui s'affiche vient donc du
 * serveur, dans la langue réglée — sans quoi la moitié du panneau resterait en
 * français sur un classeur anglais.
 */
function etatPourAssistant_ui() {
  const classeur = SpreadsheetApp.getActive();
  if (!classeur) return null;
  const lg = langueInterface_();
  const etat = etatDuTravail_(classeur);
  const etape = prochaineEtape_(etat, lg);
  return {
    etape: {
      titre: etape.libelle,
      pourquoi: etape.pourquoi,
      actionName: etape.actionName
    },
    stats: {
      journal: etat.journal,
      profils: etat.profils,
      jetons: etat.jetons,
      nonClassees: etat.nonClassees,
      envoisEnAttente: etat.envoisEnAttente,
      revocationsEnAttente: etat.revocationsEnAttente,
      aBloquer: etat.aBloquer
    },
    textes: {
      continuer: t_('assistant.continuer', lg),
      aJour: t_('assistant.aJour', lg),
      aClasser: t_('assistant.aClasser', lg, { n: etat.nonClassees }),
      toutClasse: t_('assistant.toutClasse', lg),
      aInstruire: t_('assistant.aInstruire', lg)
    }
  };
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

function menuMoissonner7() { moissonnerDepuisMenu_(7); }
function menuMoissonner180() { moissonnerDepuisMenu_(180); }
function menuMoissonner30() { moissonnerDepuisMenu_(30); }

/**
 * Demande confirmation avant de moissonner. Le vidage de l'onglet brut n'est
 * PAS fait ici : il appartient à moissonner(), qui seul sait distinguer une
 * campagne neuve d'une reprise. Le poser ici l'aurait rendu dépendant du chemin
 * emprunté — et l'assistant, qui ne passe pas par le menu, l'aurait sauté.
 */
const moissonnerDepuisMenu_ = (jours) => {
  const ui = SpreadsheetApp.getUi();
  const lg = langueInterface_();
  if (lireEtat_()) {
    ui.alert(t_('confirm.campagne.titre', lg), t_('confirm.campagne.corps', lg),
      ui.ButtonSet.OK);
    return;
  }
  const brut = chercherOnglet_(classeurCourant_(), 'brut');
  const remplacement = brut && brut.getLastRow() > 1;
  const question = t_(remplacement ? 'confirm.moisson.remplace' : 'confirm.moisson.neuf',
    lg, { n: jours });
  // Le nom se construit, il ne se choisit pas : ajouter une fenêtre ne doit pas
  // obliger à retoucher un ternaire. confirmer_ refuse un nom absent de la table.
  confirmer_(t_('confirm.moisson.titre', lg), question, `menuMoissonner${jours}`);
};

function menuInventorier() { inventorierDepuisMenu_(); }

const inventorierDepuisMenu_ = () => {
  // Un relevé déjà entamé se poursuit sans rien demander : c'est une reprise,
  // elle n'écrase rien.
  if (lireEtatInventaire_()) {
    depuisMenu_('Inventaire', inventorierJetons);
    return;
  }
  const lg = langueInterface_();
  confirmer_(t_('confirm.inventaire.titre', lg),
    t_('confirm.inventaire.corps', lg), 'menuInventorier');
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
      `Ce classeur ne contient pas d'onglet ${nomOnglet_('brut', langueInterface_())} : `
      + 'le journal n\'a pas '
      + 'encore été moissonné.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  classeur.setActiveSheet(f.showSheet());
}

function menuResserrerBrut() { resserrerDepuisMenu_(); }

/**
 * Le resserrage supprime des lignes du classeur pour de bon. Il annonce donc
 * combien, et à partir de quand, avant de rien faire — et une opération déjà
 * entamée se poursuit sans redemander.
 */
const resserrerDepuisMenu_ = () => {
  if (lireEtatResserrage_()) {
    depuisMenu_('Resserrage', () => resserrerBrut());
    return;
  }
  const brut = chercherOnglet_(classeurCourant_(), 'brut');
  if (!brut || brut.getLastRow() < 2) {
    depuisMenu_('Resserrage', () => resserrerBrut());
    return;
  }
  const lg = langueInterface_();
  confirmer_(t_('confirm.resserrer.titre', lg),
    t_('confirm.resserrer.corps', lg,
      { lignes: brut.getLastRow() - 1, seuil: dateLisibleLangue_(jour_(ilYaJours_(30)), lg) }),
    'menuResserrerBrut30');
};

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
