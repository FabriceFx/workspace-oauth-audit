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
  body { font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif; color:#202124;
         margin:0; background:#f8f9fa }
  main { max-width:980px; margin:0 auto; padding:28px 20px 60px }
  h1 { font-size:22px; margin:0 0 4px }
  h2 { font-size:16px; margin:28px 0 10px }
  .carte { background:#fff; border:1px solid #dadce0; border-radius:8px; padding:18px 20px }
  .avert { background:#fef7e0; border:1px solid #f9e3a2; border-radius:8px;
           padding:12px 16px; margin:16px 0; font-size:13px }
  table { border-collapse:collapse; width:100% }
  th { text-align:left; font-weight:600; color:#5f6368; font-size:12px;
       border-bottom:1px solid #dadce0; padding:6px 10px 6px 0 }
  td { padding:6px 10px 6px 0; border-bottom:1px solid #f1f3f4; vertical-align:top }
  .sect { font-weight:600; padding-top:14px }
  .prio { font-variant-numeric:tabular-nums; font-weight:600 }
  .r { color:#c5221f } .s { color:#b06000 } .b { color:#5f6368 }
  .note { color:#5f6368; font-size:12px }
  a { color:#1a73e8 }
  footer { color:#5f6368; font-size:12px; margin-top:34px; border-top:1px solid #dadce0;
           padding-top:12px }
`;

const enveloppe_ = (titre, corps, classeur, lg) => {
  const synthese = syntheseLue_(classeur);
  const genere = (synthese.find((l) => l.cle === 'Généré le') || {}).valeur || '—';
  const lecteur = Session.getActiveUser().getEmail();
  return HtmlService.createHtmlOutput(`
<style>${STYLE_}</style>
<main>
  <h1>${t_('vue.titre', lg)}</h1>
  <div class="note">${t_('vue.sousTitre', lg)}</div>
  ${corps}
  <footer>
    ${t_('vue.produitesLe', lg)}
    <strong>${echapper_(datesLisiblesLangue_(genere, lg))}</strong>
    ${t_('vue.neRafraichitRien', lg)}<br>
    ${lecteur ? `${t_('vue.vousConsultez', lg)} ${echapper_(lecteur)}.<br>` : ''}
    ${t_('vue.pourAgir', lg)}<br>
    ${t_('vue.outilVersion', lg)} ${echapper_(VERSION_)}.
  </footer>
</main>`)
    .setTitle(titre)
    // L'énumération ne comporte que ALLOWALL et DEFAULT — il n'existe pas de
    // DENY, et `HtmlService.XFrameOptionsMode.DENY` valait donc `undefined`.
    // DEFAULT est déjà la valeur protectrice : elle pose l'en-tête
    // X-Frame-Options normal. C'est ALLOWALL qu'il faut se garder d'écrire.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
};

const pageAccueil_ = (classeur) => {
  const lg = reglages_(classeur).interface;
  const synthese = syntheseLue_(classeur);
  const lignesSynthese = synthese
    .filter((l) => l.cle || l.valeur)
    .map((l) => `<tr><td class="${l.section ? 'sect' : ''}">${echapper_(l.cle)}</td>
      <td class="${l.section ? 'sect' : ''}">${
        echapper_(datesLisiblesLangue_(l.valeur, lg))}</td></tr>`)
    .join('');

  const { entetes, lignes } = tableau_(classeur, 'aInstruire');
  const i = (nom) => entetes.indexOf(nom);
  const file = lignes.slice(0, LIGNES_PUBLIEES_).map((l) => {
    const niveau = String(l[i('Niveau max')] || '');
    const classe = niveau === 'restreinte' ? 'r' : niveau === 'sensible' ? 's' : 'b';
    const cid = encodeURIComponent(String(l[i('client_id')] || ''));
    return `<tr>
      <td class="prio">${echapper_(l[i('Priorité')])}</td>
      <td><a href="?app=${cid}">${echapper_(l[i('Application')])}</a></td>
      <td class="${classe}">${echapper_(
        TEXTES_[`niveau.${niveau}`] ? t_(`niveau.${niveau}`, lg) : niveau)}</td>
      <td>${echapper_(l[i('Autorisants')])}</td>
      <td class="note">${echapper_(l[i('Motifs')])}</td>
    </tr>`;
  }).join('');

  return enveloppe_(t_('vue.titre', lg), `
    <h2>${t_('vue.parc', lg)}</h2>
    <div class="carte"><table>${lignesSynthese}</table></div>

    <h2>${t_('vue.aInstruire', lg)}</h2>
    <div class="carte">
      ${file ? `<table>
        <tr><th>${t_('vue.colonne.priorite', lg)}</th>
        <th>${t_('vue.colonne.application', lg)}</th>
        <th>${t_('vue.colonne.gravite', lg)}</th>
        <th>${t_('vue.colonne.autorisants', lg)}</th>
        <th>${t_('vue.colonne.pourquoi', lg)}</th></tr>${file}</table>
        ${lignes.length > LIGNES_PUBLIEES_
          ? `<div class="note" style="margin-top:10px">${t_('vue.premieres', lg,
            { n: LIGNES_PUBLIEES_, total: lignes.length })}</div>` : ''}`
        : `<div class="note">${t_('vue.rienAInstruire', lg)}</div>`}
    </div>

    <div class="avert">
      <strong>${t_('vue.avertPriorite.titre', lg)}</strong>
      ${t_('vue.avertPriorite.corps', lg)}
    </div>`, classeur, lg);
};

const pageFiche_ = (classeur, cid) => {
  const lg = reglages_(classeur).interface;
  const d = dossier_(classeur, cid);
  // Sans la liste des comptes : un comité statue sur une application, pas sur
  // des personnes nommées.
  return enveloppe_(`${d.nom}`, `
    <h2><a href="?">${t_('vue.retour', lg)}</a></h2>
    <div class="carte">${ficheHtml_(d,
      { avecComptes: false, avecImpression: false, langue: lg })}</div>`,
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
