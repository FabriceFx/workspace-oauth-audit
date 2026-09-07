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
  reprises: 0,
  // Empreinte de l'avancement à la fin de l'exécution précédente : c'est elle
  // qui distingue une reprise qui progresse d'une reprise qui tourne à vide.
  empreinte: '',
  sansProgres: 0
});

/** Ce qui doit bouger d'une exécution à l'autre. Sinon, on est bloqué. */
const empreinteMoisson_ = (etat) => `${etat.pages}:${etat.evenements}:${etat.lignes}`;

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
  const campagneNeuve = !etat;

  if (etat && jours && jours !== etat.jours) {
    dire_(`Une campagne sur ${etat.jours} jours est déjà en cours ; elle se`);
    dire_(`poursuit. Pour repartir sur ${jours} jours : annulerMoisson() d'abord.`);
  }
  if (etat) {
    etat.reprises++;
    dire_(`Reprise n°${etat.reprises} — ${etat.evenements} événements déjà lus`);

    const empreinte = empreinteMoisson_(etat);
    etat.sansProgres = empreinte === etat.empreinte ? (etat.sansProgres || 0) + 1 : 0;
    etat.empreinte = empreinte;
    if (etat.sansProgres >= REPRISES_SANS_PROGRES_MAX_) {
      retirerDeclencheurs_();
      effacerEtat_();
      dire_('');
      dire_(`ABANDON — ${etat.sansProgres} reprises consécutives n'ont lu aucune`);
      dire_('page. L\'erreur ne passera pas toute seule : la campagne est arrêtée');
      dire_('et son déclencheur retiré, plutôt que de réessayer chaque minute.');
      dire_('');
      dire_('Causes, par ordre de vraisemblance :');
      dire_('  — le rôle d\'administrateur ou le consentement a changé depuis le');
      dire_('    lancement : relancer à la main dira lequel, l\'erreur sera lisible ;');
      dire_('  — le quota de l\'API des rapports est épuisé pour la journée ;');
      dire_('  — le classeur a atteint le plafond de 10 millions de cellules, et');
      dire_('    l\'onglet brut ne peut plus être écrit. Le voir : dernière ligne de');
      dire_('    l\'onglet brut × 14 colonnes.');
      dire_('');
      dire_(`Les ${etat.lignes} lignes déjà écrites sont intactes. L'agrégation de ce`);
      dire_('qui a été collecté reste possible : « Recalculer le rapport ».');
      vider_('Moissonnage abandonné');
      return;
    }
  } else {
    const fenetre = jours || 180;
    if (fenetre > 180) throw new Error('La Reports API ne remonte pas au-delà de 180 jours.');
    etat = etatNeuf_(fenetre);
    dire_(`Nouvelle campagne — ${fenetre} derniers jours, `
      + `depuis ${jour_(etat.debut)}`);
  }

  const classeur = classeurCourant_();
  const langue = reglages_(classeur).interface;
  const brut = brutCourant_(classeur, langue);

  // Le brut se vide ICI, et nulle part ailleurs : l'écriture se fait en ajout à
  // partir de getLastRow(), donc une campagne neuve qui n'aurait pas vidé
  // empilerait sa fenêtre sur la précédente. Le rapport resterait plausible et
  // serait faux — volumes doublés, première apparition avancée. Une reprise, à
  // l'inverse, ne doit surtout PAS vider : elle continue la même campagne.
  if (campagneNeuve) entetesBrut_(brut.clear(), langue);

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

// ------------------------------------------------------ resserrage du brut

/*
 * RÉDUIRE LE JOURNAL DÉJÀ COLLECTÉ, SANS LE REDEMANDER À GOOGLE.
 *
 * L'agrégation ne se reprend pas : elle accumule en mémoire une entrée par
 * application, par couple et par portée, et ces tables ne se sérialisent pas
 * entre deux exécutions pour un coût raisonnable. Quand le brut est trop gros,
 * elle ne passera donc jamais — relancer repart de la première ligne.
 *
 * Le resserrage, lui, ne garde aucun accumulateur : il lit un bloc, jette les
 * lignes hors fenêtre, écrit le reste, avance son curseur. Chaque bloc est
 * indépendant, donc l'opération se reprend là où elle s'est arrêtée, et une
 * interruption fait au pire recommencer un bloc.
 *
 * Elle écrit dans un onglet de travail et ne remplace l'original qu'à la toute
 * fin : une interruption laisse le brut intact, jamais à moitié tronqué.
 */

const CLE_RESSERRAGE_ = 'resserrage';
const FONCTION_REPRISE_RESSERRAGE_ = 'reprendreResserrage';
const TAILLE_LOT_RESSERRAGE_ = 5000;

const lireEtatResserrage_ = () => {
  const brut = PropertiesService.getScriptProperties().getProperty(CLE_RESSERRAGE_);
  return brut ? JSON.parse(brut) : null;
};

const ecrireEtatResserrage_ = (etat) => PropertiesService.getScriptProperties()
  .setProperty(CLE_RESSERRAGE_, JSON.stringify(etat));

const effacerEtatResserrage_ = () =>
  PropertiesService.getScriptProperties().deleteProperty(CLE_RESSERRAGE_);

const retirerDeclencheursResserrage_ = () => {
  ScriptApp.getProjectTriggers()
    .filter((d) => d.getHandlerFunction() === FONCTION_REPRISE_RESSERRAGE_)
    .forEach((d) => ScriptApp.deleteTrigger(d));
};

const programmerRepriseResserrage_ = () => {
  retirerDeclencheursResserrage_();
  ScriptApp.newTrigger(FONCTION_REPRISE_RESSERRAGE_).timeBased().after(60 * 1000).create();
};

