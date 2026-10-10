/**
 * Constantes et fonctions partagées — introduites en v0.2.
 *
 * Convention du projet : les points d'entrée sont des `function` déclarées —
 * l'éditeur Apps Script ne propose qu'elles au menu d'exécution — et tout
 * l'interne est écrit en `const nom_ = (…) => …`, donc invisible de ce menu.
 * La séparation public/privé se lit ainsi dans la forme même du code.
 */

/**
 * Version du projet.
 *
 * Seul endroit du code qui porte un numéro de version — les en-têtes de fichier
 * ne disent que la version où le module est **apparu**, un fait qui ne change
 * plus. Prétendre qu'un fichier « est en v0.4 » alors qu'il a été retouché six
 * fois depuis revient à entretenir un état dupliqué qui dérive : c'est ce que
 * faisaient les en-têtes jusqu'ici, et ils mentaient tous.
 *
 * Cette constante doit valoir exactement le contenu du fichier VERSION du dépôt.
 * Le banc d'essai le vérifie : une version affichée dans l'outil et fausse serait
 * pire que pas de version du tout, puisqu'un déploiement Apps Script sert une
 * copie figée du code et qu'on ne peut pas deviner laquelle tourne.
 */
const VERSION_ = '1.7.1';

/**
 * Marge de sécurité sous le plafond d'exécution, en millisecondes.
 *
 * La table des quotas Apps Script annonce aujourd'hui 6 minutes par exécution,
 * pour les comptes grand public comme pour les comptes Workspace — les 30 minutes
 * historiquement accordées aux seconds ont été retirées. Le moissonnage reprend
 * là où il s'est arrêté, donc ce chiffre ne conditionne que le nombre de
 * reprises, jamais le résultat. Si votre tenant vous accorde davantage, montez
 * cette valeur : le moissonnage se fera en moins de passes, sans autre
 * changement.
 */
const BUDGET_MS = 4.5 * 60 * 1000;

/**
 * Reprises consécutives sans le moindre progrès avant abandon.
 *
 * Une tâche longue se reprogramme d'elle-même à la minute suivante quand elle
 * est interrompue. Sur une erreur PERMANENTE — droits retirés, quota d'API
 * épuisé, plafond de cellules du classeur atteint — cette reprise échoue
 * exactement pareil, et recommence : 1 440 exécutions par jour, la réserve de
 * six heures consommée, et rien qui prévienne. Le compteur d'avancement de
 * chaque campagne sert donc aussi de détecteur de blocage : trois reprises qui
 * n'avancent sur rien, on s'arrête et on dit pourquoi.
 */
const REPRISES_SANS_PROGRES_MAX_ = 3;

/** Quota Admin SDK Directory : 2 400 requêtes/minute/utilisateur/projet. */
const QUOTA_DIRECTORY_PAR_MIN = 2400;


/** Identifiants de colonnes, jamais des libellés : voir Langues.gs. */
const COLONNES_BRUT_ = [
  'horodatage', 'compteMin', 'domaineMin', 'evenement', 'applicationMin', 'clientId',
  'clientType', 'porteesMin', 'motifRefus', 'demandeurMin', 'api', 'methode',
  'octetsMin', 'produit'
];

/**
 * Compte rendu en cours.
 *
 * Objet constant muté en place, plutôt que deux variables réassignées : en V8,
 * les liaisons `let` de portée globale traversent mal les fichiers d'un même
 * projet, alors qu'un objet partagé, lui, se comporte partout pareil.
 *
 * `destination` vaut 'console' depuis l'éditeur et 'ui' depuis le menu du
 * classeur — un utilisateur du classeur ne voit pas le journal d'exécution.
 */
const CR_ = { lignes: [], destination: 'console' };

const dire_ = (ligne = '') => { CR_.lignes.push(String(ligne)); };

