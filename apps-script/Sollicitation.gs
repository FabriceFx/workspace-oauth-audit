/**
 * Sollicitation des autorisants — v0.3.
 *
 * Écrit aux comptes qui ont autorisé une application tierce pour leur demander
 * à quoi elle sert, leur rappeler comment retirer eux-mêmes un accès, et leur
 * transmettre les règles de nommage des projets Apps Script.
 *
 * PLAN PUIS ENVOI, JAMAIS D'ENVOI AUTOMATIQUE
 *
 * `preparerSollicitations()` construit un plan dans l'onglet Sollicitations —
 * une ligne par compte, les applications concernées, rien n'est envoyé. On lit
 * ce plan, on retire les lignes qui n'ont pas lieu d'être, puis
 * `envoyerSollicitations()` demande confirmation en annonçant le nombre exact
 * de destinataires avant de partir.
 *
 * Sur 8 500 comptes, une erreur de ciblage ne se rattrape pas : un courriel
 * parti est parti. D'où trois protections qui ne se contournent pas —
 *
 *   un courriel par PERSONNE, listant toutes ses applications, jamais un
 *   courriel par application : sinon quelqu'un qui a autorisé six outils en
 *   reçoit six ;
 *
 *   l'état de chaque ligne passe à « envoyé » immédiatement après l'envoi, si
 *   bien qu'une interruption ne peut pas produire de doublon à la reprise ;
 *
 *   le quota d'envoi restant est lu avant de commencer, et l'envoi s'arrête
 *   avant de l'épuiser : le reste part le lendemain, plutôt que d'échouer à
 *   mi-parcours.
 *
 * MailApp, et non GmailApp : MailApp ne sait qu'envoyer. Aucune portée de
 * lecture de la messagerie n'est demandée, et aucune ne pourrait l'être.
 */

const ONGLET_SOLLICITATIONS_ = 'Sollicitations';
const ONGLET_MODELE_ = 'Modèle';

const COLONNES_SOLLICITATIONS_ = [
  'Compte', 'Domaine', 'Applications', 'Détail', 'État', 'Préparé le',
  'Envoyé le', 'Relances', 'Réponse'
];

/** États d'un accès qui méritent qu'on écrive à la personne. */
const ETATS_A_SOLLICITER_ = new Set(['présumé actif', 'antérieur à la fenêtre']);

/** Sécurité : au-delà, on refuse d'envoyer sans que le plan ait été réduit. */
const PLAFOND_ENVOI_ = 500;

/** Marge laissée au quota quotidien, pour ne pas le racler jusqu'à l'os. */
const MARGE_QUOTA_ = 10;

// ------------------------------------------------------- référentiel éditable

/**
 * Paramètres du courriel, tenus dans le classeur et non dans le code : les
 * ajuster ne demande aucun déploiement. La prose, elle, reste ici — c'est une
 * structure, pas une donnée, et elle se relit mal dans une cellule.
 */
const MODELE_DEFAUT_ = [
  ['Paramètre', 'Valeur'],
  ['Objet', 'Applications tierces connectées à votre compte Google — pouvez-vous nous éclairer ?'],
  ['Délai de réponse (jours)', 15],
  ['Contact', ''],
  ['Signature', 'L\'équipe sécurité du système d\'information'],
  ['Phrase d\'introduction',
    'Nous passons en revue les applications tierces connectées aux comptes Google '
    + 'de l\'organisation. Votre compte apparaît comme ayant autorisé les '
    + 'applications ci-dessous.'],
  ['', ''],
  ['Règles de nommage des projets Apps Script', ''],
  ['1', 'Jamais « Projet sans titre ». Le nom du projet est la seule identification '
    + 'visible dans le journal d\'audit et dans la liste des applications connectées : '
    + 'un projet anonyme est un accès que personne ne peut rattacher à un usage.'],
  ['2', 'Forme retenue : ÉQUIPE — Objet — ÉTAT. Par exemple « SI — Relance des '
    + 'factures — PROD ».'],
  ['3', 'Trois états seulement : PROD pour ce qui tourne, TEST pour ce qui est en '
    + 'recette, BAC pour un bac à sable. Un projet BAC de plus de six mois est un '
    + 'projet à supprimer.'],
  ['4', 'Aucun nom de personne ni donnée personnelle dans le titre : ces noms '
    + 'ressortent en clair dans les exports d\'audit, qui circulent plus loin que '
    + 'le projet.'],
  ['5', 'Objet en français, explicite, sans sigle interne non documenté. Le nom doit '
    + 'rester lisible par quelqu\'un qui découvre le projet dans trois ans.'],
  ['6', 'Un projet, un usage. Empiler des scripts sans rapport dans un même projet '
    + 'additionne leurs autorisations : le projet finit par détenir des accès que '
    + 'plus personne ne sait justifier.'],
  ['7', 'Renommer un projet existant se fait sans risque, dans Paramètres du projet. '
    + 'Les autorisations déjà accordées peuvent continuer d\'afficher l\'ancien nom '
    + 'jusqu\'à leur renouvellement — raison de plus pour nommer correctement dès '
    + 'la création.']
];

