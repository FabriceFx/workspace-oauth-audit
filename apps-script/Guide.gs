/**
 * Le guide, dans le classeur — introduit en v1.0.
 *
 * L'outil s'adresse à des administrateurs avertis. Averti ne veut pas dire au
 * fait de ce projet-ci : la différence entre le journal et l'inventaire, la
 * raison d'être des échéances de décision, le piège de `drive` contre
 * `drive.file` ne se devinent pas. Privé d'explication, un expert reconstruit un
 * raisonnement approximatif — et décide sur cette approximation.
 *
 * D'où un guide qui vit **dans le classeur**, et non seulement dans un fichier
 * du dépôt : on le lit là où l'on travaille, sans changer d'écran. Il se
 * régénère à volonté et ne contient aucune donnée du tenant.
 */

const ONGLET_GUIDE_ = 'Guide';

/**
 * Le guide est une donnée, pas du code : une liste de sections, chacune faite
 * d'un titre et de paragraphes. L'ajout d'un chapitre ne demande donc pas de
 * toucher à la mise en page.
 */
const GUIDE_ = [
  ['Ce que fait cet outil', [
    'Il inventorie les applications tierces connectées aux comptes Google de '
    + 'votre organisation : ce qu\'elles ont obtenu, qui le leur a accordé, quand, '
    + 'et ce qu\'elles ont réellement lu depuis.',
    'Il ne bloque rien et ne supprime rien. Il donne à voir, il aide à décider, '
    + 'et il écrit aux personnes concernées quand vous le lui demandez.'
  ]],

  ['Quand une colonne est vide, elle ne dit pas « rien »', [
    'Une colonne vide de ce classeur veut dire NON MESURÉ. Jamais « rien trouvé ». '
    + 'C\'est la règle la plus importante à retenir pour lire le rapport sans se '
    + 'tromper, et elle a deux conséquences concrètes.',
    'La colonne « État du jeton » de l\'onglet Autorisants reste vide tant que '
    + 'l\'inventaire n\'a pas tourné : on ignore alors ce qui existe encore.',
    'Elle reste vide AUSSI, même après l\'inventaire, pour les comptes que '
    + 'l\'annuaire a refusé de rendre. Sur plusieurs milliers de comptes, quelques '
    + 'échecs sont inévitables ; ils sont repassés une fois, et ceux qui résistent '
    + 'sont nommés dans l\'onglet _Échecs avec le motif du refus. Leur ligne reste '
    + 'vide au lieu d\'afficher « clos » : un accès qu\'on n\'a pas su lire ne doit '
    + 'pas se donner pour un accès fermé.',
    'La synthèse porte le compte de ces comptes non mesurés, même quand il vaut '
    + 'zéro — c\'est ainsi qu\'on sait que la mesure a été complète.',
    'Ces comptes sont hors du champ des révocations : on ne révoque que ce qu\'on '
    + 'a constaté. Relancer l\'inventaire les rattrape.'
  ]],

  ['Le déroulé, une fois pour toutes', [
    'Si vous ne savez plus où vous en êtes, ouvrez L\'ASSISTANT — première entrée '
    + 'du menu. Le panneau s\'installe à droite et y reste : il nomme la prochaine '
    + 'chose à faire, dit pourquoi, la lance après confirmation, et montre ce qui '
    + 'est collecté et ce qui ne l\'est pas. Il ne se rafraîchit pas tout seul — '
    + 'l\'état ne change que lorsque vous agissez ; le lien « Actualiser l\'état » '
    + 'est en bas du panneau.',
    'Le reste de ce chapitre est là pour quand vous voulez reprendre la main.',
    '1. « Moissonner le journal — 180 jours » : lit le journal d\'audit OAuth du '
    + 'tenant et remplit les onglets. C\'est le point de départ, et il est peu coûteux.',
    'Sur un parc dont vous ne connaissez pas encore le volume, commencez par la '
    + 'fenêtre de 7 JOURS. Elle tient à coup sûr en une exécution et produit un '
    + 'rapport complet, en petit : vous voyez à quoi ressemble le résultat avant '
    + 'd\'engager 180 jours. La synthèse indique alors que la fenêtre courte a été '
    + 'ramenée à 7 jours — les volumes ne se comparent qu\'à fenêtre égale.',
    '2. « Relever les profils des comptes » : va chercher dans l\'annuaire qui est '
    + 'administrateur, délégué ou suspendu. Rapide, et cela change la lecture.',
    '3. « Relever les jetons actifs » : interroge chaque compte, un par un. '
    + 'C\'est long — comptez plusieurs reprises automatiques — et c\'est ce qui '
    + 'révèle les accès accordés il y a plus de six mois.',
    '4. Classez dans l\'onglet Décisions, en commençant par l\'onglet À instruire.',
    '5. « Préparer les sollicitations », relisez, puis envoyez.',
    '6. Pour ce que vous avez jugé « à bloquer » : « Préparer les révocations », '
    + 'relisez, puis appliquez — et allez bloquer en console, sans quoi rien '
    + 'n\'empêche une réautorisation.',
    'Les étapes 1 à 3 se relancent quand vous voulez : elles reconstruisent tout '
    + 'le classeur, sauf vos décisions.'
  ]],

  ['Deux sources, et pourquoi il en faut deux', [
    'LE JOURNAL (Reports API) dit ce qui s\'est PASSÉ, sur 180 jours au maximum — '
    + 'Google ne conserve pas au-delà. Il donne les dates, les autorisations, les '
    + 'refus, les révocations, et le volume de données extrait.',
    'L\'INVENTAIRE (Directory API) dit ce qui EXISTE aujourd\'hui : quels jetons '
    + 'sont encore valides. Il n\'a pas d\'horizon, mais aucune date.',
    'Leur écart porte l\'information la plus utile de tout l\'outil : un jeton '
    + 'actif dont aucune autorisation n\'apparaît au journal a été accordé AVANT la '
    + 'fenêtre. C\'est un accès que personne n\'a revu depuis plus de six mois, et '
    + 'que ni l\'une ni l\'autre source ne pouvait montrer seule. Ils sont réunis '
    + 'dans l\'onglet Dormants.'
  ]],

  ['Les onglets, dans l\'ordre où on les lit', [
    'SYNTHÈSE — la photographie, et les chiffres qu\'on cite. Commencez par le '
    + 'nombre d\'applications non classées : c\'est celui qu\'il faut faire décroître.',
    'À INSTRUIRE — votre file de travail. Ce qui appelle un examen, moins ce qui '
    + 'porte déjà une décision en vigueur. Se lit de haut en bas ; la colonne '
    + 'Motifs dit pourquoi chaque ligne est là.',
    'APPLICATIONS — une ligne par application, avec tout ce qu\'on sait d\'elle.',
    'AUTORISANTS — une ligne par compte et par application. C\'est ici qu\'on agit, '
    + 'et ici qu\'on voit quels comptes sont concernés.',
    'DORMANTS — les accès antérieurs à la fenêtre du journal. Vide tant que '
    + 'l\'inventaire des jetons n\'a pas été fait.',
    'PORTÉES — une ligne par autorisation demandée, avec sa gravité. Les portées '
    + 'hors catalogue apparaissent en tête : ce sont vos angles morts.',
    'VOLUMÉTRIE — ce que les applications ont réellement extrait, par service.',
    'DÉCISIONS — votre référentiel. Le seul onglet que rien ne réécrit.',
    'CATALOGUE PORTÉES et MODÈLE — vos paramètres, modifiables librement.',
    'SOLLICITATIONS — le plan des courriels à envoyer, et leur état.'
  ]],

  ['Les colonnes qui peuvent tromper', [
    'ÉTAT PRÉSUMÉ — ce que le journal LAISSE SUPPOSER, jamais un fait. Le journal '
    + 'ne connaît que la fenêtre demandée. « antérieur à la fenêtre » signale une '
    + 'application qui appelle les API sans autorisation visible : elle a donc été '
    + 'autorisée avant.',
    'JETON — ce que l\'inventaire a CONSTATÉ : actif, ou clos. Si la colonne est '
    + 'vide, cela veut dire « non mesuré », et non « rien trouvé ». Un fait et une '
    + 'présomption ne se mélangent pas : c\'est pourquoi ce sont deux colonnes.',
    'PRIORITÉ — une somme de points, pas une note sur 100. Les poids sont '
    + 'arbitraires et assumés comme tels ; la colonne Motifs en donne le détail, '
    + 'précisément pour qu\'on puisse les contester.',
    'STATUT — « approuvée (périmée) » veut dire qu\'une décision a existé mais que '
    + 'son échéance est passée. L\'application est retombée dans la file.'
  ]],

  ['Le vocabulaire, en trois lignes', [
    'PORTÉE (scope) — ce qu\'une application a le droit de faire. Google les classe '
    + 'en restreintes, sensibles et basiques. Attention : « drive » donne accès à '
    + 'tout votre Drive, « drive.file » seulement aux fichiers créés par '
    + 'l\'application. Ce sont deux mondes différents.',
    'JETON (token) — la clé remise à une application quand un utilisateur '
    + 'l\'autorise. Elle reste valable jusqu\'à ce que quelqu\'un la révoque : une '
    + 'autorisation ne s\'arrête jamais d\'elle-même.',
    'CLIENT_ID — l\'identité technique de l\'application. Deux applications peuvent '
    + 'porter le même nom : seul le client_id les distingue, et c\'est lui qui sert '
    + 'de clé au référentiel de décisions.'
  ]],

  ['Révoquer, et ce que cela ne fait pas', [
    'La révocation ne vise QUE les applications que vous avez jugées « à bloquer » '
    + 'dans l\'onglet Décisions, avec une décision en vigueur. Le référentiel '
    + 'commande : on ne révoque pas ce qu\'on n\'a pas jugé.',
    'Le plan est relu et rejoué au moment de l\'application : une décision révisée '
    + 'ou périmée entre-temps est ignorée plutôt qu\'exécutée sur une base morte.',
    'RÉVOQUER N\'EST PAS BLOQUER. Le jeton disparaît, mais l\'utilisateur peut '
    + 'réautoriser l\'application dans la minute. La révocation ne vaut que doublée '
    + 'du blocage dans la console — Sécurité > Contrôles des API — qu\'aucune API ne '
    + 'pilote. C\'est l\'illusion la plus coûteuse que cet outil pourrait entretenir.'
  ]],

  ['Ce que cet outil ne peut pas faire', [
    'Bloquer une application. La liste « approuvée / limitée / bloquée » de la '
    + 'console d\'administration n\'est pas pilotable par API : la décision se prend '
    + 'ici, son application se fait en console, sous Sécurité > Contrôles des API.',
    'Distinguer un projet Apps Script interne d\'un logiciel tiers. Aucune API ne '
    + 'donne l\'éditeur ni son statut de vérification. C\'est pourquoi le courriel '
    + 'pose la question à l\'intéressé : à ce stade, une réponse humaine vaut mieux '
    + 'qu\'une heuristique.',
    'Voir au-delà de 180 jours dans le journal. Google ne conserve pas plus '
    + 'longtemps. Seul l\'inventaire des jetons franchit cette limite.'
  ]],

  ['Diffusion de ce classeur', [
    'Ce classeur est le livrable, et son partage est le contrôle d\'accès. Il '
    + 'cartographie les points d\'entrée du tenant : ne le partagez pas plus '
    + 'largement que vous ne partageriez la console d\'administration.',
    'Les onglets masqués — commençant par un souligné — contiennent les données '
    + 'brutes qui justifient le rapport. Ils sont masqués, jamais supprimés.',
    'Les actions du menu s\'exécutent sous l\'identité de qui les déclenche : une '
    + 'personne sans droits d\'administrateur peut lire le rapport, pas le '
    + 'rafraîchir.'
  ]]
];

