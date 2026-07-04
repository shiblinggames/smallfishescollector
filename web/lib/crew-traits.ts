type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

interface CrewTrait {
  common: string
  rare: string
  legendary: string
}

export function getTraitTier(rarity: string): keyof CrewTrait {
  const r = rarity.toLowerCase() as RarityTier
  if (r === 'legendary' || r === 'mythic') return 'legendary'
  if (r === 'rare' || r === 'epic') return 'rare'
  return 'common'
}

export const CREW_TRAITS: Record<string, CrewTrait> = {
  Bass: {
    common: "Shows up. Does the work. Hasn't died yet.",
    rare: "Shows up. Does the work. Has outlasted four ships and never mentioned it.",
    legendary: "Shows up. Does the work. The Brotherhood stopped targeting him after the third attempt. Nobody knows why he's still alive. Including him.",
  },
  Eel: {
    common: "Slips through things she shouldn't be able to slip through.",
    rare: "Three Deepwatch searches. They found the ship. Never found her.",
    legendary: "Valdris himself put a price on her head in '07. She delivered it back to him. Personally.",
  },
  Flounder: {
    common: "Sees everything coming. Acts like he doesn't.",
    rare: "Flat profile, zero signature. The best scout the Drifters ever had before he stopped showing up.",
    legendary: "Disappeared from the Gilded Net's manifest eighteen months ago. They're still looking. He's been on your ship the whole time.",
  },
  Goldfish: {
    common: "Three-second memory. Zero-second reaction time. It evens out.",
    rare: "Forgets every mission immediately after. Makes her the perfect courier for things nobody should know she carried.",
    legendary: "The Deepwatch interrogated her for six hours. She remembered nothing. That was the plan.",
  },
  Dole: {
    common: "Calls the next move before it's made. Unsettling, mostly.",
    rare: "Read all three ambushes before the Deepwatch sprang a single one. The crew stopped doubting after the second.",
    legendary: "They say the Oracle read Valdris's whole campaign off one tide chart. He changed his plans. It didn't matter.",
  },
  Krill: {
    common: "Small. Expendable. Aware of both. Does it anyway.",
    rare: "The smallest crew member you've ever had. Also the one the enemy never shoots at first. That's a strategy.",
    legendary: "Survived the Bertuna Triangle twice. Once by accident. Once on purpose. Won't say which was which.",
  },
  Minnow: {
    common: "Fast. Unreliable. Sometimes that's enough.",
    rare: "Fastest thing on the water at close range. Terrible at everything else. You don't need everything else every day.",
    legendary: "Set the Coral Run speed record in '11. The Gilded Net disputed it. She ran it again while they were watching.",
  },
  Pufferfish: {
    common: "Nobody boards a ship she's on. That's the whole strategy.",
    rare: "The Brotherhood stopped raiding her convoy after two incidents. The incident reports are sealed.",
    legendary: "The Deepwatch classifies her as a weather event. Technically accurate.",
  },
  Salmon: {
    common: "Knows where she's going. Always has. Doesn't explain it.",
    rare: "Navigated the Pale Current by instinct three times. Claims it's simple. Won't teach anyone.",
    legendary: "The current moves differently when she's aboard. Scientists from the Gilded Net studied it for a year. No conclusion.",
  },
  Sardine: {
    common: "Works best in numbers. You only have one. She's adapting.",
    rare: "Former Drifter fleet coordinator. Managed eleven ships simultaneously. Now she manages you. The adjustment has been mutual.",
    legendary: "At her signal, forty Drifter vessels moved as one. She gave the signal once. Nobody's seen the fleet since.",
  },
  Tuna: {
    common: "Built for distance. Not thrilled about the detours.",
    rare: "Open Waters specialist. Has crossed the Bertuna Triangle so many times it's stopped being interesting to her.",
    legendary: "Completed the full ocean crossing alone. When asked why, said she wanted to see if she could. She could.",
  },
  Angelfish: {
    common: "Looks harmless. Has been told this. Considers it an asset.",
    rare: "The Gilded Net hired her as a diplomat three times. Each negotiation ended with them getting less than they started with.",
    legendary: "Brokered the Coral Run Accord of '13. Both sides signed. Neither side is sure what they agreed to.",
  },
  Anglerfish: {
    common: "Knows what you want before you do. Uses that.",
    rare: "Three separate Deepwatch warrants. None have stuck.",
    legendary: "The Deepwatch stopped issuing warrants. They hired her as a consultant instead. She consulted for six months. Then disappeared. The warrants are back.",
  },
  'Beluga Whale': {
    common: "Slow. Patient. Correct.",
    rare: "Was offered command of a Gilded Net frigate. Declined. Has never explained why. The offer still stands.",
    legendary: "Remembers every ship she's ever encountered. Every captain. Every cargo. The Gilded Net would pay considerably for that memory. She knows this.",
  },
  Blobfish: {
    common: "Pressure doesn't bother her. She's built for it.",
    rare: "Operates best in conditions that incapacitate everyone else. Deep runs are her comfort zone.",
    legendary: "Went into the Abyss alone to retrieve a Gilded Net cargo. Came back with the cargo and something else she won't discuss.",
  },
  'Blue Marlin': {
    common: "Fast, direct, and deeply uninterested in your opinion.",
    rare: "Former Brotherhood enforcer. Left because the work was too slow. Your pace is marginally better.",
    legendary: "Held the Deep crossing record for nine years. Someone broke it last spring. She hasn't spoken about it since. That someone hasn't been seen since.",
  },
  Clownfish: {
    common: "Unpredictable enough that the enemy can't predict her. Neither can you.",
    rare: "The Drifters called her a chaos agent and meant it as an insult. She took it as a title.",
    legendary: "Once accidentally destabilized a Saltwater Brotherhood operation by being in the wrong place. Did it again on purpose. Then again. It's a method now.",
  },
  'Goblin Shark': {
    common: "Comes out of nowhere. That's intentional.",
    rare: "The deep zones produce certain crew. She's one of them. Doesn't explain what that means.",
    legendary: "Valdris won't send ships where she operates. This covers a significant portion of the Sunken Reach.",
  },
  Koi: {
    common: "Deliberate. Unhurried. Right.",
    rare: "Spent three years in the Gilded Net's treasury division. Left voluntarily. The treasury was slightly lighter when she did.",
    legendary: "The Gilded Net considers her a significant financial liability. She considers them a minor inconvenience. Both assessments are accurate.",
  },
  Lionfish: {
    common: "The crew gives her space. She hasn't asked why. Neither should you.",
    rare: "Former Brotherhood security. Left when she disagreed with an order. The officer who gave the order didn't leave.",
    legendary: "The Brotherhood's incident reports from '10–'12 are heavily redacted. Her name appears in the margins of every one.",
  },
  'Nurse Shark': {
    common: "Keeps the crew alive. More than you'd expect.",
    rare: "Field medic for the Drifter fleet for six years. The survival rate improved. She won't take credit.",
    legendary: "Pulled a crew of nine through the Sunken Reach with no provisions and a cracked hull. She'll tell you it was straightforward. It wasn't.",
  },
  Oarfish: {
    common: "Been here longer than most things. Remembers more than she says.",
    rare: "The Pale Current doesn't disorient her. She says it used to. That was a long time ago.",
    legendary: "Has seen the Abyss from the inside. Whatever she encountered down there fundamentally changed something about the way she moves through the water. She hasn't mentioned what.",
  },
  Sailfish: {
    common: "Fastest crew member you have. Has opinions about this.",
    rare: "Won't crew on a ship slower than a Sloop. Made an exception for you. Still hasn't said why.",
    legendary: "Outran a Deepwatch intercept in open water. The Deepwatch filed a formal complaint about the physics involved.",
  },
  Swordfish: {
    common: "Combat specialist. Appropriately named.",
    rare: "Former Brotherhood boarding crew. Left the Brotherhood. The Brotherhood left her alone after that.",
    legendary: "The Brotherhood's official position is that she's not a problem. Their unofficial position is significantly different.",
  },
  'Tiger Shark': {
    common: "Reliable in a fight. Enthusiastic in a way that occasionally concerns people.",
    rare: "The Saltwater Brotherhood recruits aggressively. They recruited her once. She said no. They haven't asked again.",
    legendary: "Valdris refused to engage her ship directly after their first encounter. He sent three ships the second time. She sent back two.",
  },
  'Blue Whale': {
    common: "Everything moves out of her way. Everything.",
    rare: "The Deepwatch doesn't stop Blue Whale vessels. This is policy, not courtesy.",
    legendary: "The Gilded Net named a trade route after her. She's never acknowledged it. The route exists because she decided it would.",
  },
  Catfish: {
    common: "Knows the Abyss. The Abyss knows her back.",
    rare: "One of two crew members who can navigate the Locker. Won't explain how. The explanation probably wouldn't help.",
    legendary: "Davy Jones sent a message to her once. She didn't reply. He sent another. She still didn't reply. He stopped.",
  },
  'Doby Mick': {
    common: "Knows the Abyss. The Abyss seems uncertain about him.",
    rare: "The other crew member who can navigate the Locker. Catfish doesn't talk about him. He doesn't talk about Catfish. Something happened down there.",
    legendary: "Has been to the bottom of Davy Jones' Locker and returned. Won't say what's there. Won't say what it cost. Will say it was worth it. That's the part that's concerning.",
  },
  'Giant Squid': {
    common: "Operates on a timescale you don't fully understand.",
    rare: "Was here before most of the factions. Has watched them rise. Has a theory about which ones will fall first. Won't share it yet.",
    legendary: "The Deepwatch has a file on her that predates the Deepwatch. Nobody has read the whole thing. The ones who tried didn't finish.",
  },
  'Great White Shark': {
    common: "The crew behaves when she's aboard. So does the enemy.",
    rare: "Valdris gave her a wide berth at sea and a respectful nod in port. That's more than he gives most admirals.",
    legendary: "The Brotherhood made her an honorary captain in absentia after the incident at the Sunken Reach. She hasn't acknowledged the honor. She was there for the incident.",
  },
  'Hammerhead Shark': {
    common: "Methodical. That's more dangerous than fast.",
    rare: "Broke a Saltwater Brotherhood blockade alone in '09. The Brotherhood hasn't forgotten.",
    legendary: "The Brotherhood put three bounties on her across twelve years. She's collected all three herself. Kept the paperwork.",
  },
  'Humpback Whale': {
    common: "Something about her presence changes the water. The crew feels it.",
    rare: "The Pale Current behaves differently when she's nearby. Scientists have noted this. She considers their notes incomplete.",
    legendary: "Has communicated with something in the Abyss. The conversation was long. She described it as inconclusive. The Deepwatch described her report as classified.",
  },
  'Manta Ray': {
    common: "Glides through things that should stop her.",
    rare: "Former Deepwatch operative. The former is doing a lot of work in that sentence.",
    legendary: "Left the Deepwatch after learning something she wasn't supposed to learn. They let her leave. That detail is more troubling than it sounds.",
  },
  Orca: {
    common: "The crew follows her lead even when you haven't given one.",
    rare: "Commanded a Drifter flotilla for four years. They still follow her orders. She no longer commands them. This is an unusual arrangement.",
    legendary: "The Drifters consider her their captain in exile. She considers herself retired. Forty ships consider her a signal away. The signal has never been sent.",
  },
  'Whale Shark': {
    common: "Gentle until she isn't. The transition is fast.",
    rare: "Captained a Gilded Net flagship for six years before walking away. Never said why. The ship's still waiting in port.",
    legendary: "The Gilded Net, the Brotherhood, and the Deepwatch all have open recruitment offers for her. She's turned down all three. Currently on your ship. Make of that what you will.",
  },
  Piranha: {
    common: "Small. Mean. Gets the job done faster than anyone expects.",
    rare: "The Brotherhood hired her once for a boarding job. She finished before they'd even drawn weapons.",
    legendary: "Valdris stopped sending single ships into her territory. He stopped sending pairs too. He sends nothing now.",
  },
  'Red Snapper': {
    common: "Direct. Possibly too direct. The results justify it.",
    rare: "Negotiated a Gilded Net debt down to nothing in a single conversation. Nobody's sure what she said.",
    legendary: "Three factions tried to recruit her in the same season. All three walked away thinking they'd won. None of them had.",
  },
}

export function getCrewTrait(fishName: string, rarity: string): string {
  const traits = CREW_TRAITS[fishName]
  if (!traits) return ''
  return traits[getTraitTier(rarity)]
}
