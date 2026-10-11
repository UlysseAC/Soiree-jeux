'use strict';

/** Mots à faire deviner (Mimes & Cie). Ajoute librement des catégories. */
const MOTS = {
  Animaux: ['Éléphant', 'Girafe', 'Kangourou', 'Pingouin', 'Serpent', 'Singe', 'Crocodile', 'Papillon', 'Poulpe', 'Escargot', 'Chameau', 'Paon', 'Hérisson', 'Dauphin', 'Araignée', 'Lapin', 'Grenouille', 'Aigle', 'Ours', 'Poule', 'Taureau', 'Méduse', 'Paresseux', 'Flamant rose', 'Castor', 'Gorille'],
  Métiers: ['Pompier', 'Dentiste', 'Coiffeur', 'Astronaute', 'Boulanger', 'Chirurgien', 'Plombier', 'Magicien', "Chef d'orchestre", 'Pilote', 'Serveur', 'Facteur', 'Jardinier', 'Photographe', 'Policier', 'Clown', 'Professeur', 'Bûcheron', 'Arbitre', 'Mécanicien', 'DJ', 'Pêcheur', 'Danseuse étoile', 'Vétérinaire', 'Maître-nageur'],
  Objets: ['Parapluie', 'Brosse à dents', 'Aspirateur', 'Ciseaux', 'Téléphone', 'Guitare', 'Lunettes', 'Machine à laver', 'Échelle', 'Trompette', 'Sèche-cheveux', 'Valise', 'Bougie', 'Marteau', 'Appareil photo', 'Montre', 'Ordinateur', 'Fer à repasser', 'Trottinette', 'Boussole', 'Cadenas', 'Ventilateur', 'Tire-bouchon', 'Loupe', 'Hamac'],
  Actions: ['Faire du ski', 'Se brosser les dents', 'Changer une couche', 'Monter une tente', 'Faire un selfie', 'Promener son chien', 'Faire la vaisselle', 'Jongler', 'Plonger', 'Faire du karaoké', 'Repasser une chemise', 'Traire une vache', 'Faire un gâteau', 'Danser la salsa', 'Se raser', 'Pêcher', 'Conduire un bus', 'Faire du yoga', 'Tondre la pelouse', 'Escalader', 'Éternuer', 'Ouvrir un cadeau', "Prendre l'avion", 'Faire du surf', 'Pagayer'],
  Lieux: ['Plage', 'Hôpital', 'Cinéma', 'Piscine', 'Aéroport', 'Bibliothèque', 'Supermarché', 'Zoo', 'Cirque', 'Château', 'Église', 'Prison', 'Désert', 'Igloo', 'Boulangerie', 'Stade', 'Musée', 'Gare', 'Montagne', 'Discothèque', 'Camping', 'Volcan', 'Ferme', 'Phare', 'Laverie'],
  Nourriture: ['Spaghetti', 'Raclette', 'Fondue', 'Pizza', 'Banane', 'Glace', 'Croissant', 'Sushi', 'Hamburger', 'Pop-corn', 'Crêpe', 'Ananas', 'Barbe à papa', 'Huître', 'Fromage', 'Chocolat', 'Citron', 'Oignon', 'Soupe', 'Hot-dog', 'Pastèque', 'Escargots', 'Œuf', 'Gaufre', 'Tacos'],
  Sports: ['Football', 'Tennis', 'Natation', 'Boxe', 'Escrime', 'Golf', 'Basket', 'Curling', 'Ski', 'Patinage', 'Bowling', 'Équitation', 'Haltérophilie', 'Rugby', 'Ping-pong', "Tir à l'arc", 'Cyclisme', 'Lutte', 'Karaté', 'Badminton', 'Volley', 'Hockey', 'Surf', 'Saut à la perche', 'Aviron'],
};

/** Paires de mots proches pour l'Imposteur (mode Undercover). */
const PAIRES = {
  Animaux: [['Chat', 'Tigre'], ['Chien', 'Loup'], ['Dauphin', 'Requin'], ['Cheval', 'Zèbre'], ['Abeille', 'Guêpe'], ['Lion', 'Tigre'], ['Crocodile', 'Alligator'], ['Lapin', 'Lièvre'], ['Corbeau', 'Pie'], ['Mouton', 'Chèvre'], ['Hibou', 'Chouette'], ['Grenouille', 'Crapaud'], ['Phoque', 'Otarie'], ['Rat', 'Souris']],
  Nourriture: [['Pizza', 'Tarte flambée'], ['Raclette', 'Fondue'], ['Crêpe', 'Gaufre'], ['Croissant', 'Pain au chocolat'], ['Sushi', 'Maki'], ['Hamburger', 'Hot-dog'], ['Glace', 'Sorbet'], ['Pâtes', 'Riz'], ['Citron', 'Citron vert'], ['Beurre', 'Margarine'], ['Café', 'Thé'], ['Vin', 'Bière'], ['Chocolat', 'Caramel'], ['Pomme', 'Poire']],
  Lieux: [['Plage', 'Piscine'], ['Cinéma', 'Théâtre'], ['Hôpital', 'Clinique'], ['Montagne', 'Colline'], ['Gare', 'Aéroport'], ['Bibliothèque', 'Librairie'], ['Supermarché', 'Marché'], ['Zoo', 'Ferme'], ['Château', 'Palais'], ['Église', 'Cathédrale'], ['Lac', 'Mer'], ['Hôtel', 'Camping'], ['Musée', "Galerie d'art"], ['Discothèque', 'Bar']],
  Objets: [['Stylo', 'Crayon'], ['Fourchette', 'Cuillère'], ['Chaise', 'Tabouret'], ['Montre', 'Réveil'], ['Guitare', 'Violon'], ['Lunettes', 'Lentilles'], ['Parapluie', 'Imperméable'], ['Téléphone', 'Tablette'], ['Valise', 'Sac à dos'], ['Bougie', 'Lampe de poche'], ['Vélo', 'Trottinette'], ['Oreiller', 'Coussin'], ['Savon', 'Shampoing'], ['Livre', 'Magazine']],
  Métiers: [['Médecin', 'Infirmier'], ['Pompier', 'Policier'], ['Boulanger', 'Pâtissier'], ['Pilote', "Hôtesse de l'air"], ['Professeur', "Directeur d'école"], ['Coiffeur', 'Barbier'], ['Chanteur', 'Musicien'], ['Acteur', 'Réalisateur'], ['Plombier', 'Électricien'], ['Avocat', 'Juge'], ['Serveur', 'Barman'], ['Dentiste', 'Orthodontiste'], ['Journaliste', 'Écrivain'], ['Agriculteur', 'Jardinier']],
  Sports: [['Football', 'Rugby'], ['Tennis', 'Badminton'], ['Ski', 'Snowboard'], ['Natation', 'Plongée'], ['Basket', 'Handball'], ['Boxe', 'Karaté'], ['Vélo', 'Moto'], ['Golf', 'Mini-golf'], ['Hockey', 'Curling'], ['Course à pied', 'Marche'], ['Surf', 'Planche à voile'], ['Volley', 'Beach-volley'], ['Escalade', 'Randonnée']],
};

module.exports = { MOTS, PAIRES };
