/**
 * Built-in login quotes — Elon Musk + peers he respects, and thinkers he
 * recommends: Huang, Bezos, Page, Lütke, Naval, Jobs, Thiel, Feynman, Ford,
 * Asimov, Munger. Curated for Pragati: ownership, shipping, deletion, clarity.
 *
 * Stable ids power the no-repeat ledger (never index-based). Live updates:
 * set QUOTES_FEED_URL → JSON { quotes: [{ id?, text, author }] } merged at
 * GET /api/quotes without redeploying the app.
 */

export interface Quote {
  id: string;
  text: string;
  author: string;
  authorKey?: string;
}

export const BUILTIN_QUOTES: Quote[] = [
  {
    "id": "q001",
    "text": "The first step is to make the requirements less dumb. Question them.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q002",
    "text": "Delete any part of the process you can. You may have to add back 10% — that is fine.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q003",
    "text": "Simplify and optimize only after you have deleted the unnecessary.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q004",
    "text": "Accelerate cycle time. But never accelerate a broken process.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q005",
    "text": "Automate last. Automating a mess only makes the mess faster.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q006",
    "text": "The only rules are the ones dictated by the laws of physics. Everything else is a recommendation.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q007",
    "text": "I think it is possible for ordinary people to choose to be extraordinary.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q008",
    "text": "Persistence is very important. You should not give up unless you are forced to give up.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q009",
    "text": "When something is important enough, you do it even if the odds are not in your favor.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q010",
    "text": "Constantly seek criticism. A well thought-out critique of whatever you are doing is as valuable as gold.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q011",
    "text": "If you are not failing, you are not innovating enough.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q012",
    "text": "Work like hell. I mean you just have to put in 80 to 100 hour weeks every week.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q013",
    "text": "Some people do not like change, but you need to embrace change if the alternative is disaster.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q014",
    "text": "I could either watch it happen or be a part of it.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q015",
    "text": "Failure is an option here. If things are not failing, you are not innovating enough.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q016",
    "text": "Prefer engineers who ship. Theory without a working system is a story.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q017",
    "text": "Make the feedback loop short. See reality, change the design, ship again.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q018",
    "text": "Great companies are built on great products — not great PowerPoints.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q019",
    "text": "Physics is the law; everything else is a recommendation. Apply that to your process.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q020",
    "text": "Ask why five times. The first answer is almost never the root requirement.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q021",
    "text": "If you need more than a page to explain the plan, you do not understand the plan.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q022",
    "text": "Hardcore means you care enough to finish what you started.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q023",
    "text": "Delete the meeting if the board already answers the question.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q024",
    "text": "A schedule without owners is fiction.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q025",
    "text": "Ship the next working increment. Then the next. Momentum compounds.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q026",
    "text": "If you cannot put the problem on a whiteboard, you do not understand it yet.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q027",
    "text": "I do not like to plan too far ahead. I like to plan the next step very carefully.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q028",
    "text": "The more you sweat in peacetime, the less you bleed in wartime.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q029",
    "text": "Speed is a feature. Latency is a tax on every decision.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q030",
    "text": "You want to be working on things that matter — not on theater.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q031",
    "text": "Pain and suffering is necessary for all of us. That is how we learn.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q032",
    "text": "Strategy is about what you choose not to do as much as what you do.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q033",
    "text": "The single most important thing is to be able to reinvent yourself.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q034",
    "text": "There is no such thing as a free lunch in excellence. You earn the board looking clean.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q035",
    "text": "Move at the speed of light on the critical path. Everything else can wait.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q036",
    "text": "A great team makes hard things look simple after enough iterations.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q037",
    "text": "Do not confuse activity with progress. Measure finished work.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q038",
    "text": "If the plan is wrong, change the plan. Do not defend a bad map.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q039",
    "text": "Stay close to the work. Distance from details is how leaders get surprised.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q040",
    "text": "The best status is a green board you can trust.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q041",
    "text": "Prioritize ruthlessly. Most of the backlog is optional.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q042",
    "text": "Build for the long term, but ship every week like it is the last demo.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q043",
    "text": "Clarity is kindness. Ambiguous owners create silent failure.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q044",
    "text": "When the work is hard, that is usually the signal you are in the right place.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q045",
    "text": "Practice until the quality bar is muscle memory.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q046",
    "text": "Zero exceptions is a better morning than twenty half-done tasks.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q047",
    "text": "Write the problem down. Then the first principle solution. Then the tasks.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q048",
    "text": "High standards are not cruelty. Low standards are.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q049",
    "text": "Your calendar is a list of choices. Guard the deep work.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q050",
    "text": "Finish. Unfinished work is inventory that decays.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q051",
    "text": "Start with the customer and work backwards.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q052",
    "text": "It is always Day 1.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q053",
    "text": "We are stubborn on vision. We are flexible on details.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q054",
    "text": "If you double the number of experiments you do per year, you double your inventiveness.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q055",
    "text": "There are two kinds of decisions: one-way doors and two-way doors. Most are two-way — decide fast.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q056",
    "text": "If you are good at course correcting, being wrong may be less costly than being slow.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q057",
    "text": "A company should not get addicted to being shiny. Shiny does not last.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q058",
    "text": "Focus on the things that do not change.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q059",
    "text": "Customer Obsession: work backwards from the person who depends on the outcome.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q060",
    "text": "Ownership: act like you own the result, not just the ticket.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q061",
    "text": "Invent and Simplify: if a status meeting can be a clear board, prefer the board.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q062",
    "text": "Are Right, A Lot: check the data on the board before you defend a plan.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q063",
    "text": "Learn and Be Curious: ask why it slipped before you assign blame.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q064",
    "text": "Highest Standards: do not ship good enough when quality is the product.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q065",
    "text": "Think Big: aim at the whole delivery, then break it into visible steps.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q066",
    "text": "Bias for Action: when the decision is reversible, move and update the status.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q067",
    "text": "Frugality: cut busywork so energy goes to work that ships.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q068",
    "text": "Earn Trust: be honest about dates and blockers. Trust is a board that matches reality.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q069",
    "text": "Dive Deep: leads who never open the tasks get surprised by the late list.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q070",
    "text": "Disagree and Commit: debate openly, then commit. Half-support wastes the team.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q071",
    "text": "Deliver Results: focus on finished work, not motion.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q072",
    "text": "Make the work visible. Shared truth beats private memory.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q073",
    "text": "One owner. One date. One next action. Ambiguity is expensive.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q074",
    "text": "Exceptions first: clear what is late or blocked before celebrating what is fine.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q075",
    "text": "Long-term thinking: ship work that still makes sense next quarter.",
    "author": "Jeff Bezos",
    "authorKey": "bezos"
  },
  {
    "id": "q076",
    "text": "Always deliver more than expected.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q077",
    "text": "If you are not doing some things that are crazy, you are doing the wrong things.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q078",
    "text": "Lots of companies do not succeed over time. What do they fundamentally do wrong? They usually miss the future.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q079",
    "text": "You do not need to have a 100-person company to develop that idea.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q080",
    "text": "Especially in technology, we need revolutionary change, not incremental change.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q081",
    "text": "If we were motivated by money, we would have sold to Microsoft long ago.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q082",
    "text": "It is often easier to make something 10x better than 10% better — and more valuable.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q083",
    "text": "Focus on the user and all else will follow.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q084",
    "text": "The perfect search engine would understand exactly what you mean and give you back exactly what you want.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q085",
    "text": "Solve hard problems. Easy problems are already crowded.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q086",
    "text": "Ship something people can use. Theory is optional; the product is not.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q087",
    "text": "Do not hire people to tell them what to do. Hire them so they can tell you.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q088",
    "text": "Keep the organization flat enough that information still travels at light speed.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q089",
    "text": "Moonshots need weekly progress, not annual hope.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q090",
    "text": "If it is important and hard, start now with the smallest real step.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q091",
    "text": "Delete features that do not pull their weight. Complexity is a product tax.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q092",
    "text": "Measure what users do, not what meetings claim.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q093",
    "text": "Great products are opinionated. Weak products try to please everyone.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q094",
    "text": "Speed of iteration beats perfection of the first draft.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q095",
    "text": "Put the best people on the biggest problems.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q096",
    "text": "A clear mission makes prioritization almost automatic.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q097",
    "text": "Build for scale from day one — but ship from day one too.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q098",
    "text": "The best interface is the one that disappears into the work.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q099",
    "text": "When in doubt, make it faster and simpler.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q100",
    "text": "Your roadmap is a hypothesis. Validate it with shipped work.",
    "author": "Larry Page",
    "authorKey": "page"
  },
  {
    "id": "q101",
    "text": "Optimize for the long term. Almost everything looks different with a 10-year clock.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q102",
    "text": "Be a mentor and a student. Both make the craft better.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q103",
    "text": "Default to action. Discussion without a next step is a trap.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q104",
    "text": "Impact over activity. What changed for the customer?",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q105",
    "text": "We are not a family. We are a high-performing team with high trust.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q106",
    "text": "Build a company you would want to compete with.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q107",
    "text": "Craft is a strategy. Details compound into trust.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q108",
    "text": "The best process is the one that removes itself when the work is clear.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q109",
    "text": "Write things down. Oral culture does not scale.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q110",
    "text": "Prefer boring technology that works over exciting technology that does not.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q111",
    "text": "Small teams with ownership beat large teams with coordination theater.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q112",
    "text": "If a process needs a meeting to explain it, simplify the process.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q113",
    "text": "Protect maker time like it is the product.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q114",
    "text": "Ship, learn, refine. The loop is the strategy.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q115",
    "text": "Trust is built by keeping promises on the board.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q116",
    "text": "Do fewer things better. Priority is a product decision.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q117",
    "text": "Autonomy requires context. Give people the why, not just the what.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q118",
    "text": "Quality is not a phase. It is how you work every day.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q119",
    "text": "When something is wrong in production, drop everything else.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q120",
    "text": "The roadmap is a conversation with reality, updated weekly.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q121",
    "text": "Hire for trajectory and taste, not just credentials.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q122",
    "text": "Transparency reduces politics. Put the work where everyone can see it.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q123",
    "text": "A good tool disappears. A bad tool demands attention.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q124",
    "text": "Leave the codebase and the board better than you found them.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q125",
    "text": "Customer trust is the only moat that compounds forever.",
    "author": "Tobi Lütke",
    "authorKey": "lutke"
  },
  {
    "id": "q126",
    "text": "Play long-term games with long-term people.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q127",
    "text": "Desire is a contract you make with yourself to be unhappy until you get what you want. Choose carefully.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q128",
    "text": "Specific knowledge is found by pursuing your genuine curiosity.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q129",
    "text": "Embrace accountability and take business risks under your own name.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q130",
    "text": "Read what you love until you love to read.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q131",
    "text": "If you cannot decide, the answer is no.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q132",
    "text": "The less you need approval, the more free you are to do the real work.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q133",
    "text": "Escape competition through authenticity. Build what only you can build.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q134",
    "text": "A calm mind, a fit body, a house full of love — these things cannot be bought.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q135",
    "text": "Code and media are leverage. Use tools that multiply effort.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q136",
    "text": "Become the best in the world at what you do. Keep redefining what you do until this is true.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q137",
    "text": "Impatience with actions, patience with results.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q138",
    "text": "Clear thinking requires clear writing. If it is muddy on the board, it is muddy in the head.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q139",
    "text": "Do not spend your life on other people's priorities.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q140",
    "text": "The modern struggle is the abundance of distraction, not the scarcity of opportunity.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q141",
    "text": "Productize yourself: find the intersection of what you love, what you are good at, and what the world needs.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q142",
    "text": "Status games are zero-sum. Building is positive-sum.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q143",
    "text": "Free up your time. Judgment is the scarce resource.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q144",
    "text": "One authentic email can replace a week of meetings.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q145",
    "text": "Learn to sell, learn to build. If you can do both, you are unstoppable.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q146",
    "text": "The best way to complain is to make something better.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q147",
    "text": "Intentions do not matter. Actions do. The board only records actions.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q148",
    "text": "Retirement is when you stop sacrificing today for an imaginary tomorrow. So design work you do not need to escape.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q149",
    "text": "All the real benefits in life come from compound interest — skill, relationships, product quality.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q150",
    "text": "Busy is a decision. Protect focus like capital.",
    "author": "Naval Ravikant",
    "authorKey": "naval"
  },
  {
    "id": "q151",
    "text": "Real artists ship.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q152",
    "text": "Simple can be harder than complex. You have to work hard to get your thinking clean.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q153",
    "text": "Innovation is saying no to a thousand things.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q154",
    "text": "Details matter. It is worth waiting to get it right.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q155",
    "text": "Design is not just what it looks like. Design is how it works.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q156",
    "text": "Focus and simplicity. Once you get there, you can move mountains.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q157",
    "text": "Quality is more important than quantity. One home run is better than two doubles.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q158",
    "text": "Stay hungry. Stay foolish.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q159",
    "text": "Your work is going to fill a large part of your life. Do not settle.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q160",
    "text": "People who are crazy enough to think they can change the world are the ones who do.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q161",
    "text": "Deciding what not to do is as important as deciding what to do.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q162",
    "text": "You cannot connect the dots looking forward. You can only connect them looking backward. So you have to trust.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q163",
    "text": "Be a yardstick of quality. Some people are not used to an environment where excellence is expected.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q164",
    "text": "The people who are doing the work are the moving force. The manager is a coach.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q165",
    "text": "Do not let the noise of others' opinions drown out your own inner voice.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q166",
    "text": "Great things in business are never done by one person. They are done by a team of people.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q167",
    "text": "My favorite things in life do not cost any money. It is really clear that the most precious resource we all have is time.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q168",
    "text": "Get closer than ever to your customers. So close that you tell them what they need before they realize it themselves.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q169",
    "text": "Sometimes when you innovate, you make mistakes. It is best to admit them quickly, and get on with improving.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q170",
    "text": "I want to put a ding in the universe.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q171",
    "text": "We do not get a chance to do that many things, and every one should be really excellent.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q172",
    "text": "If you do something and it turns out pretty good, then you should go do something else wonderful.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q173",
    "text": "Technology is nothing. What is important is that you have faith in people.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q174",
    "text": "The journey is the reward — but only if you ship along the way.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q175",
    "text": "Make every detail perfect and limit the number of details to perfect.",
    "author": "Steve Jobs",
    "authorKey": "jobs"
  },
  {
    "id": "q176",
    "text": "What important truth do very few people agree with you on?",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q177",
    "text": "Competition is for losers. Escape competition by building something unique.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q178",
    "text": "Horizontal progress is going from 1 to n. Vertical progress is going from 0 to 1.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q179",
    "text": "A bad plan is better than no plan.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q180",
    "text": "Sales matters just as much as product. Distribution is not automatic.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q181",
    "text": "Brilliant thinking is rare, but courage is in even shorter supply.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q182",
    "text": "Every moment in business happens only once. The next Bill Gates will not build an operating system.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q183",
    "text": "Definite optimism works: plan and build the future, do not wait for it.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q184",
    "text": "Secrets are the truths that are hard to see. Find them in the work.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q185",
    "text": "Founders should stay with the company. Continuity of vision matters.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q186",
    "text": "Do not disrupt for its own sake. Create something people love.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q187",
    "text": "A great company is a conspiracy to change the world.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q188",
    "text": "If you focus on near-term growth above all else, you miss the most important question you should be asking.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q189",
    "text": "The most valuable businesses of coming decades will be built by those who start from small monopolies.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q190",
    "text": "The best startups might be considered slightly less extreme kinds of cults.",
    "author": "Peter Thiel",
    "authorKey": "thiel"
  },
  {
    "id": "q191",
    "text": "The first principle is that you must not fool yourself — and you are the easiest person to fool.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q192",
    "text": "What I cannot create, I do not understand.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q193",
    "text": "I would rather have questions that cannot be answered than answers that cannot be questioned.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q194",
    "text": "Study hard what interests you in the most undisciplined, irreverent, and original manner.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q195",
    "text": "Fall in love with some activity, and do it! Nobody ever figures out what life is all about.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q196",
    "text": "If you think you understand it, you do not. Explain it simply — then you will know.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q197",
    "text": "Cargo cult science looks like science but misses the honesty. Demand honesty on the board.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q198",
    "text": "Doubt is not a pleasant condition, but certainty is absurd when the data is incomplete.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q199",
    "text": "Teach it as if the student could rebuild it. That is understanding.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q200",
    "text": "Nature cannot be fooled. Neither can a ship date that was always a fantasy.",
    "author": "Richard Feynman",
    "authorKey": "feynman"
  },
  {
    "id": "q201",
    "text": "Whether you think you can, or you think you cannot — you are right.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q202",
    "text": "Quality means doing it right when no one is looking.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q203",
    "text": "Coming together is a beginning; keeping together is progress; working together is success.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q204",
    "text": "Failure is simply the opportunity to begin again, this time more intelligently.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q205",
    "text": "Do not find fault, find a remedy.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q206",
    "text": "Chop your own wood and it will warm you twice.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q207",
    "text": "Nothing is particularly hard if you divide it into small jobs.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q208",
    "text": "If everyone is moving forward together, then success takes care of itself.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q209",
    "text": "The only real security a person can have is a reserve of knowledge, experience, and ability.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q210",
    "text": "You cannot build a reputation on what you are going to do.",
    "author": "Henry Ford",
    "authorKey": "ford"
  },
  {
    "id": "q211",
    "text": "The most exciting phrase to hear in science is not Eureka but That is funny…",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q212",
    "text": "Violence is the last refuge of the incompetent. Prefer systems that prevent crisis.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q213",
    "text": "Never let your sense of morals get in the way of doing what is right.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q214",
    "text": "Self-education is the only kind of education there is.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q215",
    "text": "The true delight is in the finding out rather than in the knowing.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q216",
    "text": "People who think they know everything are a great annoyance to those of us who do.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q217",
    "text": "It pays to be obvious, especially if you have a reputation for subtlety. Make the plan readable.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q218",
    "text": "Life is pleasant. Death is peaceful. It is the transition that is troublesome. Ship carefully.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q219",
    "text": "I write for the same reason I breathe — because if I did not, I would die. Build for that reason.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q220",
    "text": "A subtle thought that is in error may yet give rise to fruitful inquiry.",
    "author": "Isaac Asimov",
    "authorKey": "asimov"
  },
  {
    "id": "q221",
    "text": "Invert, always invert. Tell me where I will die so I never go there.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q222",
    "text": "The big money is not in the buying and selling, but in the waiting — and the compounding of skill.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q223",
    "text": "Show me the incentive and I will show you the outcome.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q224",
    "text": "It is remarkable how much long-term advantage people like us have gotten by trying to be consistently not stupid.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q225",
    "text": "Take a simple idea and take it seriously.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q226",
    "text": "The best thing a human can do is help another human know more.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q227",
    "text": "Spend each day trying to be a little wiser than you were when you woke up.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q228",
    "text": "All I want to know is where I am going to die, so I will never go there. Apply that to project risks.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q229",
    "text": "A lot of success in life and business comes from knowing what you want to avoid.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q230",
    "text": "The iron rule of life is that only 20% of the people do 80% of the work. Be in the 20%.",
    "author": "Charlie Munger",
    "authorKey": "munger"
  },
  {
    "id": "q231",
    "text": "The board is the source of truth. If it is wrong, fix the board first.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q232",
    "text": "Prefer fewer projects finished over many projects lingering.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q233",
    "text": "A requirement without an owner is not a requirement.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q234",
    "text": "Cut scope before you cut quality.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q235",
    "text": "The schedule is a promise. Treat it like one.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q236",
    "text": "Prototype in the real system. Mockups do not catch integration debt.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q237",
    "text": "If the task has been open for weeks, either finish it or kill it.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q238",
    "text": "First principles planning: atoms of work, not vague phases.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q239",
    "text": "Hardware is hard. Software is hard. Communication is harder — write it down.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q240",
    "text": "The best demo is the product doing the job.",
    "author": "Elon Musk",
    "authorKey": "elon"
  },
  {
    "id": "q241",
    "text": "War-time mode means exceptions first, then everything else.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q242",
    "text": "A clean due list is a competitive advantage.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q243",
    "text": "Train the team on the hard problems while it is still peacetime.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q244",
    "text": "Do not hide red. Red is information.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q245",
    "text": "The critical path is sacred. Protect it from side quests.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q246",
    "text": "If you cannot explain the next step, you are not ready to assign it.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q247",
    "text": "Excellence is a habit of finishing.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q248",
    "text": "Leaders go where the risk is and make it visible.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q249",
    "text": "Simplify the architecture of the work, then accelerate.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  },
  {
    "id": "q250",
    "text": "A quiet dashboard with zero overdue is a victory worth defending.",
    "author": "Jensen Huang",
    "authorKey": "jensen"
  }
];

export const BUILTIN_QUOTE_VERSION = 'v15-250';