const echapper_ = (texte) => String(texte ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/**
 * La langue de l'interface, pour les rendus qui n'ont pas reçu de classeur.
 * Elle ne doit jamais faire échouer un compte rendu : un onglet Paramètres
 * absent ou illisible rend le français, pas une exception.
 */
const langueInterface_ = () => {
  try {
    return reglages_(classeurCourant_()).interface;
  } catch (e) {
    return LANGUE_DEFAUT_;
  }
};

const vider_ = (titre = 'Applications tierces') => {
  const texte = CR_.lignes.join('\n');
  CR_.lignes = [];
  if (CR_.destination !== 'ui') {
    console.log(texte);
    return;
  }
  const css = `
    body { font-family: 'Google Sans', Roboto, Arial, sans-serif; margin: 0; padding: 24px; color: #1f1f1f; background: #fff; }
    .console-box { 
      background: #f0f4f9; border-radius: 12px; padding: 16px; 
      font-family: 'Google Sans Mono', 'Roboto Mono', ui-monospace, Consolas, monospace;
      font-size: 13px; line-height: 1.5; white-space: pre-wrap;
      max-height: 340px; overflow-y: auto; color: #444746; border: 1px solid #c4c7c5;
    }
    .actions { margin-top: 24px; text-align: right; }
    button {
      background: #0b57d0; color: #fff; border: none; border-radius: 100px;
      padding: 10px 24px; font-size: 14px; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: background 0.2s, box-shadow 0.2s;
    }
    button:hover { background: #0842a0; box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); }
    button:active { background: #062e6f; }
  `;
  const html = HtmlService
    .createHtmlOutput(`<!DOCTYPE html><html><head>
      <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Google+Sans+Mono&display=swap" rel="stylesheet">
      <style>${css}</style></head><body>
      <div class="console-box">${echapper_(texte)}</div>
      <div class="actions"><button onclick="google.script.host.close()">${
        echapper_(t_('dialogue.fermer', langueInterface_()))}</button></div>
      </body></html>`)
    .setWidth(720)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, titre);
};

/**
 * Les actions du menu et de l'assistant, sous le seul nom que le client
 * connaît. Une table plutôt qu'une cascade de `else if` : le banc peut la
 * parcourir et vérifier qu'aucune étape ne désigne une action inexistante —
 * un nom mal orthographié ferait sinon un bouton qui ne fait rien, en silence.
 *
 * `dialogue: true` dit que l'action ouvre elle-même son compte rendu. Le client
 * ne doit alors PAS fermer sa fenêtre : le serveur a déjà remplacé le dialogue
 * de confirmation par celui du résultat, et fermer refermerait le résultat.
 */
const ACTIONS_ = {
  // Les entrées « demander » ouvrent la confirmation ; ce sont elles que
  // l'assistant désigne, pour qu'un clic depuis le panneau latéral passe par la
  // même garde qu'un clic dans le menu.
  demanderMoisson180: { dialogue: true, faire: () => moissonnerDepuisMenu_(180) },
  demanderMoisson30: { dialogue: true, faire: () => moissonnerDepuisMenu_(30) },
  demanderInventaire: { dialogue: true, faire: () => inventorierDepuisMenu_() },

  menuMoissonner7: { dialogue: true, faire: () => depuisMenu_('Moissonnage', () => moissonner(7)) },
  menuMoissonner180: { dialogue: true, faire: () => depuisMenu_('Moissonnage', () => moissonner(180)) },
  menuMoissonner30: { dialogue: true, faire: () => depuisMenu_('Moissonnage', () => moissonner(30)) },
  menuResserrerBrut30: { dialogue: true, faire: () => depuisMenu_('Resserrage', () => resserrerBrut(30)) },
  menuInventorier: { dialogue: true, faire: () => depuisMenu_('Inventaire', inventorierJetons) },
  menuRafraichirComptes: { dialogue: true, faire: () => depuisMenu_('Profils des comptes', rafraichirComptes) },
  preparerRevocations: { dialogue: true, faire: () => depuisMenu_('Plan de révocation', preparerRevocations) },
  appliquerRevocations: { dialogue: true, faire: () => depuisMenu_('Révocations', () => appliquerRevocations({ forcer: true })) },
  preparerSollicitations: { dialogue: true, faire: () => depuisMenu_('Plan d\'envoi', preparerSollicitations) },
  envoyerSollicitations: { dialogue: true, faire: () => depuisMenu_('Envoi', () => envoyerSollicitations({ forcer: true })) },
  ouvrirRevocations: { dialogue: false, faire: () => ouvrir_('revocations') },
  ouvrirSollicitations: { dialogue: false, faire: () => ouvrir_('sollicitations') },
  ouvrirAInstruire: { dialogue: false, faire: () => ouvrir_('aInstruire') },
  ouvrirDecisions: { dialogue: false, faire: () => ouvrir_('decisions') }
};

/**
 * Une confirmation avant l'irréversible, dans une fenêtre qu'on peut lire en
 * entier — l'alerte native tronque, et le texte qui compte est justement celui
 * qu'on tronque.
 *
 * Le bouton de validation appelle le serveur ; il ne ferme la fenêtre que si
 * l'action n'a pas produit son propre compte rendu. Fermer d'office refermait
 * le rapport de révocation, seul endroit où l'on apprend ce qui a été supprimé.
 */
