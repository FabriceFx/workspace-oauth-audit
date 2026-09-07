/**
 * Inventaire des jetons actifs — introduit en v0.6.
 *
 * Le journal dit ce qui s'est passé sur 180 jours. L'inventaire dit ce qui
 * existe aujourd'hui. Aucun des deux ne remplace l'autre, et c'est leur écart
 * qui porte l'information la plus utile de tout l'outil :
 *
 *   un jeton actif dont aucune autorisation n'apparaît au journal a été accordé
 *   AVANT la fenêtre — c'est un accès que personne n'a revu depuis plus de six
 *   mois, et que le journal seul ne pouvait pas montrer.
 *
 * LE COÛT, ET POURQUOI IL VIENT EN SIXIÈME
 *
 * Le journal s'interroge globalement : quelques dizaines de requêtes pour tout
 * le tenant. L'inventaire se paie **une requête par compte** — 8 500. C'est un
 * rapport de un à cent, et c'est pourquoi il arrive après tout le reste : on ne
 * dépense cela qu'une fois le dépouillement, le classement et la file de travail
 * en place.
 *
 * Le moissonnage se fait donc en deux phases, l'une et l'autre reprenables :
 * on recense d'abord les comptes, puis on les parcourt par blocs, en reprenant
 * là où l'on s'est arrêté. Le nombre de reprises dépend de la taille du parc ;
 * le résultat, non.
 *
 * LA PORTÉE, ET CE QU'ELLE COÛTE VRAIMENT
 *
 * `AdminDirectory.Tokens.list` exige `admin.directory.user.security`. Cette
 * portée porte la lecture **et** la suppression des jetons : Google n'en publie
 * aucune variante en lecture seule, et rien dans Apps Script ne permet de la
 * restreindre. La demander est le prix de cette version, et il faut le dire
 * plutôt que de le maquiller.
 *
 * Jusqu'en v1.0, la compensation était l'absence : aucun appel à `Tokens.remove`
 * dans le projet, vérifiable d'un grep. La v1.1 en a introduit un — dans
 * `Revocation.gs`, et nulle part ailleurs. La garantie a donc changé de forme :
 * elle n'est plus l'absence de l'appel mais son encadrement — décision
 * préalable inscrite au référentiel, plan relu, résolution rejouée avant
 * d'agir, confirmation chiffrée, plafond, et trace ligne à ligne.
 */

const ONGLET_JETONS_ = '_Jetons';
const ONGLET_PARC_ = '_Parc';
const CLE_INVENTAIRE_ = 'inventaire';
const FONCTION_REPRISE_INVENTAIRE_ = 'reprendreInventaire';

const COLONNES_JETONS_ = [
  'compteMin', 'clientId', 'applicationMin', 'porteesMin', 'anonyme', 'natif', 'releveLe'
];

/**
 * Les comptes que l'annuaire a refusé de rendre.
 *
 * Sur 8 500 appels, quelques échecs transitoires sont certains. Un compte
 * absent de l'onglet des jetons se lit exactement comme un compte sans jeton :
 * c'est la confusion que tout le reste de l'outil s'interdit — une colonne vide
 * veut dire « non mesuré », jamais « rien trouvé ». Ces comptes sont donc
 * nommés ici, repassés une fois en fin de parcours, et ceux qui résistent
 * privent leur ligne d'« État du jeton » au lieu de la remplir à tort.
 */
const COLONNES_ECHECS_ = ['compteMin', 'motifEchec', 'tentatives', 'resultat'];

/** Comptes traités entre deux écritures : compromis entre appels et pertes. */
const BLOC_COMPTES_ = 50;

// --------------------------------------------------------------------- état

const lireEtatInventaire_ = () => {
  const brut = PropertiesService.getScriptProperties().getProperty(CLE_INVENTAIRE_);
  return brut ? JSON.parse(brut) : null;
};

const ecrireEtatInventaire_ = (etat) => PropertiesService.getScriptProperties()
  .setProperty(CLE_INVENTAIRE_, JSON.stringify(etat));

