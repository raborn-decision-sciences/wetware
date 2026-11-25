/* ID Spoof: everyday first names from many cultures, and single-word jobs.
 * Original lists for this project. Names avoid the recurring Lowlight
 * characters (Rook, Vex, Kessler, Moth, Ilse). Jobs are concrete and easy to
 * type; several double as surnames (baker, tailor, smith-adjacent trades),
 * which is the point of the baker/Baker comparison (McWeeny et al. 1987).
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const w = (s) => s.trim().split(/\s*,\s*/);

  WW.idSpoofNames = w(`
    Ada, Aiko, Amara, Anya, Arjun, Ayla, Bao, Beatriz, Bilal, Bruno, Calla, Carmen, Chidi, Chloe, Dante,
    Dara, Dev, Dmitri, Eamon, Elif, Emeka, Esme, Ezra, Farah, Felix, Freya, Gael, Greta, Hana, Hassan,
    Hugo, Idris, Ines, Ingrid, Isaac, Ivo, Jada, Jamal, Javier, Jin, Joaquin, Juno, Kai, Kalani, Kamal,
    Kenji, Kiara, Kofi, Lars, Leila, Lena, Leon, Lucia, Luka, Mabel, Malik, Mara, Marco, Mateo, Maya,
    Mei, Mika, Milo, Mira, Nadia, Nico, Nina, Nils, Noor, Obi, Olga, Omar, Orla, Oscar, Paloma, Pavel,
    Petra, Priya, Quinn, Rafael, Rania, Ravi, Reza, Rhea, Rosa, Rui, Samir, Sana, Selma, Soren, Suki,
    Tariq, Tess, Theo, Tomas, Uma, Vera, Viktor, Wen, Xavier, Yara, Yusuf, Zane, Zara, Zofia, Anders,
    Cyrus, Delia, Elena, Fatima, Goran, Hiro, Jonah, Keiko, Lina, Nnamdi, Pia, Ronan, Sadia, Tobias,
    Ugo, Valentina, Wanda, Yuki, Zubair, Aurelio, Bea, Cormac, Dalia, Emil, Femi, Gita, Imani, Jorge,
    Kaveh, Lotte, Mehmet, Naoko, Osei, Pilar, Rosalind, Sven, Thandi, Ulla, Vikram, Ximena, Yosef, Zola
  `);

  WW.idSpoofJobs = w(`
    baker, nurse, pilot, chemist, welder, courier, broker, medic, tailor, florist, janitor, coder,
    plumber, dentist, barber, locksmith, mechanic, librarian, chef, bartender, drummer, sculptor,
    surgeon, lawyer, teacher, farmer, fisher, jeweler, banker, reporter, electrician, architect,
    pharmacist, gardener, guard, driver, translator, photographer, carpenter, accountant, hacker,
    smuggler, bouncer, fixer, dealer, butcher, cleaner, painter, singer, priest
  `);
})(globalThis);