const confirmer_ = (titre, question, actionName, avertissement = '') => {
  if (!ACTIONS_[actionName]) throw new Error(`Action inconnue : ${actionName}`);
  const lg = langueInterface_();
  const hauteur = 300 + (avertissement ? 110 : 0)
    + Math.min(260, Math.floor(String(question).length / 60) * 22);
  const css = `
    body { font-family: 'Google Sans', Roboto, Arial, sans-serif; margin: 0; padding: 24px; color: #1f1f1f; background: #fff; display: flex; flex-direction: column; height: calc(100% - 48px); box-sizing: border-box; }
    .avert { background: #fce8e6; border: 1px solid #f5c1bb; color: #a50e0e; border-radius: 12px; padding: 14px 18px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; margin-bottom: 16px; }
    .avert strong { display: block; margin-bottom: 4px; }
    .question { flex: 1; font-size: 15px; line-height: 1.5; white-space: pre-wrap; color: #444746; overflow-y: auto; }
    .actions { margin-top: 20px; display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
    .note { flex: 1; font-size: 12.5px; color: #5f6368; }
    button { border: none; border-radius: 100px; padding: 10px 24px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit; transition: background 0.2s, box-shadow 0.2s; }
    .btn-cancel { background: transparent; color: #0b57d0; border: 1px solid #747775; padding: 9px 23px; }
    .btn-cancel:hover { background: #f0f4f9; }
    .btn-ok { background: #0b57d0; color: #fff; display: inline-flex; align-items: center; }
    .btn-ok:hover { background: #0842a0; box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); }
    .btn-ok:disabled { background: #e3e3e3; color: #8e8e8e; cursor: not-allowed; box-shadow: none; }
    #spinner { display: none; margin-right: 8px; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
  `;
  const html = HtmlService.createHtmlOutput(`<!DOCTYPE html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>${css}</style></head><body>
    ${avertissement ? `<div class="avert"><strong>${
      echapper_(t_('dialogue.attention', lg))}</strong>${echapper_(avertissement)}</div>` : ''}
    <div class="question">${echapper_(question)}</div>
    <div class="actions">
      <div class="note">${echapper_(t_('dialogue.rienNeSeraFait', lg))}</div>
      <button class="btn-cancel" onclick="google.script.host.close()" id="btn-cancel">${
        echapper_(t_('dialogue.annuler', lg))}</button>
      <button class="btn-ok" onclick="valider()" id="btn-ok">
        <svg id="spinner" class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
        ${echapper_(t_('dialogue.confirmer', lg))}
      </button>
    </div>
    <script>
      function valider() {
        document.getElementById('btn-ok').disabled = true;
        document.getElementById('btn-cancel').style.display = 'none';
        document.getElementById('spinner').style.display = 'inline-block';
        google.script.run
          .withSuccessHandler(function (ouvreUnDialogue) {
            // Si le serveur a ouvert son compte rendu, il a déjà remplacé cette
            // fenêtre : la fermer fermerait le rapport.
            if (!ouvreUnDialogue) google.script.host.close();
          })
          .withFailureHandler(function (err) {
            document.body.innerHTML = '<div style="padding:24px;color:#b3261e;'
              + 'font-size:14px;font-family:Roboto,sans-serif">'
              + ${JSON.stringify(echapper_(t_('dialogue.erreur', lg)))} + ' : ' + err.message + '</div>';
          })
          .executerAction_ui(${JSON.stringify(actionName)});
      }
    </script></body></html>`).setWidth(520).setHeight(hauteur);
  SpreadsheetApp.getUi().showModalDialog(html, titre);
};

/**
 * Le point d'entrée de `google.script.run`. Il doit rester une `function`
 * déclarée : le client le résout par son nom global. Le suffixe `_ui` marque
 * qu'il n'est pas fait pour être lancé depuis l'éditeur.
 *
 * Rend `true` quand l'action a ouvert son propre dialogue.
 */
function executerAction_ui(nomAction) {
  const action = ACTIONS_[nomAction];
  if (!action) throw new Error(`Action inconnue : ${nomAction}`);
  action.faire();
  return action.dialogue;
}

/** Aplatit les paramètres d'un événement en objet nom -> valeur. */
const parametres_ = (evenement) => {
  const out = {};
  for (const p of evenement.parameters || []) {
    if (p.value !== undefined) out[p.name] = p.value;
    else if (p.intValue !== undefined) out[p.name] = Number(p.intValue);
    else if (p.boolValue !== undefined) out[p.name] = p.boolValue;
    else if (p.multiValue !== undefined) out[p.name] = p.multiValue;
    else if (p.multiMessageValue !== undefined) out[p.name] = p.multiMessageValue;
  }
  return out;
};

