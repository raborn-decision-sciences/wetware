/* Lexicon Breach category lists (original, authored for this project).
 *
 * Each category is split into subcategories so the game can score
 * clustering and switching (Troyer, Moscovitch & Winocur 1997). Entries
 * are lowercase singular; the game also accepts regular plurals. A word
 * that is in the ENABLE dictionary but not on the list is sent to the
 * player to confirm at the end of the round, so the lists only need to be
 * generous, not complete. These lists are the only words the game ever
 * shows that the player did not type.
 *
 * tier: 1 = rich categories, 2 = medium, 3 = narrow.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const w = (s) => s.trim().split(/\s*,\s*/);

  WW.lexiconCategories = [
    {
      id: 'animals',
      name: 'Animals',
      tier: 1,
      subs: {
        pets: w('dog, cat, puppy, kitten, hamster, gerbil, guinea pig, ferret, rabbit, bunny, goldfish, parakeet, budgie, canary, mouse, rat, chinchilla, hound, terrier, poodle, collie, beagle, retriever, spaniel, labrador, dachshund, pug, mutt'),
        farm: w('cow, bull, ox, calf, horse, pony, foal, donkey, mule, pig, hog, sow, piglet, sheep, ram, ewe, lamb, goat, kid, chicken, hen, rooster, chick, duck, goose, turkey, llama, alpaca, yak, buffalo, bison'),
        'wild mammals': w('lion, tiger, leopard, cheetah, jaguar, panther, cougar, puma, lynx, bobcat, wolf, fox, coyote, jackal, hyena, bear, panda, elephant, rhino, rhinoceros, hippo, hippopotamus, giraffe, zebra, gazelle, antelope, impala, wildebeest, gnu, deer, elk, moose, reindeer, caribou, kangaroo, wallaby, koala, wombat, platypus, monkey, ape, gorilla, chimpanzee, chimp, orangutan, baboon, lemur, gibbon, sloth, armadillo, anteater, aardvark, badger, otter, beaver, raccoon, skunk, porcupine, hedgehog, weasel, stoat, ferret, mink, wolverine, boar, warthog, camel, dromedary, tapir, okapi, meerkat, mongoose, opossum, possum, bat'),
        'small mammals': w('squirrel, chipmunk, mole, vole, shrew, lemming, gopher, marmot, groundhog, hare, jerboa, dormouse'),
        birds: w('bird, eagle, hawk, falcon, owl, vulture, condor, crow, raven, magpie, jay, robin, sparrow, finch, wren, swallow, swift, starling, blackbird, thrush, pigeon, dove, parrot, macaw, cockatoo, toucan, pelican, flamingo, heron, crane, stork, swan, gull, seagull, albatross, puffin, penguin, ostrich, emu, kiwi, peacock, pheasant, quail, grouse, woodpecker, hummingbird, kingfisher, cuckoo, lark, nightingale, oriole, cardinal, bluebird, mallard, loon, cormorant, osprey, kestrel, buzzard, vulture'),
        'sea life': w('fish, shark, whale, dolphin, porpoise, seal, sea lion, walrus, octopus, squid, jellyfish, crab, lobster, shrimp, prawn, oyster, clam, mussel, scallop, starfish, urchin, eel, ray, stingray, manta, salmon, trout, tuna, cod, herring, sardine, anchovy, mackerel, swordfish, marlin, barracuda, piranha, catfish, carp, pike, bass, perch, halibut, flounder, sole, seahorse, orca, narwhal, manatee, coral, sponge, anemone'),
        'reptiles and amphibians': w('snake, python, cobra, viper, rattlesnake, adder, boa, anaconda, mamba, lizard, gecko, iguana, chameleon, komodo, monitor, skink, turtle, tortoise, terrapin, crocodile, alligator, caiman, frog, toad, tadpole, newt, salamander, axolotl'),
        'bugs and creepy-crawlies': w('insect, ant, bee, wasp, hornet, fly, mosquito, gnat, midge, beetle, ladybug, ladybird, butterfly, moth, caterpillar, dragonfly, grasshopper, cricket, locust, cicada, cockroach, roach, termite, flea, louse, tick, mite, spider, tarantula, scorpion, centipede, millipede, worm, earthworm, slug, snail, leech, firefly, mantis, aphid, weevil, earwig'),
      },
    },
    {
      id: 'food',
      name: 'Food and drink',
      tier: 1,
      subs: {
        fruit: w('apple, pear, banana, orange, lemon, lime, grapefruit, tangerine, mandarin, clementine, grape, raisin, cherry, plum, prune, peach, nectarine, apricot, mango, papaya, pineapple, melon, watermelon, cantaloupe, honeydew, kiwi, strawberry, raspberry, blueberry, blackberry, cranberry, gooseberry, currant, fig, date, pomegranate, guava, lychee, coconut, avocado, quince, persimmon, olive, berry'),
        vegetables: w('carrot, potato, tomato, onion, garlic, leek, shallot, pea, bean, lentil, chickpea, corn, cabbage, lettuce, spinach, kale, broccoli, cauliflower, celery, cucumber, pepper, chili, zucchini, courgette, squash, pumpkin, eggplant, aubergine, beet, beetroot, radish, turnip, parsnip, yam, asparagus, artichoke, okra, mushroom, sprout, rhubarb, ginger, herb, basil, parsley, mint, cress'),
        'bread and grains': w('bread, toast, roll, bagel, croissant, muffin, rice, pasta, noodle, spaghetti, macaroni, flour, oat, oatmeal, porridge, cereal, granola, cracker, tortilla, pita, couscous, quinoa, barley, wheat, rye, dumpling, pancake, waffle'),
        'meat and eggs': w('meat, beef, steak, pork, ham, bacon, sausage, salami, chicken, turkey, lamb, mutton, veal, venison, burger, hamburger, meatball, egg, fish, tofu, jerky, chop, rib, brisket, kebab'),
        dairy: w('milk, cheese, butter, cream, yogurt, yoghurt, custard, cheddar, brie, mozzarella, parmesan, feta, ghee, margarine'),
        'dishes and condiments': w('soup, stew, salad, sandwich, pizza, taco, burrito, curry, chili, omelet, omelette, sushi, risotto, lasagna, casserole, pie, quiche, stirfry, ramen, pho, chowder, broth, hotdog, fries, chips, nachos, gravy, sauce, ketchup, mustard, mayonnaise, mayo, salsa, pickle, relish, jam, jelly, honey, syrup, vinegar, oil, salt, pepper, sugar'),
        'sweets and snacks': w('cake, cookie, biscuit, brownie, cupcake, donut, doughnut, pastry, tart, pudding, candy, sweet, chocolate, fudge, toffee, caramel, lollipop, gum, icecream, sorbet, sherbet, marshmallow, licorice, mousse, cheesecake, cracker, popcorn, pretzel, nut, peanut, almond, cashew, walnut, pecan, pistachio, hazelnut'),
        drinks: w('water, juice, soda, pop, lemonade, tea, coffee, espresso, latte, cocoa, milkshake, smoothie, beer, ale, lager, stout, wine, cider, champagne, whisky, whiskey, vodka, gin, rum, tequila, brandy, sake, cocktail, punch'),
      },
    },
    {
      id: 'body',
      name: 'Parts of the body',
      tier: 1,
      subs: {
        'head and face': w('head, face, hair, scalp, forehead, brow, eyebrow, eye, eyelid, eyelash, lash, pupil, iris, ear, earlobe, nose, nostril, cheek, mouth, lip, tongue, tooth, teeth, gum, jaw, chin, temple, skull, beard, mustache, moustache'),
        'neck and torso': w('neck, throat, shoulder, chest, breast, back, spine, rib, belly, stomach, abdomen, navel, waist, hip, pelvis, buttock, bottom, torso, trunk, groin, collarbone'),
        'arms and legs': w('arm, elbow, forearm, wrist, hand, palm, finger, thumb, knuckle, nail, fingernail, fist, leg, thigh, knee, kneecap, shin, calf, ankle, foot, feet, heel, toe, toenail, sole, arch, armpit'),
        'inside the body': w('brain, heart, lung, liver, kidney, bladder, gut, intestine, bowel, colon, pancreas, spleen, gland, appendix, vein, artery, blood, muscle, tendon, ligament, nerve, bone, marrow, skin, cartilage, joint, skeleton, tonsil, larynx, uterus, womb, ovary, prostate, esophagus, windpipe, diaphragm, retina, cornea, eardrum, cell'),
      },
    },
    {
      id: 'clothing',
      name: 'Clothing and accessories',
      tier: 1,
      subs: {
        tops: w('shirt, blouse, tee, tshirt, top, sweater, jumper, cardigan, hoodie, sweatshirt, vest, waistcoat, tank, polo, tunic, jersey, turtleneck, camisole'),
        bottoms: w('pants, trousers, jeans, shorts, skirt, slacks, leggings, tights, khakis, chinos, culottes, sweatpants, joggers, overalls, dungarees'),
        'coats, suits and dresses': w('coat, jacket, blazer, parka, anorak, raincoat, overcoat, trenchcoat, cape, cloak, poncho, shawl, windbreaker, suit, tuxedo, uniform, robe, gown, dress, frock, kimono, sari, kilt, apron, smock, jumpsuit, onesie, bathrobe, dressing gown'),
        'underwear and nightwear': w('underwear, bra, panties, knickers, boxers, briefs, sock, stocking, slip, corset, pajamas, pyjamas, nightgown, nightie, swimsuit, bikini, trunks, thong, undershirt, garter'),
        footwear: w('shoe, boot, sneaker, trainer, sandal, slipper, heel, loafer, clog, flipflop, moccasin, pump, wellington, galosh, stiletto, espadrille'),
        headwear: w('hat, cap, beanie, beret, bonnet, helmet, hood, turban, fedora, bowler, sombrero, visor, crown, tiara, headband, bandana, balaclava'),
        accessories: w('scarf, glove, mitten, belt, tie, bowtie, cravat, suspenders, braces, handbag, purse, bag, backpack, wallet, watch, bracelet, necklace, ring, earring, brooch, pendant, locket, chain, sunglasses, glasses, goggles, mask, veil, umbrella, cufflink, badge, button, zipper, pocket, collar, sleeve, cuff, lapel, hem'),
      },
    },
    {
      id: 'jobs',
      name: 'Jobs and occupations',
      tier: 1,
      subs: {
        healthcare: w('doctor, nurse, surgeon, dentist, medic, paramedic, pharmacist, therapist, psychologist, psychiatrist, vet, veterinarian, midwife, optician, physician, chemist, radiologist, anesthetist, orderly, counselor'),
        trades: w('plumber, electrician, carpenter, builder, mason, bricklayer, welder, mechanic, roofer, painter, decorator, glazier, joiner, locksmith, blacksmith, smith, tiler, technician, engineer, machinist, handyman, janitor, cleaner, gardener, landscaper, miner, logger, lumberjack'),
        'office and professional': w('accountant, lawyer, attorney, solicitor, barrister, judge, banker, clerk, secretary, receptionist, manager, executive, administrator, analyst, consultant, auditor, broker, agent, economist, actuary, programmer, coder, developer, designer, architect, editor, writer, journalist, reporter, translator, interpreter, librarian, archivist, researcher, scientist, statistician, typist, boss, ceo, intern'),
        'shops and service': w('waiter, waitress, chef, cook, baker, butcher, barista, bartender, cashier, shopkeeper, grocer, salesman, saleswoman, clerk, hairdresser, barber, stylist, tailor, seamstress, cobbler, florist, jeweler, jeweller, housekeeper, maid, butler, nanny, babysitter, chauffeur, driver, courier, postman, mailman, porter, bellhop, concierge, usher, valet'),
        'public service': w('teacher, professor, lecturer, tutor, principal, police, policeman, policewoman, officer, detective, cop, sheriff, firefighter, fireman, soldier, sailor, marine, pilot, guard, bodyguard, spy, politician, senator, mayor, diplomat, ambassador, priest, vicar, minister, rabbi, imam, monk, nun, pastor, chaplain, ranger, warden, lifeguard, inspector, coroner'),
        'arts and entertainment': w('actor, actress, artist, singer, musician, dancer, painter, sculptor, photographer, director, producer, composer, conductor, poet, novelist, author, comedian, magician, clown, model, illustrator, animator, drummer, guitarist, pianist, violinist, dj'),
        'outdoors and travel': w('farmer, rancher, fisherman, fisher, shepherd, cowboy, beekeeper, forester, hunter, trapper, sailor, captain, astronaut, explorer, surveyor, geologist, pilot, trucker, chauffeur'),
      },
    },
    {
      id: 'tools',
      name: 'Tools',
      tier: 2,
      subs: {
        'hand tools': w('hammer, mallet, screwdriver, wrench, spanner, pliers, saw, hacksaw, chisel, file, rasp, plane, axe, hatchet, crowbar, pry bar, clamp, vise, vice, level, square, tape, ruler, awl, knife, scissors, shears, snips, trowel, scraper, putty knife, sledgehammer, pickaxe, pick, wedge, punch, socket, ratchet, allen key, tweezers, pincers'),
        'power tools': w('drill, sander, grinder, jigsaw, chainsaw, router, lathe, nailgun, nail gun, heatgun, heat gun, blowtorch, torch, welder, soldering iron, compressor, jackhammer, generator'),
        garden: w('shovel, spade, rake, hoe, fork, pitchfork, scythe, sickle, pruner, secateurs, loppers, wheelbarrow, hose, sprinkler, mower, lawnmower, trimmer, strimmer, edger, dibber, watering can'),
        fasteners: w('nail, screw, bolt, nut, washer, rivet, staple, stapler, glue, tape, rope, cord, string, wire, chain, hook, hinge, bracket, pin, peg, dowel, anchor'),
        measuring: w('ruler, tape measure, protractor, compass, caliper, calipers, gauge, meter, thermometer, scale, scales, stopwatch, multimeter, plumb line, spirit level, sextant, square'),
        'workshop': w('ladder, bucket, brush, paintbrush, roller, sponge, broom, mop, funnel, magnifier, magnifying glass, flashlight, lantern, toolbox, workbench, jack, pulley, lever, crank, anvil, bellows, forge, needle, thimble, crochet hook, loom, spindle'),
      },
    },
    {
      id: 'vehicles',
      name: 'Vehicles and transport',
      tier: 2,
      subs: {
        'road vehicles': w('car, automobile, taxi, cab, bus, coach, minibus, van, truck, lorry, pickup, jeep, suv, limo, limousine, convertible, sedan, hatchback, wagon, motorcycle, motorbike, scooter, moped, bike, bicycle, tricycle, unicycle, tandem, quad, ambulance, firetruck, fire engine, tanker, trailer, caravan, camper, rv, hearse, tractor, bulldozer, digger, excavator, forklift, crane, tank, go kart, kart, rickshaw, segway, skateboard, rollerskate, stroller, pram, buggy'),
        rail: w('train, tram, trolley, streetcar, subway, metro, underground, monorail, locomotive, engine, carriage, wagon, freight, railcar, maglev, funicular, cable car, gondola'),
        boats: w('boat, ship, yacht, sailboat, dinghy, canoe, kayak, raft, rowboat, ferry, liner, cruiser, tugboat, tug, barge, tanker, freighter, trawler, submarine, sub, speedboat, jetski, catamaran, gondola, punt, schooner, galleon, frigate, destroyer, battleship, carrier, lifeboat, hovercraft, paddleboat, junk, sampan, ark'),
        aircraft: w('plane, airplane, aeroplane, jet, airliner, glider, helicopter, chopper, blimp, airship, zeppelin, balloon, drone, rocket, spaceship, spacecraft, shuttle, satellite, biplane, seaplane, hang glider, paraglider, parachute, bomber, fighter'),
        'other ways to travel': w('sled, sledge, sleigh, toboggan, snowmobile, cart, wheelbarrow, chariot, carriage, stagecoach, wagon, horse, camel, elevator, lift, escalator, conveyor, hoverboard'),
      },
    },
    {
      id: 'sports',
      name: 'Sports and games',
      tier: 2,
      subs: {
        'ball sports': w('soccer, football, rugby, cricket, baseball, softball, basketball, netball, volleyball, handball, hockey, lacrosse, tennis, squash, badminton, racquetball, golf, polo, bowling, billiards, snooker, pool, croquet, dodgeball, kickball, pickleball, ping pong, table tennis, water polo, rounders, hurling'),
        'athletics and individual sports': w('running, jogging, sprinting, marathon, swimming, diving, cycling, rowing, canoeing, kayaking, sailing, surfing, windsurfing, skiing, snowboarding, skating, skateboarding, climbing, bouldering, hiking, gymnastics, archery, shooting, fencing, boxing, wrestling, judo, karate, taekwondo, kickboxing, weightlifting, triathlon, decathlon, hurdles, javelin, discus, shotput, pole vault, high jump, long jump, equestrian, riding, racing, motocross, luge, bobsled, curling, darts, yoga, pilates, aerobics, parkour, fishing'),
        'board games': w('chess, checkers, draughts, go, backgammon, monopoly, scrabble, cluedo, mahjong, dominoes, domino, ludo, bingo, risk, othello, shogi, sudoku, crossword, jigsaw, puzzle'),
        'card games': w('poker, bridge, blackjack, rummy, solitaire, patience, snap, hearts, spades, cribbage, canasta, euchre, baccarat, gin'),
        'playground and party games': w('tag, hide and seek, hopscotch, marbles, jacks, leapfrog, tug of war, charades, tag, frisbee, kite, yo yo, yoyo, skipping, jump rope, hula hoop, paintball, laser tag, bowls, quoits, horseshoes, cornhole, trivia, pinball, arcade'),
      },
    },
    {
      id: 'kitchen',
      name: 'Things in a kitchen',
      tier: 2,
      subs: {
        appliances: w('oven, stove, cooker, hob, microwave, fridge, refrigerator, freezer, dishwasher, toaster, kettle, blender, mixer, processor, juicer, grill, griddle, fryer, airfryer, slow cooker, rice cooker, coffee maker, espresso machine, extractor, range, sink, tap, faucet'),
        cookware: w('pot, pan, saucepan, skillet, frying pan, wok, casserole, dutch oven, roasting tin, baking tray, tray, sheet, tin, dish, ramekin, steamer, colander, sieve, strainer, kettle, pressure cooker'),
        utensils: w('knife, fork, spoon, teaspoon, ladle, spatula, whisk, tongs, peeler, grater, zester, masher, rolling pin, corkscrew, opener, can opener, tin opener, scissors, skewer, chopsticks, cleaver, cutlery, silverware, scoop, baster, mortar, pestle, timer, thermometer, funnel'),
        tableware: w('plate, bowl, cup, mug, glass, saucer, jug, pitcher, teapot, carafe, decanter, tumbler, goblet, platter, tray, napkin, tablecloth, placemat, coaster, salt shaker, pepper mill, butter dish, gravy boat, eggcup, straw'),
        storage: w('cupboard, cabinet, drawer, shelf, pantry, larder, jar, canister, tupperware, container, box, bin, rack, spice rack, breadbin, bread box, foil, cling film, wrap, bag, lid'),
        'around the kitchen': w('counter, worktop, island, table, chair, stool, apron, oven mitt, oven glove, tea towel, dishcloth, sponge, scourer, detergent, soap, mat, cookbook, recipe, scale, scales, chopping board, cutting board, trivet, timer'),
      },
    },
    {
      id: 'plants',
      name: 'Plants and trees',
      tier: 2,
      subs: {
        trees: w('tree, oak, ash, elm, beech, birch, maple, pine, fir, spruce, cedar, cypress, redwood, sequoia, yew, larch, willow, poplar, aspen, alder, hazel, chestnut, walnut, sycamore, plane, lime, linden, holly, hawthorn, rowan, juniper, palm, baobab, eucalyptus, gum, acacia, mahogany, teak, ebony, bamboo, magnolia, dogwood, hickory, cherry, apple, olive, banyan, mangrove, sapling'),
        flowers: w('flower, rose, tulip, daisy, lily, daffodil, sunflower, orchid, poppy, violet, pansy, iris, lavender, lilac, jasmine, carnation, chrysanthemum, marigold, petunia, geranium, begonia, peony, dahlia, hyacinth, crocus, snowdrop, bluebell, buttercup, dandelion, primrose, foxglove, lotus, hibiscus, camellia, azalea, rhododendron, gardenia, freesia, gladiolus, zinnia, aster, cornflower, clover, heather, honeysuckle, wisteria, bougainvillea, sweet pea, forget me not, edelweiss'),
        'grasses, shrubs and crops': w('grass, moss, fern, ivy, vine, reed, rush, sedge, bracken, lichen, algae, seaweed, kelp, weed, nettle, thistle, bramble, briar, hedge, shrub, bush, cactus, succulent, aloe, agave, yucca, mistletoe, creeper, clover, shamrock, bulrush, papyrus, hemp, flax, cotton, wheat, corn, rice, barley, oat'),
        herbs: w('basil, mint, parsley, sage, thyme, rosemary, oregano, dill, chive, coriander, cilantro, tarragon, fennel, chamomile, lemongrass, bay, catnip, marjoram'),
        'plant parts': w('leaf, root, stem, stalk, trunk, branch, twig, bark, bud, petal, seed, pod, thorn, bulb, tuber, pollen, sap, cone, acorn, nut, berry, blossom, bloom, frond, needle, shoot, sprout, vine'),
      },
    },
    {
      id: 'furniture',
      name: 'Furniture and household',
      tier: 3,
      subs: {
        seating: w('chair, armchair, sofa, couch, settee, stool, bench, ottoman, footstool, recliner, rocker, beanbag, pouf, futon, loveseat, chaise, throne, pew, highchair, deckchair, hammock'),
        bedding: w('bed, bunk, cot, crib, cradle, mattress, pillow, cushion, duvet, quilt, blanket, sheet, comforter, headboard, bedspread, divan, waterbed, hammock'),
        storage: w('wardrobe, closet, dresser, chest, cabinet, cupboard, drawer, bookcase, bookshelf, shelf, shelving, sideboard, dresser, armoire, hutch, trunk, locker, rack, coatrack, hatstand, cubby, bureau, credenza, vanity, nightstand'),
        surfaces: w('table, desk, counter, workbench, coffee table, side table, dining table, bedside table, console, lectern, podium, easel, stand, nightstand, bar'),
        'fixtures and decor': w('lamp, light, chandelier, lampshade, mirror, clock, curtain, drape, blind, shutter, rug, carpet, mat, doormat, radiator, heater, fireplace, mantel, mantelpiece, fan, vase, picture, painting, frame, poster, ornament, candle, candlestick, shelf, hook, doorknob, switch, socket, bath, bathtub, shower, toilet, basin, sink, towel, rail'),
        appliances: w('television, tv, radio, stereo, speaker, computer, laptop, printer, phone, telephone, router, console, vacuum, hoover, iron, washer, dryer, washing machine, tumble dryer, dehumidifier, humidifier, thermostat, alarm, doorbell, kettle, toaster'),
      },
    },
    {
      id: 'instruments',
      name: 'Musical instruments',
      tier: 3,
      subs: {
        strings: w('guitar, bass, violin, viola, cello, fiddle, harp, banjo, mandolin, ukulele, lute, sitar, zither, lyre, double bass, contrabass, dulcimer, balalaika, bouzouki, koto, shamisen'),
        keyboards: w('piano, keyboard, organ, harpsichord, synthesizer, synth, accordion, harmonium, clavichord, celesta, melodica, spinet, keytar'),
        woodwind: w('flute, piccolo, recorder, clarinet, oboe, bassoon, saxophone, sax, fife, panpipe, panpipes, bagpipe, bagpipes, harmonica, kazoo, ocarina, whistle, didgeridoo, shawm, pipe'),
        brass: w('trumpet, trombone, tuba, horn, cornet, bugle, flugelhorn, euphonium, sousaphone, french horn, conch'),
        percussion: w('drum, snare, bass drum, timpani, kettledrum, cymbal, gong, triangle, tambourine, xylophone, marimba, vibraphone, glockenspiel, bell, bells, chimes, castanets, maracas, bongo, bongos, conga, tabla, djembe, cowbell, woodblock, cajon, steelpan, washboard, rattle, clapper'),
        electronic: w('sampler, theremin, drum machine, turntable, sequencer, vocoder, moog'),
      },
    },
    {
      id: 'weather',
      name: 'Weather and sky',
      tier: 3,
      subs: {
        'rain, snow and fog': w('rain, drizzle, shower, downpour, deluge, storm, thunderstorm, monsoon, sleet, hail, snow, snowflake, flurry, blizzard, frost, ice, dew, mist, fog, haze, smog, cloud, puddle, flood, rainbow, drought, humidity, damp'),
        wind: w('wind, breeze, gust, gale, squall, hurricane, typhoon, cyclone, tornado, twister, whirlwind, draft, draught, zephyr, sandstorm, dust storm, jet stream'),
        'sun, moon and stars': w('sun, sunshine, sunlight, sunrise, sunset, dawn, dusk, twilight, moon, moonlight, star, starlight, planet, comet, meteor, asteroid, galaxy, nebula, eclipse, aurora, horizon, sky, heaven, constellation, orbit, crescent, halo'),
        'seasons and extremes': w('thunder, lightning, heatwave, cold snap, chill, freeze, thaw, warmth, heat, temperature, pressure, front, forecast, climate, season, spring, summer, autumn, fall, winter, avalanche, landslide, wildfire, ozone, overcast, sleet'),
      },
    },
    {
      id: 'materials',
      name: 'Metals and materials',
      tier: 3,
      subs: {
        metals: w('iron, steel, copper, brass, bronze, tin, lead, zinc, aluminium, aluminum, nickel, chrome, chromium, titanium, tungsten, gold, silver, platinum, mercury, cobalt, magnesium, lithium, uranium, plutonium, pewter, solder, alloy, ore, palladium, cadmium, manganese, sodium, potassium, calcium'),
        'stone, wood and gems': w('wood, timber, lumber, bamboo, cork, stone, rock, marble, granite, slate, sandstone, limestone, chalk, clay, sand, gravel, mud, soil, coal, charcoal, diamond, ruby, emerald, sapphire, pearl, amber, jade, quartz, crystal, flint, obsidian, ivory, bone, shell, horn, salt, peat, wax, beeswax, resin, rubber, latex'),
        textiles: w('cotton, wool, silk, linen, leather, suede, fur, felt, denim, velvet, satin, lace, tweed, canvas, hemp, jute, burlap, cashmere, flannel, corduroy, polyester, nylon, rayon, spandex, lycra, fleece, chiffon, muslin, gauze'),
        'manufactured materials': w('glass, plastic, concrete, cement, brick, tile, ceramic, porcelain, china, paper, cardboard, plywood, fiberglass, fibreglass, carbon, graphite, foam, vinyl, acrylic, kevlar, silicon, silicone, tar, asphalt, plaster, mortar, enamel, lacquer, varnish, paint, ink, dye, steel wool, tinfoil, foil'),
      },
    },
  ];
})(globalThis);
