/* Wetware story: intercepts from Lowlight. Unlocked by days of practice
 * (distinct calendar days with at least one training session), never by
 * scores, so the story rewards spacing rather than grinding (PLAN §3).
 * Original text for this project.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  WW.intercepts = [
    { days: 1, title: 'Handshake', text: 'Rook: "Everybody down here has chrome. Chrome breaks, chrome gets recalled, chrome gets hacked. What you’ve got between your ears doesn’t phone home. Keep it sharp and you’ll outlast all of them."' },
    { days: 2, title: 'Second day', text: 'A message pinned to your door: TWO DAYS IN A ROW. MOST QUIT AFTER ONE. —R. You didn’t hear anyone on the stairs.' },
    { days: 3, title: 'Overheard', text: 'Two runners in the noodle line, arguing about neural boosters. One swears by them. The other has a twitch in her left eye she pretends not to notice. Rook, behind you: "Practice doesn’t come with a warranty void."' },
    { days: 5, title: 'The Vault', text: 'Rook slides a datachip across the counter. "Corporate vault in the Spire. The lock rotates its keys every ninety seconds. Ninety seconds is plenty, if you don’t waste the first sixty remembering what you just saw."' },
    { days: 7, title: 'A week', text: '"A week," Rook says, not looking up. "Your reaction times are steadier. Don’t get cocky. Steady is what keeps you alive, not fast."' },
    { days: 10, title: 'Ghosts', text: 'Somebody has been tailing your packets through the subnet: three signatures that never quite collide with yours. You lose two of them in a crowd of traffic. The third is still out there.' },
    { days: 14, title: 'The fence', text: 'Vex counts your take twice and comes up short both times. You count it once, out loud, slowly. Vex laughs and pays in full. "You’re learning. That’s bad for business."' },
    { days: 21, title: 'Rook’s rule', text: 'Late, the rain loud on the shutters. Rook: "I tested myself every month for twenty years. Same tests. Most months, nothing moved. Then one winter everything did. You don’t get to pick the month. You just have to still be showing up."' },
    { days: 30, title: 'Baseline', text: 'A month. Rook hands you a printout: your first diagnostic run next to last night’s. Some lines moved. Some didn’t. "Now you know which work is paying. That’s more than most people in this city ever find out."' },
    { days: 45, title: 'The Spire', text: 'The vault job is on. You walk the route in your head: steel door, coat hook, shoe rack. Everything is where you left it. The cameras cut, and for once the dark doesn’t bother you.' },
    // After the job: roughly monthly, in step with the diagnostics retests.
    { days: 60, title: 'Aftermath', text: 'The Spire says nothing about the vault. That is how you know it hurt. Rook: "Keep the routine. Same hour, same stool, same tests. A routine is the best alibi there is."' },
    { days: 75, title: 'What was in the vault', text: 'Not money. Test records: thousands of names, one row a month, years deep. A last column headed RESPONDERS, mostly empty. Rook reads it twice and puts the chip in the freezer, behind the dumplings.' },
    { days: 90, title: 'Responders', text: 'Vex finds a name on the list: Moth. Flat scores for three years, then a jump the month the graft went in. "Grafts don’t teach you anything," Vex says. "They make the test easier to pass. The job stays exactly as hard."' },
    { days: 120, title: 'Your line', text: 'Your name isn’t on the list. Rook seems relieved. "Good. Everything in your numbers, you put there. Nobody can recall it, patch it, or switch it off."' },
    { days: 150, title: 'Kessler', text: 'Kessler wants in on the next job and has the scores to prove it: the same three tests, every night, for months. Rook shakes his head at the printout. "He trains for the test. You train for the work. Only one of those shows up on a job."' },
    { days: 180, title: 'Half a year', text: 'Two printouts on the counter, six months apart. "Most of what moved is what you practised," Rook says. "A little leaked into the rest. Down here, a little is plenty. Don’t let anyone sell you more than that."' },
    { days: 240, title: 'The sealed graft', text: 'Vex traces the graft with no maker’s mark to a Spire lab that closed before anyone could audit it. It doesn’t add anything. It lights up what is already there. "A mirror," Vex says. "Expensive. Honest, for once."' },
    { days: 300, title: 'A flat month', text: 'Rain on the shutters again. Rook runs the old tests, the same ones as twenty years ago. Nothing moved this month. Rook logs it anyway. "Showing up is the result. The numbers are just the receipt."' },
    { days: 365, title: 'A year', text: 'Rook leaves the shop keys on your bench and goes to sleep in the back. A year of showing up. Down here that is rarer than chrome, and worth more.' },
  ];

  /** Unlocked intercepts given distinct practice days. */
  WW.intercepts.unlocked = (days) => WW.intercepts.filter((x) => x.days <= days);
  WW.intercepts.next = (days) => WW.intercepts.find((x) => x.days > days) || null;
})(globalThis);