const octets_ = (n) => {
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
  return `${Math.round(v * 10) / 10} ${unites[i]}`;
};

const ilYaJours_ = (jours) =>
  new Date(Date.now() - jours * 24 * 3600 * 1000).toISOString();

/** Trie un objet {clé: nombre} en liste [clé, nombre] décroissante. */
const classer_ = (compteur) => Object.entries(compteur).sort((a, b) => b[1] - a[1]);

/** Domaine d'une adresse, ou '(sans domaine)'. */
const domaine_ = (email) =>
  (email && email.indexOf('@') > 0) ? email.split('@')[1] : '(sans domaine)';

/** Normalise le paramètre « scope », tantôt liste tantôt chaîne. */
const portees_ = ({ scope }) => {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope;
  return String(scope).split(/[\s,]+/).filter(Boolean);
};

/**
 * Journée d'un horodatage, au format yyyy-MM-dd, quelle que soit sa forme.
 *
 * Indispensable, et pas seulement cosmétique : Sheets convertit en objets Date
 * les chaînes ISO qu'on lui écrit, si bien qu'à la relecture `String(valeur)`
 * rend « Thu May 14 2026 02:00:00 GMT+0200 ». Outre l'affichage en anglais, ces
 * chaînes se comparent alphabétiquement sur le nom du jour — la période observée
 * et les premières/dernières apparitions étaient donc fausses, silencieusement.
 */
const jour_ = (valeur) => {
  if (!valeur) return '';
  if (valeur instanceof Date) {
    return Utilities.formatDate(valeur, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const texte = String(valeur);
  if (/^\d{4}-\d{2}-\d{2}/.test(texte)) return texte.slice(0, 10);
  const d = new Date(texte);
  return isNaN(d.getTime()) ? texte.slice(0, 10)
    : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
};

const MOIS_ = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Une date pour être lue, non pour être triée.
 *
 * Le classeur stocke en `yyyy-MM-dd` et cela ne change pas : c'est le seul
 * format qui se trie correctement en tant que texte, et tout le reste de l'outil
 * en dépend. Mais `2026-09-06` n'est pas une date à montrer à un comité — d'où
 * cette conversion, qui n'intervient qu'à l'affichage.
 */
const dateLisible_ = (valeur) => {
  const m = String(valeur).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(valeur);
  const [, annee, mois, jour, heure, minute] = m;
  const quantieme = Number(jour);
  const texte = `${quantieme === 1 ? '1er' : quantieme} ${MOIS_[Number(mois) - 1]} ${annee}`;
  return heure ? `${texte} à ${heure} h ${minute}` : texte;
};

const MOIS_EN_ = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * La même date, dans la langue du lecteur.
 *
 * Le français met le mois en minuscule et un ordinal au premier du mois ;
 * l'anglais capitalise le mois et n'en met pas. Deux règles typographiques que
 * seule la langue décide — d'où deux rendus, et non un format paramétré.
 */
const dateLisibleLangue_ = (valeur, langue) => {
  if (langue !== 'en') return dateLisible_(valeur);
  const m = String(valeur).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(valeur);
  const [, annee, mois, jour, heure, minute] = m;
  const texte = `${Number(jour)} ${MOIS_EN_[Number(mois) - 1]} ${annee}`;
  return heure ? `${texte} at ${heure}:${minute}` : texte;
};

const datesLisiblesLangue_ = (texte, langue) => (langue !== 'en'
  ? datesLisibles_(texte)
  : String(texte).replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/g,
    (d) => dateLisibleLangue_(d, 'en')));

/**
 * Rend lisibles toutes les dates d'un texte, y compris au milieu d'autre chose —
 * une période « 2026-05-29 → 2026-09-05 » devient « 29 mai 2026 → 5 septembre
 * 2026 » sans qu'on ait à savoir d'avance ce que la chaîne contient.
 */
const datesLisibles_ = (texte) => String(texte)
  .replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/g, (d) => dateLisible_(d));

/**
 * Famille d'une portée, déduite de son chemin — « drive », « gmail », « admin »…
 * Ce n'est pas un niveau de sensibilité : le catalogue arrive en v0.5.
 */
const famille_ = (portee) => {
  const m = String(portee).match(/auth\/([a-z0-9_.-]+)/i);
  if (!m) return String(portee).startsWith('openid') ? 'identité' : 'autre';
  const t = m[1].split('.')[0];
  return t === 'userinfo' ? 'identité' : t;
};

/**
 * Ce à quoi une famille de portées donne accès, dit à celui qui va le lire.
 *
 * L'onglet Applications garde les familles techniques : l'administrateur les
 * connaît, et elles se filtrent. Le courriel, lui, s'adresse à quelqu'un pour
 * qui « spreadsheets, script, cloud-identity » ne veut rien dire — et à qui
 * l'on demande précisément de juger si cet accès se justifie.
 */