const empreinteResserrage_ = (etat) => `${etat.ligneSource}:${etat.gardees}`;

function resserrerBrut(jours) {
  const t0 = Date.now();
  const classeur = classeurCourant_();
  const langue = reglages_(classeur).interface;
  let etat = lireEtatResserrage_();

  if (lireEtat_()) {
    dire_('Une campagne de moissonnage est en cours : elle écrit dans le brut,');
    dire_('et le resserrer maintenant perdrait des lignes. Attendez la fin, ou');
    dire_('annulerMoisson() d\'abord.');
    vider_('Resserrage impossible');
    return;
  }

  const source = chercherOnglet_(classeur, 'brut');
  if (!source || source.getLastRow() < 2) {
    dire_('L\'onglet brut est absent ou vide : il n\'y a rien à resserrer.');
    vider_('Rien à resserrer');
    return;
  }

  if (etat) {
    etat.reprises++;
    const empreinte = empreinteResserrage_(etat);
    etat.sansProgres = empreinte === etat.empreinte ? (etat.sansProgres || 0) + 1 : 0;
    etat.empreinte = empreinte;
    if (etat.sansProgres >= REPRISES_SANS_PROGRES_MAX_) {
      retirerDeclencheursResserrage_();
      effacerEtatResserrage_();
      dire_(`ABANDON — ${etat.sansProgres} reprises sans progrès.`);
      dire_('');
      dire_('L\'onglet brut d\'origine est INTACT : le resserrage écrit à côté et');
      dire_('ne remplace qu\'à la fin. Rien n\'est perdu.');
      dire_('');
      dire_('Si le classeur a atteint le plafond de 10 millions de cellules, il n\'y');
      dire_('a plus de place pour l\'onglet de travail : supprimez d\'abord les');
      dire_('onglets de rapport — ils se reconstruisent — puis recommencez.');
      vider_('Resserrage abandonné');
      return;
    }
    dire_(`Reprise n°${etat.reprises} — ${etat.lues} lignes examinées, ${etat.gardees} gardées`);
  } else {
    const fenetre = jours || 30;
    // L'onglet de travail d'une tentative précédente ne se recycle pas : on ne
    // saurait pas d'où il vient ni où il s'était arrêté.
    const ancien = chercherOnglet_(classeur, 'brutTemp');
    if (ancien) classeur.deleteSheet(ancien);
    const temp = classeur.insertSheet(nomOnglet_('brutTemp', langue));
    entetesBrut_(temp, langue);
    temp.hideSheet();
    etat = {
      jours: fenetre, seuil: jour_(ilYaJours_(fenetre)),
      ligneSource: 2, lues: 0, gardees: 0, reprises: 0,
      empreinte: '', sansProgres: 0
    };
    dire_(`Resserrage sur ${fenetre} jours — les lignes antérieures au `
      + `${etat.seuil} vont être écartées.`);
  }

  const temp = chercherOnglet_(classeur, 'brutTemp');
  if (!temp) {
    effacerEtatResserrage_();
    throw new Error('L\'onglet de travail du resserrage a disparu : recommencer.');
  }

  const dernier = source.getLastRow();
  const entetes = source.getRange(1, 1, 1, COLONNES_BRUT_.length).getValues()[0];
  const iHoro = colonne_(entetes, 'horodatage');

  while (etat.ligneSource <= dernier) {
    if (Date.now() - t0 > BUDGET_MS) {
      ecrireEtatResserrage_(etat);
      programmerRepriseResserrage_();
      dire_(`Budget de temps atteint — ${etat.lues}/${dernier - 1} lignes examinées, `
        + `${etat.gardees} gardées.`);
      dire_('Reprise programmée dans une minute. Le brut d\'origine est intact.');
      vider_('Resserrage en cours');
      return;
    }
    const n = Math.min(TAILLE_LOT_RESSERRAGE_, dernier - etat.ligneSource + 1);
    const lot = source.getRange(etat.ligneSource, 1, n, COLONNES_BRUT_.length).getValues();
    // jour_ et non String().slice : l'horodatage revient de Sheets en objet Date.
    const gardees = lot.filter((l) => jour_(l[iHoro]) >= etat.seuil);
    if (gardees.length) {
      temp.getRange(temp.getLastRow() + 1, 1, gardees.length, COLONNES_BRUT_.length)
        .setValues(gardees);
      etat.gardees += gardees.length;
    }
    // Curseur avancé APRÈS l'écriture : au pire un bloc refait, jamais sauté.
    etat.ligneSource += n;
    etat.lues += n;
    SpreadsheetApp.flush();
  }

  // La bascule, et elle seule, est destructrice. Elle vient en dernier.
  const nom = source.getName();
  const cache = source.isSheetHidden ? source.isSheetHidden() : true;
  classeur.deleteSheet(source);
  temp.setName(nom);
  if (cache) temp.hideSheet();

  retirerDeclencheursResserrage_();
  effacerEtatResserrage_();
  dire_(`Resserrage terminé — ${etat.lues} lignes examinées, ${etat.gardees} gardées, `
    + `${etat.lues - etat.gardees} écartées.`);
  dire_('');
  dire_(`Le journal ne couvre plus que les ${etat.jours} derniers jours. Les`);
  dire_('événements antérieurs ne sont PAS récupérables sans un nouveau');
  dire_('moissonnage : ils ont été supprimés du classeur, pas archivés.');
  dire_('');
  dire_('Étape suivante : « Recalculer le rapport, sans rien recollecter ».');
  vider_('Resserrage terminé');
}

function reprendreResserrage() {
  resserrerBrut();
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
