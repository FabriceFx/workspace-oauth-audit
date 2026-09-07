/**
 * Agrégation du journal moissonné en onglets — introduite en v0.2.
 *
 * L'onglet brut est la preuve, ces quatre-là sont le rapport :
 *
 *   Synthèse     la photographie, et les chiffres qu'on cite
 *   Applications une ligne par application — de quoi décider
 *   Autorisants  une ligne par compte et application — de quoi agir
 *   Portées      une ligne par portée — de quoi comprendre
 *
 * Aucun score ici : le dépouillement ne juge pas. Il rapproche seulement trois
 * choses — ce que dit le journal, ce que dit l'annuaire sur les comptes, et ce
 * qu'a décidé l'administrateur — pour que le jugement, lui, soit possible. Le
 * catalogue de sensibilité des portées arrive en v0.5.
 *
 * Le brut est relu par lots, jamais d'un bloc : un journal de production peut
 * compter des centaines de milliers de lignes, et getDataRange() les ramènerait
 * toutes en mémoire.
 */

const TAILLE_LOT_ = 20000;

/**
 * Reconstruit les quatre onglets à partir du brut déjà moissonné.
 *
 * Utile pour rejouer l'agrégation après une modification du code, sans
 * redemander le journal à Google. Le moissonnage l'appelle de lui-même une fois
 * sa dernière page lue : en usage normal, on n'a pas à y toucher.
 */
function reagreger() {
  const classeur = classeurCourant_();
  const brut = chercherOnglet_(classeur, 'brut');
  if (!brut || brut.getLastRow() < 2) {
    dire_('Il n\'y a rien à agréger : l\'onglet brut est absent ou vide.');
    dire_('Le journal se moissonne d\'abord — moissonner(180) — et l\'agrégation');
    dire_('suit d\'elle-même.');
    vider_('Rien à agréger');
    return;
  }
  return agreger_(classeur, null);
}