const feuilleAvecDefaut_ = (classeur, nom, contenu) => {
  const existante = classeur.getSheetByName(nom);
  if (existante) return existante;
  const f = classeur.insertSheet(nom);
  f.getRange(1, 1, contenu.length, contenu[0].length).setValues(contenu);
  f.getRange(1, 1, 1, contenu[0].length).setFontWeight('bold');
  f.setFrozenRows(1);
  f.setColumnWidth(2, 640);
  f.getRange(1, 1, contenu.length, contenu[0].length).setWrap(true);
  return f;
};

const lireModele_ = (classeur) => {
  const f = feuilleAvecDefaut_(classeur, ONGLET_MODELE_, MODELE_DEFAUT_);
  const valeurs = f.getDataRange().getValues();
  const params = {};
  const regles = [];
  let dansRegles = false;
  for (const [cle, valeur] of valeurs.slice(1)) {
    const k = String(cle).trim();
    if (k.startsWith('Règles de nommage')) { dansRegles = true; continue; }
    if (!k) continue;
    if (dansRegles) { if (String(valeur).trim()) regles.push(String(valeur).trim()); }
    else params[k] = valeur;
  }
  return { params, regles };
};

/*
 * Il n'y a plus de liste d'exclusion séparée. Une application qu'on ne sollicite
 * plus est une application qu'on a jugée, et ce jugement vit dans l'onglet
 * Décisions, avec son motif, son auteur et son échéance. Deux listes auraient
 * fini par diverger, et l'on aurait tu une application sans savoir qui l'avait
 * décidé ni quand.
 */

// ------------------------------------------------------------------- le plan

/**
 * Regroupe l'onglet Autorisants par compte, en n'y gardant que ce qui mérite
 * une sollicitation.
 *
 * Cette fonction sert au plan ET à l'envoi. L'envoi relit ainsi la source
 * plutôt que de réinterpréter la colonne Détail du plan : un nom d'application
 * contenant une parenthèse ou une barre verticale suffirait à faire dérailler
 * une telle relecture, et le courriel partirait avec du charabia.
 */
const grouperAutorisants_ = (classeur) => {
  const autorisants = classeur.getSheetByName('Autorisants');
  if (!autorisants || autorisants.getLastRow() < 2) return null;
  const silencieuses = decisionsSilencieuses_(classeur);

  const valeurs = autorisants.getDataRange().getValues();
  const entetes = valeurs[0];
  const iCompte = entetes.indexOf('Compte');
  const iDomaine = entetes.indexOf('Domaine');
  const iApp = entetes.indexOf('Application');
  const iCid = entetes.indexOf('client_id');
  const iEtat = entetes.indexOf('État présumé');
  const iPortees = entetes.indexOf('Portées');
  const iPremiere = entetes.indexOf('Première');

  const parCompte = new Map();
  let ecartesApprouvees = 0;
  let ecartesEtat = 0;

  for (const l of valeurs.slice(1)) {
    const compte = String(l[iCompte] || '').trim();
    if (!compte || compte.indexOf('@') < 0) continue;
    if (!ETATS_A_SOLLICITER_.has(String(l[iEtat] || '').trim())) { ecartesEtat++; continue; }
    const app = String(l[iApp] || '').trim();
    const cid = String(l[iCid] || '').trim();
    if (silencieuses.has(cid.toLowerCase())) {
      ecartesApprouvees++;
      continue;
    }
    if (!parCompte.has(compte)) {
      parCompte.set(compte, { compte, domaine: String(l[iDomaine] || ''), apps: [] });
    }
    const familles = [...new Set(String(l[iPortees] || '').split(' ')
      .filter(Boolean).map(famille_))].sort();
    const nom = app || cid || '(sans nom)';
    const depuis = jour_(l[iPremiere]);
    const groupe = parCompte.get(compte);

    // Deux identifiants OAuth portant le même nom — cas courant d'un projet
    // déployé deux fois — ne font qu'une ligne : le destinataire ne peut pas
    // les distinguer, et lui présenter deux fois « workspace-console » ne lui
    // apprend rien qu'il puisse utiliser.
    const jumelle = groupe.apps.find((a) => a.nom === nom);
    if (jumelle) {
      for (const f of familles) if (!jumelle.familles.includes(f)) jumelle.familles.push(f);
      if (depuis && (!jumelle.depuis || depuis < jumelle.depuis)) jumelle.depuis = depuis;
      continue;
    }
    groupe.apps.push({ nom, depuis, etat: String(l[iEtat] || ''), familles });
  }
  return { parCompte, ecartesEtat, ecartesApprouvees };
};

