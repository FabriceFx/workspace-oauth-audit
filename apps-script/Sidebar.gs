/**
 * Assistant — panneau latéral, introduit en v1.5.
 *
 * Le menu répondait déjà à « et maintenant ? », mais seulement au moment de
 * l'ouvrir, et sur une seule ligne. Le panneau tient la réponse sous les yeux
 * pendant qu'on travaille, avec ce qui la motive.
 *
 * IL NE SONDE PAS LE CLASSEUR
 *
 * Un rafraîchissement périodique serait la solution évidente et la mauvaise :
 * l'état ne change que lorsque l'utilisateur agit, et relire les onglets en
 * boucle coûterait du quota d'exécution pour rien — sur un parc de plusieurs
 * milliers de comptes, chaque relecture est une lecture complète de l'onglet
 * des décisions. Le panneau se met donc à jour au chargement, après chaque
 * action, et sur demande explicite.
 *
 * TOUS SES LIBELLÉS VIENNENT DU SERVEUR
 *
 * Un fichier HTML ne peut pas appeler le dictionnaire. Ceux qui ne changent
 * jamais sont injectés à la construction, ceux qui dépendent de l'état arrivent
 * avec lui — sans quoi le panneau resterait français sur un classeur anglais.
 */

const htmlAssistant_ = (lg) => {
  const T = (cle) => echapper_(t_(cle, lg));
  return `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primaire: #0b57d0;
      --surface: #f3f4f6;
      --carte: #ffffff;
      --contour: #c7c7c7;
      --texte: #1f1f1f;
      --secondaire: #444746;
    }
    body {
      font-family: 'Google Sans', Roboto, Arial, sans-serif; margin: 0; padding: 16px;
      background-color: var(--surface); color: var(--texte);
      font-size: 14px; line-height: 1.5;
    }
    .header { margin: 8px 0 24px; text-align: center; }
    .header h1 { font-size: 22px; font-weight: 500; margin: 0; letter-spacing: -0.01em; }

    .card { background: var(--carte); border-radius: 16px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); margin-bottom: 20px; }
    .card-title { font-size: 16px; font-weight: 500; margin: 0 0 8px; }
    .card-desc { color: var(--secondaire); font-size: 13.5px; margin-bottom: 16px; }

    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 24px; border-radius: 100px; font-family: inherit; font-weight: 500; font-size: 14.5px; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); border: none; width: 100%; box-sizing: border-box; }
    .btn-primary { background: var(--primaire); color: #fff; }
    .btn-primary:hover { background: #0842a0; box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); transform: translateY(-1px); }
    .btn-primary:active { transform: translateY(0) scale(0.98); box-shadow: none; }
    .btn-primary:disabled { background: #e3e3e3; color: #8e8e8e; cursor: not-allowed; transform: none; box-shadow: none; }

    .status-list { list-style: none; padding: 0; margin: 0; }
    .status-item { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--contour); font-size: 13.5px; font-weight: 500; color: var(--secondaire); }
    .status-item:last-child { border-bottom: none; }
    .status-icon { margin-right: 12px; font-size: 16px; width: 24px; text-align: center; }

    .pied { text-align: center; margin-top: 16px; }
    .pied a { color: var(--primaire); font-size: 13.5px; text-decoration: none; font-weight: 500; }
    .pied p { color: #5f6368; font-size: 12px; line-height: 1.45; margin: 10px 4px 0; }

    .loading-overlay { position: fixed; inset: 0; background: rgba(243, 244, 246, 0.7); display: flex; justify-content: center; align-items: center; z-index: 100; backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); transition: opacity 0.3s; }
    .spinner { width: 36px; height: 36px; border: 3.5px solid rgba(11,87,208,0.2); border-top-color: var(--primaire); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hidden { opacity: 0; pointer-events: none; }
    .erreur { background: #fce8e6; color: #a50e0e; border-radius: 12px; padding: 12px 16px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div id="loading" class="loading-overlay"><div class="spinner"></div></div>

  <div class="header"><h1>${T('assistant.titre')}</h1></div>

  <div id="erreur" class="erreur" hidden></div>

  <div class="card">
    <h2 class="card-title" id="etapeTitre">${T('assistant.chargement')}</h2>
    <div class="card-desc" id="etapeDesc">${T('assistant.patienter')}</div>
    <button class="btn btn-primary" id="btnAction" onclick="lancerAction()" disabled>${
      T('assistant.continuer')}</button>
  </div>

  <div class="card">
    <h2 class="card-title">${T('assistant.avancement')}</h2>
    <ul class="status-list">
      <li class="status-item"><span class="status-icon" id="icon-journal">⚪</span>
        <span>${T('assistant.journal')}</span></li>
      <li class="status-item"><span class="status-icon" id="icon-profils">⚪</span>
        <span>${T('assistant.profils')}</span></li>
      <li class="status-item"><span class="status-icon" id="icon-jetons">⚪</span>
        <span>${T('assistant.jetons')}</span></li>
      <li class="status-item"><span class="status-icon" id="icon-nonClassees">⚪</span>
        <span id="texte-nonClassees">${T('assistant.aInstruire')}</span></li>
    </ul>
  </div>

  <div class="pied">
    <a href="#" onclick="rafraichir(); return false;">${T('assistant.actualiser')}</a>
    <p>${T('assistant.pasDeSondage')}</p>
  </div>

  <script>
    var actionCourante = '';

    function afficherErreur(message) {
      var e = document.getElementById('erreur');
      e.textContent = ${JSON.stringify(t_('dialogue.erreur', lg))} + ' : ' + message;
      e.hidden = false;
    }

    function lancerAction() {
      if (!actionCourante) return;
      document.getElementById('erreur').hidden = true;
      document.getElementById('loading').classList.remove('hidden');
      google.script.run
        .withSuccessHandler(function () { rafraichir(); })
        .withFailureHandler(function (err) {
          document.getElementById('loading').classList.add('hidden');
          afficherErreur(err.message);
        })
        .executerAction_ui(actionCourante);
    }

    function rafraichir() {
      document.getElementById('loading').classList.remove('hidden');
      google.script.run
        .withSuccessHandler(majUi)
        .withFailureHandler(function (err) {
          document.getElementById('loading').classList.add('hidden');
          afficherErreur(err.message);
        })
        .etatPourAssistant_ui();
    }

    function majUi(donnees) {
      document.getElementById('loading').classList.add('hidden');
      if (!donnees) return;

      document.getElementById('etapeTitre').textContent = donnees.etape.titre;
      document.getElementById('etapeDesc').textContent = donnees.etape.pourquoi;
      actionCourante = donnees.etape.actionName;

      var btn = document.getElementById('btnAction');
      btn.disabled = !actionCourante;
      btn.textContent = actionCourante ? donnees.textes.continuer : donnees.textes.aJour;

      var s = donnees.stats;
      document.getElementById('icon-journal').textContent = s.journal ? '✅' : '⚪';
      document.getElementById('icon-profils').textContent = s.profils ? '✅' : '⚪';
      document.getElementById('icon-jetons').textContent = s.jetons ? '✅' : '⚪';

      var icone = document.getElementById('icon-nonClassees');
      var texte = document.getElementById('texte-nonClassees');
      if (s.nonClassees > 0) {
        icone.textContent = '🟠';
        texte.textContent = donnees.textes.aClasser;
      } else if (s.journal) {
        icone.textContent = '✅';
        texte.textContent = donnees.textes.toutClasse;
      } else {
        icone.textContent = '⚪';
        texte.textContent = donnees.textes.aInstruire;
      }
    }

    rafraichir();
  </script>
</body>
</html>`;
};

/** Affiche le panneau latéral, dans la langue réglée pour l'interface. */
function afficherAssistant() {
  const lg = langueInterface_();
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutput(htmlAssistant_(lg)).setTitle(t_('assistant.titre', lg)));
}
