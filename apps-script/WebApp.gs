/**
 * Vue de consultation — introduite en v1.2.
 *
 * Une page web en **lecture seule**, pour les destinataires que le classeur ne
 * sert pas : le RSSI, le comité sécurité, la direction — des gens qui doivent
 * voir l'état du parc sans recevoir l'inventaire, et qui ne sont pas
 * administrateurs Workspace.
 *
 * POURQUOI PAS SIMPLEMENT PARTAGER LE CLASSEUR EN LECTURE
 *
 * Parce qu'un lecteur peut en faire une copie, et récupérer dans cette copie les
 * onglets masqués : le journal brut et le relevé des jetons. Ce sont exactement
 * les données qu'on ne veut pas voir circuler. Le partage en lecture n'est pas
 * une frontière, c'est un ralentisseur.
 *
 * CE QUE CETTE PAGE NE FAIT PAS, ET NE FERA PAS
 *
 * Elle n'agit pas. Pas de moissonnage, pas d'envoi, pas de révocation, pas de
 * `doPost`. Elle ne sait que lire un classeur déjà produit.
 *
 * C'est la condition qui rend acceptable son déploiement « en tant que le
 * déployeur » — nécessaire, puisque ses lecteurs n'ont aucun droit sur le
 * classeur. Une application web qui agirait sous cette identité rendrait à
 * quiconque possède l'URL les droits d'administrateur du déployeur : c'est
 * précisément la faille que le passage au script lié avait supprimée, et il n'est
 * pas question de la réintroduire par la fenêtre.
 *
 * ELLE NE PUBLIE QUE LE RÉSUMÉ
 *
 * La synthèse, la file de travail, et la fiche d'une application **sans la liste
 * des comptes qui l'ont autorisée** — un comité statue sur une application, pas
 * sur des personnes nommées. Ni onglet brut, ni relevé de jetons, ni onglet
 * Dormants, qui sont tous nominatifs.
 *
 * DÉPLOIEMENT
 *
 * Le manifeste déclare « exécuter en tant que le déployeur » et « accès :
 * domaine ». Il reste à faire, une fois, depuis l'éditeur : Déployer > Nouveau
 * déploiement > Application web. Ne choisissez jamais « toute personne disposant
 * du lien » : cette page montre la cartographie des accès du tenant.
 */

const CLE_CLASSEUR_ = 'idClasseur';

/** Nombre de lignes de la file de travail publiées sur la page d'accueil. */
const LIGNES_PUBLIEES_ = 40;

/**
 * Le classeur, y compris hors du contexte du document.
 *
 * Une application web ne s'exécute pas « dans » le classeur : selon le contexte,
 * `getActive()` peut ne rien rendre. On mémorise donc son identifiant à chaque
 * passage par le menu, et on s'en sert de repli.
 */
const memoriserClasseur_ = () => {
  const classeur = SpreadsheetApp.getActive();
  if (classeur) {
    PropertiesService.getScriptProperties().setProperty(CLE_CLASSEUR_, classeur.getId());
  }
  return classeur;
};

const classeurPublie_ = () => {
  const actif = SpreadsheetApp.getActive();
  if (actif) return actif;
  const id = PropertiesService.getScriptProperties().getProperty(CLE_CLASSEUR_);
  if (!id) {
    throw new Error('Le classeur n\'a pas encore été mémorisé : ouvrez-le une fois '
      + 'et lancez « Vue de consultation » depuis le menu.');
  }
  return SpreadsheetApp.openById(id);
};

// ------------------------------------------------------------------- lecture

const tableau_ = (classeur, id) => {
  const f = chercherOnglet_(classeur, id);
  if (!f || f.getLastRow() < 2) return { entetes: [], lignes: [] };
  const v = f.getDataRange().getValues();
  return { entetes: v[0], lignes: v.slice(1) };
};

/** La Synthèse est un tableau clé/valeur : on la relit telle quelle. */
const syntheseLue_ = (classeur) => {
  const { lignes } = tableau_(classeur, 'synthese');
  return lignes.map(([cle, valeur]) => ({
    cle: String(cle || ''),
    valeur: valeur === '' || valeur === undefined ? '' : String(valeur),
    section: String(cle || '').length > 0 && !String(cle).startsWith('   ')
  }));
};

// ------------------------------------------------------------------ pages

