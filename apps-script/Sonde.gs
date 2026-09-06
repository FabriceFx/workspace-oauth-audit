/**
 * Sonde de faisabilité — introduite en v0.1.
 *
 * Ne produit aucun rapport et ne modifie rien. Elle répond à trois questions,
 * avant qu'une ligne de l'outil ne soit écrite :
 *
 *   A. Le journal OAuth (application « token ») répond-il sur ce tenant, et
 *      avec quelle profondeur ?
 *   B. Les événements « activity » portent-ils num_response_bytes — c'est-à-dire
 *      la volumétrie réellement extraite par chaque application ?
 *   C. Combien de temps coûte l'énumération des jetons compte par compte ?
 *
 * À exécuter depuis l'éditeur, avec un compte administrateur.
 *
 *   sonde()             tests A et B — lecture seule stricte
 *   sondeEnumeration()  test C — demande une portée supplémentaire, voir plus bas
 *
 * Le test C appelle AdminDirectory.Tokens.list, qui exige la portée
 * admin.directory.user.security. Cette portée porte la lecture ET la suppression
 * des jetons, sans variante lecture seule : elle est donc volontairement absente
 * du manifeste. Pour exécuter le test C, ajouter cette ligne à oauthScopes dans
 * appsscript.json, puis la retirer ensuite :
 *
 *   "https://www.googleapis.com/auth/admin.directory.user.security"
 *
 * La sonde n'appelle aucune suppression.
 */

/** Sous ce nombre de comptes au journal, on n'est pas sur un tenant de production. */
const SEUIL_TENANT_ATELIER_ = 20;

// ----------------------------------------------------------------- tests A+B