const effacerEtatInventaire_ = () =>
  PropertiesService.getScriptProperties().deleteProperty(CLE_INVENTAIRE_);

const retirerDeclencheursInventaire_ = () => {
  ScriptApp.getProjectTriggers()
    .filter((d) => d.getHandlerFunction() === FONCTION_REPRISE_INVENTAIRE_)
    .forEach((d) => ScriptApp.deleteTrigger(d));
};

const programmerRepriseInventaire_ = () => {
  retirerDeclencheursInventaire_();
  ScriptApp.newTrigger(FONCTION_REPRISE_INVENTAIRE_).timeBased().after(60 * 1000).create();
};

/** Ce qui doit bouger d'une exécution à l'autre. Sinon, on est bloqué. */
const empreinteInventaire_ = (etat) =>
  `${etat.phase}:${etat.comptes}:${etat.traites}:${etat.jetons}:${etat.prochaineLigneEchec}`;

/** L'onglet des échecs, créé à la demande et masqué comme les autres bruts. */
const feuilleEchecs_ = (classeur) => {
  const existante = chercherOnglet_(classeur, 'echecs');
  if (existante) return existante;
  const lg = reglages_(classeur).interface;
  const f = classeur.insertSheet(nomOnglet_('echecs', lg));
  const entetes = entetesEn_(COLONNES_ECHECS_, lg);
  f.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
  f.setFrozenRows(1);
  f.hideSheet();
  return f;
};

/**
 * Les comptes dont les jetons n'ont PAS pu être lus, et le sont restés après
 * la seconde tentative. Le rapport doit s'en souvenir : c'est ce qui distingue
 * « ce compte n'a aucun jeton » de « on n'a pas pu savoir ».
 */
const comptesNonMesures_ = (classeur) => {
  const f = chercherOnglet_(classeur, 'echecs');
  const nonMesures = new Set();
  if (!f || f.getLastRow() < 2) return nonMesures;
  const v = f.getDataRange().getValues();
  const iCompte = colonne_(v[0], 'compteMin');
  const iResultat = colonne_(v[0], 'resultat');
  for (const l of v.slice(1)) {
    const compte = String(l[iCompte] || '').trim();
    if (compte && !String(l[iResultat] || '').trim()) nonMesures.add(compte);
  }
  return nonMesures;
};

// ------------------------------------------------------------------- phases

/** Phase 1 : recenser le parc. Une colonne, une adresse par ligne. */
const recenserParc_ = (classeur, etat, t0) => {
  let f = chercherOnglet_(classeur, 'parc');
  if (!f) {
    f = classeur.insertSheet(nomOnglet_('parc', reglages_(classeur).interface));
    f.getRange(1, 1).setValue(nomColonne_('compteMin', LANGUE_DEFAUT_)).setFontWeight('bold');
    f.hideSheet();
  }
  do {
    const rep = AdminDirectory.Users.list({
      customer: 'my_customer',
      maxResults: 500,
      orderBy: 'email',
      projection: 'basic',
      fields: 'nextPageToken,users/primaryEmail',
      pageToken: etat.pageToken
    });
    const comptes = (rep.users || []).map((u) => [u.primaryEmail]);
    if (comptes.length) {
      f.getRange(f.getLastRow() + 1, 1, comptes.length, 1).setValues(comptes);
      etat.comptes += comptes.length;
    }
    etat.pageToken = rep.nextPageToken || null;
    if (!etat.pageToken) {
      etat.phase = 'jetons';
      etat.prochaineLigne = 2;
      return true;
    }
  } while (Date.now() - t0 < BUDGET_MS);
  return false;
};

