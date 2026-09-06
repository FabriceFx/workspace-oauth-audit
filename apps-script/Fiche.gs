/**
 * Fiche d'une application — introduite en v1.0.
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
  const iCid = colonne_(entetes, 'clientId');
  if (iCid < 0) throw new Error(`L'onglet ${f.getName()} ne porte pas de client_id.`);
  const cid = String(f.getRange(ligne, iCid + 1).getValue() || '').trim();
  if (!cid) throw new Error('Aucun client_id sur cette ligne.');
  return cid;
};

/** Rassemble tout ce que le classeur sait d'une application. */
const dossier_ = (classeur, cid) => {
  const lire = (id) => {
    const f = chercherOnglet_(classeur, id);
    if (!f || f.getLastRow() < 2) return { entetes: [], lignes: [] };
    const v = f.getDataRange().getValues();
    return { entetes: v[0], lignes: v.slice(1) };
  };
  const colonne = colonne_;

  const apps = lire('applications');
  const iCid = colonne(apps.entetes, 'client_id');
  const app = apps.lignes.find((l) => String(l[iCid]).trim() === cid);
  if (!app) throw new Error(`Application ${cid} introuvable dans l'onglet Applications.`);

  const champ = (nom) => {
    const i = colonne(apps.entetes, nom);
    return i < 0 ? '' : app[i];
  };

  const aut = lire('autorisants');
  const iAutCid = colonne(aut.entetes, 'client_id');
  const autorisants = aut.lignes.filter((l) => String(l[iAutCid]).trim() === cid)
    .map((l) => ({
      compte: l[colonne(aut.entetes, 'Compte')],
      profil: l[colonne(aut.entetes, 'Profil')],
      jeton: l[colonne(aut.entetes, 'Jeton')],
      etat: l[colonne(aut.entetes, 'État présumé')],
      premiere: l[colonne(aut.entetes, 'Première')]
    }));

  const vol = lire('volumetrie');
  const iVolCid = colonne(vol.entetes, 'client_id');
  const services = iVolCid < 0 ? [] : vol.lignes
    .filter((l) => String(l[iVolCid]).trim() === cid)
    .map((l) => ({
      service: l[colonne(vol.entetes, 'Service')],
      appels: l[colonne(vol.entetes, 'Appels')],
      volume: l[colonne(vol.entetes, 'Volume')]
    }));

  const dec = lire('decisions');
  const iDecCid = colonne(dec.entetes, 'client_id');
  const decision = dec.lignes.find((l) => String(l[iDecCid]).trim() === cid);
  const champDec = (nom) => {
    if (!decision) return '';
    const i = colonne(dec.entetes, nom);
    return i < 0 ? '' : decision[i];
  };

  const port = lire('portees');
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

/**
 * Deux usages, une seule fiche.
 *
 * Dans le classeur, l'administrateur voit déjà les comptes : les masquer
 * n'aurait aucun sens. Sur la vue de consultation, ils disparaissent — un comité
 * statue sur une application, pas sur des personnes nommées, et cette page
 * s'adresse à des lecteurs qui n'ont aucun droit sur le tenant.
 */
const ficheHtml_ = (d, options) => {
  const { avecComptes = true, avecImpression = true,
    langue: lg = LANGUE_DEFAUT_ } = options || {};
  // Toutes les valeurs de la fiche passent par la lisibilité des dates : elle
  // est faite pour être lue, pas pour être triée.
  const ligne = (cle, valeur, note) => valeur === '' || valeur === undefined ? '' : `
    <tr>
      <th style="text-align:left;padding:5px 16px 5px 0;font-weight:600;white-space:nowrap;vertical-align:top">${echapper_(cle)}</th>
      <td style="padding:5px 0">${echapper_(datesLisiblesLangue_(valeur, lg))}${
        note ? `<div style="color:#5f6368;font-size:12px;margin-top:2px">${
          echapper_(datesLisiblesLangue_(note, lg))}</div>` : ''}</td>
    </tr>`;

  const portees = d.portees.map((p) => {
    const n = d.niveaux.get(p) || {};
    const couleur = n.niveau === 'restreinte' ? '#c5221f'
      : n.niveau === 'sensible' ? '#b06000' : '#5f6368';
    return `<li style="margin:3px 0"><code style="font-size:12px">${echapper_(p)}</code>
      <span style="color:${couleur};font-size:12px"> — ${echapper_(
        n.niveau ? t_(`niveau.${n.niveau}`, lg) : t_('fiche.portees.nonClassee', lg))}${
      n.administration === 'oui' ? t_('fiche.portees.administration', lg) : ''}</span></li>`;
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
    <td style="padding:3px 16px 3px 0">${echapper_(s.appels)} ${t_('fiche.appels', lg)}</td>
    <td style="padding:3px 0">${echapper_(s.volume)}</td></tr>`).join('');

  return `
<div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#202124">
  ${avecImpression ? `<button onclick="window.print()"
    style="float:right;padding:6px 14px;cursor:pointer"
    class="sans-impression">${t_('fiche.imprimer', lg)}</button>
  <style>@media print { .sans-impression { display:none } }</style>` : ''}

  <h2 style="margin:0 0 2px">${echapper_(d.nom)}</h2>
  <div style="color:#5f6368;font-size:12px;margin-bottom:14px">
    <code>${echapper_(d.cid)}</code></div>

  <table style="border-collapse:collapse;margin-bottom:16px">
    ${ligne(t_('fiche.statut', lg), d.statut, d.motifDecision
      ? `${d.motifDecision}${d.decidePar ? ` — ${d.decidePar}` : ''}${
        d.decideLe ? `, ${d.decideLe}` : ''}`
      : t_('fiche.sansDecision', lg))}
    ${ligne(t_('fiche.revoirAvant', lg), d.revoirAvant, t_('fiche.revoirAvant.note', lg))}
    ${ligne(t_('fiche.priorite', lg), d.priorite, d.motifs || t_('fiche.rienNeSignale', lg))}
    ${ligne(t_('fiche.graviteMax', lg), d.niveauMax ? t_(`niveau.${d.niveauMax}`, lg) : '',
      d.niveauMax ? t_(`note.${d.niveauMax}`, lg) : '')}
    ${ligne(t_('fiche.administration', lg), d.administration === 'oui' ? 'oui' : '',
      t_('fiche.administration.note', lg))}
    ${ligne(t_('fiche.autorisants', lg), d.autorisantsNb,
      t_('fiche.autorisants.note', lg, { p: d.privileges || 0, s: d.suspendus || 0 }))}
    ${ligne(t_('fiche.volume', lg), d.volume,
      t_('fiche.volume.note', lg, { v: d.volume30 || '0 o', j: FENETRE_RECENTE_JOURS_ }))}
    ${ligne(t_('fiche.observee', lg),
      `${d.premiere} ${t_('fiche.observee.au', lg)} ${d.derniere}`,
      t_('fiche.observee.note', lg))}
  </table>

  <h3 style="margin:18px 0 6px;font-size:14px">${t_('fiche.portees', lg)}</h3>
  <ul style="margin:0;padding-left:18px">${portees
    || `<li>${t_('fiche.portees.aucune', lg)}</li>`}</ul>

  ${services ? `<h3 style="margin:18px 0 6px;font-size:14px">${t_('fiche.lu', lg)}</h3>
  <table style="border-collapse:collapse">${services}</table>` : ''}

  ${avecComptes ? `<h3 style="margin:18px 0 6px;font-size:14px">${
    t_('fiche.comptes', lg)}</h3>
  <table style="border-collapse:collapse">
    <tr style="text-align:left;color:#5f6368;font-size:12px">
      <th style="padding-right:16px">${t_('fiche.comptes.compte', lg)}</th>
      <th style="padding-right:16px">${t_('fiche.comptes.profil', lg)}</th>
      <th style="padding-right:16px">${t_('fiche.comptes.jeton', lg)}</th>
      <th>${t_('fiche.comptes.journal', lg)}</th>
    </tr>
    ${autorisants}
  </table>
  ${d.autorisants.length > 40
    ? `<div style="color:#5f6368;font-size:12px;margin-top:6px">${
      t_('fiche.comptes.suite', lg, { n: d.autorisants.length - 40 })}</div>`
    : ''}` : `<div style="color:#5f6368;font-size:12px;margin-top:14px">${
    t_('fiche.comptes.nonPublies', lg)}</div>`}

  <div style="margin-top:22px;padding-top:10px;border-top:1px solid #dadce0;color:#5f6368;font-size:11px">
    ${t_('fiche.pied', lg)}
  </div>
</div>`;
};

function fiche() {
  const classeur = classeurCourant_();
  const d = dossier_(classeur, cidSelectionne_(classeur));
  const lg = reglages_(classeur).interface;
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(ficheHtml_(d, { langue: lg })).setWidth(760).setHeight(620),
    `Fiche — ${d.nom}`.slice(0, 90));
}
