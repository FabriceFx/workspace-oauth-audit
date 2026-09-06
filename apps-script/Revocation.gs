/**
 * Révocation des jetons — v1.1.
 *
 * C'est la seule partie de l'outil qui détruit quelque chose. Elle est donc
 * bâtie autour de trois refus.
 *
 * ON NE RÉVOQUE QUE CE QU'ON A JUGÉ
 *
 * Le plan ne se construit pas à partir d'un filtre ni d'un score : il se
 * construit à partir du référentiel de décisions, et n'y retient que les
 * applications portant le statut « à bloquer », décision en vigueur. Une
 * application non classée, ou dont l'échéance est passée, ne produit aucune
 * ligne. L'ordre est délibéré : la décision précède l'acte, et elle porte le nom
 * de qui l'a prise.
 *
 * ON REJOUE LA RÉSOLUTION AVANT D'AGIR
 *
 * Entre le plan et son application, le monde a pu changer — une décision
 * révisée, une échéance franchie, un jeton déjà retiré par son propriétaire.
 * Chaque ligne est donc revérifiée au moment de l'exécution, et une ligne dont
 * la décision ne tient plus est laissée en l'état plutôt qu'exécutée sur une
 * base périmée.
 *
 * RÉVOQUER N'EST PAS BLOQUER
 *
 * `Tokens.remove` supprime l'accès en cours ; l'utilisateur peut réautoriser
 * l'application dans la minute. La révocation seule est un pansement : elle ne
 * vaut que doublée du blocage dans la console d'administration, sous
 * Sécurité > Contrôles des API, qu'aucune API ne pilote. Le plan le rappelle, le
 * compte rendu le rappelle, et ce commentaire aussi — parce que c'est
 * l'illusion la plus coûteuse que cet outil pourrait entretenir.
 *
 * CECI LÈVE LA GARANTIE DES VERSIONS PRÉCÉDENTES
 *
 * Jusqu'en v1.0, le projet promettait qu'aucun appel de suppression de jeton n'y
 * figurait, et cela se vérifiait d'un `grep`. Cette version-ci en introduit un,
 * ici et nulle part ailleurs. La garantie change de forme : elle n'est plus
 * l'absence de l'appel, mais son encadrement — décision préalable, plan relu,
 * confirmation chiffrée, plafond, et trace ligne à ligne.
 */

const ONGLET_REVOCATIONS_ = 'Révocations';

const COLONNES_REVOCATIONS_ = [
  'Compte', 'Domaine', 'Profil', 'Application', 'client_id', 'Portées',
  'Décidé par', 'Motif de la décision', 'État', 'Préparé le', 'Appliqué le',
  'Résultat'
];

/** Statut du référentiel qui, seul, autorise une révocation. */
const STATUT_REVOCABLE_ = 'à bloquer';

/** Cran d'arrêt : au-delà, le plan doit être réduit avant d'être appliqué. */
const PLAFOND_REVOCATION_ = 200;

// -------------------------------------------------------------------- le plan