const LIBELLES_FAMILLES_ = {
  drive: 'vos fichiers Drive',
  gmail: 'votre messagerie',
  calendar: 'votre agenda',
  documents: 'vos documents Docs',
  spreadsheets: 'vos feuilles de calcul',
  presentations: 'vos présentations',
  forms: 'vos formulaires',
  script: 'vos projets Apps Script',
  admin: 'l\'administration du domaine',
  'cloud-identity': 'l\'annuaire de l\'organisation',
  apps: 'les services Google Workspace',
  apps_genai: 'les fonctions d\'intelligence artificielle',
  contacts: 'vos contacts',
  tasks: 'vos tâches',
  identité: 'votre identité (nom et adresse)',
  autre: 'd\'autres services Google'
};

const enClair_ = (familles) => {
  const libelles = familles
    .map((f) => LIBELLES_FAMILLES_[f] || `${f} (service Google)`)
    .filter((v, i, t) => t.indexOf(v) === i);
  if (!libelles.length) return 'accès non précisé par le journal';
  if (libelles.length === 1) return libelles[0];
  return `${libelles.slice(0, -1).join(', ')} et ${libelles[libelles.length - 1]}`;
};

/**
 * Le classeur qui porte le rapport : celui auquel ce script est lié.
 *
 * Le projet est volontairement lié à un classeur plutôt qu'autonome. Le rapport
 * vit alors là où on le consulte, `onOpen()` y pose le menu nativement, et
 * chaque action s'exécute sous l'identité de qui la déclenche — non sous celle
 * du poseur d'un déclencheur, ce qui aurait prêté ses droits d'administrateur à
 * toute personne ayant accès au classeur.
 */
const classeurCourant_ = () => {
  const classeur = SpreadsheetApp.getActive();
  if (!classeur) {
    throw new Error('Ce script doit être lié à un classeur : ouvrez le classeur, '
      + 'Extensions > Apps Script, et exécutez-le de là.');
  }
  return classeur;
};

/**
 * Rend l'onglet brut, en le créant au besoin.
 *
 * Le cas courant au premier lancement est un classeur neuf avec sa seule
 * « Feuille 1 » vide : on la renomme plutôt que d'en ajouter une et de laisser
 * une feuille orpheline derrière soi.
 */
const brutCourant_ = (classeur, lg) => {
  const langue = lg || LANGUE_DEFAUT_;
  const existant = ongletCanonique_(classeur, 'brut', langue);
  if (existant) return existant;

  const nom = nomOnglet_('brut', langue);
  const feuilles = classeur.getSheets();
  const seuleEtVide = feuilles.length === 1 && feuilles[0].getLastRow() === 0;
  const brut = seuleEtVide ? feuilles[0].setName(nom) : classeur.insertSheet(nom);
  return entetesBrut_(brut, langue);
};

/**
 * Les noms que Google donne à la feuille créée d'office avec un classeur.
 * Selon la langue du compte, et selon qu'il y ait une espace ou non.
 */
const FEUILLES_PAR_DEFAUT_ = /^(feuille|sheet)\s?1$/i;

/**
 * Supprime la feuille par défaut si elle est restée vide.
 *
 * `brutCourant_` la renomme quand elle est seule dans un classeur neuf, mais ce
 * cas ne couvre pas tout : dès qu'un autre onglet existe déjà — un référentiel
 * créé avant le premier moissonnage —, elle survit et traîne indéfiniment.
 * Le ménage se fait donc aussi à la fin, quand on sait ce que le classeur
 * contient vraiment.
 *
 * Deux garde-fous : on ne supprime que si la feuille est **vide**, et jamais la
 * dernière du classeur, qu'un classeur ne peut pas perdre.
 */
const nettoyerFeuilleParDefaut_ = (classeur) => {
  const feuilles = classeur.getSheets();
  if (feuilles.length < 2) return false;
  const cible = feuilles.find((f) => FEUILLES_PAR_DEFAUT_.test(f.getName())
    && f.getLastRow() === 0 && f.getLastColumn() === 0);
  if (!cible) return false;
  classeur.deleteSheet(cible);
  return true;
};

const entetesBrut_ = (brut, lg) => {
  brut.getRange(1, 1, 1, COLONNES_BRUT_.length)
    .setValues([entetesEn_(COLONNES_BRUT_, lg || LANGUE_DEFAUT_)])
    .setFontWeight('bold');
  brut.setFrozenRows(1);
  return brut;
};