/** Phase 2 : parcourir le parc, relever les jetons de chacun. */
const releverJetons_ = (classeur, etat, t0) => {
  const parc = chercherOnglet_(classeur, 'parc');
  const jetons = chercherOnglet_(classeur, 'jetons');
  const dernier = parc.getLastRow();
  const aujourdhui = jour_(new Date());

  while (etat.prochaineLigne <= dernier) {
    if (Date.now() - t0 > BUDGET_MS) return false;
    const n = Math.min(BLOC_COMPTES_, dernier - etat.prochaineLigne + 1);
    const comptes = parc.getRange(etat.prochaineLigne, 1, n, 1).getValues();
    const lignes = [];

    const echecs = [];

    for (const [compte] of comptes) {
      if (!compte) continue;
      try {
        const rep = AdminDirectory.Tokens.list(compte);
        for (const t of rep.items || []) {
          lignes.push([
            compte, t.clientId || '', t.displayText || '',
            (t.scopes || []).join(' '),
            t.anonymous ? 'oui' : '', t.nativeApp ? 'oui' : '', aujourdhui
          ]);
        }
      } catch (e) {
        // Le compte est NOMMÉ, pas seulement compté : sans son nom, on ne peut
        // ni le repasser ni retirer sa ligne du rapport.
        echecs.push([compte, String(e.message || e).slice(0, 300), 1, '']);
        etat.erreurs++;
        if (!etat.premiereErreur) etat.premiereErreur = `${compte} : ${e.message || e}`;
      }
    }
    if (lignes.length) {
      jetons.getRange(jetons.getLastRow() + 1, 1, lignes.length, COLONNES_JETONS_.length)
        .setValues(lignes);
      etat.jetons += lignes.length;
    }
    if (echecs.length) {
      const fe = feuilleEchecs_(classeur);
      fe.getRange(fe.getLastRow() + 1, 1, echecs.length, COLONNES_ECHECS_.length)
        .setValues(echecs);
    }
    // Avancé APRÈS l'écriture : une interruption fait au pire recommencer un
    // bloc, jamais en sauter un.
    etat.prochaineLigne += n;
    etat.traites += n;
    SpreadsheetApp.flush();
  }
  // Le parcours est fini, mais pas l'inventaire : les comptes tombés en erreur
  // méritent une seconde chance avant qu'on les déclare non mesurés.
  etat.phase = 'reprise';
  etat.prochaineLigneEchec = 2;
  return false;
};

/**
 * Phase 3 : repasser une fois les comptes tombés en erreur.
 *
 * La plupart des échecs sur un parc de plusieurs milliers de comptes sont
 * transitoires — un 429, un 503, un compte supprimé pendant le parcours. Une
 * seconde tentative les efface presque tous ; ceux qui restent sont un vrai
 * constat, et ils sont traités comme tel.
 */
