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

  // Le plus ancien horodatage de TOUT le journal collecté : c'est lui qui borne
  // la fenêtre courte, et non la date d'apparition de l'application affichée.
  // Les dates sont normalisées, donc comparables comme du texte.
  const iPremiereVue = colonne(apps.entetes, 'Première vue');
  const horoMinJournal = iPremiereVue < 0 ? '' : apps.lignes
    .map((l) => jour_(l[iPremiereVue])).filter(Boolean).sort()[0] || '';

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
    fenetreRecente: fenetreRecenteEffective_(horoMinJournal),
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

  // Toutes les valeurs de la fiche passent par datesLisiblesLangue_ : elle est
  // faite pour être lue, pas pour être triée. Le classeur, lui, garde yyyy-mm-dd.
  const css = `
    .fiche-container { font-family: 'Outfit', 'Google Sans', Roboto, sans-serif; color: #1f1f1f; line-height: 1.5; }
    .fiche-header { margin-bottom: 24px; }
    .fiche-title { margin: 0 0 6px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.02em; }
    .fiche-cid { font-family: 'Google Sans Mono', 'Roboto Mono', ui-monospace, monospace; font-size: 12px; color: #5f6368; background: rgba(0,0,0,0.04); padding: 4px 8px; border-radius: 6px; display: inline-block; }
    .fiche-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .kv { display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(0,0,0,0.08); padding: 14px 18px; border-radius: 16px; transition: transform 0.2s, box-shadow 0.2s; backdrop-filter: blur(8px); }
    .kv:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
    .kv-key { font-size: 13px; font-weight: 600; color: #5f6368; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
    .kv-val { font-size: 15px; font-weight: 500; }
    .kv-note { font-size: 12.5px; color: #5f6368; margin-top: 6px; font-weight: 400; line-height: 1.4; }
    .fiche-section { margin: 32px 0 16px 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
    .fiche-list { margin: 0; padding-left: 20px; }
    .fiche-list li { margin-bottom: 8px; font-size: 14px; }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 100px; font-weight: 600; margin-left: 8px; vertical-align: middle; letter-spacing: 0.02em; }
    .badge-restreinte { background: #fce8e6; color: #c5221f; }
    .badge-sensible { background: #fef7e0; color: #b06000; }
    .badge-basique { background: #f1f3f4; color: #5f6368; }
    .badge-admin { background: #e8f0fe; color: #1a73e8; }
    .fiche-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px; background: rgba(255,255,255,0.4); border-radius: 12px; overflow: hidden; border: 1px solid rgba(0,0,0,0.06); }
    .fiche-table th { text-align: left; padding: 12px 16px; color: #5f6368; font-size: 12px; font-weight: 600; border-bottom: 1px solid rgba(0,0,0,0.06); background: rgba(0,0,0,0.02); text-transform: uppercase; letter-spacing: 0.03em; }
    .fiche-table td { padding: 12px 16px; font-size: 13.5px; border-bottom: 1px solid rgba(0,0,0,0.04); vertical-align: top; }
    .fiche-table tr { transition: background 0.2s; }
    .fiche-table tr:hover { background: rgba(255,255,255,0.8); }
    .fiche-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.1); font-size: 12.5px; color: #5f6368; line-height: 1.5; }
    .btn-print { float: right; background: #fff; border: 1px solid #dadce0; border-radius: 100px; padding: 8px 20px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s, box-shadow 0.2s; font-family: inherit; color: #1a73e8; }
    .btn-print:hover { background: #f8f9fa; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    @media print { .sans-impression { display: none !important; } .kv { border: 1px solid #dadce0; box-shadow: none !important; transform: none !important; background: #fff; } .fiche-table { border: 1px solid #dadce0; } }
  `;

  const ligne = (cle, valeur, note) => valeur === '' || valeur === undefined ? '' : `
    <div class="kv">
      <div class="kv-key">${echapper_(cle)}</div>
      <div class="kv-val">${echapper_(datesLisiblesLangue_(valeur, lg))}</div>
      ${note ? `<div class="kv-note">${echapper_(datesLisiblesLangue_(note, lg))}</div>` : ''}
    </div>`;

  const portees = d.portees.map((p) => {
    const n = d.niveaux.get(p) || {};
    const niveauId = n.niveau || 'basique';
    const badgeClass = `badge-${niveauId}`;
    return `<li style="margin:6px 0"><code style="font-size:12.5px;font-family:'Google Sans Mono',monospace">${echapper_(p)}</code>
      <span class="badge ${badgeClass}">${echapper_(
        n.niveau ? t_(`niveau.${n.niveau}`, lg) : t_('fiche.portees.nonClassee', lg))}</span>${
      n.administration === 'oui' ? `<span class="badge badge-admin">${t_('fiche.portees.administration', lg)}</span>` : ''}</li>`;
  }).join('');

  const autorisants = !avecComptes ? '' : d.autorisants.slice(0, 40).map((a) => `
    <tr>
      <td>${echapper_(a.compte)}</td>
      <td style="color:#5f6368">${echapper_(a.profil || '')}</td>
      <td>${echapper_(a.jeton || '—')}</td>
      <td style="color:#5f6368">${echapper_(a.etat || '')}</td>
    </tr>`).join('');

  const services = d.services.map((s) => `
    <tr><td>${echapper_(s.service)}</td>
    <td>${echapper_(s.appels)} ${t_('fiche.appels', lg)}</td>
    <td>${echapper_(s.volume)}</td></tr>`).join('');

  return `
<style>${css}</style>
<div class="fiche-container">
  ${avecImpression ? `<button onclick="window.print()" class="btn-print sans-impression">${t_('fiche.imprimer', lg)}</button>` : ''}

  <div class="fiche-header">
    <h2 class="fiche-title">${echapper_(d.nom)}</h2>
    <div class="fiche-cid">${echapper_(d.cid)}</div>
  </div>

  <div class="fiche-grid">
    ${ligne(t_('fiche.statut', lg), d.statut, d.motifDecision
      ? `${d.motifDecision}${d.decidePar ? ` — ${d.decidePar}` : ''}${d.decideLe ? `, ${d.decideLe}` : ''}`
      : t_('fiche.sansDecision', lg))}
    ${ligne(t_('fiche.revoirAvant', lg), d.revoirAvant, t_('fiche.revoirAvant.note', lg))}
    ${ligne(t_('fiche.priorite', lg), d.priorite, d.motifs || t_('fiche.rienNeSignale', lg))}
    ${ligne(t_('fiche.graviteMax', lg), d.niveauMax ? t_(`niveau.${d.niveauMax}`, lg) : '', d.niveauMax ? t_(`note.${d.niveauMax}`, lg) : '')}
    ${ligne(t_('fiche.administration', lg), d.administration === 'oui' ? 'oui' : '', t_('fiche.administration.note', lg))}
    ${ligne(t_('fiche.autorisants', lg), d.autorisantsNb, t_('fiche.autorisants.note', lg, { p: d.privileges || 0, s: d.suspendus || 0 }))}
    ${ligne(t_('fiche.volume', lg), d.volume, t_('fiche.volume.note', lg, { v: d.volume30 || '0 o', j: d.fenetreRecente }))}
    ${ligne(t_('fiche.observee', lg), `${d.premiere} ${t_('fiche.observee.au', lg)} ${d.derniere}`, t_('fiche.observee.note', lg))}
  </div>

  <h3 class="fiche-section">${t_('fiche.portees', lg)}</h3>
  <ul class="fiche-list">${portees || `<li>${t_('fiche.portees.aucune', lg)}</li>`}</ul>

  ${services ? `<h3 class="fiche-section">${t_('fiche.lu', lg)}</h3>
  <table class="fiche-table">${services}</table>` : ''}

  ${avecComptes ? `<h3 class="fiche-section">${t_('fiche.comptes', lg)}</h3>
  <table class="fiche-table">
    <tr>
      <th>${t_('fiche.comptes.compte', lg)}</th>
      <th>${t_('fiche.comptes.profil', lg)}</th>
      <th>${t_('fiche.comptes.jeton', lg)}</th>
      <th>${t_('fiche.comptes.journal', lg)}</th>
    </tr>
    ${autorisants}
  </table>
  ${d.autorisants.length > 40
    ? `<div style="color:#5f6368;font-size:12.5px;margin-top:8px">${t_('fiche.comptes.suite', lg, { n: d.autorisants.length - 40 })}</div>`
    : ''}` : `<div style="color:#5f6368;font-size:12.5px;margin-top:16px">${t_('fiche.comptes.nonPublies', lg)}</div>`}

  <div class="fiche-footer">
    ${t_('fiche.pied', lg)}
  </div>
</div>`;
};

function fiche() {
  const classeur = classeurCourant_();
  const d = dossier_(classeur, cidSelectionne_(classeur));
  const lg = reglages_(classeur).interface;
  const htmlFragment = ficheHtml_(d, { langue: lg });
  
  const html = HtmlService.createHtmlOutput(`<!DOCTYPE html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Google+Sans:wght@400;500;600&family=Google+Sans+Mono&display=swap" rel="stylesheet">
    <style>
      body { margin: 0; padding: 24px; background: #f8f9fa; }
    </style>
    </head><body>${htmlFragment}</body></html>`)
    .setWidth(800).setHeight(680);
    
  SpreadsheetApp.getUi().showModalDialog(html, `Fiche — ${d.nom}`.slice(0, 90));
}