function preparerRevocations() {
  const classeur = classeurCourant_();
  const jetons = lireJetons_(classeur);
  if (!jetons) {
    dire_('Aucun inventaire de jetons : on ne sait pas ce qui existe encore, donc');
    dire_('rien à révoquer. Lancez « Inventorier les jetons actifs » d\'abord.');
    dire_('');
    dire_('Un plan bâti sur le seul journal viserait des accès peut-être déjà');
    dire_('fermés, et manquerait ceux accordés avant la fenêtre.');
    vider_('Rien à préparer');
    return;
  }

  const decisions = lireDecisions_(classeur);
  const profils = lireComptes_(classeur);
  const aujourdhui = jour_(new Date());

  const lignes = [];
  let ecartesSansDecision = 0;
  let ecartesPerimees = 0;

  for (const j of jetons.values()) {
    const d = decisions.get(j.cid);
    if (!d || !d.statut) { ecartesSansDecision++; continue; }
    if (d.statut !== STATUT_REVOCABLE_) continue;
    if (!d.enVigueur) { ecartesPerimees++; continue; }
    lignes.push([
      j.compte, domaine_(j.compte), libelleProfil_(profils.get(j.compte)),
      j.nom || j.cid, j.cid, j.portees.join(' '),
      d.par, d.motif, 'à révoquer', aujourdhui, '', ''
    ]);
  }
  lignes.sort((x, y) => (x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : (x[0] < y[0] ? -1 : 1)));

  const f = onglet_(classeur, ONGLET_REVOCATIONS_, COLONNES_REVOCATIONS_);
  poser_(f, lignes, true);
  classeur.setActiveSheet(f);

  const apps = new Set(lignes.map((l) => l[4]));
  dire_(`Plan préparé : ${lignes.length} jeton(s) à révoquer, `
    + `sur ${apps.size} application(s) jugée(s) « ${STATUT_REVOCABLE_} ».`);
  dire_('');
  if (!lignes.length) {
    dire_(`Aucune application ne porte le statut « ${STATUT_REVOCABLE_} » avec une`);
    dire_('décision en vigueur. C\'est le référentiel qui commande : classez');
    dire_('d\'abord dans l\'onglet Décisions, le plan suivra.');
  }
  if (ecartesPerimees) {
    dire_(`${ecartesPerimees} jeton(s) écartés : décision « ${STATUT_REVOCABLE_} » périmée.`);
    dire_('Une décision dont l\'échéance est passée ne commande plus rien —');
    dire_('reconduisez-la si elle tient toujours.');
    dire_('');
  }
  dire_(`${ecartesSansDecision} jeton(s) portent sur des applications non classées :`);
  dire_('ils ne sont pas candidats. On ne révoque que ce qu\'on a jugé.');
  dire_('');
  dire_('RIEN N\'EST RÉVOQUÉ. Relisez le plan, supprimez les lignes qui n\'ont pas');
  dire_('lieu d\'être, puis « Appliquer les révocations ».');
  dire_('');
  dire_('Et rappelez-vous : révoquer n\'est pas bloquer. L\'utilisateur peut');
  dire_('réautoriser l\'application dans la minute. La révocation ne vaut que');
  dire_('doublée du blocage en console — Sécurité > Contrôles des API.');
  vider_('Plan de révocation');
}

// -------------------------------------------------------------- l'application