const agreger_ = (classeur, etat) => {
  const t0 = Date.now();
  const lg = reglages_(classeur).interface;
  const brut = chercherOnglet_(classeur, 'brut');
  if (!brut) throw new Error(`Onglet ${nomOnglet_('brut', lg)} introuvable : moissonner() d'abord.`);

  const dernier = brut.getLastRow();
  if (dernier < 2) throw new Error('Le journal moissonné est vide.');

  const profils = lireComptes_(classeur);
  const catalogue = chargerCatalogue_(classeur);
  const jetonsReleves = lireJetons_(classeur);
  const services = new Map();
  const debutRecent = debutFenetreRecente_();
  const apps = new Map();
  const couples = new Map();
  const portees = new Map();
  const parEvenement = {};
  const motifsRefus = {};
  const parDomaine = {};
  const comptes = new Set();
  let octetsTotal = 0;
  let evenementsAvecOctets = 0;
  let horoMin = null;
  let horoMax = null;
  let nbLignes = 0;

  const entetesBrut = brut.getRange(1, 1, 1, COLONNES_BRUT_.length).getValues()[0];
  const C = {};
  COLONNES_BRUT_.forEach((id) => { C[id] = colonne_(entetesBrut, id); });

  for (let debut = 2; debut <= dernier; debut += TAILLE_LOT_) {
    if (Date.now() - t0 > BUDGET_MS) {
      throw new Error(`Agrégation interrompue sur le budget de temps après ${nbLignes} `
        + `lignes sur ${dernier - 1}. Le brut est intact : relancer reagreger(), `
        + 'ou resserrer la fenêtre.');
    }
    const n = Math.min(TAILLE_LOT_, dernier - debut + 1);
    const lot = brut.getRange(debut, 1, n, COLONNES_BRUT_.length).getValues();

    for (const l of lot) {
      nbLignes++;
      const horo = jour_(l[C.horodatage]);
      const compte = String(l[C.compteMin] || '');
      const dom = String(l[C.domaineMin] || '');
      const evenement = String(l[C.evenement] || '');
      const cid = String(l[C.clientId] || '');
      const nom = String(l[C.applicationMin] || '') || cid || '(sans nom)';
      const octets = typeof l[C.octetsMin] === 'number' && l[C.octetsMin] > 0 ? l[C.octetsMin] : 0;

      if (horo) {
        if (!horoMin || horo < horoMin) horoMin = horo;
        if (!horoMax || horo > horoMax) horoMax = horo;
      }
      parEvenement[evenement] = (parEvenement[evenement] || 0) + 1;
      if (compte && !comptes.has(compte)) {
        comptes.add(compte);
        parDomaine[dom] = (parDomaine[dom] || 0) + 1;
      }
      if (evenement === 'deny') {
        const motif = String(l[C.motifRefus] || '') || '(non précisé)';
        motifsRefus[motif] = (motifsRefus[motif] || 0) + 1;
      }
      if (octets) { octetsTotal += octets; evenementsAvecOctets++; }
      if (!cid) continue;

      if (!apps.has(cid)) {
        apps.set(cid, {
          nom, cid, clientType: String(l[C.clientType] || ''),
          autorisants: new Set(), aPrivileges: new Set(), suspendus: new Set(),
          niveauMax: null, administration: false, porteesInconnues: new Set(),
          jetons: new Set(), appels: 0, appels30: 0, octets30: 0,
          autorisations: 0, revocations: 0, refus: 0,
          activites: 0, premiere: horo, derniere: horo, portees: new Set(), octets: 0
        });
      }
      const a = apps.get(cid);
      if (nom && nom !== cid) a.nom = nom;
      if (horo) {
        if (!a.premiere || horo < a.premiere) a.premiere = horo;
        if (!a.derniere || horo > a.derniere) a.derniere = horo;
      }
      compter_(a, evenement);
      if (evenement === 'activity') {
        const service = String(l[C.produit] || '') || String(l[C.api] || '') || '(non précisé)';
        compterAppel_(a, services, cid, service, octets, horo >= debutRecent, horo);
      } else {
        a.octets += octets;
      }

      const listePortees = String(l[C.porteesMin] || '').split(' ').filter(Boolean);
      for (const p of listePortees) {
        a.portees.add(p);
        const classement = classerPortee_(p, catalogue);
        a.niveauMax = pireNiveau_(a.niveauMax, classement.niveau);
        if (classement.administration) a.administration = true;
        if (!classement.connue) a.porteesInconnues.add(p);
        if (!portees.has(p)) {
          portees.set(p, {
            famille: famille_(p), niveau: classement.niveau,
            administration: classement.administration, connue: classement.connue,
            apps: new Set(), comptes: new Set(), occurrences: 0
          });
        }
        const e = portees.get(p);
        e.apps.add(cid);
        e.occurrences++;
        if (compte) e.comptes.add(compte);
      }

      if (!compte) continue;
      a.autorisants.add(compte);
      const profil = profils.get(compte);
      if (profil) {
        if (profil.admin || profil.delegue) a.aPrivileges.add(compte);
        if (profil.suspendu) a.suspendus.add(compte);
      }
      const cle = `${cid} ${compte}`;
      if (!couples.has(cle)) {
        couples.set(cle, {
          compte, domaine: dom, nom: a.nom, cid, profil: libelleProfil_(profils.get(compte)),
          jetonActif: false,
          autorisations: 0, revocations: 0, refus: 0, activites: 0,
          premiere: horo, derniere: horo, portees: new Set(), demandeur: ''
        });
      }
      const c = couples.get(cle);
      if (horo) {
        if (!c.premiere || horo < c.premiere) c.premiere = horo;
        if (!c.derniere || horo > c.derniere) c.derniere = horo;
      }
      compter_(c, evenement);
      if (l[C.demandeurMin]) c.demandeur = String(l[C.demandeurMin]);
      for (const p of listePortees) c.portees.add(p);
    }
  }

  const contexte = {
    etat, lignes: nbLignes, comptes: comptes.size, horoMin, horoMax,
    parEvenement, motifsRefus, parDomaine, octetsTotal, evenementsAvecOctets
  };

  // Le référentiel de décisions s'enrichit AVANT que le rapport ne s'écrive :
  // l'onglet Applications affiche ensuite le statut de chacune, y compris des
  // nouvelles, qui apparaissent non classées.
  // Le relevé des jetons entre ici, et il apporte des applications que le
  // journal n'a jamais vues : celles autorisées avant la fenêtre et restées
  // silencieuses depuis. Les omettre reviendrait à perdre exactement ce que
  // l'inventaire a coûté 8 500 requêtes à établir.
  if (jetonsReleves) {
    fusionnerJetons_(apps, couples, portees, jetonsReleves, profils, catalogue);
  }

  for (const a of apps.values()) a.evaluation = evaluer_(a);

  const ajouts = synchroniserDecisions_(classeur, apps, lg);
  const decisions = lireDecisions_(classeur);
  contexte.services = ecrireVolumetrie_(classeur, apps, services, octetsTotal, lg);
  contexte.palmares = palmares_(apps);
  contexte.octets30 = [...apps.values()].reduce((n, a) => n + a.octets30, 0);
  contexte.aInstruire = ecrireAInstruire_(classeur, apps, decisions, lg);
  contexte.inventaire = Boolean(jetonsReleves);
  if (jetonsReleves) {
    contexte.jetonsActifs = jetonsReleves.size;
    contexte.dormants = ecrireDormants_(classeur, apps, couples, lg);
  }
  contexte.porteesInconnues = [...portees.values()].filter((e) => !e.connue).length;
  contexte.bilan = bilanDecisions_(classeur, apps);
  contexte.ajouts = ajouts;

  ecrireSynthese_(classeur, apps, couples, portees, contexte, lg);
  ecrireApplications_(classeur, apps, decisions, lg);
  ecrireAutorisants_(classeur, couples, Boolean(jetonsReleves), lg);
  ecrirePortees_(classeur, portees, lg);
  classeur.setActiveSheet(chercherOnglet_(classeur, 'synthese'));
  classeur.moveActiveSheet(1);
  chercherOnglet_(classeur, 'brut').hideSheet();
  const menage = nettoyerFeuilleParDefaut_(classeur);

  dire_(`Agrégation terminée en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  if (menage) dire_('La feuille vide créée d\'office avec le classeur a été supprimée.');
  dire_(`  ${apps.size} applications, ${couples.size} couples compte/application, `
    + `${portees.size} portées distinctes.`);
  dire_('');
  dire_(`Classement : ${contexte.bilan.nonClassees} application(s) sans décision`
    + `${ajouts.nouvelles ? `, dont ${ajouts.nouvelles} nouvelle(s)` : ''}`
    + `${contexte.bilan.expirees ? `, et ${contexte.bilan.expirees} périmée(s)` : ''}.`);
  if (jetonsReleves) {
    dire_(`Inventaire : ${contexte.jetonsActifs} jetons actifs, `
      + `dont ${contexte.dormants} accès dormants — autorisés avant la fenêtre.`);
  } else {
    dire_('Aucun inventaire de jetons : la colonne « Jeton » reste vide et les');
    dire_('accès antérieurs à la fenêtre restent invisibles. Menu > Inventorier');
    dire_('les jetons actifs.');
  }
  dire_(`File de travail : ${contexte.aInstruire} application(s) à instruire`
    + `${contexte.porteesInconnues ? `, ${contexte.porteesInconnues} portée(s) hors catalogue` : ''}.`);
  if (!profils.size) {
    dire_('Profils des comptes non relevés : les colonnes « à privilèges » et');
    dire_('« suspendus » resteront vides. Menu > Relever les profils des comptes.');
  }
  dire_('');
  dire_(`L'onglet ${nomOnglet_('brut', langueInterface_())} est masqué, pas `
    + 'supprimé : c\'est la pièce');
  dire_('justificative du rapport. Ne le partagez pas plus largement que le reste.');
  dire_('Pour le revoir : menu « Applications tierces » > « Afficher l\'onglet brut ».');
  vider_('Rapport prêt');
  return classeur;
};