const repasserEchecs_ = (classeur, etat, t0) => {
  const f = chercherOnglet_(classeur, 'echecs');
  if (!f || f.getLastRow() < 2) return true;
  const jetons = chercherOnglet_(classeur, 'jetons');
  const aujourdhui = jour_(new Date());

  // Une seule lecture, et des écritures par blocs : la liste des échecs est
  // courte au regard du parc, mais une lecture et une écriture par cellule s'y
  // paieraient quand même en minutes.
  const valeurs = f.getDataRange().getValues();
  const iCompte = colonne_(valeurs[0], 'compteMin');
  const iMotif = colonne_(valeurs[0], 'motifEchec');
  const iTentatives = colonne_(valeurs[0], 'tentatives');
  const iResultat = colonne_(valeurs[0], 'resultat');
  const dernier = valeurs.length;

  // Ce qui reste à écrire depuis la dernière vidange, avec sa ligne de destination.
  let premiereLigneEnAttente = etat.prochaineLigneEchec;
  const enAttente = [];
  const vider = () => {
    if (!enAttente.length) return;
    f.getRange(premiereLigneEnAttente, iMotif + 1, enAttente.length, 3)
      .setValues(enAttente);
    enAttente.length = 0;
    SpreadsheetApp.flush();
  };

  // UNE SEULE SORTIE, et la vidange est après elle. Écrire par blocs oblige à
  // vider avant de rendre la main ; un `return` au milieu de la boucle aurait
  // perdu les tentatives déjà faites, et rien dans le banc ne l'aurait vu — on
  // ne contrôle pas l'horloge. La forme de la boucle le rend impossible.
  let interrompu = false;

  while (etat.prochaineLigneEchec <= dernier) {
    if (Date.now() - t0 > BUDGET_MS) { interrompu = true; break; }
    const l = valeurs[etat.prochaineLigneEchec - 1];
    const compte = String(l[iCompte] || '').trim();
    const dejaTraite = String(l[iResultat] || '').trim();

    if (!compte || dejaTraite) {
      enAttente.push([l[iMotif] || '', l[iTentatives] || '', l[iResultat] || '']);
    } else {
      try {
        const rep = AdminDirectory.Tokens.list(compte);
        const lignes = (rep.items || []).map((t) => [
          compte, t.clientId || '', t.displayText || '',
          (t.scopes || []).join(' '),
          t.anonymous ? 'oui' : '', t.nativeApp ? 'oui' : '', aujourdhui
        ]);
        if (lignes.length) {
          jetons.getRange(jetons.getLastRow() + 1, 1, lignes.length, COLONNES_JETONS_.length)
            .setValues(lignes);
          etat.jetons += lignes.length;
        }
        enAttente.push([l[iMotif] || '', 2, 'relevé']);
        etat.repris++;
      } catch (e) {
        enAttente.push([String(e.message || e).slice(0, 300), 2, '']);
      }
    }
    etat.prochaineLigneEchec++;
    if (enAttente.length >= BLOC_COMPTES_) {
      vider();
      premiereLigneEnAttente = etat.prochaineLigneEchec;
    }
  }
  vider();
  return !interrompu;
};

// -------------------------------------------------------------- moissonnage

