/**
 * Menu du classeur — v0.2.
 *
 * Le script étant lié au classeur, `onOpen` est un déclencheur simple : le menu
 * apparaît de lui-même, sans rien à installer.
 *
 * CE QUE CE CHOIX ÉVITE
 *
 * Un projet autonome aurait dû poser un déclencheur installable, lequel
 * s'exécute sous l'identité de celui qui l'a posé — l'administrateur — et non
 * sous celle de la personne qui ouvre le classeur. Toute personne à qui l'on
 * partage le rapport aurait alors pu, d'un clic, relire le journal d'audit avec
 * des droits d'administrateur. Pour un outil dont l'objet est précisément de
 * traquer les accès mal maîtrisés, ce serait une faute.
 *
 * Ici, chaque action s'exécute sous l'identité de qui la déclenche, avec ses
 * propres droits : un lecteur du rapport qui n'est pas administrateur se voit
 * refuser l'accès par Google lui-même, et non par une règle que nous aurions
 * écrite. La bonne défense est celle qu'on n'a pas eu à coder.
 */

/**
 * Le menu suit le déroulé du travail, non l'ordre où les fonctions ont été
 * écrites : collecter, puis suivre, puis solliciter. Les actions courantes —
 * la fiche, le guide — restent au premier niveau ; le reste est rangé, parce
 * qu'un menu de vingt entrées ne s'apprend pas, il se subit.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Applications tierces')
    .addItem('Fiche de l\'application sélectionnée', 'menuFiche')
    .addSeparator()
    .addSubMenu(ui.createMenu('1. Collecter')
      .addItem('Moissonner le journal — 180 jours', 'menuMoissonner180')
      .addItem('Moissonner le journal — 30 jours', 'menuMoissonner30')
      .addItem('Relever les profils des comptes', 'menuRafraichirComptes')
      .addItem('Inventorier les jetons actifs…', 'menuInventorier')
      .addSeparator()
      .addItem('Rejouer l\'agrégation', 'menuReagreger'))
    .addSubMenu(ui.createMenu('2. Suivre')
      .addItem('Où en est la campagne ?', 'menuEtat')
      .addItem('Où en est l\'inventaire ?', 'menuEtatInventaire')
      .addSeparator()
      .addItem('Annuler la campagne en cours', 'menuAnnuler')
      .addItem('Annuler l\'inventaire en cours', 'menuAnnulerInventaire'))
    .addSubMenu(ui.createMenu('3. Solliciter')
      .addItem('Préparer les sollicitations', 'menuPreparerSollicitations')
      .addItem('S\'envoyer un exemple de courriel', 'menuSollicitationExemple')
      .addItem('Envoyer les sollicitations…', 'menuEnvoyerSollicitations'))
    .addSubMenu(ui.createMenu('4. Révoquer')
      .addItem('Préparer les révocations', 'menuPreparerRevocations')
      .addItem('Appliquer les révocations…', 'menuAppliquerRevocations'))
    .addSubMenu(ui.createMenu('Onglets techniques')
      .addItem('Afficher l\'onglet brut', 'menuAfficherBrut')
      .addItem('Masquer l\'onglet brut', 'menuMasquerBrut'))
    .addSeparator()
    .addItem('Vue de consultation — obtenir le lien', 'menuUrlConsultation')
    .addSeparator()
    .addItem('Afficher le guide', 'menuGuide')
    .addItem('Aide — le déroulé en bref', 'menuAide')
    .addItem('À propos', 'menuAPropos')
    .addToUi();
}

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

// -------------------------------------------------------------------- actions

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
      'Une campagne est déjà en cours et va se poursuivre. Consultez « Où en est '
      + 'la campagne ? », ou annulez-la avant d\'en lancer une autre.',
      ui.ButtonSet.OK);
    return;
  }
  const classeur = classeurCourant_();
  const brut = classeur.getSheetByName(ONGLET_BRUT_);
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

function menuReagreger() { depuisMenu_('Agrégation', reagreger); }
function menuEtat() { depuisMenu_('Campagne', etatMoisson); }
function menuAnnuler() { depuisMenu_('Annulation', annulerMoisson); }

function menuRafraichirComptes() {
  depuisMenu_('Profils des comptes', rafraichirComptes);
}

function menuInventorier() {
  const ui = SpreadsheetApp.getUi();
  if (!lireEtatInventaire_()) {
    const question = 'Le relevé interroge l\'annuaire compte par compte : une '
      + 'requête par compte, reprise automatiquement jusqu\'au bout.\n\nLe relevé '
      + 'précédent sera remplacé — les mêler ferait passer pour actifs des jetons '
      + 'révoqués depuis.\n\nContinuer ?';
    if (ui.alert('Inventorier les jetons', question, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
      return;
    }
  }
  depuisMenu_('Inventaire', inventorierJetons);
}

function menuEtatInventaire() { depuisMenu_('Inventaire', etatInventaire); }
function menuAnnulerInventaire() { depuisMenu_('Inventaire', annulerInventaire); }

function menuPreparerSollicitations() {
  depuisMenu_('Plan de sollicitation', preparerSollicitations);
}

function menuSollicitationExemple() {
  depuisMenu_('Exemple', envoyerSollicitationExemple);
}

function menuEnvoyerSollicitations() {
  depuisMenu_('Envoi', envoyerSollicitations);
}

function menuPreparerRevocations() {
  depuisMenu_('Plan de révocation', preparerRevocations);
}

function menuAppliquerRevocations() {
  depuisMenu_('Révocations', appliquerRevocations);
}

function menuFiche() { depuisMenu_('Fiche', fiche); }
function menuGuide() { depuisMenu_('Guide', guide); }
function menuUrlConsultation() { depuisMenu_('Vue de consultation', urlConsultation); }
function menuAide() { depuisMenu_('Aide', aide); }

function menuAfficherBrut() {
  const classeur = classeurCourant_();
  const f = classeur.getSheetByName(ONGLET_BRUT_);
  if (!f) {
    SpreadsheetApp.getUi().alert('Onglet brut absent',
      `Ce classeur ne contient pas d'onglet ${ONGLET_BRUT_} : le journal n'a pas `
      + 'encore été moissonné.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  classeur.setActiveSheet(f.showSheet());
}

function menuMasquerBrut() {
  const f = classeurCourant_().getSheetByName(ONGLET_BRUT_);
  if (f) f.hideSheet();
}

function menuAPropos() {
  depuisMenu_('À propos', () => {
    dire_('Audit des applications tierces et de l\'IA fantôme');
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
    dire_('Le guide complet est dans l\'onglet « Guide » : menu > Afficher le guide.');
    dire_('');
    dire_('Développeur : Fabrice Faucheux (https://faucheux.bzh)');
    dire_('Licence Elastic 2.0.');
    vider_('À propos');
  });
}
