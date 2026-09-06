/**
 * Volumétrie des accès — introduite en v0.7.
 *
 * Les événements « activity » du journal portent `num_response_bytes` : le
 * volume que Google a réellement rendu à l'application, appel par appel. C'est
 * la seule mesure de ce qu'une application **fait** de son accès, par opposition
 * à ce qu'elle a le droit de faire.
 *
 * L'écart entre les deux est tout l'intérêt de la chose. Une application qui
 * détient une portée restreinte et n'a jamais rien lu se discute ; la même qui a
 * extrait quatre gigaoctets de Drive le mois dernier ne se discute plus. C'est
 * ce chiffre-là qui fait décider un comité, et aucun autre onglet ne le donne.
 *
 * DEUX FENÊTRES, PARCE QU'UNE SEULE INDUIRAIT EN ERREUR
 *
 * Le total sur toute la période moissonnée dit l'ampleur historique ; les
 * 30 derniers jours disent ce qui se passe **maintenant**. Une application qui a
 * beaucoup lu il y a cinq mois puis plus rien n'appelle pas la même réaction
 * qu'une application qui lit aujourd'hui, et un chiffre unique confondrait les
 * deux.
 *
 * QUAND IL N'Y A RIEN À MESURER
 *
 * Certains tenants ne journalisent aucun événement « activity ». L'onglet le dit
 * alors en toutes lettres au lieu de rester vide : une absence de mesure n'est
 * pas une absence de trafic, et un tableau vide se lit à tort comme rassurant.
 */

const FENETRE_RECENTE_JOURS_ = 30;

/**
 * Volume extrait sur 30 jours au-delà duquel une application entre d'elle-même
 * dans la file de travail.
 *
 * Le seuil est arbitraire, comme tout seuil ; il est ici pour que le motif
 * apparaisse en clair — « 4,2 Go extraits sur 30 jours » — et non pour trancher
 * à la place de l'administrateur.
 */
const SEUIL_VOLUME_30J_ = 1024 * 1024 * 1024;

const COLONNES_VOLUMETRIE_ = [
  'application', 'clientId', 'service', 'appels', 'volume', 'volumeOctets',
  'appelsRecents', 'volumeRecent', 'volumeRecentOctets', 'partDuTotal', 'dernierAppel'
];

const debutFenetreRecente_ = () =>
  jour_(new Date(Date.now() - FENETRE_RECENTE_JOURS_ * 24 * 3600 * 1000));

/**
 * Additionne un appel d'API dans les compteurs d'une application et dans le
 * détail par service. `recent` dit si l'appel tombe dans la fenêtre courte.
 */
const compterAppel_ = (app, services, cid, service, octets, recent, horo) => {
  app.appels++;
  app.octets += octets;
  if (recent) { app.appels30++; app.octets30 += octets; }

  const cle = `${cid} ${service}`;
  if (!services.has(cle)) {
    services.set(cle, {
      cid, service, nom: app.nom,
      appels: 0, octets: 0, appels30: 0, octets30: 0, dernier: ''
    });
  }
  const s = services.get(cle);
  s.appels++;
  s.octets += octets;
  if (recent) { s.appels30++; s.octets30 += octets; }
  if (horo > s.dernier) s.dernier = horo;
};

const ecrireVolumetrie_ = (classeur, apps, services, total, lg) => {
  const f = onglet_(classeur, 'volumetrie', COLONNES_VOLUMETRIE_, lg);

  if (!services.size) {
    poser_(f, [[
      'Aucun événement « activity » sur la période moissonnée.', '', '', '', '',
      '', '', '', '', '', ''
    ]], false);
    f.getRange(3, 1).setValue(
      'Ce n\'est pas une absence de trafic : c\'est une absence de mesure. Ce '
      + 'tenant ne journalise pas les appels d\'API des applications tierces, ou '
      + 'aucune n\'en a fait sur la fenêtre. À vérifier avec la sonde.');
    return 0;
  }

  const lignes = [...services.values()]
    .map((s) => [
      s.nom, s.cid, s.service, s.appels, octets_(s.octets), s.octets,
      s.appels30, octets_(s.octets30), s.octets30,
      total ? Math.round((s.octets / total) * 1000) / 10 : 0,
      s.dernier
    ])
    .sort((x, y) => (y[8] - x[8]) || (y[5] - x[5]));
  poser_(f, lignes, true);
  return lignes.length;
};

/** Les plus grosses consommatrices, pour la Synthèse. */
const palmares_ = (apps, combien = 5) => [...apps.values()]
  .filter((a) => a.octets30 > 0)
  .sort((a, b) => b.octets30 - a.octets30)
  .slice(0, combien);