function inventorierJetons() {
  const t0 = Date.now();
  const classeur = classeurCourant_();
  let etat = lireEtatInventaire_();

  if (etat) {
    etat.reprises++;
    dire_(`Reprise n°${etat.reprises} — phase « ${etat.phase} », `
      + `${etat.traites}/${etat.comptes} comptes, ${etat.jetons} jetons relevés`);

    const empreinte = empreinteInventaire_(etat);
    etat.sansProgres = empreinte === etat.empreinte ? (etat.sansProgres || 0) + 1 : 0;
    etat.empreinte = empreinte;
    if (etat.sansProgres >= REPRISES_SANS_PROGRES_MAX_) {
      retirerDeclencheursInventaire_();
      effacerEtatInventaire_();
      dire_('');
      dire_(`ABANDON — ${etat.sansProgres} reprises consécutives n'ont parcouru`);
      dire_('aucun compte. L\'erreur ne passera pas toute seule : l\'inventaire est');
      dire_('arrêté et son déclencheur retiré, plutôt que de réessayer chaque minute.');
      dire_('');
      dire_('Causes, par ordre de vraisemblance :');
      dire_('  — la portée admin.directory.user.security n\'est plus consentie, ou');
      dire_('    le rôle d\'administrateur a changé : relancer à la main rendra');
      dire_('    l\'erreur lisible ;');
      dire_('  — le quota de l\'annuaire est épuisé pour la journée ;');
      dire_('  — le classeur a atteint le plafond de 10 millions de cellules.');
      dire_('');
      dire_(`ATTENTION : le relevé est PARTIEL — ${etat.traites} comptes sur ${etat.comptes}.`);
      dire_('Ne l\'utilisez pas pour révoquer : un compte non parcouru y ressemble');
      dire_('à un compte sans jeton. Relancez l\'inventaire depuis le début une fois');
      dire_('la cause levée.');
      vider_('Inventaire abandonné');
      return;
    }
  } else {
    etat = {
      phase: 'comptes', pageToken: null, prochaineLigne: 2, prochaineLigneEchec: 2,
      comptes: 0, traites: 0, jetons: 0, erreurs: 0, repris: 0, premiereErreur: '',
      lancee: new Date().toISOString(), reprises: 0,
      // Voir empreinteInventaire_ : le détecteur de blocage.
      empreinte: '', sansProgres: 0
    };
    // On repart d'un relevé neuf : mêler deux inventaires ferait passer pour
    // actifs des jetons révoqués entre-temps.
    const ancien = chercherOnglet_(classeur, 'parc');
    if (ancien) classeur.deleteSheet(ancien);
    const anciensEchecs = chercherOnglet_(classeur, 'echecs');
    if (anciensEchecs) classeur.deleteSheet(anciensEchecs);
    const brut = onglet_(classeur, 'jetons', COLONNES_JETONS_, reglages_(classeur).interface);
    brut.hideSheet();
    dire_('Nouvel inventaire — le parc va être recensé, puis parcouru compte par compte.');
  }

  let fini = false;
  try {
    if (etat.phase === 'comptes') {
      const recense = recenserParc_(classeur, etat, t0);
      if (recense) dire_(`Parc recensé : ${etat.comptes} comptes.`);
    }
    if (etat.phase === 'jetons') {
      const parcouru = releverJetons_(classeur, etat, t0);
      if (parcouru) fini = true;
    }
    if (etat.phase === 'reprise') fini = repasserEchecs_(classeur, etat, t0);
  } catch (e) {
    ecrireEtatInventaire_(etat);
    programmerRepriseInventaire_();
    dire_(`Interruption sur erreur : ${e}`);
    dire_('');
    dire_('Si le message parle de droits : la lecture des jetons exige la portée');
    dire_('admin.directory.user.security et le rôle d\'administrateur correspondant.');
    dire_('L\'état est conservé, une reprise est programmée dans une minute.');
    dire_('Pour abandonner : annulerInventaire().');
    vider_('Inventaire interrompu');
    throw e;
  }

  if (!fini) {
    ecrireEtatInventaire_(etat);
    programmerRepriseInventaire_();
    const reste = etat.phase === 'comptes' ? 'recensement du parc en cours'
      : etat.phase === 'reprise' ? `${etat.erreurs} compte(s) en échec repassés`
        : `${etat.traites}/${etat.comptes} comptes parcourus`;
    dire_(`Budget de temps atteint — ${reste}, ${etat.jetons} jetons relevés.`);
    dire_('Reprise programmée dans une minute.');
    vider_('Inventaire en cours');
    return;
  }

  retirerDeclencheursInventaire_();
  dire_(`Inventaire terminé — ${etat.comptes} comptes parcourus, `
    + `${etat.jetons} jetons actifs relevés, ${etat.reprises + 1} exécution(s).`);
  if (etat.erreurs) {
    const restants = etat.erreurs - etat.repris;
    dire_('');
    dire_(`${etat.erreurs} compte(s) ont échoué au premier passage ; `
      + `${etat.repris} ont été relevés à la seconde tentative.`);
    dire_(`Premier échec rencontré : ${etat.premiereErreur}`);
    if (restants > 0) {
      dire_('');
      dire_(`${restants} compte(s) restent NON MESURÉS. Ils sont nommés dans l'onglet`);
      dire_(`${nomOnglet_('echecs', reglages_(classeur).interface)}, avec le motif du refus.`);
      dire_('');
      dire_('Ce n\'est pas un détail de journalisation. Pour ces comptes, la colonne');
      dire_('« État du jeton » de l\'onglet Autorisants reste VIDE au lieu d\'afficher');
      dire_('« clos » : on ignore ce qu\'ils portent, et un accès qu\'on n\'a pas su');
      dire_('lire ne doit pas se donner pour un accès fermé.');
      dire_('');
      dire_('Ils sont aussi hors du champ des révocations : on ne révoque que ce');
      dire_('qu\'on a constaté. Relancez l\'inventaire pour les rattraper.');
    }
  }
  dire_('');
  dire_('L\'agrégation va croiser ce relevé avec le journal.');
  vider_('Inventaire terminé');
  effacerEtatInventaire_();

  if (chercherOnglet_(classeur, 'brut')) agreger_(classeur, null);
}

function reprendreInventaire() {
  inventorierJetons();
}