function guide() {
  const classeur = classeurCourant_();
  const f = onglet_(classeur, 'guide', ['guide', 'valeur'], reglages_(classeur).interface);

  const lignes = [];
  for (const [titre, paragraphes] of GUIDE_) {
    lignes.push([titre.toUpperCase(), '']);
    for (const p of paragraphes) lignes.push(['', p]);
    lignes.push(['', '']);
  }
  poser_(f, lignes, false);

  f.setColumnWidth(1, 260);
  f.setColumnWidth(2, 820);
  f.getRange(1, 1, lignes.length + 1, 2).setWrap(true).setVerticalAlignment('top');
  f.getRange(2, 1, lignes.length, 1).setFontWeight('bold');
  classeur.setActiveSheet(f);
  classeur.moveActiveSheet(2);
  return f;
}

/**
 * L'aide courte, en dialogue : de quoi retrouver le déroulé sans quitter
 * l'onglet où l'on se trouve. Le guide complet est un clic plus loin.
 */
function aide() {
  dire_('LE DÉROULÉ');
  dire_('');
  dire_('  1. Moissonner le journal — 180 jours');
  dire_('  2. Relever les profils des comptes');
  dire_('  3. Relever les jetons actifs        (long, reprend tout seul)');
  dire_('  4. Classer, en partant de l\'onglet « À instruire »');
  dire_('  5. Préparer les sollicitations, relire, envoyer');
  dire_('');
  dire_('CE QU\'IL FAUT AVOIR EN TÊTE');
  dire_('');
  dire_('  Le journal dit ce qui s\'est passé sur 180 jours.');
  dire_('  L\'inventaire dit ce qui existe aujourd\'hui.');
  dire_('  Leur écart — l\'onglet Dormants — montre les accès accordés');
  dire_('  avant la fenêtre, que personne n\'a revus depuis.');
  dire_('');
  dire_('  « État présumé » est une supposition tirée du journal.');
  dire_('  « Jeton » est un constat tiré de l\'inventaire.');
  dire_('  Une colonne vide veut dire « non mesuré », pas « rien trouvé ».');
  dire_('');
  dire_('  L\'onglet « Décisions » est le seul que rien ne réécrit :');
  dire_('  c\'est là que votre travail de classement s\'accumule.');
  dire_('');
  dire_('Le guide complet est dans l\'onglet « Guide » — menu > Guide complet.');
  vider_('Aide');
}