function preparerSollicitations() {
  const classeur = classeurCourant_();
  const groupes = grouperAutorisants_(classeur);
  if (!groupes) {
    dire_('L\'onglet Autorisants est absent ou vide : il n\'y a personne à solliciter.');
    dire_('Moissonner le journal d\'abord.');
    vider_('Rien à préparer');
    return;
  }
  const { parCompte, ecartesEtat, ecartesApprouvees } = groupes;
  const dejaEnvoye = etatsExistants_(classeur);

  const f = onglet_(classeur, ONGLET_SOLLICITATIONS_, COLONNES_SOLLICITATIONS_);
  const aujourdhui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const lignes = [...parCompte.values()]
    .sort((a, b) => b.apps.length - a.apps.length)
    .map((p) => {
      const ancien = dejaEnvoye.get(p.compte);
      return [
        p.compte, p.domaine, p.apps.length,
        p.apps.map((a) => `${a.nom} (${a.familles.join(', ')}, vu depuis ${a.depuis})`).join(' | '),
        ancien ? ancien.etat : 'à envoyer',
        aujourdhui,
        ancien ? ancien.envoyeLe : '',
        ancien ? ancien.relances : 0,
        ancien ? ancien.reponse : ''
      ];
    });
  poser_(f, lignes, true);

  dire_(`Plan préparé : ${lignes.length} compte(s) à solliciter, `
    + `${[...parCompte.values()].reduce((n, p) => n + p.apps.length, 0)} application(s).`);
  dire_('');
  dire_(`Écartés : ${ecartesEtat} couple(s) dont l'état ne le justifie pas `
    + '(révoqué, refusé, sans trace),');
  dire_(`          ${ecartesApprouvees} couple(s) portant sur une application jugée`);
  dire_('          approuvée ou tolérée, décision en vigueur.');
  dire_('');
  dire_('RIEN N\'EST ENVOYÉ. Relisez l\'onglet Sollicitations, supprimez les lignes');
  dire_('qui n\'ont pas lieu d\'être, puis « Envoyer les sollicitations ».');
  dire_('');
  dire_(`Le texte du courriel et les règles de nommage se modifient dans l'onglet `
    + `${ONGLET_MODELE_}. Pour cesser de solliciter une application, jugez-la`);
  dire_(`« approuvée » ou « tolérée » dans l'onglet ${ONGLET_DECISIONS_}.`);
  dire_('Commencez par vous envoyer un exemplaire à vous-même : « Envoyer un exemple ».');
  vider_('Plan de sollicitation');
}

/** Ce qui a déjà été envoyé, pour ne pas l'oublier en reconstruisant le plan. */
const etatsExistants_ = (classeur) => {
  const f = classeur.getSheetByName(ONGLET_SOLLICITATIONS_);
  const connus = new Map();
  if (!f || f.getLastRow() < 2) return connus;
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  for (const l of valeurs.slice(1)) {
    const compte = String(l[e.indexOf('Compte')] || '').trim();
    if (!compte) continue;
    connus.set(compte, {
      etat: String(l[e.indexOf('État')] || 'à envoyer'),
      envoyeLe: l[e.indexOf('Envoyé le')] || '',
      relances: l[e.indexOf('Relances')] || 0,
      reponse: l[e.indexOf('Réponse')] || ''
    });
  }
  return connus;
};

// ------------------------------------------------------------------- courriel