const direEtatInventaire_ = () => {
  const etat = lireEtatInventaire_();
  if (!etat) {
    const classeur = classeurCourant_();
    const f = chercherOnglet_(classeur, 'jetons');
    dire_(f && f.getLastRow() > 1
      ? `Aucun inventaire en cours. Dernier relevé : ${f.getLastRow() - 1} jetons.`
      : 'Aucun inventaire en cours, et aucun relevé disponible.');
  } else {
    dire_(`Inventaire lancé le ${etat.lancee.slice(0, 19).replace('T', ' ')}`);
    dire_(`  phase       ${etat.phase}`);
    dire_(`  avancement  ${etat.traites}/${etat.comptes} comptes, `
      + `${etat.jetons} jetons, ${etat.reprises} reprise(s)`);
    if (etat.erreurs) dire_(`  erreurs     ${etat.erreurs}`);
  }
};

function etatInventaire() {
  direEtatInventaire_();
  vider_('Où en est l\'inventaire');
}

const direAnnulerInventaire_ = () => {
  const etat = lireEtatInventaire_();
  retirerDeclencheursInventaire_();
  effacerEtatInventaire_();
  dire_(etat
    ? 'Inventaire abandonné. Le relevé partiel reste, mais il est incomplet : ne'
      + ' l\'interprétez pas comme un inventaire.'
    : 'Aucun inventaire en cours ; déclencheurs retirés par précaution.');
};

function annulerInventaire() {
  direAnnulerInventaire_();
  vider_('Inventaire annulé');
}

// ----------------------------------------------------------------- lecture

/**
 * Le relevé, indexé par « client_id compte ».
 *
 * Rend `null` quand aucun inventaire n'a été fait : l'absence de relevé et
 * l'absence de jeton sont deux choses différentes, et les confondre ferait
 * passer tout le parc pour révoqué.
 */
const lireJetons_ = (classeur) => {
  const f = chercherOnglet_(classeur, 'jetons');
  if (!f || f.getLastRow() < 2) return null;
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCompte = colonne_(e, 'compteMin');
  const iCid = colonne_(e, 'clientId');
  const iApp = colonne_(e, 'applicationMin');
  const iPortees = colonne_(e, 'porteesMin');
  const iAnonyme = colonne_(e, 'anonyme');

  const jetons = new Map();
  for (const l of valeurs.slice(1)) {
    const compte = String(l[iCompte] || '').trim();
    const cid = String(l[iCid] || '').trim();
    if (!compte || !cid) continue;
    jetons.set(`${cid} ${compte}`, {
      compte,
      cid,
      nom: String(l[iApp] || '').trim(),
      portees: String(l[iPortees] || '').split(' ').filter(Boolean),
      anonyme: String(l[iAnonyme]).trim() === 'oui'
    });
  }
  return jetons;
};

const COLONNES_DORMANTS_ = [
  'compte', 'domaine', 'profil', 'application', 'clientId', 'niveauMax',
  'administration', 'portees'
];

/**
 * Les accès dormants : un jeton vit, et le journal n'a vu aucune autorisation
 * sur la fenêtre. L'autorisation est donc antérieure — au moins six mois sans
 * que personne ne l'ait revue.
 *
 * C'est la seule chose que ni le journal ni l'inventaire ne pouvaient dire
 * seuls, et c'est ce qui justifiait de dépenser 8 500 requêtes.
 */
const ecrireDormants_ = (classeur, apps, couples, lg) => {
  const f = onglet_(classeur, 'dormants', COLONNES_DORMANTS_, lg);
  const lignes = [...couples.values()]
    .filter((c) => c.jetonActif && !c.autorisations)
    .map((c) => {
      const a = apps.get(c.cid) || {};
      return [
        c.compte, c.domaine, c.profil, c.nom, c.cid,
        a.niveauMax || '', a.administration ? 'oui' : '', [...c.portees].join(' ')
      ];
    })
    .sort((x, y) => (x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : (x[0] < y[0] ? -1 : 1)));
  poser_(f, lignes, true);
  return lignes.length;
};