const STYLE_ = `
  :root { color-scheme: light }
  body { font-family: 'Outfit', 'Google Sans', sans-serif; color: #1f1f1f; margin: 0; background-color: #e8ecf1; background-image: radial-gradient(at 0% 0%, hsla(253,16%,7%,0.03) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(225,39%,30%,0.04) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(339,49%,30%,0.04) 0, transparent 50%); background-attachment: fixed; min-height: 100vh; }
  main { max-width: 1024px; margin: 0 auto; padding: 48px 24px 80px; animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  h1 { font-size: 34px; margin: 0 0 8px; font-weight: 600; letter-spacing: -0.02em; color: #1a1a1a; }
  h2 { font-size: 20px; margin: 48px 0 20px; font-weight: 600; letter-spacing: -0.01em; color: #1a1a1a; display: flex; align-items: center; }
  .carte { background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.8); border-radius: 20px; padding: 28px 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.04); }
  .avert { background: rgba(254, 247, 224, 0.85); backdrop-filter: blur(8px); border: 1px solid rgba(249, 227, 162, 0.6); border-radius: 16px; padding: 20px 24px; margin: 32px 0; font-size: 14.5px; box-shadow: 0 4px 16px rgba(0,0,0,0.03); line-height: 1.6; color: #4a3e00; }
  
  .synthese-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .synthese-section { grid-column: 1 / -1; font-size: 16.5px; font-weight: 600; color: #1a1a1a; margin-top: 16px; border-bottom: 1px solid rgba(0,0,0,0.08); padding-bottom: 8px; }
  .synthese-item { background: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.9); padding: 14px 18px; border-radius: 14px; transition: transform 0.2s, box-shadow 0.2s; }
  .synthese-item:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.05); }
  .synthese-cle { font-size: 13px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .synthese-val { font-size: 18px; font-weight: 500; color: #1f1f1f; }
  
  .app-list { display: grid; gap: 12px; }
  .app-card { display: flex; align-items: center; background: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.9); border-radius: 14px; padding: 14px 20px; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; text-decoration: none; color: inherit; }
  .app-card:hover { transform: translateY(-2px) scale(1.005); background: rgba(255,255,255,0.9); box-shadow: 0 8px 20px rgba(0,0,0,0.06); }
  .app-prio { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 17px; color: #5f6368; min-width: 48px; }
  .app-main { flex: 1; min-width: 0; padding-right: 16px; }
  .app-nom { font-size: 16.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #1a73e8; margin-bottom: 4px; }
  .app-meta { font-size: 13.5px; color: #5f6368; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
  .app-badges { display: flex; gap: 8px; align-items: center; }
  .badge { font-size: 11.5px; padding: 4px 12px; border-radius: 100px; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; }
  .badge-r { background: #fce8e6; color: #c5221f; }
  .badge-s { background: #fef7e0; color: #b06000; }
  .badge-b { background: #f1f3f4; color: #5f6368; }
  
  .note { color: #5f6368; font-size: 14px; line-height: 1.5; }
  a { color: #1a73e8; text-decoration: none; transition: color 0.2s; }
  a:hover { color: #174ea6; text-decoration: underline; }
  footer { color: #5f6368; font-size: 13px; margin-top: 56px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 24px; line-height: 1.6; }
`;