/**
 * Verse le relevé des jetons dans les mêmes tableaux que le journal.
 *
 * Un couple déjà connu du journal reçoit simplement son drapeau. Un couple
 * inconnu — jeton vivant sans trace d'autorisation sur la fenêtre — est créé
 * de toutes pièces : c'est le cas que l'inventaire est seul à voir, et le seul
 * qui justifiait de le faire.
 */
const fusionnerJetons_ = (apps, couples, portees, jetons, profils, catalogue) => {
  for (const j of jetons.values()) {
    if (!apps.has(j.cid)) {
      apps.set(j.cid, {
        nom: j.nom || j.cid, cid: j.cid, clientType: j.anonyme ? 'ANONYME' : '',
        autorisants: new Set(), aPrivileges: new Set(), suspendus: new Set(),
        niveauMax: null, administration: false, porteesInconnues: new Set(),
        jetons: new Set(), autorisations: 0, revocations: 0, refus: 0, activites: 0,
        appels: 0, appels30: 0, octets30: 0,
        premiere: '', derniere: '', portees: new Set(), octets: 0
      });
    }
    const a = apps.get(j.cid);
    if (j.nom && (!a.nom || a.nom === a.cid)) a.nom = j.nom;
    a.autorisants.add(j.compte);
    a.jetons.add(j.compte);
    const profil = profils.get(j.compte);
    if (profil) {
      if (profil.admin || profil.delegue) a.aPrivileges.add(j.compte);
      if (profil.suspendu) a.suspendus.add(j.compte);
    }
    for (const p of j.portees) {
      a.portees.add(p);
      const classement = classerPortee_(p, catalogue);
      a.niveauMax = pireNiveau_(a.niveauMax, classement.niveau);
      if (classement.administration) a.administration = true;
      if (!classement.connue) a.porteesInconnues.add(p);

      // L'onglet Portées doit connaître les portées que seul l'inventaire
      // révèle : sans cela, il sous-estimerait ce qui est réellement accordé.
      if (!portees.has(p)) {
        portees.set(p, {
          famille: famille_(p), niveau: classement.niveau,
          administration: classement.administration, connue: classement.connue,
          apps: new Set(), comptes: new Set(), occurrences: 0
        });
      }
      const e = portees.get(p);
      e.apps.add(j.cid);
      e.comptes.add(j.compte);
      e.occurrences++;
    }

    const cle = `${j.cid} ${j.compte}`;
    if (!couples.has(cle)) {
      couples.set(cle, {
        compte: j.compte, domaine: domaine_(j.compte), nom: a.nom, cid: j.cid,
        profil: libelleProfil_(profil), jetonActif: true,
        autorisations: 0, revocations: 0, refus: 0, activites: 0,
        premiere: '', derniere: '', portees: new Set(j.portees), demandeur: ''
      });
    } else {
      const c = couples.get(cle);
      c.jetonActif = true;
      for (const p of j.portees) c.portees.add(p);
    }
  }
};

