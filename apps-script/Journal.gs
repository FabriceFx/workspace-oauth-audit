/**
 * Moissonnage du journal OAuth — introduit en v0.2.
 *
 * Lit l'application « token » de la Reports API et écrit un événement par ligne
 * dans l'onglet brut du classeur, puis agrège (voir Feuille.gs).
 *
 * La lecture reprend là où elle s'est arrêtée : si le budget de temps est
 * atteint, l'état — jeton de page et compteurs — est mis de côté et un
 * déclencheur relance la fonction une minute plus tard. Le nombre de reprises
 * dépend du volume du journal ; le résultat, non.
 *
 *   moissonner(180)   démarre une campagne sur les 180 derniers jours
 *   moissonner()      reprend la campagne en cours, ou en démarre une de 180 jours
 *   etatMoisson()     où en est-on
 *   annulerMoisson()  abandonne la campagne
 *
 * Une seule campagne à la fois : relancer moissonner(30) alors qu'une campagne
 * de 180 jours est en cours la poursuit sans changer sa fenêtre. Il faut
 * l'annuler d'abord — sans quoi on mélangerait deux périodes dans un même
 * classeur, et le rapport mentirait sans le dire.
 */

const CLE_ETAT_ = 'moisson';
const FONCTION_REPRISE_ = 'reprendreMoisson';

// --------------------------------------------------------------------- état

const lireEtat_ = () => {
  const brut = PropertiesService.getScriptProperties().getProperty(CLE_ETAT_);
  return brut ? JSON.parse(brut) : null;
};

const ecrireEtat_ = (etat) =>
  PropertiesService.getScriptProperties().setProperty(CLE_ETAT_, JSON.stringify(etat));

const effacerEtat_ = () =>
  PropertiesService.getScriptProperties().deleteProperty(CLE_ETAT_);

const retirerDeclencheurs_ = () => {
  ScriptApp.getProjectTriggers()
    .filter((d) => d.getHandlerFunction() === FONCTION_REPRISE_)
    .forEach((d) => ScriptApp.deleteTrigger(d));
};

const programmerReprise_ = () => {
  retirerDeclencheurs_();
  ScriptApp.newTrigger(FONCTION_REPRISE_).timeBased().after(60 * 1000).create();
};

const etatNeuf_ = (jours) => ({
  jours,
  debut: ilYaJours_(jours),
  lancee: new Date().toISOString(),
  pageToken: null,
  pages: 0,
  evenements: 0,
  lignes: 0,
  reprises: 0
});

// ------------------------------------------------------------------ lecture

/** Un événement du journal devient une ou plusieurs lignes du brut. */
const lignesDe_ = (item) => {
  const horo = (item.id && item.id.time) || '';
  const compte = (item.actor && item.actor.email) || '(inconnu)';
  return (item.events || []).map((ev) => {
    const p = parametres_(ev);
    return [
      horo,
      compte,
      domaine_(compte),
      ev.name || '',
      p.app_name || '',
      p.client_id || '',
      p.client_type || '',
      portees_(p).join(' '),
      p.rejection_type || '',
      p.requester_email || '',
      p.api_name || '',
      p.method_name || '',
      typeof p.num_response_bytes === 'number' ? p.num_response_bytes : '',
      p.product_bucket || ''
    ];
  });
};

const lirePage_ = (etat) => AdminReports.Activities.list('all', 'token', {
  startTime: etat.debut,
  maxResults: 1000,
  pageToken: etat.pageToken
});

// --------------------------------------------------------------- moissonnage