function sonde(jours = 180) {
  if (jours > 180) throw new Error('La Reports API ne remonte pas au-delà de 180 jours.');
  const t0 = Date.now();
  const debut = ilYaJours_(jours);

  dire_(`A. Journal OAuth — ${jours} derniers jours`);
  dire_('────────────────────────────────────────────');

  const parEvenement = {};
  const motifsRefus = {};
  const apps = new Map();            // client_id -> nom affiché
  const autorisants = new Map();     // client_id -> Set(emails)
  const octetsParApp = new Map();    // client_id -> octets
  const acteurs = new Set();
  const domaines = {};
  let avecOctets = 0;
  let total = 0;
  let pages = 0;
  let plusAncien = null;
  let plusRecent = null;
  let jetonPage = null;
  let tronque = false;

  try {
    do {
      const rep = AdminReports.Activities.list('all', 'token', {
        startTime: debut, maxResults: 1000, pageToken: jetonPage
      });
      const items = rep.items || [];
      if (!items.length && pages === 0) {
        dire_('Le journal répond, mais ne renvoie aucun événement sur la période.');
        dire_('Élargir avec sonde(180), ou le journal n\'est pas alimenté.');
        vider_('Sonde');
        return;
      }
      for (const it of items) {
        total++;
        const horo = it.id && it.id.time;
        if (horo) { plusRecent = plusRecent || horo; plusAncien = horo; }
        const acteur = (it.actor && it.actor.email) || '?';
        if (!acteurs.has(acteur)) {
          acteurs.add(acteur);
          const d = domaine_(acteur);
          domaines[d] = (domaines[d] || 0) + 1;
        }
        for (const ev of it.events || []) {
          const nom = ev.name || '?';
          parEvenement[nom] = (parEvenement[nom] || 0) + 1;
          const p = parametres_(ev);
          if (nom === 'deny') {
            const motif = p.rejection_type || '(non précisé)';
            motifsRefus[motif] = (motifsRefus[motif] || 0) + 1;
          }
          const cid = p.client_id;
          if (!cid) continue;
          if (!apps.has(cid)) apps.set(cid, p.app_name || '(sans nom)');
          if (nom === 'authorize' || nom === 'request') {
            if (!autorisants.has(cid)) autorisants.set(cid, new Set());
            autorisants.get(cid).add(acteur);
          }
          if (typeof p.num_response_bytes === 'number') {
            avecOctets++;
            octetsParApp.set(cid, (octetsParApp.get(cid) || 0) + p.num_response_bytes);
          }
        }
      }
      pages++;
      jetonPage = rep.nextPageToken;
      if (jetonPage && Date.now() - t0 > BUDGET_MS) { tronque = true; break; }
    } while (jetonPage);
  } catch (e) {
    dire_(`ÉCHEC — ${e}`);
    dire_('');
    dire_('Un 403 sur ce journal signifie soit une portée absente du consentement,');
    dire_('soit un rôle d\'administrateur insuffisant, soit — c\'est l\'hypothèse à');
    dire_('écarter — un journal non disponible pour ce tenant.');
    dire_('');
    dire_('Verdict : sans journal, l\'outil se réduit à l\'inventaire des jetons');
    dire_('actifs, sans historique ni volumétrie. Les versions 0.2 et 0.5 tombent,');
    dire_('et l\'énumération des 8 500 comptes devient le seul chemin.');
    vider_('Sonde — échec');
    return;
  }

  dire_(`DISPONIBLE — ${total} événements lus en ${((Date.now() - t0) / 1000).toFixed(1)} s `
    + `(${pages} page(s))`);
  if (plusAncien) dire_(`Fenêtre observée : ${jour_(plusAncien)} → ${jour_(plusRecent)}`);
  dire_(`Applications distinctes : ${apps.size}`);
  dire_(`Comptes distincts au journal : ${acteurs.size}  (domaines : `
    + `${classer_(domaines).map(([d, n]) => `${d} ×${n}`).join(', ')})`);

  const atelier = acteurs.size < SEUIL_TENANT_ATELIER_;
  if (atelier) {
    dire_('');
    dire_(`Note : ${acteurs.size} compte(s) distincts au journal — petit tenant,`);
    dire_('   d\'atelier ou de mise au point. C\'est le bon endroit pour développer,');
    dire_('   et les chiffres ci-dessous valident la mécanique. Ils ne dimensionnent');
    dire_('   rien : le volume du journal et la volumétrie se mesurent en production.');
  }

  dire_('');
  dire_('Répartition par type d\'événement :');
  for (const [nom, n] of classer_(parEvenement)) dire_(`  ${nom.padEnd(12)} ${n}`);

  if (parEvenement.deny) {
    dire_('');
    dire_('  Motifs de refus (rejection_type) :');
    for (const [nom, n] of classer_(motifsRefus)) dire_(`    ${nom.padEnd(20)} ${n}`);
    dire_('  Un refus imposé par la politique signale une application que des');
    dire_('  utilisateurs cherchent à connecter et que le tenant bloque : c\'est');
    dire_('  une demande en attente autant qu\'un risque évité.');
  }

  if (tronque) {
    dire_('');
    dire_('Lecture arrêtée sur le budget de temps : les chiffres sont des minorants.');
    dire_('Relancer sur une fenêtre plus courte — sonde(30) — pour un chiffre ferme.');
    dire_('Si même 30 jours ne tiennent pas, le volume du journal impose dès la v0.2');
    dire_('le moissonnage par déclencheurs prévu pour la v0.3 : à savoir maintenant.');
  }

  dire_('');
  dire_('B. Volumétrie — num_response_bytes');
  dire_('──────────────────────────────────');
  if (avecOctets) {
    dire_(`PRÉSENT — ${avecOctets} événements portent un volume de réponse.`);
    dire_('');
    dire_('Applications les plus consommatrices sur la période :');
    for (const [cid, n] of [...octetsParApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      dire_(`  ${octets_(n).padStart(12)}   ${apps.get(cid).slice(0, 48)}`);
    }
  } else if (!parEvenement.activity) {
    dire_('INDÉTERMINÉ — aucun événement « activity » sur la période, donc aucun');
    dire_('endroit où num_response_bytes aurait pu apparaître. Ce n\'est pas un');
    dire_('échec : c\'est un tenant où aucune application tierce n\'a appelé les API');
    dire_('de Google sur la fenêtre. La question reste ouverte, elle se tranchera');
    dire_('sur un tenant où des applications travaillent réellement.');
  } else {
    dire_(`ABSENT — ${parEvenement.activity} événements « activity » existent,`);
    dire_('mais aucun ne porte num_response_bytes. Là, c\'est un vrai constat : ce');
    dire_('tenant journalise les appels sans leur volume. La volumétrie (v0.5) tombe.');
  }

  if (autorisants.size) {
    dire_('');
    dire_('Applications par nombre d\'autorisants (sur la période)');
    dire_('─────────────────────────────────────────────────────');
    const classement = [...autorisants.entries()]
      .map(([cid, users]) => [cid, users.size])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [cid, n] of classement) {
      dire_(`  ${String(n).padStart(5)} compte(s)   ${apps.get(cid).slice(0, 48)}`);
    }
  }

  dire_('');
  dire_('Verdict');
  dire_('───────');
  dire_('Le journal répond : c\'est la source primaire.');
  dire_(`  ${apps.size} applications distinctes vues en ${jours} jours, obtenues en`);
  dire_(`  ${pages} requêtes globales — contre 8 500 requêtes pour l'énumération`);
  dire_('  compte par compte.');
  dire_('');
  dire_('Stratégie retenue : journal d\'abord, énumération ensuite et ciblée sur les');
  dire_('applications à enjeu, pour lever les jetons antérieurs à la fenêtre de 6 mois.');
  if (!avecOctets) {
    dire_('');
    dire_(parEvenement.activity
      ? 'Réserve : la volumétrie est journalisée sans les octets — v0.5 tombe.'
      : 'Réserve : volumétrie indéterminée, faute d\'événement « activity ». À rejouer.');
  }
  if (atelier) {
    dire_('');
    dire_('Portée de ce verdict : la mécanique. Le journal répond, se pagine et se');
    dire_('   dépouille — c\'était la question de la v0.1, elle est réglée. Restent à');
    dire_('   mesurer en production : le volume du journal, qui décide si la v0.2 tient');
    dire_('   en une exécution, et la présence d\'événements « activity ».');
  }
  vider_('Sonde');
}

