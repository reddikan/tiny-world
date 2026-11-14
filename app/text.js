/* Tiny World: words. Trend categories, names, and the lines citizens say. */
(function (root) {
  'use strict';

  // Snapshot of real US trending searches (Google Trends, Nov 13 2026). The web preview
  // rotates through these; the Raspberry Pi version replaces this with a live pull.
  const TREND_POOL = [
    { term: 'cowboys vs eagles', vol: 2000000, cat: 'sports' },
    { term: "who won the ballon d'or 2026", vol: 1000000, cat: 'sports' },
    { term: 'eric bauza', vol: 200000, cat: 'person' },
    { term: 'nicki minaj', vol: 200000, cat: 'fun' },
    { term: 'at&t 2024 data breach settlement', vol: 100000, cat: 'money' },
    { term: 'texas roadhouse steak complaint', vol: 200000, cat: 'food' },
    { term: 'alan dysert', vol: 100000, cat: 'person' },
    { term: 'warriors vs nuggets', vol: 200000, cat: 'sports' },
    { term: 'walter koenig', vol: 200000, cat: 'person' },
    { term: 'timberwolves vs cavaliers', vol: 200000, cat: 'sports' },
    { term: 'jalen williams injury', vol: 500000, cat: 'sports' },
    { term: 'supplemental security income november payout', vol: 100000, cat: 'money' },
    { term: 'donnie iris', vol: 50000, cat: 'fun' },
    { term: 'bulls vs celtics', vol: 100000, cat: 'sports' },
    { term: 'anthropic ipo', vol: 100000, cat: 'money' },
    { term: 'suns vs thunder', vol: 100000, cat: 'sports' },
    { term: 'savannah chrisley boyfriend', vol: 20000, cat: 'romance' },
    { term: 'microsoft layoffs', vol: 100000, cat: 'work' },
    { term: 'walmart great value fruit cocktail recall', vol: 20000, cat: 'health' },
    { term: 'mavericks vs heat', vol: 50000, cat: 'sports' },
    { term: 'alexia putellas', vol: 20000, cat: 'sports' },
    { term: 'mbappe', vol: 20000, cat: 'sports' },
    { term: 'troy aikman monday night football emotion', vol: 20000, cat: 'sports' },
    { term: 'abdifatah yusuf guilty verdict reinstated', vol: 20000, cat: 'law' }
  ];

  // Keyword classifier, used when a trend arrives without a category (the live feed).
  const KEYWORDS = {
    sports: [' vs ', 'vs.', 'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'fifa', 'football', 'basketball', 'baseball', 'soccer', 'hockey', 'playoff', 'touchdown', 'quarterback', 'espn', 'ballon', 'world cup', 'super bowl', 'grand prix', '49ers', 'bengals', 'broncos', 'buccaneers', 'seahawks', 'steelers', 'celtics', 'knicks', '76ers', 'raptors', 'cavaliers', 'pacers', 'nuggets', 'timberwolves', 'trail blazers', 'clippers', 'mavericks', 'grizzlies', 'pelicans', 'dodgers', 'red sox', 'astros', 'phillies', 'orioles', 'blue jays', 'mariners', 'oilers', 'maple leafs', 'bruins', 'lakers', 'cowboys', 'yankees', 'premier league', 'la liga', 'champions league', 'ncaa', 'college football', 'march madness', 'nascar', 'formula 1', 'wnba', 'pga', 'ryder cup', 'wimbledon', 'heisman', 'stanley cup', 'world series', 'nba finals', 'sportscenter', 'fantasy football', 'real madrid', 'inter miami', 'messi', 'ronaldo', 'lebron', 'mbappe', 'box score', 'trade deadline', 'free agent'],
    food: ['recipe', 'restaurant', 'steak', 'pizza', 'burger', 'coffee', 'pie', 'menu', 'food', 'diner', 'bakery', 'thanksgiving dinner', 'turkey'],
    money: ['stock', 'ipo', 'price', 'payout', 'settlement', 'tax', 'bank', 'loan', 'crypto', 'bitcoin', 'market', 'refund', 'stimulus', 'rates', 'inflation', 'lottery', 'powerball', 'jackpot'],
    work: ['layoff', 'hiring', 'strike', 'jobs', 'salary', 'union', 'unemployment', 'shutdown'],
    health: ['recall', 'flu', 'covid', 'virus', 'outbreak', 'symptoms', 'vaccine', 'hospital', 'cancer', 'health', 'disease'],
    law: ['verdict', 'guilty', 'trial', 'court', 'arrest', 'lawsuit', 'sentenced', 'police', 'charges', 'jury', 'indicted'],
    politics: ['election', 'senate', 'congress', 'president', 'governor', 'vote', 'bill', 'white house', 'mayor', 'poll'],
    conflict: ['war', 'attack', 'missile', 'invasion', 'military', 'troops', 'shooting', 'strike on', 'bomb'],
    tech: ['iphone', 'android', 'ai ', 'app', 'update', 'launch', 'software', 'robot', 'chip', 'outage', 'spacex', 'nasa'],
    nature: ['meteor', 'eclipse', 'aurora', 'northern lights', 'comet', 'moon', 'earthquake', 'wildfire', 'volcano'],
    weather: ['weather', 'storm', 'hurricane', 'tornado', 'snow', 'forecast', 'flood', 'frost', 'heat wave', 'blizzard'],
    faith: ['church', 'pope', 'prayer', 'christmas', 'easter', 'diwali', 'ramadan', 'hanukkah', 'holiday', 'blessing'],
    death: ['dies', 'death', 'obituary', 'funeral', 'passed away', 'killed', 'tribute'],
    romance: ['boyfriend', 'girlfriend', 'wedding', 'engaged', 'divorce', 'dating', 'married', 'husband', 'wife'],
    fun: ['movie', 'trailer', 'album', 'song', 'tour', 'concert', 'netflix', 'season', 'episode', 'game release', 'tickets', 'show']
  };
  const SPORTS_WEAK = ['injury', 'score', 'draft', 'coach', 'league', 'championship', 'tennis', 'golf', 'boxing', 'wrestling', 'olympic', 'bears', 'bills', 'browns', 'cardinals', 'chargers', 'chiefs', 'colts', 'commanders', 'dolphins', 'eagles', 'falcons', 'jaguars', 'jets', 'lions', 'packers', 'panthers', 'patriots', 'raiders', 'ravens', 'saints', 'texans', 'titans', 'vikings', 'bulls', 'pistons', 'bucks', 'hawks', 'hornets', 'heat', 'magic', 'wizards', 'thunder', 'jazz', 'warriors', 'suns', 'kings', 'rockets', 'spurs', 'braves', 'mets', 'cubs', 'padres', 'guardians', 'rangers', 'penguins', 'game', 'win', 'beat', 'roster', 'standings', 'mvp', 'halftime', 'kickoff', 'us open', 'barcelona', 'arsenal', 'liverpool', 'manchester', 'chelsea', 'season', 'team', 'match', 'overtime', 'goal', 'inning', 'referee', 'stadium'];
  const reCache = {};
  function has(s, k) { k = k.trim(); const key = k; let re = reCache[key]; if (!re) re = reCache[key] = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es|ed|ing)?($|[^a-z0-9])'); return re.test(s); }
  function classify(term, news) {
    const s = (term + ' | ' + (news || '')).toLowerCase();
    for (const k of KEYWORDS.sports) if (has(s, k)) return 'sports';
    let weak = 0; for (const k of SPORTS_WEAK) if (has(s, k) && ++weak >= 2) return 'sports';
    for (const cat of ['conflict', 'death', 'law', 'health', 'weather', 'nature', 'money', 'work', 'politics', 'food', 'romance', 'faith', 'tech', 'fun']) {
      for (const k of KEYWORDS[cat]) if (has(s, k)) return cat;
    }
    return 'person'; // an unexplained name or phrase: treated as gossip
  }

  // What each kind of trend stirs up: a gathering and a line for the feed.
  const REACT = {
    food: { ev: 'Food fair', texts: ['{town} can talk of nothing but food. Cooks drag tables into the plaza.', 'A craving sweeps {town}. Ovens are lit and a queue forms.', 'Arguments about a bad meal turn into a cook-off in {town}.'] },
    money: { ev: 'Market rush', texts: ['Word of money matters reaches {town}. Traders crowd the market to haggle.', '{town} counts its coins twice. Debts are called in at the market.', 'Rumors of a windfall send {town} to the money-changers.'] },
    work: { ev: 'Guild meeting', texts: ['Talk of lost work unsettles {town}. The guilds call a meeting.', '{town} worries who will be let go next. Workers gather to talk.', 'Nobody in {town} feels safe in their trade today. A meeting is called.'] },
    fun: { ev: 'Festival', texts: ['{town} strikes up music. A crowd gathers to sing and dance.', 'A tune catches on in {town} and work stops for it.', 'Drums come out in {town}. Half the town is dancing.'] },
    person: { ev: 'Gossip circle', texts: ['One name is on every tongue in {town}. Stories spread at the well.', '{town} trades tales about someone famous and far away.', 'Everyone in {town} claims to know the real story.'] },
    romance: { ev: 'Courting dance', texts: ['Love is the only topic in {town}. A courting dance is announced.', '{town} gossips about who is walking out with whom.', 'Matchmakers are busy in {town} tonight.'] },
    health: { ev: "Healer's queue", texts: ['A health scare spreads. {town} lines up at the healer\'s door.', '{town} throws out its preserves, just in case.', 'Everyone in {town} suddenly feels a little unwell.'] },
    law: { ev: 'Open court', texts: ['{town} argues about justice. The elders hold open court.', 'A verdict from far away divides {town}. Old grudges come out.', 'Talk of guilt and punishment fills {town}.'] },
    politics: { ev: 'Town debate', texts: ['{town} splits into camps. A debate is called in the plaza.', 'Who should lead? {town} cannot stop arguing about it.', 'Speeches from every doorstep in {town} today.'] },
    conflict: { ev: 'Muster', texts: ['Talk of fighting stirs {town}. The bold sharpen their tools.', '{town} posts extra guards. Tempers run short.', 'Old soldiers in {town} tell war stories to anyone who will listen.'] },
    tech: { ev: "Tinkerers' meet", texts: ['A new idea reaches {town}. Tinkerers gather to pull it apart.', '{town} is full of plans and sketches today.', 'Someone in {town} swears there is a better way to do everything.'] },
    nature: { ev: 'Sky watch', texts: ['{town} looks up. A crowd climbs to open ground to watch the sky.', 'Signs in the heavens have {town} whispering.', 'Nobody in {town} wants to be indoors tonight.'] },
    weather: { ev: 'Storm prep', texts: ['{town} eyes the clouds and starts tying things down.', 'Weather talk turns to worry in {town}. Stores are checked.', '{town} brings the animals in early.'] },
    faith: { ev: 'Vigil', texts: ['A holy mood settles on {town}. Candles are lit.', '{town} gathers to pray and to argue about how.', 'Bells in {town}. The devout fill the square.'] },
    death: { ev: 'Remembrance', texts: ['{town} mourns someone it never met. A remembrance is held.', 'News of a death far away quiets {town}.', '{town} lights a lamp for the departed.'] }
  };

  // Lines citizens say about a trend, by temperament.
  const QUOTES = {
    food: { kind: ['Made extra. Take some home.', 'Nobody leaves my table hungry.'], temper: ['If it is burnt again I am sending it back.', 'I waited an hour for this?'], whim: ['I am putting honey on everything now.', 'Dessert first. I have decided.'], plain: ['Smells better than it has any right to.', 'I could eat.'] },
    money: { kind: ['If it comes through, I am sharing it.', 'I hope the widows get theirs first.'], temper: ['Somebody owes me, and they know it.', 'They always pay late.'], whim: ['I am going to buy a goat. Or two.', 'What if coins were bigger?'], plain: ['I will believe it when it is in my hand.', 'Count it twice.'] },
    work: { kind: ['If they cut anyone, I will share my shift.', 'We look after each other here.'], temper: ['Let them try letting me go.', 'I have done this job twenty years.'], whim: ['Maybe I will become a poet instead.', 'I never liked mornings anyway.'], plain: ['Keep your head down and your hands busy.', 'Work is work.'] },
    fun: { kind: ['Come on, everyone can sing this one.', 'I saved you a spot near the front.'], temper: ['They are playing it wrong.', 'Too loud. Still good.'], whim: ['I have invented a dance. Stand back.', 'One more song and then one more.'], plain: ['Not bad. Not bad at all.', 'My feet hurt already.'] },
    person: { kind: ['Leave the poor soul alone, I say.', 'I am sure they are lovely in person.'], temper: ['Overrated. I said it.', 'Why does anyone care?'], whim: ['I heard they can talk to birds.', 'We are probably related.'], plain: ['Never met them. Have opinions anyway.', 'So I heard.'] },
    romance: { kind: ['I hope it lasts for them.', 'Everybody deserves somebody.'], temper: ['It will end badly. Mark me.', 'Not my business. But still.'], whim: ['I am writing a ballad about it.', 'I have fallen in love three times today.'], plain: ['Good for them.', 'People will talk.'] },
    health: { kind: ['I boiled water for the whole street.', 'Bring the little ones to me, I will check them.'], temper: ['I told them it was bad. Nobody listens.', 'I am not eating anything I did not grow.'], whim: ['I feel fine. Or do I?', 'I am wearing garlic. It cannot hurt.'], plain: ['Better safe than sorry.', 'Threw it all out.'] },
    law: { kind: ['Mercy costs nothing.', 'I just hope it was fair.'], temper: ['Guilty is guilty.', 'Too soft, the lot of them.'], whim: ['I should be a judge. I own a robe.', 'What if we flipped a coin?'], plain: ['Rules are rules.', 'Not for me to say.'] },
    politics: { kind: ['Can we not shout about it?', 'We all want the same things, really.'], temper: ['They are wrong and I will say so.', 'I am not voting for that fool.'], whim: ['I nominate my dog.', 'What if nobody was in charge on Tuesdays?'], plain: ['Same as last time, then.', 'I will hear them out.'] },
    conflict: { kind: ['Nothing good comes of it.', 'Keep the children close.'], temper: ['Let them come.', 'About time we stood up for ourselves.'], whim: ['I would be a terrible soldier. Great hat, though.', 'Do we get drums?'], plain: ['Lock the door tonight.', 'I do not like it.'] },
    tech: { kind: ['If it saves backs, I am for it.', 'I will show the others how it works.'], temper: ['The old way was fine.', 'It will break in a week.'], whim: ['I am building one out of spoons.', 'What if it could also make soup?'], plain: ['Clever. We will see.', 'Show me it working.'] },
    nature: { kind: ['Wake the children, they should see this.', 'Bring a blanket, I have spare.'], temper: ['My neck hurts and nothing has happened.', 'It is just the sky.'], whim: ['I am going to name one after myself.', 'It winked at me.'], plain: ['Worth staying up for.', 'Clear night, at least.'] },
    weather: { kind: ['My cellar is open if anyone needs it.', 'I brought in my neighbor\'s washing.'], temper: ['If my roof goes again I am moving.', 'Every year the same.'], whim: ['I like a good storm. Bring it.', 'I am going to stand in it.'], plain: ['Tie it down.', 'Could be worse.'] },
    faith: { kind: ['There is room for everyone.', 'I lit one for you too.'], temper: ['They are doing the rites wrong.', 'Some people only pray when it suits.'], whim: ['I had a vision. It was mostly about cheese.', 'What if the stars are listening?'], plain: ['It does no harm.', 'Quiet is nice.'] },
    death: { kind: ['Say something kind tonight.', 'I never met them and I am still sad.'], temper: ['Gone too soon. It is not right.', 'Nobody tells you anything until it is too late.'], whim: ['I want fireworks at mine.', 'I think they are a star now.'], plain: ['Comes for us all.', 'Rest easy.'] }
  };

  // Lines for things the people do on their own.
  const SAY = {
    birth: ['Ten fingers, ten toes, very loud.', 'She has my nose, poor thing.', 'We are not sleeping this year.', 'Another mouth, another blessing.'],
    wedding: ['About time.', 'I cried. I am not ashamed.', 'They will be fighting by spring. Happily.', 'Best feast in years.'],
    funeral: ['The place will be quieter without them.', 'They taught me my trade.', 'We will look after the family.', 'Gone, and the work still to do.'],
    warFor: ['They had it coming.', 'For our dead.', 'I am going. Do not try to stop me.', 'We finish this now.'],
    warAgainst: ['I will not carry a blade for this.', 'My cousin lives there.', 'This is madness.', 'Who feeds the children while we fight?'],
    flee: ['Grab what you can carry.', 'We are going to the woods until it is over.', 'I am not dying for a fence line.'],
    peace: ['Enough graves.', 'I will shake their hand. I will not like it.', 'Maybe now we can plant.'],
    faithNew: ['It came to me all at once.', 'The old ways missed something.', 'Follow or do not. I know what I saw.'],
    convert: ['It finally makes sense to me.', 'I was lost before.', 'My mother will be furious.'],
    schism: ['They have strayed. We have not.', 'I will not kneel beside them again.'],
    leader: ['I will not waste your trust.', 'First, the granary. Then everything else.', 'Somebody has to.'],
    ousted: ['They will miss me.', 'I did my best. It was not enough.', 'Good luck to the next fool.'],
    protest: ['We are hungry and nobody listens.', 'Enough is enough.', 'I pay my share. Where does it go?'],
    murder: ['I saw it happen. I wish I had not.', 'There was always bad blood there.', 'Lock your doors.'],
    exile: ['I am not sorry.', 'I will find somewhere that wants me.'],
    famine: ['The bins are empty.', 'I gave mine to the children.', 'We eat bark soup tonight.'],
    plague: ['Stay home. Please.', 'Three on my street already.', 'I am burning the bedding.'],
    fire: ['Buckets! Everyone!', 'The whole ridge went up.', 'We saved the house. Not the barn.'],
    flood: ['The river took the lower field.', 'It was at the door by dawn.', 'We will dig it out. We always do.'],
    storm: ['Lost half the roof.', 'The boats are matchwood.', 'I have never heard wind like it.'],
    blizzard: ['Burned the last of the wood last night.', 'Could not see my own hand.', 'We sleep in one room now.'],
    drought: ['The ground is cracking.', 'Not a drop in weeks.', 'The well is down to mud.'],
    harvest: ['Best crop I have seen.', 'The carts cannot keep up.', 'We will eat well this winter.'],
    found: ['There is good land out there. I am taking it.', 'Too crowded here. Time to go.', 'We will send word when the roofs are up.'],
    join: ['I am going with them.', 'A fresh start sounds right.'],
    invent: ['It just needed a second wheel.', 'I got the idea watching ducks.', 'It works. Mostly.'],
    newfield: ['Good soil under those trees.', 'Cleared it myself. My back knows it.'],
    barren: ['That field is finished. Nothing left in it.', 'We pushed it too hard.'],
    build: ['Roof is on.', 'Four walls and a door. Home.'],
    abandoned: ['Nobody left to light the lamps.'],
    breakup: ['We wanted different things.', 'I kept the goat.'],
    trade: ['Fair price, for once.', 'They drive a hard bargain over there.'],
    landslide: ['Half the hill came down.', 'It sounded like thunder underfoot.']
  };

  const THOUGHT = {
    sleep: ['So tired.', 'Bed. Now.', 'Five minutes, then I will get up.'],
    eat: ['What is for supper?', 'Starving.', 'I could eat a whole loaf.'],
    work: ['Back to it.', 'These rows will not hoe themselves.', 'Nearly done. Nearly.', 'One more load.'],
    social: ['I wonder what the news is.', 'I should see who is about.', 'I owe someone a visit.'],
    court: ['Do I look all right?', 'Maybe today I will say something.', 'I picked flowers. Too much?'],
    worship: ['I need some quiet.', 'A candle for the family.', 'Time to give thanks.'],
    attend: ['I am not missing this.', 'Everyone will be there.', 'Just for a little while.'],
    wander: ['I wonder what is over that hill.', 'A walk will clear my head.', 'Never been this far out.'],
    trade: ['Prices are better over there.', 'Long road. Good coin.', 'I will bring something back for the children.'],
    visit: ['It has been too long.', 'I hope they are home.'],
    preach: ['They need to hear this.', 'The word will not spread itself.'],
    study: ['There must be a better way.', 'What if I tried it backwards?'],
    protest: ['Somebody has to say it.', 'They will hear us today.'],
    mourn: ['I miss them.', 'It should have been me.', 'I keep expecting to see them.'],
    raid: ['Stay close. Stay quiet.', 'For home.', 'I hope I come back.'],
    defend: ['Not one step further.', 'They will not take my house.'],
    flee: ['Run. Just run.', 'Keep the little ones moving.'],
    rest: ['I feel dreadful.', 'Just need to lie down.'],
    play: ['Tag! You are it!', 'I found a frog.', 'Race you to the well.'],
    migrate: ['New ground. New start.', 'I hope the soil is good.']
  };

  const NAME_A = ['Ma', 'Or', 'In', 'To', 'Pel', 'Ka', 'Li', 'Ro', 'Sa', 'Te', 'Vi', 'Ha', 'Jo', 'Ne', 'Bri', 'Da', 'El', 'Fen', 'Gar', 'Isa', 'Lu', 'Mi', 'No', 'Ru', 'Sy', 'Tal', 'Ul', 'Wen', 'Ya', 'Zo', 'Ana', 'Be', 'Co', 'Dru', 'Em', 'Fa', 'Gil', 'Hes', 'Io', 'Ke'];
  const NAME_F = ['ra', 'la', 'na', 'ni', 'sa', 'ia', 'wen', 'lis', 'ya', 'ri', 'nna', 'the'];
  const NAME_M = ['en', 'bi', 'ric', 'an', 'os', 'ek', 'in', 'mar', 'rin', 'lo', 'dan', 'vor'];
  const FAMILY = {
    capital: ['Quill', 'Hearth', 'Miller', 'Brook', 'Ashby', 'Thatcher', 'Wain', 'Cooper', 'Marsh', 'Field', 'Oakes', 'Rowan', 'Tanner', 'Pike'],
    port: ['Tidewell', 'Net', 'Gull', 'Saltmarsh', 'Keel', 'Shoal', 'Wharf', 'Driftwood'],
    sun: ['Dune', 'Ember', 'Sandahl', 'Kharim', 'Solane', 'Zafir', 'Amari'],
    jungle: ['Vine', 'Fern', 'Tamar', 'Orchid', 'Canopy', 'Moss', 'Liana'],
    frost: ['Frost', 'Rime', 'Holm', 'Bjorn', 'Icewater', 'Snowe', 'Pine'],
    other: ['Newcombe', 'Farrow', 'Strand', 'Wilde', 'Hollis', 'Venn']
  };
  const TOWN_A = ['Elm', 'Stone', 'Ash', 'Wolf', 'Gold', 'Mist', 'Dawn', 'Oak', 'Red', 'Salt', 'Wind', 'Moss', 'Iron', 'Moon', 'Fox', 'Deep', 'High', 'Bright', 'Still', 'Raven'];
  const TOWN_B = ['ford', 'holm', 'mere', 'wick', 'stead', 'fall', 'haven', 'crest', 'moor', 'vale', 'reach', 'gate'];
  const FAITH_NAME = { food: 'The Full Table', money: 'The Golden Ledger', fun: 'The Dancing Flame', romance: 'The Twin Hearts', health: 'The Healing Spring', law: 'The Even Scale', politics: 'The Common Voice', tech: 'The Turning Wheel', work: 'The Steady Hand', nature: 'The Star Watch', weather: 'The Storm Father', faith: 'The Inner Light', death: 'The Quiet Road', conflict: 'The Iron Vow', person: 'The Remembered Name' };
  const FAITH_TENET = { food: 'that sharing a meal is the highest rite', money: 'that fortune favors the careful', fun: 'that joy is a duty', romance: 'that love is the only law', health: 'that the body is a temple', law: 'that every wrong must be weighed', politics: 'that every voice must be heard', tech: 'that making is a form of prayer', work: 'that honest labor is holy', nature: 'that the sky sends signs', weather: 'that storms are judgments', faith: 'that silence reveals truth', death: 'that the dead walk beside us', conflict: 'that strength keeps the peace', person: 'that great names never die' };
  const TRAIT_WORDS = { bold: ['timid', 'bold'], kind: ['hard-hearted', 'kind'], cur: ['set in their ways', 'curious'], dev: ['skeptical', 'devout'], amb: ['content', 'ambitious'], soc: ['solitary', 'sociable'], temper: ['even-tempered', 'hot-tempered'], whim: ['steady', 'whimsical'], civ: ['self-serving', 'public-spirited'] };


  // Gossip: what villagers say about each other once a trend gets round. [effect on friendship, line]
  const GOSSIP = {
    food: [[-1, '{A} is telling people that {B}\'s cooking deserves a "{t}" of its own. {B} has stopped inviting {A} to supper.'], [1, 'Since "{t}" came up, {A} swears {B} makes the best stew in {town} and wants the recipe written down.'], [-1, '{A} says {B} has been hiding a second sack of flour ever since "{t}". {B} says it is seed grain.']],
    money: [[-1, '{A} says {B} plans to sell the family goats and "get in early" after hearing about "{t}".'], [-1, 'Word is {B} still owes {A} three sacks of grain and is using "{t}" as the excuse.'], [1, '{A} heard that {B} quietly paid a neighbor\'s debt the day "{t}" reached {town}.']],
    work: [[-1, 'Since "{t}", {A} has been telling people the guild means to let {B} go. {B} was the last to hear it.'], [1, '{A} says if hands are cut after "{t}", {B} is the one worker {town} cannot lose.'], [-1, '{A} claims {B} has been napping behind the storehouse and that "{t}" should be a warning.']],
    fun: [[-1, '{A} has been humming "{t}" for three days. {B} has asked the elders to make it stop.'], [1, '{A} says {B} does the best "{t}" in {town} and should perform at the next feast.'], [-1, '{A} and {B} both claim they heard "{t}" first. They are no longer speaking.']],
    person: [[1, '{A} tells anyone who will listen that {B} is the {town} answer to "{t}". {B} is not sure it is a compliment.'], [-1, '{A} and {B} argued for an hour about "{t}" without either knowing a thing about it.'], [-1, '{A} has named a goat after "{t}". {B} says the goat deserves better.']],
    romance: [[1, '{A} says the talk of "{t}" has given {B} ideas. {B} was seen picking flowers by the river.'], [-1, 'Ever since "{t}", {A} has been hinting that {B} was seen walking out with someone new.'], [1, '{A} is sure {B} has a secret admirer and blames "{t}" for making everyone so bold.']],
    health: [[-1, '{A} swears {B}\'s preserves are what made the miller ill. Since "{t}", nobody will touch them.'], [1, '{A} says {B} sat up all night with a sick neighbor after "{t}" frightened the whole street.'], [-1, '{A} is telling people {B} coughed twice at market and should stay home. "{t}" has everyone jumpy.']],
    law: [[-1, '{A} and {B} nearly came to blows over "{t}". {A} says rules are rules; {B} says mercy matters more.'], [-1, 'After "{t}", {A} is saying {B} never did answer for that missing sheep.'], [1, '{A} thinks {B} should sit as judge in {town}. All the talk of "{t}" proves someone fair is needed.']],
    politics: [[-1, '{A} says {B} is angling for the leader\'s seat and is using "{t}" to stir people up.'], [1, '{A} has been telling the market that {B} talks more sense about "{t}" than the whole council.'], [-1, '{A} and {B} took opposite sides on "{t}" and now their families sit apart.']],
    conflict: [[-1, '{A} says {B} has been sharpening tools at night since "{t}". {B} says they are just tools.'], [-1, '{A} is calling {B} a coward for wanting no part of the fighting talk around "{t}".'], [1, '{A} says if trouble comes after "{t}", they want {B} standing next to them.']],
    tech: [[-1, '{A} says the new idea {B} is so proud of was copied straight from the talk about "{t}".'], [1, '{A} swears {B} has built something clever in the shed since "{t}" and will not show anyone yet.'], [-1, '{A} says {B}\'s latest contraption, inspired by "{t}", set fire to a fence.']],
    nature: [[1, '{A} and {B} stayed out all night after "{t}". Both say they saw something; neither agrees what.'], [-1, '{A} says {B} is reading omens into "{t}" and frightening the children.'], [1, '{A} tells everyone {B} predicted "{t}" a month ago.']],
    weather: [[-1, '{A} says {B} has not mended the roof and will be sorry, with "{t}" on everyone\'s lips.'], [1, '{A} says {B} has opened the cellar to the whole lane because of "{t}".'], [-1, '{A} claims {B} borrowed all the rope in {town} the moment "{t}" got round.']],
    faith: [[-1, '{A} says {B} only started praying when "{t}" came up.'], [1, '{A} says {B} lit a candle for every house on the lane after "{t}".'], [-1, '{A} and {B} disagree about what "{t}" means for the faithful, loudly, in the square.']],
    death: [[1, '{A} says {B} wept at the news of "{t}" and has been kinder to everyone since.'], [-1, '{A} thinks {B} is making a show of mourning "{t}" to be seen doing it.'], [1, 'Since "{t}", {A} and {B} have mended an old quarrel. Life is short, they say.']]
  };
  const GOSSIP_REPLY = { kind: ['Let them talk. I will bring them soup anyway.', 'I am sure they meant no harm.', 'It is half true, and I am not ashamed of it.'], temper: ['That is not what happened and they know it.', 'Say it to my face.', 'I will remember this.'], whim: ['The version I heard was better. I had a horse in it.', 'All true, except the parts that are not.', 'I started that rumor myself, for fun.'], plain: ['People will say anything.', 'No comment.', 'First I have heard of it.'] };
  // How a trend turns into bad blood between two towns.
  const DISPUTE = {
    money: '{A}\'s traders say {B} cheated them on a deal, and "{t}" is the proof they wave about.', food: 'Since "{t}" set everyone counting stores, {A} accuses {B} of hoarding grain.', work: '{A} says {B} is luring away its builders with promises, after all the talk of "{t}".', fun: 'A song about "{t}" that mocks {A}\'s leader is being sung in {B}\'s market.', person: '{A} and {B} each claim "{t}" as one of their own, and neither will back down.', romance: 'A broken betrothal between a family in {A} and one in {B} is blamed on gossip about "{t}".', health: '{A} says the sickness scare over "{t}" started in {B} and wants its traders kept out.', law: '{A} demands {B} hand over a man it calls guilty. Talk of "{t}" has hardened both sides.', politics: 'Arguments over "{t}" have turned into {A} telling {B} how to run its affairs.', conflict: 'After "{t}", {A} has posted guards on the road to {B}. {B} takes it as a threat.', tech: '{A} says {B} copied its new plough design after "{t}" got round.', nature: 'Elders in {A} read "{t}" as a sign against {B}.', weather: '{A} blames {B} for damming the stream now that "{t}" has everyone worried about water.', faith: 'Preachers in {A} say "{t}" is a judgment on {B}.', death: 'Mourning over "{t}" has turned to blame between {A} and {B}.'
  };
  const WAR_CAUSE = {
    money: 'It began as a trade debt. Since "{t}", neither side will pay or forgive.', food: 'It is about grain. Ever since "{t}" set everyone counting stores, {A} has said {B} is hoarding.', work: '{A} says {B} stole its workers after "{t}", and means to take them back.', fun: 'It began with an insult: a mocking song about "{t}" sung in {B}\'s market.', person: 'It began with a boast. Both towns claim "{t}" as their own, and words became blows.', romance: 'A broken betrothal, blamed on gossip about "{t}", has set family against family.', health: '{A} blames {B} for the sickness scare that followed "{t}".', law: '{A} demanded {B} hand over a man it calls guilty. After "{t}", {B} refused.', politics: 'Arguments over "{t}" became demands, and the demands became threats.', conflict: 'Fear did it. After "{t}", {A} decided to strike before it was struck.', tech: '{A} says {B} stole its designs after "{t}" and wants them back.', nature: '{A}\'s elders read "{t}" as a sign to take up arms.', weather: 'It is about water. With "{t}" on every tongue, {A} says {B} dammed the stream.', faith: 'Preachers in {A} call "{t}" a judgment on {B}. The faithful are marching.', death: 'Grief over "{t}" turned to blame, and blame to blades.'
  };
  const STARTERS = ['{a} the {job} was first to bring the news.', 'It started with {a} the {job}, who heard it from a passing trader.', '{a} the {job} will not stop talking about it.', '{a} the {job} is at the middle of it, as usual.'];

  // What each person wants out of life, and how their feelings sound in their own head.
  const GOALS = {
    power: { label: 'to lead the town', th: ['This town needs a firmer hand. Mine.', 'One day they will ask me to decide.', 'I could do better than the one in charge.'] },
    wealth: { label: 'to be rich', th: ['A full cellar is the only safety.', 'Buy low. Sell dear.', 'Why should I share what I earned?'] },
    family: { label: 'a big, happy family', th: ['A house full of children. That is all I want.', 'Family first. Always.', 'I hope the little ones are warm.'] },
    faith: { label: 'to serve their faith', th: ['Everything happens for a reason.', 'I must set a better example.', 'The town has lost its way. I can help.'] },
    knowledge: { label: 'to understand how things work', th: ['Why does the river run faster in spring?', 'There is a pattern here. I nearly have it.', 'I should write this down.'] },
    wander: { label: 'to see the world', th: ['What is past the mountains?', 'I was not made to stay in one place.', 'Next season, I am going.'] },
    peace: { label: 'a quiet, peaceful life', th: ['If people would only be kind.', 'I want no part of any quarrel.', 'A good day is one where nobody shouts.'] },
    craft: { label: 'to be the best at their trade', th: ['Nobody does this job better than me.', 'Measure twice.', 'I can still improve on this.'] },
    revenge: { label: 'revenge', th: ['I have not forgotten.', 'They will answer for it.', 'I see their face every night.'] }
  };
  const FEEL = {
    anger: ['I have not forgotten what {x} said.', 'If {x} crosses me again...', 'My blood is still up.'], fear: ['What if they come back?', 'I do not feel safe here any more.', 'Keep the door barred.'],
    envy: ['Why should others have so much?', 'I work twice as hard for half as much.', 'Some people get everything.'], pride: ['I did well. I know I did.', 'Let them say I never helped.', 'My mother would be proud.'],
    civic: ['The granary roof needs mending. I will see to it.', 'If we all do our part, we will be fine.', 'This town raised me. I owe it.'], selfish: ['Let someone else do it.', 'Nobody ever helped me.', 'What has this town ever done for me?']
  };
  const SAY2 = {
    steal: ['My children were hungry. What would you do?', 'Everyone takes a little. I got caught.', 'The granary is ours, is it not?'], give: ['I have more than I need.', 'Nobody goes hungry on my street.', 'It is only grain.'],
    arson: ['They pushed me to it.', 'Now they know how it feels.'], coup: ['Enough talk. I am in charge now.', 'Someone had to take hold of things.'], coupFail: ['I only said what many think.', 'I was betrayed.'],
    skim: ['Leaders eat first. That is how it is.', 'I earned it.'], witness: ['I saw it with my own eyes.', 'I always knew there was something off there.', 'Shameful.'], confront: ['Say it again, to my face.', 'I want an apology.', 'We settle this now.']
  };

  root.TW_TEXT = { GOALS, FEEL, SAY2, GOSSIP, GOSSIP_REPLY, DISPUTE, WAR_CAUSE, STARTERS, TREND_POOL, classify, REACT, QUOTES, SAY, THOUGHT, NAME_A, NAME_F, NAME_M, FAMILY, TOWN_A, TOWN_B, FAITH_NAME, FAITH_TENET, TRAIT_WORDS };
})(typeof window !== 'undefined' ? window : globalThis);