const enveloppe_ = (titre, corps, classeur, lg) => {
  const synthese = syntheseLue_(classeur);
  const genere = (synthese.find((l) => l.cle === 'Généré le') || {}).valeur || '—';
  const lecteur = Session.getActiveUser().getEmail();
  return HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Google+Sans:wght@400;500;600&family=Google+Sans+Mono&display=swap" rel="stylesheet">
  <style>${STYLE_}</style>
</head>
<body>
<main>
  <h1>${t_('vue.titre', lg)}</h1>
  <div class="note" style="font-size:15px">${t_('vue.sousTitre', lg)}</div>
  ${corps}
  <footer>
    ${t_('vue.produitesLe', lg)}
    <strong>${echapper_(datesLisiblesLangue_(genere, lg))}</strong>
    ${t_('vue.neRafraichitRien', lg)}<br>
    ${lecteur ? `${t_('vue.vousConsultez', lg)} <strong>${echapper_(lecteur)}</strong>.<br>` : ''}
    ${t_('vue.pourAgir', lg)}<br>
    ${t_('vue.outilVersion', lg)} ${echapper_(VERSION_)}.
  </footer>
</main>
</body>
</html>`)
    .setTitle(titre)
    // L'énumération ne comporte que ALLOWALL et DEFAULT — il n'existe pas de
    // DENY, et `HtmlService.XFrameOptionsMode.DENY` valait donc `undefined`,
    // ce que l'appel rejette. DEFAULT est déjà la valeur protectrice : elle pose
    // l'en-tête X-Frame-Options normal. C'est ALLOWALL qu'il faut se garder
    // d'écrire. Ne pas « corriger » ceci en DENY.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
};

const pageAccueil_ = (classeur) => {
  const lg = reglages_(classeur).interface;
  const synthese = syntheseLue_(classeur);
  const lignesSynthese = synthese
    .filter((l) => l.cle || l.valeur)
    .map((l) => {
      if (!l.valeur && l.section) return `<div class="synthese-section">${echapper_(l.cle)}</div>`;
      if (!l.valeur) return '';
      return `<div class="synthese-item"><div class="synthese-cle">${echapper_(l.cle)}</div><div class="synthese-val">${echapper_(datesLisiblesLangue_(l.valeur, lg))}</div></div>`;
    }).join('');

  const { entetes, lignes } = tableau_(classeur, 'aInstruire');
  const i = (nom) => entetes.indexOf(nom);
  const file = lignes.slice(0, LIGNES_PUBLIEES_).map((l) => {
    const niveau = String(l[i('Niveau max')] || '');
    const classe = niveau === 'restreinte' ? 'r' : niveau === 'sensible' ? 's' : 'b';
    const cid = encodeURIComponent(String(l[i('client_id')] || ''));
    const autorisants = String(l[i('Autorisants')] || '0');
    const motifs = String(l[i('Motifs')] || '');
    return `
      <a href="?app=${cid}" class="app-card">
        <div class="app-prio">${echapper_(l[i('Priorité')])}</div>
        <div class="app-main">
          <div class="app-nom">${echapper_(l[i('Application')])}</div>
          <div class="app-meta">${echapper_(autorisants)} ${t_('vue.colonne.autorisants', lg).toLowerCase()}${motifs ? ` &bull; ${echapper_(motifs)}` : ''}</div>
        </div>
        <div class="app-badges">
          <span class="badge badge-${classe}">${echapper_(TEXTES_[`niveau.${niveau}`] ? t_(`niveau.${niveau}`, lg) : niveau)}</span>
        </div>
      </a>`;
  }).join('');

  return enveloppe_(t_('vue.titre', lg), `
    <h2>${t_('vue.parc', lg)}</h2>
    <div class="carte" style="padding-bottom:32px">
      <div class="synthese-grid">${lignesSynthese}</div>
    </div>

    <h2>${t_('vue.aInstruire', lg)}</h2>
    <div class="carte">
      ${file ? `<div class="app-list">${file}</div>
        ${lignes.length > LIGNES_PUBLIEES_
          ? `<div class="note" style="margin-top:20px;text-align:center;font-weight:500">${t_('vue.premieres', lg,
            { n: LIGNES_PUBLIEES_, total: lignes.length })}</div>` : ''}`
        : `<div class="note">${t_('vue.rienAInstruire', lg)}</div>`}
    </div>

    <div class="avert">
      <strong style="display:block;margin-bottom:8px;font-size:15.5px">${t_('vue.avertPriorite.titre', lg)}</strong>
      ${t_('vue.avertPriorite.corps', lg)}
    </div>`, classeur, lg);
};

const pageFiche_ = (classeur, cid) => {
  const lg = reglages_(classeur).interface;
  const d = dossier_(classeur, cid);
  // Sans la liste des comptes : un comité statue sur une application, pas sur
  // des personnes nommées. Le classeur, lui, les nomme — c'est là qu'on agit.
  return enveloppe_(`${d.nom}`, `
    <h2 style="margin-top:0"><a href="?">&larr; ${t_('vue.retour', lg)}</a></h2>
    <div class="carte" style="padding:0;overflow:hidden;background:rgba(255,255,255,0.7);border:none;box-shadow:none">
      ${ficheHtml_(d, { avecComptes: false, avecImpression: false, langue: lg })}
    </div>`,
  classeur, lg);
};

/**
 * Point d'entrée de l'application web. Lecture seule, et rien d'autre :
 * il n'existe volontairement pas de `doPost`.
 */
function doGet(e) {
  const classeur = classeurPublie_();
  const demande = (e && e.parameter && e.parameter.app) ? String(e.parameter.app).trim() : '';
  if (!demande) return pageAccueil_(classeur);
  try {
    return pageFiche_(classeur, demande);
  } catch (err) {
    // Un identifiant inconnu ne doit rien apprendre à qui l'essaie : on
    // ramène à l'accueil plutôt que d'afficher un message qui confirmerait
    // l'existence ou l'absence d'une application.
    return pageAccueil_(classeur);
  }
}

/** Le lien à transmettre, et les avertissements qui vont avec. */
function urlConsultation() {
  memoriserClasseur_();
  let url = '';
  try {
    url = ScriptApp.getService().getUrl() || '';
  } catch (e) {
    url = '';
  }
  if (!url) {
    dire_('L\'application web n\'est pas encore déployée.');
    dire_('');
    dire_('Depuis l\'éditeur : Déployer > Nouveau déploiement > Application web,');
    dire_('avec « Exécuter en tant que : moi » et « Accès : votre domaine ».');
    dire_('');
    dire_('NE CHOISISSEZ JAMAIS « toute personne disposant du lien » : cette page');
    dire_('montre la cartographie des accès de votre tenant.');
  } else {
    dire_('Lien de consultation, à transmettre aux lecteurs sans droits :');
    dire_('');
    dire_(`  ${url}`);
    dire_('');
    dire_('Cette page est en lecture seule et ne publie que la synthèse, la file');
    dire_('de travail et les fiches — sans la liste des comptes autorisants.');
    dire_('Elle n\'appelle aucune API d\'administration et ne peut rien modifier.');
    dire_('');
    dire_('Vérifiez tout de même le paramétrage du déploiement : l\'accès doit être');
    dire_('limité au domaine, jamais ouvert à toute personne disposant du lien.');
  }
  vider_('Vue de consultation');
}
