/**
 * Fiche d'une application — v1.0.
 *
 * Ce qui circule hors du classeur, c'est la fiche, jamais l'inventaire. Un
 * comité de sécurité n'a pas à recevoir la cartographie complète des points
 * d'entrée du tenant pour statuer sur une application : il lui faut cette
 * application, ses portées, ses autorisants, ce qu'elle a extrait, et le calcul
 * qui l'a mise en tête de file.
 *
 * La fiche s'affiche dans un dialogue et s'imprime — le navigateur en fait un
 * PDF. Aucune portée Drive n'est demandée pour produire un fichier : ce serait
 * payer cher une commodité, et laisser dans le Drive des copies qu'on ne
 * suivrait plus.
 *
 * CHAQUE CHIFFRE EST EXPLIQUÉ SUR LA FICHE
 *
 * Elle est faite pour être lue par quelqu'un qui ne connaît pas l'outil. Les
 * termes du domaine — portée restreinte, accès dormant, jeton — y sont définis
 * en une ligne, à l'endroit où ils apparaissent.
 */

const ONGLETS_FICHE_ = ['Applications', 'À instruire', 'Décisions', 'Dormants'];

/** Retrouve le client_id sur la ligne active, quel que soit l'onglet. */
const cidSelectionne_ = (classeur) => {
  const f = classeur.getActiveSheet();
  if (ONGLETS_FICHE_.indexOf(f.getName()) < 0) {
    throw new Error('Placez-vous sur une ligne des onglets Applications, '
      + 'À instruire, Décisions ou Dormants, puis relancez.');
  }
  const ligne = classeur.getActiveRange().getRow();
  if (ligne < 2) throw new Error('Sélectionnez la ligne de l\'application, pas l\'en-tête.');
  const entetes = f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0];
  const iCid = entetes.indexOf('client_id');
  if (iCid < 0) throw new Error(`L'onglet ${f.getName()} ne porte pas de client_id.`);
  const cid = String(f.getRange(ligne, iCid + 1).getValue() || '').trim();
  if (!cid) throw new Error('Aucun client_id sur cette ligne.');
  return cid;
};

/** Rassemble tout ce que le classeur sait d'une application. */
const dossier_ = (classeur, cid) => {
  const lire = (nom) => {
    const f = classeur.getSheetByName(nom);
    if (!f || f.getLastRow() < 2) return { entetes: [], lignes: [] };
    const v = f.getDataRange().getValues();
    return { entetes: v[0], lignes: v.slice(1) };
  };
  const colonne = (entetes, nom) => entetes.indexOf(nom);

  const apps = lire('Applications');
  const iCid = colonne(apps.entetes, 'client_id');
  const app = apps.lignes.find((l) => String(l[iCid]).trim() === cid);
  if (!app) throw new Error(`Application ${cid} introuvable dans l'onglet Applications.`);

  const champ = (nom) => {
    const i = colonne(apps.entetes, nom);
    return i < 0 ? '' : app[i];
  };

  const aut = lire('Autorisants');
  const iAutCid = colonne(aut.entetes, 'client_id');
  const autorisants = aut.lignes.filter((l) => String(l[iAutCid]).trim() === cid)
    .map((l) => ({
      compte: l[colonne(aut.entetes, 'Compte')],
      profil: l[colonne(aut.entetes, 'Profil')],
      jeton: l[colonne(aut.entetes, 'Jeton')],
      etat: l[colonne(aut.entetes, 'État présumé')],
      premiere: l[colonne(aut.entetes, 'Première')]
    }));

  const vol = lire('Volumétrie');
  const iVolCid = colonne(vol.entetes, 'client_id');
  const services = iVolCid < 0 ? [] : vol.lignes
    .filter((l) => String(l[iVolCid]).trim() === cid)
    .map((l) => ({
      service: l[colonne(vol.entetes, 'Service')],
      appels: l[colonne(vol.entetes, 'Appels')],
      volume: l[colonne(vol.entetes, 'Volume')]
    }));

  const dec = lire('Décisions');
  const iDecCid = colonne(dec.entetes, 'client_id');
  const decision = dec.lignes.find((l) => String(l[iDecCid]).trim() === cid);
  const champDec = (nom) => {
    if (!decision) return '';
    const i = colonne(dec.entetes, nom);
    return i < 0 ? '' : decision[i];
  };

  const port = lire('Portées');
  const iPortCid = colonne(port.entetes, 'Portée');
  const portees = new Set();
  const iAutPortees = colonne(aut.entetes, 'Portées');
  for (const l of aut.lignes) {
    if (String(l[iAutCid]).trim() !== cid) continue;
    for (const p of String(l[iAutPortees] || '').split(' ').filter(Boolean)) portees.add(p);
  }
  const niveaux = new Map();
  for (const l of port.lignes) {
    niveaux.set(String(l[iPortCid]).trim(), {
      niveau: l[colonne(port.entetes, 'Niveau')],
      administration: l[colonne(port.entetes, 'Administration')]
    });
  }

  return {
    cid,
    nom: champ('Application'),
    statut: champ('Statut'),
    revoirAvant: champ('Revoir avant'),
    priorite: champ('Priorité'),
    niveauMax: champ('Niveau max'),
    administration: champ('Administration'),
    autorisantsNb: champ('Autorisants'),
    privileges: champ('dont à privilèges'),
    suspendus: champ('dont suspendus'),
    volume: champ('Volume'),
    volume30: champ(`Volume ${FENETRE_RECENTE_JOURS_} j`),
    motifs: champ('Motifs'),
    premiere: champ('Première vue'),
    derniere: champ('Dernière vue'),
    autorisants,
    services,
    portees: [...portees].sort(),
    niveaux,
    motifDecision: champDec('Motif'),
    decidePar: champDec('Décidé par'),
    decideLe: champDec('Le')
  };
};

