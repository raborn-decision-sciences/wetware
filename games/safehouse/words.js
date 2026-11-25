/* Safehouse word pool: concrete, highly imageable nouns, some with a
 * Lowlight flavour. Hand-authored for this project. Avoids the locus names
 * so an item never collides with the place it is stashed.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  WW.safehouseWords = `
anchor anvil apple arrow axe badge balloon banana bandage barrel basket bat battery beacon beard bee bell belt bicycle blanket
blender boat bone book boot bottle bow bowl box bracelet brick bridge broom bubble bucket bugle bullet butterfly button cable
cactus cage cake camel camera candle cannon canoe cap car carrot castle cat chain chair cheese cherry chess chicken chimney
cigar clock cloud clown coconut coffin coin comb compass cone cookie corn cowboy crab crane crayon crow crown crystal cup
curtain dagger daisy dart deer diamond dice dinosaur dolphin donkey dragon drill drum duck eagle earring egg elephant
envelope eye falcon feather fence fern fiddle fire fish flag flame flashlight flute fork fox frog garlic gear ghost
giraffe glass globe glove goat goggles gorilla grapes guitar hammer hamster harp hat hawk helmet hive hook horn horse
hourglass iceberg igloo jacket jaguar jar jellyfish jewel kangaroo kettle key kite knife koala ladder ladle lantern leaf
lemon lens leopard lighthouse lion lizard lobster lock magnet mango map mask match medal melon microphone monkey moon
moose motorcycle mouse mushroom needle nest net octopus onion orange ostrich owl paddle padlock paintbrush panda parachute
parrot peach peacock peanut pear pearl pelican pen penguin pepper piano pickaxe pig pineapple pipe pirate pistol pizza
planet plug plum pumpkin puppet pyramid rabbit raccoon radio raft rake raven razor ring robot rocket rooster rope rose
ruby saddle sail salmon sandal satellite saw saxophone scarf scissors scorpion screw seahorse shark sheep shell shield
ship shovel skull sled snail snake snowman sock spider spoon squid squirrel stamp star statue stethoscope sword syringe
tank teapot telescope tent thimble throne tiger toaster tomato tooth torch tornado tortoise tractor trophy trumpet
tulip turtle typewriter umbrella unicorn vase violin volcano vulture waffle wallet walrus watch whale wheel whistle
wig windmill wolf worm wrench yacht zebra zipper
drone hologram katana visor implant datachip cyberdeck jumpsuit hoverbike antenna barcode canister
capsule cartridge goggles keycard laser mainframe monocle nanobot pager prism reactor scanner shuriken
stimpack switchblade taser transistor turbine wristband
`
    .trim()
    .split(/\s+/)
    .filter((w, i, a) => a.indexOf(w) === i);
})(globalThis);
