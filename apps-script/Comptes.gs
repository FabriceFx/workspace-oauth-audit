/**
 * Profil des comptes — v0.4.
 *
 * Une application autorisée par un administrateur délégué n'est pas dans la
 * même catégorie qu'une autre : ses portées s'exercent sur un compte qui peut
 * lui-même agir sur le tenant. De même, une autorisation portée par un compte
 * suspendu est un cas à part — la personne est partie, l'accès, lui, peut être
 * resté ouvert.
 *
 * Ces deux qualités ne se lisent pas dans le journal d'audit : elles se lisent
 * dans l'annuaire. C'est le seul endroit du projet où l'on interroge l'annuaire,
 * et il ne coûte presque rien — 17 pages de 500 comptes pour 8 500, contre une
 * requête par compte pour l'inventaire des jetons de la v0.5.
 *
 * L'onglet produit ne retient QUE les comptes hors du commun : administrateurs,
 * administrateurs délégués, comptes suspendus. Sur 8 500 comptes, ils se
 * comptent en dizaines — inutile de recopier tout l'annuaire dans un classeur,
 * et malvenu de le faire.
 */

const ONGLET_COMPTES_ = '_Comptes';

const COLONNES_COMPTES_ = ['Compte', 'Administrateur', 'Délégué', 'Suspendu', 'Relevé le'];

function rafraichirComptes() {
  const t0 = Date.now();
  const classeur = classeurCourant_();
  const remarquables = [];
  let total = 0;
  let jeton = null;

  try {
    do {
      const rep = AdminDirectory.Users.list({
        customer: 'my_customer',
        maxResults: 500,
        orderBy: 'email',
        projection: 'basic',
        fields: 'nextPageToken,users(primaryEmail,isAdmin,isDelegatedAdmin,suspended)',
        pageToken: jeton
      });
      for (const u of rep.users || []) {
        total++;
        if (u.isAdmin || u.isDelegatedAdmin || u.suspended) {
          remarquables.push([
            u.primaryEmail,
            u.isAdmin ? 'oui' : '',
            u.isDelegatedAdmin ? 'oui' : '',
            u.suspended ? 'oui' : '',
            jour_(new Date())
          ]);
        }
      }
      jeton = rep.nextPageToken;
      if (jeton && Date.now() - t0 > BUDGET_MS) {
        dire_(`Relevé interrompu sur le budget de temps après ${total} comptes.`);
        dire_('Relancez : le relevé repart du début, mais il est rapide.');
        break;
      }
    } while (jeton);
  } catch (e) {
    dire_(`ÉCHEC — ${e}`);
    dire_('');
    dire_('La lecture de l\'annuaire demande le rôle d\'administrateur correspondant.');
    dire_('Sans elle, les colonnes de profil resteront vides : le reste du rapport');
    dire_('fonctionne, il est seulement moins tranchant.');
    vider_('Profils des comptes — échec');
    return;
  }

  const f = onglet_(classeur, ONGLET_COMPTES_, COLONNES_COMPTES_);
  poser_(f, remarquables, false);
  f.hideSheet();

  const admins = remarquables.filter((l) => l[1] === 'oui').length;
  const delegues = remarquables.filter((l) => l[2] === 'oui').length;
  const suspendus = remarquables.filter((l) => l[3] === 'oui').length;

  dire_(`${total} comptes parcourus en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  dire_('');
  dire_(`  administrateurs          ${admins}`);
  dire_(`  administrateurs délégués ${delegues}`);
  dire_(`  comptes suspendus        ${suspendus}`);
  dire_('');
  dire_('Seuls ces comptes-là sont retenus : recopier tout l\'annuaire dans un');
  dire_('classeur n\'aurait aucune utilité, et l\'exposerait sans raison.');
  dire_('');
  dire_('Relancez l\'agrégation — « Rejouer l\'agrégation » — pour que les colonnes');
  dire_('de profil apparaissent dans les onglets Applications et Autorisants.');
  vider_('Profils des comptes');
}

/** Compte -> profil, pour les seuls comptes hors du commun. */
const lireComptes_ = (classeur) => {
  const f = classeur.getSheetByName(ONGLET_COMPTES_);
  const profils = new Map();
  if (!f || f.getLastRow() < 2) return profils;
  const valeurs = f.getDataRange().getValues();
  const e = valeurs[0];
  const iCompte = e.indexOf('Compte');
  const iAdmin = e.indexOf('Administrateur');
  const iDelegue = e.indexOf('Délégué');
  const iSuspendu = e.indexOf('Suspendu');
  for (const l of valeurs.slice(1)) {
    const compte = String(l[iCompte] || '').trim();
    if (!compte) continue;
    profils.set(compte, {
      admin: String(l[iAdmin]).trim() === 'oui',
      delegue: String(l[iDelegue]).trim() === 'oui',
      suspendu: String(l[iSuspendu]).trim() === 'oui'
    });
  }
  return profils;
};

/** Libellé court, pour la colonne Profil de l'onglet Autorisants. */
const libelleProfil_ = (profil) => {
  if (!profil) return '';
  const traits = [];
  if (profil.admin) traits.push('administrateur');
  else if (profil.delegue) traits.push('délégué');
  if (profil.suspendu) traits.push('suspendu');
  return traits.join(', ');
};
