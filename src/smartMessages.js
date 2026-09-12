// Messages intelligents pour CAPV ERP

export function getSalutation(nom) {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bonjour, " + nom + " !";
  if (h >= 12 && h < 14) return "Bon midi, " + nom + " !";
  if (h >= 14 && h < 18) return "Bon apres-midi, " + nom + " !";
  if (h >= 18 && h < 21) return "Bonsoir, " + nom + " !";
  return "Bonne nuit, " + nom + " !";
}

export function getMotivation() {
  const msgs = [
    "Excellente journee de travail !",
    "Chaque effort compte, continuez comme ca !",
    "Ensemble, on fait avancer le CAPV !",
    "Votre travail fait la difference !",
    "La rigueur est la cle du succes !",
    "Bonne continuation dans vos taches !",
    "Un pas a la fois, on avance !",
    "Vous etes un pilier de cette equipe !",
    "Le travail bien fait est une fierte !",
    "Courage et determination !",
    "Chaque journee est une opportunite !",
    "Votre engagement est precieux !",
    "On construit l'avenir de nos eleves !",
    "La perseverance porte ses fruits !",
    "Merci pour votre devouement !"
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

export function getActionMessage(action) {
  const msgs = {
    paiement: ["Paiement enregistre avec succes !", "Transaction effectuee, bravo !", "C'est note, merci !"],
    creation: ["Element cree avec succes !", "Bien joue, c'est enregistre !", "Parfait, tout est en ordre !"],
    modification: ["Modification enregistree !", "Mise a jour effectuee !", "C'est mis a jour !"],
    suppression: ["Suppression effectuee.", "Element retire avec succes.", "C'est fait."],
    approbation: ["Approuve avec succes !", "Validation confirmee !", "Bien note, c'est approuve !"],
    connexion: ["Content de vous revoir !", "Bienvenue dans votre espace de travail !", "Pret a travailler ? C'est parti !"]
  };
  const list = msgs[action] || msgs.creation;
  return list[Math.floor(Math.random() * list.length)];
}

export function getPeriodEmoji() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "☀️";
  if (h >= 12 && h < 14) return "🌤️";
  if (h >= 14 && h < 18) return "⛅";
  if (h >= 18 && h < 21) return "🌆";
  return "🌙";
}