const corpsCourriel_ = (destinataire, apps, modele) => {
  const { params, regles } = modele;
  const delai = params['Délai de réponse (jours)'] || 15;
  const contact = String(params.Contact || '').trim();
  const signature = params.Signature || '';
  const intro = params['Phrase d\'introduction'] || '';

  const lignesApps = apps.map((a) => `
    <tr>
      <td style="padding:6px 12px 6px 0">${echapper_(a.nom)}</td>
      <td style="padding:6px 12px 6px 0">${echapper_(enClair_(a.familles))}</td>
      <td style="padding:6px 0">${echapper_(a.depuis)}</td>
    </tr>`).join('');

  const lignesRegles = regles.map((r) => `<li style="margin:6px 0">${echapper_(r)}</li>`).join('');

  const html = `
<div style="font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#202124;max-width:640px">
  <p>Bonjour,</p>
  <p>${echapper_(intro)}</p>

  <table style="border-collapse:collapse;margin:18px 0">
    <tr style="border-bottom:1px solid #dadce0;text-align:left">
      <th style="padding:6px 12px 6px 0">Application</th>
      <th style="padding:6px 12px 6px 0">Accède à</th>
      <th style="padding:6px 0">Autorisée depuis</th>
    </tr>
    ${lignesApps}
  </table>

  <p><strong>Ce que nous vous demandons</strong>, pour chacune :</p>
  <ol>
    <li>à quoi elle vous sert, en une phrase ;</li>
    <li>si elle vous est encore nécessaire aujourd'hui ;</li>
    <li>si d'autres personnes s'en servent, et lesquelles.</li>
  </ol>

  <p><strong>Si vous ne la reconnaissez pas, ou si elle ne vous sert plus</strong>, vous
  pouvez retirer son accès vous-même, en quelques secondes et sans nous attendre :
  <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
  Dites-le-nous simplement, pour que nous n'ayons pas à revenir vers vous.</p>

  <p style="background:#f8f9fa;border-left:3px solid #dadce0;padding:10px 14px">
  Une autorisation accordée ne s'arrête jamais d'elle-même : elle reste valable
  jusqu'à ce que quelqu'un la retire. C'est pourquoi nous les passons en revue.
  Une application autorisée « pour essayer » il y a deux ans a toujours accès
  aujourd'hui.</p>

  ${regles.length ? `
  <p><strong>Si l'une de ces applications est un projet Apps Script que vous avez
  créé</strong>, voici les règles de nommage à appliquer. Un projet mal nommé est un
  accès que personne ne peut rattacher à un usage — et c'est aujourd'hui le premier
  obstacle à cette revue.</p>
  <ol>${lignesRegles}</ol>` : ''}

  <p>Merci de nous répondre sous <strong>${echapper_(delai)} jours</strong>${
    contact ? `, à ${echapper_(contact)}` : ', par simple réponse à ce message'}.
  Sans réponse, les accès concernés seront réexaminés et pourront être retirés.</p>

  <p>${echapper_(signature)}</p>
</div>`;

  const texte = [
    'Bonjour,', '', intro, '',
    ...apps.map((a) => `  - ${a.nom} — accède à ${enClair_(a.familles)} — vue depuis ${a.depuis}`),
    '',
    'Pour chacune : à quoi elle vous sert, si elle vous est encore nécessaire,',
    'et qui d\'autre s\'en sert.', '',
    'Si vous ne la reconnaissez pas ou qu\'elle ne vous sert plus, vous pouvez',
    'retirer son accès vous-même : https://myaccount.google.com/permissions', '',
    'Une autorisation accordée ne s\'arrête jamais d\'elle-même : elle reste',
    'valable jusqu\'à ce que quelqu\'un la retire.', '',
    ...(regles.length ? ['Règles de nommage des projets Apps Script :',
      ...regles.map((r, i) => `  ${i + 1}. ${r}`), ''] : []),
    `Merci de nous répondre sous ${delai} jours${contact ? `, à ${contact}` : ''}.`,
    '', signature
  ].join('\n');

  return { html, texte };
};

// -------------------------------------------------------------------- l'envoi

function envoyerSollicitationExemple() {
  const classeur = classeurCourant_();
  const modele = lireModele_(classeur);
  const moi = Session.getActiveUser().getEmail();
  const exemple = [
    { nom: 'SI — Relance des factures — PROD', familles: ['drive', 'gmail'], depuis: '2026-03-12' },
    { nom: 'Projet sans titre', familles: ['drive', 'script'], depuis: '2026-05-02' }
  ];
  const { html, texte } = corpsCourriel_(moi, exemple, modele);
  MailApp.sendEmail({
    to: moi,
    subject: `[EXEMPLE] ${modele.params.Objet}`,
    body: texte,
    htmlBody: html
  });
  dire_(`Exemplaire envoyé à ${moi}, avec deux applications fictives.`);
  dire_('');
  dire_('Relisez-le comme le recevra un collègue : le ton, le délai, le contact, et');
  dire_('surtout les règles de nommage, qui se modifient dans l\'onglet '
    + `${ONGLET_MODELE_}.`);
  vider_('Exemple envoyé');
}