const compter_ = (o, evenement) => {
  if (evenement === 'authorize') o.autorisations++;
  else if (evenement === 'revoke') o.revocations++;
  else if (evenement === 'deny') o.refus++;
  else if (evenement === 'activity') o.activites++;
};

// ------------------------------------------------------------------ écriture

/**
 * Prépare un onglet : identifiant interne et identifiants de colonnes, jamais
 * des libellés. Les noms visibles se déduisent de la langue courante, et un
 * onglet créé sous une autre langue est renommé plutôt que doublé.
 */
const onglet_ = (classeur, id, ids, lg) => {
  const langue = lg || LANGUE_DEFAUT_;
  let f = ongletCanonique_(classeur, id, langue);
  if (f) {
    const filtre = f.getFilter();
    if (filtre) filtre.remove();
    f.clear();
  } else {
    f = classeur.insertSheet(nomOnglet_(id, langue));
  }
  const entetes = entetesEn_(ids, langue);
  f.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
  f.setFrozenRows(1);
  return f;
};

const poser_ = (f, lignes, filtrer) => {
  if (lignes.length) {
    f.getRange(2, 1, lignes.length, lignes[0].length).setValues(lignes);
    if (filtrer) f.getRange(1, 1, lignes.length + 1, lignes[0].length).createFilter();
  }
  f.autoResizeColumns(1, f.getLastColumn());
  return f;
};

/**
 * Ce que le journal seul permet de dire d'un couple compte × application.
 *
 * Aucune de ces valeurs n'est un fait : le journal ne connaît que la fenêtre
 * qu'on lui a demandée. Seul l'inventaire des jetons (v0.3) peut affirmer qu'un
 * accès existe encore aujourd'hui.
 *
 * « antérieur à la fenêtre » est la valeur qui compte : l'application a appelé
 * les API pour ce compte, mais aucune autorisation n'apparaît sur la période.
 * C'est donc qu'elle a été accordée avant — un accès qui dure depuis plus
 * longtemps que ne porte le journal, et que personne n'a revu depuis.
 */
