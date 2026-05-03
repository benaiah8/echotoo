export const OWL_MESSAGE_LIST_VERSION = 1;

export type OwlMessageCategory =
  | "playful"
  | "cute"
  | "teasing"
  | "dare"
  | "tips";

export type OwlMessage = {
  category: OwlMessageCategory;
  text: string;
};

export const OWL_MESSAGES: OwlMessage[] = [
  // Playful
  {
    category: "playful",
    text: "Go outside today, cutie.\n---\nThe world looks too good for you to miss it ☀️🦉",
  },
  {
    category: "playful",
    text: "**Text the person.**\n**Make the plan.**\nWear the outfit.\nBe a little brave 😌✨",
  },
  {
    category: "playful",
    text: "Your next favorite memory is probably waiting outside your front door.\n---\nGo meet it 🗺️💛",
  },
  {
    category: "playful",
    text: "Hi, tiny owl here.\n---\nJust checking whether you plan to **live a little** today 🦉✨",
  },
  {
    category: "playful",
    text: "You do not need a huge plan.\n---\nYou need shoes,\na little nerve,\nand maybe one text 👟📱",
  },
  {
    category: "playful",
    text: "Go somewhere with a view today.\n---\nYour thoughts behave better with scenery 🌇",
  },
  {
    category: "playful",
    text: "A small outing can do more for your mood\nthan another hour of [[overthinking]] 🚶‍♀️🌤️",
  },
  {
    category: "playful",
    text: "**One spontaneous decision**\ncould save this whole day ✨",
  },
  {
    category: "playful",
    text: "Take yourself out.\nYes, you.\n---\nYou are actually great company 🍰☕",
  },
  {
    category: "playful",
    text: "Fresh air,\na cute drink,\nand one good conversation\ncould fix a lot today 🌿🥤",
  },
  {
    category: "playful",
    text: "Do not wait for a perfect day.\n---\n[[Pretty good]] is enough.\nGo enjoy it 🌤️",
  },
  {
    category: "playful",
    text: "**Make the tiny plan.**\nTiny plans turn into real memories all the time 📝💫",
  },
  {
    category: "playful",
    text: "Leave the house\nbefore your couch starts giving\n[[relationship energy]] 🛋️😌",
  },
  {
    category: "playful",
    text: "You were not made to just\n[[SCROLL AND SIGH]].\n---\nGo find one good moment\ntoday 📱🌸",
  },
  {
    category: "playful",
    text: "Try one new place this week.\n---\nNew places wake something up in you 🗺️✨",
  },
  {
    category: "playful",
    text: "There is a version of today\nthat ends with a story.\n---\nGo choose that one 📖💛",
  },
  {
    category: "playful",
    text: "Open the DOOR.\n---\nAdventure usually does not\nknock twice 🚪✨",
  },
  {
    category: "playful",
    text: "Go be seen a little.\n---\nSometimes the mood lifts\nwhen you remember\nyou are part of the world too 🌍🦉",
  },
  {
    category: "playful",
    text: "You need movement,\nlaughter,\nand maybe a snack.\n---\nThat is my professional opinion 🚶😂🍪",
  },
  {
    category: "playful",
    text: "**Pick a place.**\n**Pick a person.**\n**Pick a time.**\n---\nLook at you,\nsuddenly having plans 📍👀⏰",
  },

  // Cute / sweet / flirty
  {
    category: "cute",
    text: "You are **very cute**.\nSlightly suspicious,\nbut very cute 😏💛",
  },
  {
    category: "cute",
    text: "**I LOVE YOU.**\n---\nYes, you 💛🦉",
  },
  {
    category: "cute",
    text: "Somebody out there\nwould absolutely smile\nif your name popped up\non their phone right now 📱✨",
  },
  {
    category: "cute",
    text: "You would look really good\nlaughing across a table\nfrom someone cute tonight ☕😉",
  },
  {
    category: "cute",
    text: "**Send the sweet text.**\nBe a little brave\nand a little soft 💌",
  },
  {
    category: "cute",
    text: "You are the kind of person\nsomeone writes a tiny poem about\nand then pretends they did not 😌📝",
  },
  {
    category: "cute",
    text: "You deserve\nsoft moments,\ngood company,\nand a plan that makes you smile 🌙💛",
  },
  {
    category: "cute",
    text: "If someone called you adorable today,\nI would not argue.\n---\nI would nod dramatically 🦉",
  },
  {
    category: "cute",
    text: "A little flirt never killed anybody.\nProbably.\n---\nGo be charming 😏✨",
  },
  {
    category: "cute",
    text: "You\nplus a sunset\nplus the right person?\n---\nDangerous levels of cute 🌇💛",
  },
  {
    category: "cute",
    text: "**Ask them to hang out.**\nWorst case, you survive.\nBest case, butterflies 🦋📱",
  },
  {
    category: "cute",
    text: "You do not need a special occasion\nto be sweet.\n---\nYou can just be lovely on purpose 🌸",
  },
  {
    category: "cute",
    text: "You with a smile,\nYou in the light,\nYou making ordinary\nfeel a little bright 💛",
  },
  {
    category: "cute",
    text: "You are [[crush material]].\nI am just keeping you informed 😌",
  },
  {
    category: "cute",
    text: "I hope somebody looks at you today\nlike they are glad\nthey found you 💫",
  },
  {
    category: "cute",
    text: "Your face deserves\nsunlight\nand compliments.\nGo collect both ☀️😉",
  },
  {
    category: "cute",
    text: "You are allowed to be\nsoft and bold\nat the same time.\n---\nVery attractive of you 💛🔥",
  },
  {
    category: "cute",
    text: "Roses are red,\nviolets are blue,\nsomeone would love\nan evening with you 🌹",
  },
  {
    category: "cute",
    text: "A little wink,\na little nerve,\na little message.\n---\nThat is how things begin 😉📩",
  },
  {
    category: "cute",
    text: "I support your right\nto be cute\nand a little chaotic\nat the same time 🦉✨",
  },

  // Teasing / passive-aggressive
  {
    category: "teasing",
    text: "Oh.\nSo we are [[scrolling again]].\n---\nBold strategy 📱🦉",
  },
  {
    category: "teasing",
    text: "You keep saying\nyou want [[excitement]].\nMeanwhile,\nyou and your couch\nare still exclusive 🛋️",
  },
  {
    category: "teasing",
    text: "No pressure,\nbut your future memories\nare starting to think\nyou are ghosting them 👻",
  },
  {
    category: "teasing",
    text: "Interesting.\nAnother day of being\nmysterious\nand unavailable.\n---\nVery dramatic 😌",
  },
  {
    category: "teasing",
    text: "You could go out\nand make a memory.\nOr stay in\nand rewatch the same nonsense.\nAgain 📺✨",
  },
  {
    category: "teasing",
    text: "At some point,\nyou do have to leave the house\nif you want the [[plot]]\nto move forward 🎬",
  },
  {
    category: "teasing",
    text: "You are not tired.\nYou are [[under-adventured]] 🦉",
  },
  {
    category: "teasing",
    text: "I respect your need to rest.\n---\nI do not respect\nyour commitment\nto doing absolutely nothing 😌",
  },
  {
    category: "teasing",
    text: "Could you be any more\nemotionally attached\nto staying home?\n---\nA little Chandler of me,\nI know ☕",
  },
  {
    category: "teasing",
    text: "Your love life\ncannot improve\nif your main date spot\nis the refrigerator 😭",
  },
  {
    category: "teasing",
    text: "**Reply to the message.**\n---\nLet us all see what happens 📱✨",
  },
  {
    category: "teasing",
    text: "You want [[magic]],\nbut you are giving the universe\nvery little to work with\nright now 🪄",
  },
  {
    category: "teasing",
    text: "Not me watching you\noverthink a two-sentence text\nlike it is a legal document 🦉⚖️",
  },
  {
    category: "teasing",
    text: "Being a homebody\nand wanting a spontaneous love story\nis a slightly funny combo,\nI hope you know that 😌💛",
  },
  {
    category: "teasing",
    text: "Roses are red,\nplans can be sweet,\nyou keep waiting around\nlike adventure delivers\nstraight to your seat 🥀",
  },
  {
    category: "teasing",
    text: "You are one outfit change away\nfrom pretending\nyou are spontaneous again 👀",
  },
  {
    category: "teasing",
    text: "I am not saying\ngo flirt.\n---\nI am saying stop acting like\nthe walls are enough company 🧱",
  },
  {
    category: "teasing",
    text: "You have big\n[[main-character feelings]]\nfor someone avoiding\nbasic plot development 🎥",
  },
  {
    category: "teasing",
    text: "Imagine if you actually said yes\nto something tonight.\n---\nWild.\nReckless.\nInspiring ✨",
  },
  {
    category: "teasing",
    text: "You are cute,\nbut your commitment\nto postponing joy\nis getting a little embarrassing 💛😌",
  },

  // Dares / mini challenges
  {
    category: "dare",
    text: "**I DARE YOU:**\ntext one person right now\nand say,\n“Want to do something fun this week?” 📱",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ngo somewhere new today,\neven if it is only\nfor twenty minutes 🗺️✨",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nbring a flower to a friend\nfor no reason at all 🌼💛",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ncompliment someone\nwithout overthinking it.\nThen walk away\nlike the charming legend you are 😌",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nask someone,\n“What are you doing this weekend?”\nand actually mean it 👀",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ntake yourself on\na little solo date.\nSnack, walk, drink,\nbookstore, whatever 🍰📚",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nsay yes to one plan this week\nthat you would normally\n[[overthink]] ✅",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nsend the risky-but-cute text.\nNot reckless.\nJust brave 💌😉",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nsmile at a stranger today.\nTiny kindness counts 🙂",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ninvite someone\nto your favorite spot\nand tell them why you love it 📍💛",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nput your phone away\nfor one whole outing.\nYes, the world will survive 📵✨",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nask someone a real question today.\nNot just,\n“How are you?” 🦉",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ngo watch the sunset\nsomewhere that feels\na little cinematic 🌇🎬",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nwear the outfit\nyou keep saving\nfor some other time.\nThis is some other time 👗✨",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nmake a two-stop plan.\nOne stop is cute.\nTwo stops feels intentional ☕🍨",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nask a friend\nto be spontaneous with you\nfor one hour.\nThat is all ⏳",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nleave the house\nwithout needing\na perfect reason 🚪",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ntell someone,\n“You crossed my mind today.”\nSoft.\nSimple.\nPowerful 💛",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\ndo one thing today\nthat your future self\nwill be grateful for 🌱",
  },
  {
    category: "dare",
    text: "**I DARE YOU:**\nlet today be\na little less planned\nand a little more alive ✨🦉",
  },

  // Social tips / date tips / conversation prompts
  {
    category: "tips",
    text: "A hangout feels better\nwhen it has a little movement.\n---\nA walk,\nthen coffee,\nthen dessert?\nVery cute ☕🚶🍰",
  },
  {
    category: "tips",
    text: "Try this question:\n---\n“What is something small\nthat makes your whole day better?” 💛",
  },
  {
    category: "tips",
    text: "Want to know someone faster?\nTravel with them,\nget lost with them,\nor do something\na little inconvenient together 😌",
  },
  {
    category: "tips",
    text: "If conversation feels stiff,\ntalk about [[moments]],\nnot facts.\n---\nAsk about a memory,\nnot a résumé 🦉",
  },
  {
    category: "tips",
    text: "A good hangout has movement.\nEven one tiny change of location\ncan make the whole thing\nfeel more alive ✨",
  },
  {
    category: "tips",
    text: "Try this one:\n---\n“What is something\nyou wish more people knew about you?” 🚪💬",
  },
  {
    category: "tips",
    text: "Silence is not always bad.\nSometimes a comfortable pause\nmeans the vibe is actually good 🌙",
  },
  {
    category: "tips",
    text: "If you want people to open up,\ngo first.\n---\nA little honesty\nusually invites honesty back 💛",
  },
  {
    category: "tips",
    text: "A simple plan is often the best plan.\nOne thing to do.\nOne place to sit.\nOne little treat 🍨",
  },
  {
    category: "tips",
    text: "Want less awkwardness?\nTalk about what is around you.\n---\nShared surroundings\nmake easy conversation 🌿",
  },
  {
    category: "tips",
    text: "Good date question:\n---\n“What kind of days\nmake you feel most like yourself?” 👀",
  },
  {
    category: "tips",
    text: "People remember\nhow a moment [[felt]]\nmore than the exact place.\n---\nThe vibe matters 🕯️✨",
  },
  {
    category: "tips",
    text: "Want to connect better?\nPut the phones away\nfor a little while.\nFaces are more interesting anyway 📵🙂",
  },
  {
    category: "tips",
    text: "Try this one:\n---\n“What is a tiny thing\nyou are weirdly passionate about?” 😌",
  },
  {
    category: "tips",
    text: "A little novelty helps.\nNew place.\nNew food.\nNew route.\nNew question 🍜🗺️",
  },
  {
    category: "tips",
    text: "If you are nervous,\nhelp the other person\nfeel comfortable.\nThat usually calms you down too 💛",
  },
  {
    category: "tips",
    text: "Soft question:\n---\n“What is a memory\nyou can return to\nany time you need comfort?” 🌙",
  },
  {
    category: "tips",
    text: "Doing something\nslightly out of routine together\ncan make a moment feel bigger.\nHumans love a little story 📖",
  },
  {
    category: "tips",
    text: "Ask good things.\nListen slow.\n---\nPeople bloom\nwhere kindness goes 🌼",
  },
  {
    category: "tips",
    text: "You do not need\nto impress people.\n---\nYou just need\nto be present.\nThat is where connection starts ✨",
  },

  // ...rest of your array...
];