const NOTE_ = {
  restreinte: 'Portée restreinte au sens de Google : accès complet ou en lecture '
    + 'à Gmail ou à tout Drive.',
  sensible: 'Portée sensible : accès à des données personnelles, sans atteindre '
    + 'le niveau restreint.',
  basique: 'Portée basique : identité, ou fichiers créés par l\'application '
    + 'elle-même.'
};

/**
 * Deux usages, une seule fiche.
 *
 * Dans le classeur, l'administrateur voit déjà les comptes : les masquer
 * n'aurait aucun sens. Sur la vue de consultation, ils disparaissent — un comité
 * statue sur une application, pas sur des personnes nommées, et cette page
 * s'adresse à des lecteurs qui n'ont aucun droit sur le tenant.
 */
const ficheHtml_ = (d, options) => {
  const { avecComptes = true, avecImpression = true } = options || {};
  const ligne = (cle, valeur, note) => valeur === '' || valeur === undefined ? '' : `
    <tr>
      <th style="text-align:left;padding:5px 16px 5px 0;font-weight:600;white-space:nowrap;vertical-align:top">${echapper_(cle)}</th>
      <td style="padding:5px 0">${echapper_(valeur)}${
        note ? `<div style="color:#5f6368;font-size:12px;margin-top:2px">${echapper_(note)}</div>` : ''}</td>
    </tr>`;

  const portees = d.portees.map((p) => {
    const n = d.niveaux.get(p) || {};
    const couleur = n.niveau === 'restreinte' ? '#c5221f'
      : n.niveau === 'sensible' ? '#b06000' : '#5f6368';
    return `<li style="margin:3px 0"><code style="font-size:12px">${echapper_(p)}</code>
      <span style="color:${couleur};font-size:12px"> — ${echapper_(n.niveau || 'non classée')}${
      n.administration === 'oui' ? ', administration du domaine' : ''}</span></li>`;
  }).join('');

  const autorisants = !avecComptes ? '' : d.autorisants.slice(0, 40).map((a) => `
    <tr>
      <td style="padding:3px 16px 3px 0">${echapper_(a.compte)}</td>
      <td style="padding:3px 16px 3px 0;color:#5f6368">${echapper_(a.profil || '')}</td>
      <td style="padding:3px 16px 3px 0">${echapper_(a.jeton || '—')}</td>
      <td style="padding:3px 0;color:#5f6368">${echapper_(a.etat || '')}</td>
    </tr>`).join('');

  const services = d.services.map((s) => `
    <tr><td style="padding:3px 16px 3px 0">${echapper_(s.service)}</td>
    <td style="padding:3px 16px 3px 0">${echapper_(s.appels)} appels</td>
    <td style="padding:3px 0">${echapper_(s.volume)}</td></tr>`).join('');

  return `
<div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#202124">
  ${avecImpression ? `<button onclick="window.print()"
    style="float:right;padding:6px 14px;cursor:pointer"
    class="sans-impression">Imprimer / PDF</button>
  <style>@media print { .sans-impression { display:none } }</style>` : ''}

  <h2 style="margin:0 0 2px">${echapper_(d.nom)}</h2>
  <div style="color:#5f6368;font-size:12px;margin-bottom:14px">
    <code>${echapper_(d.cid)}</code></div>

  <table style="border-collapse:collapse;margin-bottom:16px">
    ${ligne('Statut', d.statut, d.motifDecision
      ? `${d.motifDecision}${d.decidePar ? ` — ${d.decidePar}` : ''}${d.decideLe ? `, le ${d.decideLe}` : ''}`
      : 'Aucune décision inscrite au référentiel.')}
    ${ligne('Revoir avant', d.revoirAvant, 'Passée cette date, la décision est caduque et l\'application revient dans la file.')}
    ${ligne('Priorité', d.priorite, d.motifs || 'Rien ne la signale.')}
    ${ligne('Gravité maximale', d.niveauMax, NOTE_[d.niveauMax] || '')}
    ${ligne('Administration du domaine', d.administration === 'oui' ? 'oui' : '',
      'L\'application détient une portée qui donne prise sur le tenant lui-même.')}
    ${ligne('Autorisants', d.autorisantsNb,
      `dont ${d.privileges || 0} à privilèges et ${d.suspendus || 0} suspendu(s)`)}
    ${ligne('Volume extrait', d.volume, `dont ${d.volume30 || '0 o'} sur ${FENETRE_RECENTE_JOURS_} jours`)}
    ${ligne('Vue du', `${d.premiere} au ${d.derniere}`,
      'Bornes observées dans le journal d\'audit, qui ne remonte pas au-delà de 180 jours.')}
  </table>

  <h3 style="margin:18px 0 6px;font-size:14px">Portées obtenues</h3>
  <ul style="margin:0;padding-left:18px">${portees || '<li>Aucune portée relevée.</li>'}</ul>

  ${services ? `<h3 style="margin:18px 0 6px;font-size:14px">Ce qu'elle a réellement lu</h3>
  <table style="border-collapse:collapse">${services}</table>` : ''}

  ${avecComptes ? `<h3 style="margin:18px 0 6px;font-size:14px">Comptes concernés</h3>
  <table style="border-collapse:collapse">
    <tr style="text-align:left;color:#5f6368;font-size:12px">
      <th style="padding-right:16px">Compte</th><th style="padding-right:16px">Profil</th>
      <th style="padding-right:16px">Jeton</th><th>Journal</th>
    </tr>
    ${autorisants}
  </table>
  ${d.autorisants.length > 40
    ? `<div style="color:#5f6368;font-size:12px;margin-top:6px">…et ${d.autorisants.length - 40} autres. La liste complète est dans l'onglet Autorisants.</div>`
    : ''}` : `<div style="color:#5f6368;font-size:12px;margin-top:14px">
    Les comptes concernés ne sont pas publiés sur cette page : ils figurent dans
    le classeur, auquel seuls les administrateurs ont accès.</div>`}

  <div style="margin-top:22px;padding-top:10px;border-top:1px solid #dadce0;color:#5f6368;font-size:11px">
    « Jeton » est un constat : l'accès existe encore, ou non, au jour du relevé.
    « Journal » est une supposition tirée des 180 derniers jours. Une valeur vide
    signifie « non mesuré », jamais « rien trouvé ».
  </div>
</div>`;
};

function fiche() {
  const classeur = classeurCourant_();
  const d = dossier_(classeur, cidSelectionne_(classeur));
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(ficheHtml_(d)).setWidth(760).setHeight(620),
    `Fiche — ${d.nom}`.slice(0, 90));
}