// -------------------------------------------------------------------- test C

/**
 * Test C — coût de l'énumération. Exige la portée admin.directory.user.security,
 * à ajouter au manifeste (voir l'en-tête). N'appelle aucune suppression.
 */
function sondeEnumeration(echantillon = 25) {
  const t0 = Date.now();

  dire_('C. Coût de l\'énumération des jetons, compte par compte');
  dire_('─────────────────────────────────────────────────────');

  const comptes = [];
  let jeton = null;
  try {
    do {
      const rep = AdminDirectory.Users.list({
        customer: 'my_customer', maxResults: 500, orderBy: 'email',
        projection: 'basic', fields: 'nextPageToken,users/primaryEmail',
        pageToken: jeton
      });
      comptes.push(...(rep.users || []).map((u) => u.primaryEmail));
      jeton = rep.nextPageToken;
      if (jeton && Date.now() - t0 > BUDGET_MS / 2) {
        dire_('Énumération des comptes interrompue sur le budget de temps.');
        break;
      }
    } while (jeton);
  } catch (e) {
    dire_(`ÉCHEC à l'énumération des comptes — ${e}`);
    vider_('Sonde — énumération');
    return;
  }
  dire_(`Comptes énumérés : ${comptes.length} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const pas = Math.max(1, Math.floor(comptes.length / echantillon));
  const cibles = [];
  for (let i = 0; i < comptes.length && cibles.length < echantillon; i += pas) {
    cibles.push(comptes[i]);
  }

  const latences = [];
  let jetonsVus = 0;
  let erreurs = 0;
  dire_('');
  dire_(`Mesure sur ${cibles.length} comptes répartis dans l'annuaire…`);
  for (const email of cibles) {
    const t = Date.now();
    try {
      const r = AdminDirectory.Tokens.list(email);
      jetonsVus += (r.items || []).length;
    } catch (e) {
      erreurs++;
      if (erreurs === 1) dire_(`  première erreur : ${e}`);
    }
    latences.push(Date.now() - t);
  }
  if (!latences.length) { vider_('Sonde — énumération'); return; }

  latences.sort((a, b) => a - b);
  const med = latences[Math.floor(latences.length / 2)];
  dire_(`Latence médiane  : ${med} ms`);
  dire_(`Jetons trouvés   : ${jetonsVus} sur l'échantillon `
    + `(${(jetonsVus / cibles.length).toFixed(1)} par compte en moyenne)`);
  if (erreurs) dire_(`Erreurs          : ${erreurs}`);

  const n = comptes.length;
  const sequentiel = n * med / 60000;
  const plancherQuota = n / QUOTA_DIRECTORY_PAR_MIN;
  dire_('');
  dire_(`Extrapolation sur ${n} comptes :`);
  dire_(`  séquentiel            ~ ${sequentiel.toFixed(0)} min`);
  dire_(`  plancher de quota       ${plancherQuota.toFixed(1)} min `
    + `(${QUOTA_DIRECTORY_PAR_MIN} req/min)`);
  dire_('');
  if (sequentiel > 6) {
    dire_('Au-delà du plafond d\'exécution de 6 minutes d\'Apps Script, et Apps Script');
    dire_(`ne parallélise pas : ${Math.ceil(sequentiel / 4.5)} exécutions successives`);
    dire_('seraient nécessaires, avec reprise d\'état entre chacune. C\'est faisable par');
    dire_('déclencheur, mais ce n\'est plus un outil qui répond à un clic.');
  } else {
    dire_('L\'énumération tient dans une exécution : la contrainte des 6 minutes ne mord pas.');
  }
  vider_('Sonde — énumération');
}