function appliquerRevocations() {
  const classeur = classeurCourant_();
  const f = classeur.getSheetByName(ONGLET_REVOCATIONS_);
  if (!f || f.getLastRow() < 2) {
    dire_('Aucun plan à appliquer. Préparez-le d\'abord.');
    vider_('Rien à appliquer');
    return;
  }
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCompte = e.indexOf('Compte');
  const iCid = e.indexOf('client_id');
  const iNom = e.indexOf('Application');
  const iEtat = e.indexOf('État');
  const iApplique = e.indexOf('Appliqué le');
  const iResultat = e.indexOf('Résultat');

  const cibles = [];
  const iPrepare = e.indexOf('Préparé le');
  valeurs.slice(1).forEach((l, i) => {
    if (String(l[iEtat]).trim() !== 'à révoquer') return;
    const compte = String(l[iCompte]).trim();
    const cid = String(l[iCid]).trim();
    if (compte.indexOf('@') < 0 || !cid) return;
    cibles.push({
      ligne: i + 2,
      compte,
      cid,
      nom: String(l[iNom]),
      prepareLe: l[iPrepare] || ''
    });
  });

  if (!cibles.length) {
    dire_('Aucune ligne à l\'état « à révoquer ».');
    vider_('Rien à appliquer');
    return;
  }
  if (cibles.length > PLAFOND_REVOCATION_) {
    dire_(`${cibles.length} jetons visés : au-delà du plafond de ${PLAFOND_REVOCATION_}`);
    dire_('fixé dans le code. Ce n\'est pas une limite technique, c\'est un cran');
    dire_('d\'arrêt : une révocation de cette ampleur se conduit par vagues.');
    vider_('Application refusée');
    return;
  }

  // On rejoue la résolution : une décision révisée ou périmée depuis la
  // préparation ne doit pas s'exécuter sur une base morte.
  const decisions = lireDecisions_(classeur);
  const perimes = cibles.filter((c) => {
    const d = decisions.get(c.cid);
    return !d || d.statut !== STATUT_REVOCABLE_ || !d.enVigueur;
  });
  const retenus = cibles.filter((c) => perimes.indexOf(c) < 0);

  const ui = SpreadsheetApp.getUi();
  const moi = Session.getEffectiveUser().getEmail();
  const surMoi = retenus.filter((c) => c.compte === moi);

  if (!retenus.length) {
    dire_(`Les ${perimes.length} ligne(s) du plan ne sont plus commandées par une`);
    dire_(`décision « ${STATUT_REVOCABLE_} » en vigueur : le référentiel a changé`);
    dire_('depuis la préparation. Rien n\'est appliqué — repréparez le plan.');
    vider_('Plan périmé');
    return;
  }

  const apps = new Set(retenus.map((c) => c.cid));
  const question = `${retenus.length} jeton(s) vont être révoqués, sur `
    + `${apps.size} application(s).\n\n`
    + (perimes.length ? `${perimes.length} ligne(s) sont ignorées : leur décision `
      + 'a changé depuis la préparation.\n\n' : '')
    + 'Cette suppression est immédiate et ne s\'annule pas.\n\n'
    + 'Rappel : révoquer n\'est pas bloquer. L\'utilisateur pourra réautoriser '
    + 'l\'application tant qu\'elle ne sera pas bloquée en console.\n\nAppliquer ?';
  if (ui.alert('Appliquer les révocations', question, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
    dire_('Application annulée. Rien n\'a été révoqué.');
    vider_('Annulé');
    return;
  }

  // Se retirer à soi-même le jeton de l'outil, c'est s'enfermer dehors.
  if (surMoi.length) {
    const second = ui.alert('Un de ces jetons est le vôtre',
      `${surMoi.length} ligne(s) portent sur votre propre compte (${moi}).\n\n`
      + 'Si l\'une d\'elles concerne l\'application qui fait tourner cet outil, '
      + 'vous perdrez l\'accès et devrez réautoriser depuis l\'éditeur.\n\n'
      + 'Continuer quand même ?', ui.ButtonSet.OK_CANCEL);
    if (second !== ui.Button.OK) {
      dire_('Application annulée. Rien n\'a été révoqué.');
      vider_('Annulé');
      return;
    }
  }

  const aujourdhui = jour_(new Date());
  const t0 = Date.now();
  let faits = 0;
  let absents = 0;
  let erreurs = 0;

  for (const c of retenus) {
    if (Date.now() - t0 > BUDGET_MS) break;
    let etat = 'révoqué';
    let resultat = '';
    try {
      AdminDirectory.Tokens.remove(c.compte, c.cid);
      faits++;
    } catch (err) {
      const message = String(err.message || err);
      const introuvable = message.indexOf('Not Found') >= 0 || message.indexOf('404') >= 0;
      etat = introuvable ? 'déjà absent' : 'échec';
      resultat = introuvable
        ? 'Le jeton n\'existait plus au moment de l\'application.' : message;
      if (introuvable) absents++; else erreurs++;
    }
    // Écrit en bloc les 4 colonnes d'état (État, Préparé le, Appliqué le, Résultat)
    // tout de suite : une interruption ne doit pas laisser croire qu'un jeton vit
    // encore alors qu'il a été supprimé.
    f.getRange(c.ligne, iEtat + 1, 1, 4).setValues([[etat, c.prepareLe, aujourdhui, resultat]]);
    SpreadsheetApp.flush();
  }

  for (const c of perimes) {
    f.getRange(c.ligne, iEtat + 1, 1, 4).setValues([[
      'ignoré', c.prepareLe, '', 'La décision a changé depuis la préparation du plan.'
    ]]);
  }

  dire_(`${faits} jeton(s) révoqué(s).`);
  if (absents) dire_(`${absents} avaient déjà disparu — retirés entre-temps par leur propriétaire.`);
  if (erreurs) dire_(`${erreurs} échec(s), motif inscrit dans la colonne Résultat.`);
  if (perimes.length) dire_(`${perimes.length} ligne(s) ignorée(s) : décision changée.`);
  const reste = retenus.length - faits - absents - erreurs;
  if (reste > 0) {
    dire_(`${reste} ligne(s) restent à traiter — budget de temps atteint.`);
    dire_('Relancez : les lignes déjà traitées ne le seront pas deux fois.');
  }
  dire_('');
  dire_('CE N\'EST PAS FINI.');
  dire_('');
  dire_('Ces accès sont fermés aujourd\'hui, pas interdits demain : rien n\'empêche');
  dire_('les mêmes utilisateurs de réautoriser les mêmes applications. Allez les');
  dire_('bloquer dans la console d\'administration — Sécurité > Contrôles des API >');
  dire_('Gérer l\'accès des applications tierces — puis passez leur statut à');
  dire_('« bloquée » dans l\'onglet Décisions.');
  dire_('');
  dire_('Relancez ensuite l\'inventaire pour vérifier ce qui reste ouvert.');
  vider_('Révocations appliquées');
}