function moissonner(jours) {
  const t0 = Date.now();
  let etat = lireEtat_();

  if (etat && jours && jours !== etat.jours) {
    dire_(`Une campagne sur ${etat.jours} jours est déjà en cours ; elle se`);
    dire_(`poursuit. Pour repartir sur ${jours} jours : annulerMoisson() d'abord.`);
  }
  if (etat) {
    etat.reprises++;
    dire_(`Reprise n°${etat.reprises} — ${etat.evenements} événements déjà lus`);
  } else {
    const fenetre = jours || 180;
    if (fenetre > 180) throw new Error('La Reports API ne remonte pas au-delà de 180 jours.');
    etat = etatNeuf_(fenetre);
    dire_(`Nouvelle campagne — ${fenetre} derniers jours, `
      + `depuis ${jour_(etat.debut)}`);
  }

  const classeur = classeurCourant_();
  const brut = brutCourant_(classeur);
  let fini = false;

  try {
    do {
      const rep = lirePage_(etat);
      const items = rep.items || [];
      const lignes = items.flatMap(lignesDe_);
      if (lignes.length) {
        brut.getRange(brut.getLastRow() + 1, 1, lignes.length, COLONNES_BRUT_.length)
          .setValues(lignes);
        etat.lignes += lignes.length;
      }
      etat.evenements += items.length;
      etat.pages++;
      etat.pageToken = rep.nextPageToken || null;
      if (!etat.pageToken) { fini = true; break; }
    } while (Date.now() - t0 < BUDGET_MS);
  } catch (e) {
    ecrireEtat_(etat);
    programmerReprise_();
    dire_(`Interruption sur erreur : ${e}`);
    dire_('L\'état est conservé, une reprise est programmée dans une minute.');
    dire_('Pour abandonner : annulerMoisson().');
    vider_('Moissonnage interrompu');
    throw e;
  }

  if (!fini) {
    ecrireEtat_(etat);
    programmerReprise_();
    dire_(`Budget de temps atteint — ${etat.evenements} événements, ${etat.pages} pages.`);
    dire_('Reprise programmée dans une minute.');
    vider_('Moissonnage en cours');
    return;
  }

  retirerDeclencheurs_();
  dire_(`Moissonnage terminé — ${etat.evenements} événements, ${etat.lignes} lignes, `
    + `${etat.pages} pages, ${etat.reprises + 1} exécution(s).`);

  if (!etat.lignes) {
    // Sans cette porte, l'agrégation échouait sur un brut vide et son message
    // parlait d'un onglet introuvable — ce qui n'était pas le problème.
    dire_('');
    dire_('Le journal n\'a rendu aucun événement sur la fenêtre demandée : il n\'y');
    dire_('a donc rien à agréger.');
    dire_('');
    dire_('Trois causes possibles, par ordre de vraisemblance :');
    dire_('  — la fenêtre est trop courte : réessayer avec moissonner(180) ;');
    dire_('  — le compte qui exécute n\'a pas le rôle d\'administrateur donnant');
    dire_('    accès aux rapports d\'audit ;');
    dire_('  — ce tenant ne journalise pas les événements OAuth.');
    dire_('');
    dire_('La sonde tranche entre les trois : lancer sonde(180).');
    vider_('Journal vide');
    effacerEtat_();
    return;
  }
  vider_('Moissonnage terminé');

  agreger_(classeur, etat);
  effacerEtat_();
}

function reprendreMoisson() {
  moissonner();
}

/**
 * Ces deux-là ne vident pas le compte rendu : c'est l'appelant qui décide.
 * `vider_` ouvre un dialogue, et deux dialogues enchaînés dans une même
 * exécution n'en montrent qu'un — le second efface le premier sans prévenir.
 */
const direEtatMoisson_ = () => {
  const etat = lireEtat_();
  if (!etat) {
    dire_('Aucune campagne en cours.');
  } else {
    dire_(`Campagne lancée le ${etat.lancee.slice(0, 19).replace('T', ' ')}`);
    dire_(`  fenêtre     ${etat.jours} jours, depuis ${jour_(etat.debut)}`);
    dire_(`  avancement  ${etat.evenements} événements, ${etat.lignes} lignes, `
      + `${etat.pages} pages, ${etat.reprises} reprise(s)`);
    dire_(`  reste       ${etat.pageToken ? 'oui' : 'non — agrégation en attente'}`);
  }
};

function etatMoisson() {
  direEtatMoisson_();
  vider_('Où en est la campagne');
}

const direAnnulerMoisson_ = () => {
  const etat = lireEtat_();
  retirerDeclencheurs_();
  effacerEtat_();
  dire_(etat
    ? 'Campagne abandonnée. Le contenu déjà moissonné reste dans l\'onglet brut.'
    : 'Aucune campagne en cours ; déclencheurs retirés par précaution.');
};

function annulerMoisson() {
  direAnnulerMoisson_();
  vider_('Campagne annulée');
}
