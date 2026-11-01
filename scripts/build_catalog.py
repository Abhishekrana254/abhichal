#!/usr/bin/env python3
"""Build data/catalog.json: every niche the page lists, with its sourced RPM band.

A niche here is a name, a one-line description, a search phrase for the weekly
scan, how much of it AI can make, and a production style. The RPM band belongs
to the group and cites where it came from. Groups with no published band say so.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SOURCES = {
    "lfs": {"name": "Longform Studio, faceless niches by RPM (2026)", "url": "https://longformstudio.app/articles/best-faceless-youtube-niches"},
    "rp": {"name": "ReelPilot, faceless RPM by niche (2026)", "url": "https://reelpilot.app/blog/faceless-youtube-rpm-by-niche"},
    "vidiq": {"name": "vidIQ, 80 best niches. Band is its CPM range times 55%", "url": "https://vidiq.com/blog/post/best-youtube-niches/"},
    "playcut": {"name": "Playcut, RPM by niche", "url": "https://playcut.ai"},
    "air": {"name": "AIR Media-Tech, Shorts RPM by country", "url": "https://air.io/en/air-data-findings/youtube-shorts-rpm-vs-long-form-how-much-do-shorts-earn-in-2026"},
    "ig": {"name": "Instagram Help Center, bonus program rules", "url": "https://help.instagram.com/708013994693013"},
}

GROUPS = {
    "ai-story": ("AI stories and comedy", [2, 6], "rp", "story"),
    "finance": ("Money and investing", [8, 25], "lfs", "explainer"),
    "business": ("Business", [8, 19], "lfs", "explainer"),
    "legal": ("Legal and tax", [8, 22], "lfs", "explainer"),
    "insurance": ("Insurance", [7, 17], "lfs", "explainer"),
    "realestate": ("Real estate", [5, 17], "lfs", "explainer"),
    "tech": ("AI and tech", [4, 25], "lfs", "news"),
    "health": ("Health and wellness", [4, 22], "lfs", "explainer"),
    "career": ("Career and skills", [5, 12], "lfs", "tutorial"),
    "edu": ("Education and science", [6, 13], "rp", "explainer"),
    "history": ("History and true crime", [3, 12], "lfs", "explainer"),
    "parenting": ("Parenting", [4, 10], "lfs", "explainer"),
    "gaming": ("Gaming", [1, 5], "lfs", "commentary"),
    "cars": ("Cars and bikes", [5, 13], "playcut", "listicle"),
    "outdoors": ("Outdoors and survival", [4, 11], "playcut", "listicle"),
    "fitness": ("Fitness", [6, 12], "rp", "handson"),
    "food": ("Food and cooking", [2.8, 5], "vidiq", "handson"),
    "travel": ("Travel", [2.8, 5], "vidiq", "explainer"),
    "motivation": ("Motivation", [3, 8], "rp", "quote"),
    "satisfying": ("Satisfying and ASMR", [1.2, 4], "rp", "satisfying"),
    "animals": ("Animals and wildlife", [2, 6], "rp", "explainer"),
    "sports": ("Sports and combat", [1.5, 4], "playcut", "commentary"),
    "comedy": ("Comedy and sketches", [2, 6], "rp", "story"),
    "music": ("Music", None, None, "ambient"),
    "diy": ("DIY and hobbies", [2.8, 5], "vidiq", "handson"),
    "faith": ("Faith and culture", None, None, "story"),
    "beauty": ("Beauty and style", None, None, "handson"),
    "misc": ("Explainers and lists", [3, 8], "rp", "explainer"),
}

# (name, ai, line, search phrase or None, style override or None)
# ai: F = AI can make all of it, A = AI helps and you add screen or footage, R = needs your own footage
N = {}
N["ai-story"] = [
    ("AI baby comedy", "F", "One baby, an adult voice, a short joke. The face stays the same.", "ai baby comedy", None),
    ("Two babies talking", "F", "Two saved faces argue. The joke lands in the third reply.", "ai talking babies", None),
    ("AI horror episodes", "F", "Numbered episodes. A normal start, one wrong detail, a last line.", "ai horror story", None),
    ("AI mythology", "F", "One scene from a known story in one art style.", "ai mahabharat", None),
    ("Character dance", "F", "A character you made, placed on a dance you can use.", "ai character dance", None),
    ("Object characters", "F", "A fruit, vegetable, or tool with a face doing one human thing.", "ai talking vegetables", None),
    ("AI love story", "F", "A short romance. The last scene changes what the first meant.", "ai love story", None),
    ("Real or AI", "A", "The viewer guesses which clip is generated.", "is this real or ai", None),
    ("Original AI character talks", "F", "One original adult character, to camera, one opinion a video.", "ai girl talking", None),
    ("Hindi AI story series", "F", "A continuing family story. Each episode ends on a question.", "ai hindi kahani", None),
    ("One-twist AI short", "F", "A one-off story with a single turn.", "ai short film twist", None),
    ("AI religious scene", "F", "One scene from a known religious story, told as a story.", "ai islamic story", None),
    ("Wedding-day drama", "F", "One argument on a wedding day.", "ai wedding drama", None),
    ("AI animal rescue stories", "F", "A rescued animal, an owner, a happy last scene.", "ai animal rescue story", None),
    ("AI cartoon moral stories", "F", "A short moral tale with animal or kid characters.", "ai moral story for kids", None),
    ("AI superhero kids", "F", "A kid with one power and one chore.", "ai superhero kid", None),
    ("AI fake movie trailers", "F", "A trailer for a film that does not exist.", "ai movie trailer", None),
    ("AI sci-fi mini series", "F", "Episodic sci-fi with one lead and one ship.", "ai sci fi short film", None),
    ("AI what-if history", "F", "A famous event told with one thing changed.", "ai what if history", None),
    ("AI fantasy kingdom lore", "F", "The made-up history of one kingdom, one chapter a video.", "ai fantasy lore", None),
    ("AI villain monologues", "F", "One villain, one speech, one reason.", "ai villain monologue", None),
    ("AI bedtime stories", "F", "Slow stories read aloud over soft stills.", "ai bedtime story", None),
]
N["finance"] = [
    ("Personal finance whiteboard", "A", "A money idea drawn on a whiteboard while you talk.", "personal finance whiteboard", "animation"),
    ("Budgeting basics", "A", "One budgeting method, walked through with real numbers.", "budgeting for beginners", None),
    ("Investing for beginners", "A", "Index funds, SIPs, and getting started.", "investing for beginners", None),
    ("Mutual funds explained", "A", "One fund type per video, in plain words.", "mutual funds explained", None),
    ("Credit card rewards", "A", "Which card pays back on which spend.", "credit card rewards", None),
    ("Side-hustle case studies", "A", "A real income breakdown from a side project.", "side hustle case study", None),
    ("FIRE and early retirement", "A", "How much you need and how long it takes.", "financial independence retire early", None),
    ("Crypto explained", "A", "One idea about digital assets, no price calls.", "crypto explained", None),
    ("Small-business finance", "A", "Cash flow and taxes for shop owners.", "small business finance", None),
    ("Stock market news", "A", "The week in markets, in two minutes.", "stock market news", "news"),
    ("Debt payoff plans", "A", "Snowball or avalanche, with the maths.", "debt payoff plan", None),
    ("Money psychology", "A", "Why people spend the way they do.", "psychology of money", None),
]
N["business"] = [
    ("Business case studies", "A", "How one company got big, or failed.", "business case study", None),
    ("Startup stories", "A", "Founder stories told as a timeline.", "startup story", None),
    ("Brand history", "A", "Where a famous brand came from.", "brand history documentary", None),
    ("E-commerce and dropshipping", "A", "Store breakdowns and product tests.", "ecommerce store breakdown", None),
    ("Sales and marketing tips", "A", "One tactic, one example.", "marketing tips", None),
    ("Entrepreneur biographies", "A", "A founder's life in ten minutes.", "entrepreneur biography", None),
    ("Productivity systems", "A", "A system you can start today.", "productivity system", None),
    ("Small shop business ideas", "A", "A business a person can start in one city.", "small business ideas india", None),
]
N["legal"] = [
    ("Tax education", "A", "Tax rules explained for salaried people.", "income tax explained", None),
    ("Court case summaries", "A", "A public case told clearly.", "court case summary", None),
    ("Tenant and landlord rights", "A", "What the rental agreement really says.", "tenant rights", None),
    ("Consumer rights in India", "A", "What you can ask for when a product fails.", "consumer rights india", None),
    ("Contract basics", "A", "Clauses that matter and clauses that do not.", "contract basics", None),
    ("Immigration explainers", "A", "Visa steps in order.", "immigration explained", None),
]
N["insurance"] = [
    ("Health insurance explained", "A", "What is covered and what is not.", "health insurance explained", None),
    ("Car insurance tips", "A", "How claims get rejected, and how to avoid it.", "car insurance tips", None),
    ("Term life insurance", "A", "How much cover and for how long.", "term insurance explained", None),
]
N["realestate"] = [
    ("First-time home buyer", "A", "The buying steps, in order.", "first time home buyer", None),
    ("Property market by city", "A", "Prices and trends for one city.", "real estate market city", None),
    ("Rental property case studies", "A", "Real numbers from a rental.", "rental property investing", None),
    ("Home loan explainers", "A", "Rates, EMI, and what banks check.", "home loan explained", None),
    ("Home renovation costs", "R", "What a room costs to redo.", "home renovation cost", None),
]
N["tech"] = [
    ("AI news", "A", "What changed in AI this week.", "ai news this week", None),
    ("AI tool reviews", "A", "One tool, tested on one task.", "ai tool review", "listicle"),
    ("AI workflow tutorials", "A", "A screen recording of one real job.", "ai workflow tutorial", "tutorial"),
    ("Gadget reviews", "R", "A product on a desk, with a verdict.", "gadget review", "listicle"),
    ("No-code automation", "A", "n8n, Zapier, and Make builds end to end.", "no code automation", "tutorial"),
    ("Cybersecurity basics", "A", "How scams work and how to avoid them.", "cybersecurity basics", None),
    ("Smartphone tips", "A", "Settings people do not know exist.", "smartphone tips and tricks", None),
    ("Senior digital skills", "A", "Teaching older people phones and online banking.", "smartphone for seniors", "tutorial"),
    ("AI side hustles", "A", "Ways people say they earn with AI, tested.", "ai side hustle", None),
]
N["health"] = [
    ("Sleep science", "A", "Why you wake up tired.", "sleep science", None),
    ("Nutrition myths", "A", "A food claim, checked.", "nutrition myths", None),
    ("Senior health and longevity", "A", "Habits that help older people.", "senior health longevity", None),
    ("Mental health basics", "A", "Stress and anxiety in plain words.", "mental health basics", None),
    ("Skincare science", "A", "What an ingredient does and does not do.", "skincare science", None),
    ("Gut health", "A", "What the research says.", "gut health", None),
    ("Back pain and posture", "A", "Stretches and desk fixes.", "back pain exercises", None),
    ("Diabetes and diet", "A", "Food swaps, from public guidance.", "diabetes diet", None),
]
N["career"] = [
    ("Resume tips", "A", "One fix per resume.", "resume tips", None),
    ("Interview preparation", "A", "A question and a good answer.", "interview preparation", None),
    ("Excel tutorials", "A", "One formula, one job.", "excel tutorial", None),
    ("Freelancing tips", "A", "Finding and keeping clients.", "freelancing tips", None),
    ("Remote jobs", "A", "Where roles are and how to apply.", "remote jobs", None),
    ("Study techniques", "A", "How to learn faster.", "study techniques", None),
    ("Government exam prep", "A", "Syllabus, notes, and tricks.", "government exam preparation", None),
]
N["edu"] = [
    ("Science explainers", "F", "One idea animated in a minute.", "science explained", None),
    ("Physics visualised", "F", "A physics idea drawn on screen.", "physics visualization", None),
    ("Space and astronomy", "F", "Planets, stars, and distances.", "space facts", None),
    ("Math tricks", "A", "A shortcut and why it works.", "math tricks", None),
    ("English learning", "A", "Words and phrases in use.", "english learning", None),
    ("Book summaries", "A", "A book in five minutes.", "book summary", None),
    ("Geography facts", "F", "Maps and surprising borders.", "geography facts", None),
    ("Psychology facts", "A", "One finding, one example.", "psychology facts", None),
    ("Economics explained", "A", "Inflation, rates, and trade.", "economics explained", None),
    ("Philosophy shorts", "A", "One thinker, one idea.", "philosophy explained", None),
    ("Biology explained", "F", "How cells and bodies work.", "biology explained", None),
    ("Data visualisation", "A", "A chart that moves.", "data visualization", None),
]
N["history"] = [
    ("City docs", "A", "Why a city was built this way. Maps, satellite shots, voiceover.", "city documentary", None),
    ("History mysteries", "A", "A question from the past with no clean answer.", "history mystery", None),
    ("Ancient civilizations", "F", "How an old culture lived.", "ancient civilization", None),
    ("War history", "A", "One battle, one decision.", "war history documentary", None),
    ("Geopolitics explained", "A", "Why two countries disagree.", "geopolitics explained", None),
    ("True crime cases", "A", "One public case, narrated.", "true crime case", None),
    ("Unsolved mysteries", "A", "A case with no answer.", "unsolved mystery", None),
    ("Disaster documentaries", "A", "What went wrong, in order.", "disaster documentary", None),
    ("Famous scams", "A", "How a scam worked.", "famous scam documentary", None),
    ("Celebrity stories", "A", "A career told with photos and a voice. Rights are the hard part.", "celebrity story documentary", None),
    ("Aviation facts", "A", "How planes work and why they crash.", "aviation explained", None),
    ("Jet explainers", "F", "How one machine works, animated.", "how jet engines work", "animation"),
]
N["parenting"] = [
    ("Parenting tips", "A", "One problem, one fix.", "parenting tips", None),
    ("Homeschooling", "A", "Plans and resources.", "homeschooling", None),
    ("Baby sleep", "A", "Routines that help.", "baby sleep tips", None),
    ("Special needs parenting", "A", "Honest day-to-day stories.", "special needs parenting", None),
    ("Kids learning cartoons", "F", "Alphabets, numbers, and rhymes. Made-for-kids content pays less.", "kids learning cartoon", "animation"),
]
N["gaming"] = [
    ("Game guides and lore", "A", "How a mechanic works, or where a story comes from.", "game lore explained", None),
    ("Gaming news", "A", "The week in games.", "gaming news", "news"),
    ("Retro gaming", "R", "Old consoles and old games.", "retro gaming", None),
    ("Mod showcases", "R", "A mod, shown in play.", "mod showcase", None),
    ("Minecraft stories", "A", "A story told inside a block world.", "minecraft story", None),
    ("Speedrunning", "R", "Beat a game as fast as possible.", "speedrun", None),
    ("Mobile game tips", "R", "Tricks for popular phone games.", "mobile game tips", None),
]
N["cars"] = [
    ("Car hacks", "A", "One repair or buying mistake, shown with stock footage and callouts.", "car hacks", None),
    ("Used car buying", "A", "What to check before you pay.", "used car buying tips", None),
    ("Car maintenance DIY", "R", "A job you can do at home.", "car maintenance diy", None),
    ("EV explained", "A", "Range, charging, and cost.", "electric car explained", None),
    ("Car comparisons", "A", "Two models, one table.", "car comparison", None),
    ("Motorcycle reviews", "R", "A bike, ridden and judged.", "motorcycle review", None),
    ("Supercar facts", "A", "What makes one cost this much.", "supercar facts", None),
]
N["outdoors"] = [
    ("Survival gear", "A", "Which piece of gear is worth buying, and which is hype.", "survival gear", None),
    ("Camping tips", "A", "What to pack and what to leave.", "camping tips", None),
    ("Bushcraft skills", "R", "Fire, shelter, and water in the woods.", "bushcraft", None),
    ("Fishing tips", "R", "Baits, spots, and knots.", "fishing tips", None),
    ("Hiking gear", "A", "Bags, boots, and layers.", "hiking gear", None),
    ("Wilderness survival stories", "A", "A real survival story, told in order.", "wilderness survival story", None),
]
N["fitness"] = [
    ("Home workouts", "R", "Exercises with no equipment.", "home workout", None),
    ("Animated workouts", "F", "A workout drawn or animated, no face, counted reps on screen.", "animated workout", "animation"),
    ("Yoga for beginners", "R", "Poses and flows.", "yoga for beginners", None),
    ("Calisthenics", "R", "Bodyweight strength.", "calisthenics", None),
    ("Weight loss myths", "A", "A claim, checked.", "weight loss myths", None),
    ("Gym for beginners", "R", "First weeks in a gym.", "gym for beginners", None),
    ("Stretching routines", "R", "Ten minutes, morning or night.", "stretching routine", None),
]
N["food"] = [
    ("Recipe shorts", "R", "A dish in 30 seconds.", "recipe shorts", None),
    ("Meat cooking", "R", "Close-up cooking. Cuts, heat, the finished plate. No talking needed.", "steak cooking", None),
    ("Meal prep", "R", "A week of lunches.", "meal prep", None),
    ("Street food", "R", "A stall, a cook, a plate.", "street food", None),
    ("Kitchen gadget reviews", "R", "Does it work, or does it end up in a drawer.", "kitchen gadgets review", "listicle"),
    ("Baking", "R", "Doughs, cakes, and fixes.", "baking", None),
    ("Healthy snacks", "R", "Snacks under five minutes.", "healthy snacks", None),
    ("Regional Indian cooking", "R", "A home dish from one state.", "regional indian recipe", None),
]
N["travel"] = [
    ("Budget travel", "A", "A trip for less money.", "budget travel", None),
    ("Luxury travel", "A", "A hotel or flight, reviewed.", "luxury travel", None),
    ("City travel guides", "A", "Three days in one city.", "travel guide city", None),
    ("Hidden places", "A", "Places guidebooks skip.", "hidden places to visit", None),
    ("Visa and flight hacks", "A", "How to book cheaper and enter easier.", "flight booking hacks", None),
]
N["motivation"] = [
    ("Quote videos", "F", "One quote over one image.", "motivational quotes", None),
    ("Stoic wisdom", "F", "One line from Stoic writers, one example.", "stoicism", None),
    ("Morning routines", "A", "A routine, timed.", "morning routine", None),
    ("Discipline stories", "A", "A story of someone who kept going.", "discipline story", None),
    ("Success biographies", "A", "A career told in five minutes.", "success story biography", None),
    ("Affirmations", "F", "A voice and a slow scene.", "affirmations", None),
]
N["satisfying"] = [
    ("ASMR cutting", "R", "Knives, soap, and sand.", "asmr cutting", None),
    ("Satisfying cleaning", "R", "A dirty thing becomes clean.", "satisfying cleaning", None),
    ("Pressure washing", "R", "A wall, a lawn, a car.", "pressure washing satisfying", None),
    ("Oddly satisfying machines", "F", "Machines doing precise work.", "oddly satisfying machines", None),
    ("Restoration videos", "R", "A broken thing, repaired.", "restoration video", None),
    ("Soap cutting", "R", "Colour layers and a sharp blade.", "soap cutting asmr", None),
    ("Sleep sounds", "F", "Hours of one soft sound.", "sleep sounds", "ambient"),
]
N["animals"] = [
    ("Wildlife facts", "F", "One animal, three facts.", "wildlife facts", None),
    ("Funny pets", "R", "Your own pet, edited tight.", "funny pets", None),
    ("Animal rescue", "R", "A rescue, start to finish.", "animal rescue", None),
    ("Aquarium setups", "R", "A tank, built.", "aquarium setup", None),
    ("Dog training", "R", "One command, one method.", "dog training", None),
    ("Dinosaurs and prehistoric life", "F", "How a creature lived, from fossils.", "dinosaur documentary", None),
    ("Deep sea creatures", "F", "What lives below the light.", "deep sea creatures", None),
    ("Cat behaviour", "A", "Why cats do the thing.", "cat behavior explained", None),
]
N["sports"] = [
    ("MMA breakdowns", "A", "One fight, paused, with the move explained. Footage has to be yours or licensed.", "mma breakdown", None),
    ("Cricket analysis", "A", "A match or a player, with numbers.", "cricket analysis", None),
    ("Football tactics", "A", "One formation, drawn.", "football tactics explained", None),
    ("Self-defense", "R", "One situation, three moves. Easy to copy, so the feed is crowded.", "self defense techniques", None),
    ("Sports science", "A", "Why athletes recover faster.", "sports science", None),
    ("Sports history stories", "A", "A famous match, told as a story.", "sports history story", None),
    ("Boxing technique", "R", "One punch, broken down.", "boxing technique", None),
]
N["comedy"] = [
    ("Sketch comedy", "R", "A short scripted scene.", "sketch comedy", None),
    ("Parody videos", "R", "A familiar thing, made funny.", "parody", None),
    ("Reaction videos", "R", "You, watching something.", "reaction video", "commentary"),
    ("Roast and commentary", "R", "A take on a viral clip.", "roast video", "commentary"),
    ("Meme explainers", "A", "Where a meme came from.", "meme explained", None),
    ("Desi family comedy", "F", "Everyday family jokes, with one set of characters.", "desi family comedy ai", None),
]
N["music"] = [
    ("AI music", "F", "Songs made with an AI music tool.", "ai music", None),
    ("Lyrics videos", "A", "Words on screen over a song.", "lyrics video", None),
    ("Lofi and study beats", "F", "Long loops for focus.", "lofi study music", "ambient"),
    ("Cover songs", "R", "You, singing someone else's song.", "cover song", None),
    ("Instrument tutorials", "R", "One riff, taught.", "guitar tutorial", "tutorial"),
]
N["diy"] = [
    ("Woodworking", "R", "A build, start to finish.", "woodworking", None),
    ("Mechanical keyboards", "R", "Builds, sounds, and mods.", "mechanical keyboard", None),
    ("Bookbinding", "R", "A book, made by hand.", "bookbinding", None),
    ("Urban sketching", "R", "A street, drawn.", "urban sketching", None),
    ("Aquascaping", "R", "A planted tank.", "aquascaping", None),
    ("Garden", "R", "One plant, one problem, a fix. Hands in frame, face optional.", "gardening tips", None),
    ("3D printing", "R", "Prints, fails, and fixes.", "3d printing", None),
    ("Home repairs", "R", "A leaking tap, a loose door.", "home repair diy", None),
    ("Electronics projects", "R", "A circuit, built.", "electronics project", None),
    ("Crafts and paper art", "R", "A small craft in ten steps.", "paper craft", None),
]
N["faith"] = [
    ("Mythology facts", "F", "One story or one character, three facts.", "mythology facts", None),
    ("Devotional stories", "F", "A devotional story, narrated.", "bhakti story", None),
    ("Quran and Islamic stories", "F", "Stories of the prophets, told with illustrations.", "islamic stories", None),
    ("Bible stories", "F", "A parable, narrated.", "bible story", None),
    ("Astrology explained", "A", "What a sign or a planet means.", "astrology explained", None),
    ("Vastu tips", "A", "Home layout beliefs, explained.", "vastu tips", None),
]
N["beauty"] = [
    ("Skincare routines", "R", "A routine, step by step.", "skincare routine", None),
    ("Makeup tutorials", "R", "A look, in order.", "makeup tutorial", None),
    ("AI fashion lookbooks", "F", "Outfits on a made-up model.", "ai fashion lookbook", None),
    ("Hair care", "R", "A wash day, explained.", "hair care routine", None),
    ("Men's grooming", "R", "A beard, a haircut, a routine.", "mens grooming", None),
]
N["misc"] = [
    ("Stick-figure life skills", "A", "A stick figure walks through one life skill.", "stick figure life skills", "animation"),
    ("Top-10 lists", "A", "A ranked list with real research.", "top 10 facts", "listicle"),
    ("Reddit stories", "A", "A post read aloud over game footage.", "reddit stories", None),
    ("Quiz and trivia", "A", "Questions with a countdown.", "quiz trivia", None),
    ("Optical illusions", "F", "An image and a trick.", "optical illusions", None),
    ("Tutorials", "A", "Screen recording of one job, start to finish. The word is too broad to be one niche.", "tutorial", "tutorial"),
    ("Luxury lifestyle", "A", "Houses, cars, and watches.", "luxury lifestyle", None),
    ("Product reviews", "R", "One product, tested.", "product review", "listicle"),
    ("Podcast clips", "A", "Two minutes from a long talk. You need the rights.", "podcast clips", None),
    ("News summaries", "A", "Today in three lines.", "news summary", "news"),
    ("Interesting facts", "F", "One surprising fact per video.", "interesting facts", None),
    ("Human body facts", "F", "What your body does in a day.", "human body facts", None),
]

RECIPE_FOR = {
    "AI baby comedy": "baby",
    "Two babies talking": "talking",
    "AI horror episodes": "horror",
    "AI mythology": "myth",
    "Character dance": "dance",
    "Object characters": "objects",
    "AI love story": "love",
    "Real or AI": "guess",
    "Original AI character talks": "talker",
    "Hindi AI story series": "serial",
    "One-twist AI short": "film",
    "AI religious scene": "faith",
    "Wedding-day drama": "wedding",
}

REEL = {
    "City docs": "$6.3K/mo",
    "Car hacks": "$2.6K/mo",
    "Survival gear": "$2.2K/mo",
    "Jet explainers": "$400/mo",
    "Animated workouts": "$3K/mo",
    "MMA breakdowns": "$3.5K/mo",
    "Tutorials": "$1K/mo",
    "Stick-figure life skills": "$1K/mo",
    "Meat cooking": "$5K/mo",
    "Garden": "$2K/mo",
    "Self-defense": "$1K/mo",
    "Celebrity stories": "$10K/mo",
}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main():
    groups = {}
    niches = []
    for gid, rows in N.items():
        title, rpm, src, style = GROUPS[gid]
        groups[gid] = {"name": title, "rpm": rpm, "src": src}
        for name, ai, line, query, override in rows:
            st = override or style
            niches.append({
                "id": slug(name),
                "name": name,
                "group": gid,
                "ai": ai,
                "line": line,
                "q": query or name,
                "style": st,
                "ig": st != "ambient",
                "recipe": RECIPE_FOR.get(name),
                "reel": REEL.get(name),
            })
    ids = [n["id"] for n in niches]
    assert len(ids) == len(set(ids)), "duplicate id"
    doc = {"groups": groups, "sources": SOURCES, "niches": niches}
    out = ROOT / "data" / "catalog.json"
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(niches)} niches in {len(groups)} groups")


if __name__ == "__main__":
    main()