const etatPresume_ = (c) => {
  if (c.autorisations > 0) return c.revocations > 0 ? 'révoqué depuis' : 'présumé actif';
  if (c.activites > 0) return 'antérieur à la fenêtre';
  if (c.revocations > 0) return 'révoqué';
  if (c.refus > 0) return 'refusé';
  return '—';
};

const ecrireSynthese_ = (classeur, apps, couples, portees, ctx, lg) => {
  const f = onglet_(classeur, 'synthese', ['indicateur', 'valeur'], lg);
  const l = [];
  const fenetre = ctx.etat ? `${ctx.etat.jours} jours` : '(agrégation manuelle)';
  l.push(['Généré le', Utilities.formatDate(new Date(), Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm')]);
  l.push(['Fenêtre demandée', fenetre]);
  l.push(['Période observée', `${ctx.horoMin || '?'} → ${ctx.horoMax || '?'}`]);
  l.push(['Événements', ctx.lignes]);
  l.push(['Comptes distincts', ctx.comptes]);
  l.push(['Applications distinctes', apps.size]);
  l.push(['Couples compte/application', couples.size]);
  l.push(['Portées distinctes', portees.size]);

  if (ctx.inventaire) {
    l.push(['', '']);
    l.push(['Inventaire des jetons', '']);
    l.push(['   jetons actifs relevés', ctx.jetonsActifs]);
    l.push(['   dont accès dormants', ctx.dormants]);
  }

  if (ctx.aInstruire !== undefined) {
    l.push(['', '']);
    l.push(['File de travail', '']);
    l.push(['   applications à instruire', ctx.aInstruire]);
    if (ctx.porteesInconnues) {
      l.push(['   portées hors catalogue', ctx.porteesInconnues]);
    }
  }

  if (ctx.bilan) {
    l.push(['', '']);
    l.push(['Classement des applications', '']);
    l.push(['   non classées', ctx.bilan.nonClassees]);
    for (const [statut, n] of classer_(ctx.bilan.parStatut)) l.push([`   ${statut}`, n]);
    if (ctx.bilan.expirees) l.push(['   dont décisions périmées', ctx.bilan.expirees]);
    if (ctx.ajouts && ctx.ajouts.nouvelles) {
      l.push(['   apparues depuis la dernière campagne', ctx.ajouts.nouvelles]);
    }
  }

  const etats = {};
  for (const c of couples.values()) {
    const e = etatPresume_(c);
    etats[e] = (etats[e] || 0) + 1;
  }
  l.push(['', '']);
  l.push(['État présumé des couples', '']);
  for (const [nom, n] of classer_(etats)) l.push([`   ${nom}`, n]);

  l.push(['', '']);
  l.push(['Par type d\'événement', '']);
  for (const [nom, n] of classer_(ctx.parEvenement)) l.push([`   ${nom}`, n]);

  if (Object.keys(ctx.motifsRefus).length) {
    l.push(['', '']);
    l.push(['Motifs de refus', '']);
    for (const [nom, n] of classer_(ctx.motifsRefus)) l.push([`   ${nom}`, n]);
  }

  l.push(['', '']);
  l.push(['Volumétrie', '']);
  l.push(['   Événements portant un volume', ctx.evenementsAvecOctets]);
  l.push(['   Volume cumulé', ctx.evenementsAvecOctets
    ? octets_(ctx.octetsTotal) : 'non journalisé sur cette période']);
  if (ctx.evenementsAvecOctets) {
    l.push([`   Volume sur ${FENETRE_RECENTE_JOURS_} jours`, octets_(ctx.octets30)]);
    l.push(['   Couples application/service', ctx.services]);
    if (ctx.palmares && ctx.palmares.length) {
      l.push(['', '']);
      l.push([`Plus consommatrices sur ${FENETRE_RECENTE_JOURS_} jours`, '']);
      for (const a of ctx.palmares) l.push([`   ${a.nom}`, octets_(a.octets30)]);
    }
  }

  l.push(['', '']);
  l.push(['Comptes par domaine', '']);
  for (const [nom, n] of classer_(ctx.parDomaine).slice(0, 15)) l.push([`   ${nom}`, n]);

  poser_(f, l, false);
};

const ecrireApplications_ = (classeur, apps, decisions, lg) => {
  const f = onglet_(classeur, 'applications', [
    'application', 'clientId', 'statut', 'revoirAvant', 'priorite', 'niveauMax',
    'administration', 'type', 'autorisants', 'dontPrivileges', 'dontSuspendus',
    'autorisations', 'revocations', 'refus', 'appels', 'volume', 'volumeOctets',
    'volumeRecent', 'appelsRecents',
    'portees', 'familles', 'motifs', 'premiereVue', 'derniereVue'
  ], lg);
  const l = [...apps.values()]
    .map((a) => {
      const familles = [...new Set([...a.portees].map(famille_))].sort();
      const d = decisions.get(a.cid);
      // Une décision périmée n'est pas une décision : on l'affiche comme telle,
      // pour que l'application retombe sous les yeux plutôt que de se faire
      // oublier derrière une approbation d'il y a deux ans.
      const statut = !d || !d.statut ? 'non classée'
        : d.expiree ? `${d.statut} (périmée)` : d.statut;
      return [
        a.nom, a.cid, statut, d ? d.revoirAvant : '',
        a.evaluation.points, a.niveauMax || '', a.administration ? 'oui' : '',
        a.clientType, a.autorisants.size, a.aPrivileges.size, a.suspendus.size,
        a.autorisations, a.revocations, a.refus, a.activites,
        a.octets ? octets_(a.octets) : '', a.octets || '',
        a.octets30 ? octets_(a.octets30) : '', a.appels30 || '',
        a.portees.size, familles.join(', '), a.evaluation.motifs,
        a.premiere, a.derniere
      ];
    })
    // Les non classées d'abord, puis par priorité décroissante : la file de
    // travail se lit de haut en bas, sans avoir à trier soi-même.
    .sort((x, y) => (Number(y[2] === 'non classée') - Number(x[2] === 'non classée'))
      || (y[4] - x[4]) || (y[8] - x[8]));
  poser_(f, l, true);
};

/**
 * Ce que dit l'inventaire, tenu à part de ce que présume le journal.
 *
 * Sans relevé, la colonne reste vide : ne pas avoir inventorié n'est pas la
 * même chose que n'avoir trouvé aucun jeton, et les confondre ferait passer
 * tout le parc pour révoqué. Un fait et une présomption ne se mélangent pas
 * dans une même cellule.
 */
const etatJeton_ = (c, inventaire) => {
  if (!inventaire) return '';
  return c.jetonActif ? 'actif' : 'clos';
};

const ecrireAutorisants_ = (classeur, couples, inventaire, lg) => {
  const f = onglet_(classeur, 'autorisants', [
    'compte', 'domaine', 'profil', 'application', 'clientId', 'jeton',
    'autorisations', 'revocations', 'refus', 'appels', 'etatPresume',
    'demandePar', 'portees', 'premiere', 'derniere'
  ], lg);
  const l = [...couples.values()]
    .map((c) => [
      c.compte, c.domaine, c.profil, c.nom, c.cid, etatJeton_(c, inventaire),
      c.autorisations, c.revocations, c.refus, c.activites, etatPresume_(c),
      c.demandeur, [...c.portees].join(' '), c.premiere, c.derniere
    ])
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : (x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : 0)));
  poser_(f, l, true);
};

const ecrirePortees_ = (classeur, portees, lg) => {
  const f = onglet_(classeur, 'portees', [
    'porteeOuPrefixe', 'niveau', 'administration', 'auCatalogue', 'famille',
    'applications', 'comptes', 'occurrences'
  ], lg);
  const l = [...portees.entries()]
    .map(([p, e]) => [p, e.niveau, e.administration ? 'oui' : '', e.connue ? 'oui' : 'NON',
      e.famille, e.apps.size, e.comptes.size, e.occurrences])
    // Les portées hors catalogue d'abord : un trou qu'on ne voit pas ne se
    // comble jamais.
    .sort((x, y) => (Number(x[3] === 'NON') - Number(y[3] === 'NON'))
      || (NIVEAUX_.indexOf(x[1]) - NIVEAUX_.indexOf(y[1])) || (y[5] - x[5]));
  poser_(f, l, true);
};