function envoyerSollicitations() {
  const classeur = classeurCourant_();
  const f = classeur.getSheetByName(ONGLET_SOLLICITATIONS_);
  if (!f || f.getLastRow() < 2) {
    dire_('Aucun plan à envoyer. Préparez-le d\'abord.');
    vider_('Rien à envoyer');
    return;
  }
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCompte = e.indexOf('Compte');
  const iEtat = e.indexOf('État');
  const iEnvoye = e.indexOf('Envoyé le');

  const groupes = grouperAutorisants_(classeur);
  if (!groupes) {
    dire_('L\'onglet Autorisants a disparu : impossible de savoir quoi écrire à qui.');
    dire_('Rien n\'est parti. Remoissonnez, puis repréparez le plan.');
    vider_('Envoi impossible');
    return;
  }

  const aEnvoyer = [];
  valeurs.slice(1).forEach((l, i) => {
    const compte = String(l[iCompte]).trim();
    if (String(l[iEtat]).trim() !== 'à envoyer' || compte.indexOf('@') < 0) return;
    const groupe = groupes.parCompte.get(compte);
    if (!groupe) return;   // le plan est plus vieux que la source : on saute
    aEnvoyer.push({ ligne: i + 2, compte, apps: groupe.apps });
  });

  if (!aEnvoyer.length) {
    dire_('Aucune ligne à l\'état « à envoyer ».');
    vider_('Rien à envoyer');
    return;
  }
  if (aEnvoyer.length > PLAFOND_ENVOI_) {
    dire_(`${aEnvoyer.length} destinataires : au-delà du plafond de ${PLAFOND_ENVOI_} `
      + 'fixé dans le code.');
    dire_('');
    dire_('Ce plafond n\'est pas une limite technique, c\'est un cran d\'arrêt. Un envoi');
    dire_('de cette ampleur se fait par vagues — filtrez l\'onglet par domaine ou par');
    dire_('service, mettez à « ne pas envoyer » ce qui attendra, et recommencez.');
    vider_('Envoi refusé');
    return;
  }

  const quota = MailApp.getRemainingDailyQuota();
  const possible = Math.max(0, Math.min(aEnvoyer.length, quota - MARGE_QUOTA_));
  if (!possible) {
    dire_(`Quota d'envoi épuisé pour aujourd'hui (${quota} restant). Reprenez demain :`);
    dire_('les lignes déjà envoyées ne le seront pas deux fois.');
    vider_('Quota épuisé');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const question = `${aEnvoyer.length} compte(s) sont à l'état « à envoyer ».\n\n`
    + `${possible} courriel(s) vont partir maintenant`
    + (possible < aEnvoyer.length
      ? `, le reste demain (quota du jour : ${quota}).` : '.')
    + '\n\nCes courriels partent à de vraies personnes et ne peuvent pas être '
    + 'rappelés.\n\nEnvoyer ?';
  if (ui.alert('Envoyer les sollicitations', question, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
    dire_('Envoi annulé. Rien n\'est parti.');
    vider_('Annulé');
    return;
  }

  const modele = lireModele_(classeur);
  const aujourdhui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const t0 = Date.now();
  let envoyes = 0;
  let erreurs = 0;

  for (const cible of aEnvoyer.slice(0, possible)) {
    if (Date.now() - t0 > BUDGET_MS) break;
    try {
      const { html, texte } = corpsCourriel_(cible.compte, cible.apps, modele);
      MailApp.sendEmail({
        to: cible.compte, subject: modele.params.Objet, body: texte, htmlBody: html
      });
      // Marqué tout de suite : une interruption ne peut pas produire de doublon.
      f.getRange(cible.ligne, iEtat + 1).setValue('envoyé');
      f.getRange(cible.ligne, iEnvoye + 1).setValue(aujourdhui);
      SpreadsheetApp.flush();
      envoyes++;
    } catch (err) {
      erreurs++;
      f.getRange(cible.ligne, iEtat + 1).setValue(`échec : ${err.message || err}`);
      SpreadsheetApp.flush();
    }
  }

  dire_(`${envoyes} courriel(s) envoyé(s).`);
  if (erreurs) dire_(`${erreurs} échec(s), inscrits dans la colonne État.`);
  const reste = aEnvoyer.length - envoyes - erreurs;
  if (reste > 0) {
    dire_(`${reste} compte(s) restent à l'état « à envoyer » — quota du jour ou budget`);
    dire_('de temps atteint. Relancez : rien ne partira deux fois.');
  }
  dire_('');
  dire_(`Quota d'envoi restant aujourd'hui : ${MailApp.getRemainingDailyQuota()}.`);
  vider_('Sollicitations envoyées');
}
