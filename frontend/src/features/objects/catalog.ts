// The object catalog behind C2's search: common things people build habits around, grouped by category, each with the
// words people use for it. The catalog is a search index, not a list of proof objects.
//
// The proof object is one of the program's eight (`OBJECTS` in @kept/config, `object_id < 8`). An entry has
// `object: <id>` only when it IS that object (or the same thing by another name: "sneakers" are running shoes, a "jump
// rope" is a skipping rope). Everything else is `object: null`: unavailable until the program, the backend's OBJECT_IDS /
// OBJECT_TEXT and `OBJECTS` gain a distinct object for it (docs/BACKEND_GAPS.md › Proof objects). Never map a
// different object onto one of the eight: a kettlebell is not a dumbbell, a notebook is not a book.
//
// Labels are copy (`additions.objects.entry.<key>`); aliases are search data only and are lower case.
import type { ObjectId } from "@kept/config";

export type ObjectCategory =
  | "strength" | "cardio" | "sport" | "mind_body" | "reading" | "study" | "music" | "health"
  | "plants" | "home" | "creative" | "kitchen" | "outdoors" | "sleep" | "tech";

export const CATEGORIES: readonly ObjectCategory[] = [
  "strength", "cardio", "sport", "mind_body", "reading", "study", "music", "health", "plants", "home", "creative", "kitchen", "outdoors", "sleep", "tech",
];

export interface CatalogEntry {
  /** Copy key suffix and stable id of the entry. */
  key: string;
  category: ObjectCategory;
  /** The program's object this entry is, or null when none of the eight is the same thing. */
  object: ObjectId | null;
  aliases: readonly string[];
}

const e = (key: string, category: ObjectCategory, object: ObjectId | null, ...aliases: string[]): CatalogEntry => ({ key, category, object, aliases });

export const CATALOG: readonly CatalogEntry[] = [
  // ── the eight objects a proof can check today ──
  e("dumbbell", "strength", "dumbbell", "dumbbells", "dumb bell", "dumb bells", "hand weight", "hand weights", "free weights", "free weight", "weights", "adjustable dumbbell", "lifting weights", "weight training", "strength training", "arm workout", "bicep curls"),
  e("book", "reading", "book", "books", "paperback", "hardcover", "hardback", "novel", "textbook", "text book", "storybook", "story book", "fiction", "non fiction", "nonfiction", "library book", "reading", "read", "read a book", "book club", "bible", "quran", "manual", "dictionary", "comic book"),
  e("water_bottle", "health", "water_bottle", "bottle", "bottles", "water", "drink water", "drinking water", "hydrate", "hydration", "hydration bottle", "sports bottle", "sport bottle", "gym bottle", "reusable bottle", "drinking bottle", "refillable bottle", "plastic bottle", "glass bottle", "stay hydrated", "8 glasses"),
  e("guitar", "music", "guitar", "guitars", "acoustic guitar", "electric guitar", "classical guitar", "guitar practice", "practice guitar", "strum", "chords", "fretboard"),
  e("running_shoe", "cardio", "running_shoe", "running shoes", "running shoe", "sneakers", "sneaker", "trainers", "trainer", "runners", "jogging shoes", "jogging shoe", "athletic shoes", "sports shoes", "sport shoes", "gym shoes", "tennis shoes", "kicks", "run", "running", "jog", "jogging", "5k", "10k", "marathon", "daily run", "morning run"),
  e("plant", "plants", "plant", "plants", "houseplant", "house plant", "potted plant", "pot plant", "seedling", "sapling", "succulent", "cactus", "herb plant", "indoor plant", "garden plant", "water the plants", "watering plants", "fern", "bonsai", "basil plant"),
  e("skipping_rope", "cardio", "skipping_rope", "skipping rope", "jump rope", "jumping rope", "skip rope", "speed rope", "rope skipping", "rope jumping", "skipping", "jump roping", "jump rope workout"),
  e("yoga_mat", "mind_body", "yoga_mat", "yoga", "yoga mat", "exercise mat", "workout mat", "pilates mat", "pilates", "fitness mat", "stretching mat", "stretch", "stretching", "gym mat", "floor workout", "sun salutation"),

  // ── strength (not a dumbbell) ──
  e("kettlebell", "strength", null, "kettle bell", "kettlebells", "kettlebell swing"),
  e("barbell", "strength", null, "barbells", "bar bell", "olympic bar", "squat rack", "bench press", "deadlift", "squat"),
  e("weight_plate", "strength", null, "plates", "weight plates", "bumper plate"),
  e("resistance_band", "strength", null, "resistance bands", "exercise band", "theraband", "loop band", "stretch band"),
  e("pull_up_bar", "strength", null, "pullup bar", "pull up bar", "chin up bar", "pull ups", "pullups", "chin ups"),
  e("medicine_ball", "strength", null, "med ball", "slam ball", "wall ball"),
  e("gym_bench", "strength", null, "bench", "weight bench", "workout bench"),
  e("push_ups", "strength", null, "pushups", "push up", "push ups", "press ups", "plank", "sit ups", "situps", "burpees", "calisthenics", "bodyweight workout"),
  e("foam_roller", "strength", null, "foam rolling", "massage roller", "roller", "mobility", "recovery"),
  e("gym", "strength", null, "gym membership", "go to the gym", "weight room", "fitness center", "workout", "exercise", "training"),

  // ── cardio and sport (not running shoes or a skipping rope) ──
  e("bicycle", "cardio", null, "bike", "bikes", "cycling", "cycle", "road bike", "mountain bike", "bicycle ride", "commute by bike", "stationary bike", "spin bike", "exercise bike"),
  e("bike_helmet", "cardio", null, "helmet", "cycling helmet", "bicycle helmet"),
  e("treadmill", "cardio", null, "running machine", "walking pad", "treadmill run"),
  e("rowing_machine", "cardio", null, "rower", "erg", "ergometer", "row machine"),
  e("walking", "cardio", null, "walk", "daily walk", "steps", "10000 steps", "10k steps", "step count", "pedometer", "walk the dog", "dog walk", "dog leash", "leash"),
  e("swimming", "cardio", null, "swim", "swimming goggles", "goggles", "swimsuit", "swim cap", "pool", "laps"),
  e("football", "sport", null, "soccer", "soccer ball", "football ball", "futsal"),
  e("basketball", "sport", null, "basketball hoop", "hoops", "shoot hoops"),
  e("tennis_racket", "sport", null, "tennis", "racket", "racquet", "tennis ball", "padel"),
  e("badminton", "sport", null, "badminton racket", "shuttlecock", "birdie"),
  e("cricket_bat", "sport", null, "cricket", "bat", "cricket ball"),
  e("boxing_gloves", "sport", null, "boxing", "punching bag", "kickboxing", "mma", "martial arts"),
  e("volleyball", "sport", null, "volley ball", "beach volleyball"),
  e("skateboard", "sport", null, "skate board", "skating", "roller skates", "rollerblades", "scooter"),
  e("golf_club", "sport", null, "golf", "golf clubs", "golf ball"),
  e("climbing", "sport", null, "rock climbing", "bouldering", "climbing shoes", "climbing wall", "chalk bag"),

  // ── mind and body ──
  e("meditation_cushion", "mind_body", null, "meditation", "meditate", "cushion", "zafu", "mindfulness", "breathing exercise", "breathwork", "prayer mat", "prayer"),
  e("journal", "mind_body", null, "journaling", "diary", "gratitude journal", "bullet journal", "write in a journal", "daily journal"),

  // ── reading and study (not a book) ──
  e("notebook", "study", null, "notepad", "note book", "exercise book", "copybook", "composition book", "notes", "taking notes", "spiral notebook"),
  e("e_reader", "reading", null, "ereader", "kindle", "kobo", "ebook", "e book", "audiobook", "audio book"),
  e("magazine", "reading", null, "newspaper", "magazines", "news", "article", "blog"),
  e("pen", "study", null, "pens", "pencil", "pencils", "stationery", "highlighter", "marker", "writing"),
  e("planner", "study", null, "agenda", "to do list", "todo list", "to-do list", "calendar", "day planner", "checklist"),
  e("flashcards", "study", null, "flash cards", "index cards", "revision cards", "anki", "vocabulary cards", "vocab"),
  e("calculator", "study", null, "maths", "math", "homework", "revision", "exam prep", "past papers"),
  e("language_study", "study", null, "learn a language", "language learning", "spanish", "french", "german", "japanese", "hindi", "duolingo"),
  e("backpack", "study", null, "school bag", "schoolbag", "rucksack", "bag", "satchel"),

  // ── music (not a guitar) ──
  e("bass_guitar", "music", null, "bass", "electric bass", "bass practice"),
  e("ukulele", "music", null, "uke", "ukelele"),
  e("piano", "music", null, "keyboard", "digital piano", "electric piano", "keys", "piano practice", "synth", "synthesizer"),
  e("violin", "music", null, "fiddle", "viola", "cello", "bow", "strings practice"),
  e("drums", "music", null, "drum kit", "drum", "drum sticks", "drumsticks", "snare", "practice pad", "percussion"),
  e("flute", "music", null, "recorder", "clarinet", "saxophone", "sax", "trumpet", "harmonica", "woodwind", "brass"),
  e("microphone", "music", null, "mic", "singing", "sing", "vocal practice", "karaoke", "podcast"),
  e("headphones", "music", null, "earphones", "earbuds", "airpods", "headset", "listen to music"),
  e("sheet_music", "music", null, "music book", "score", "songbook", "tablature"),

  // ── health ──
  e("vitamins", "health", null, "vitamin", "supplements", "supplement", "multivitamin", "pills", "pill", "medicine", "medication", "medicine tablets", "pill box", "pillbox"),
  e("shaker_bottle", "health", null, "protein shaker", "shaker", "protein shake", "protein"),
  e("thermos", "health", null, "flask", "vacuum flask", "insulated bottle", "tumbler", "travel mug", "stanley"),
  e("coffee_cup", "health", null, "coffee", "mug", "cup", "tea", "teacup", "green tea"),
  e("toothbrush", "health", null, "tooth brush", "brush teeth", "brushing teeth", "floss", "flossing", "dental", "toothpaste", "mouthwash"),
  e("scale", "health", null, "weighing scale", "bathroom scale", "weigh in", "weight loss", "body weight"),
  e("skincare", "health", null, "skin care", "moisturizer", "sunscreen", "face wash", "cleanser", "serum", "face mask"),

  // ── plants and garden (not a houseplant) ──
  e("watering_can", "plants", null, "watering", "garden hose", "hose", "sprinkler"),
  e("garden_tools", "plants", null, "trowel", "shovel", "spade", "gardening", "garden", "pruning", "secateurs", "weeding"),
  e("flowers", "plants", null, "flower", "bouquet", "roses", "rose", "tulips", "sunflower", "fresh flowers"),
  e("tree", "plants", null, "trees", "plant a tree", "sapling tree", "forest"),
  e("seeds", "plants", null, "seed", "seed packet", "planting seeds", "sow", "sowing"),
  e("vegetable_garden", "plants", null, "veggie garden", "allotment", "grow vegetables", "tomatoes", "compost", "composting"),

  // ── home ──
  e("bed", "home", null, "make the bed", "make bed", "bedmaking", "bed sheets", "duvet", "blanket"),
  e("broom", "home", null, "sweep", "sweeping", "dustpan", "brush"),
  e("vacuum", "home", null, "hoover", "vacuum cleaner", "vacuuming", "clean the house", "cleaning", "housework", "chores"),
  e("mop", "home", null, "mopping", "bucket", "floor cleaning"),
  e("dishes", "home", null, "dishwasher", "washing up", "wash dishes", "sink", "dish soap", "plates and cups"),
  e("laundry", "home", null, "washing machine", "laundry basket", "clothes", "folding clothes", "ironing", "iron", "hanger", "wardrobe"),
  e("trash_bin", "home", null, "trash", "rubbish", "bin", "garbage", "recycling", "dustbin", "take out the trash"),
  e("desk", "home", null, "tidy desk", "organize", "organise", "declutter", "decluttering", "tidy up", "workspace"),

  // ── creative ──
  e("paintbrush", "creative", null, "painting", "paint", "watercolor", "watercolour", "acrylic", "oil painting", "canvas", "easel"),
  e("sketchbook", "creative", null, "drawing", "sketch", "sketching", "doodle", "illustration", "sketch pad", "art journal", "art"),
  e("camera", "creative", null, "photography", "photo", "dslr", "film camera", "take a photo", "polaroid"),
  e("sewing_machine", "creative", null, "sewing", "needle and thread", "knitting", "knit", "crochet", "yarn", "embroidery", "needlework"),
  e("clay", "creative", null, "pottery", "ceramics", "sculpting", "sculpture", "pottery wheel", "modeling clay"),
  e("typewriter", "creative", null, "writing a novel", "creative writing", "poetry", "poem", "write a story", "word count"),
  e("lego", "creative", null, "legos", "building blocks", "model kit", "puzzle", "jigsaw", "jigsaw puzzle", "chess", "chess board", "board game"),

  // ── kitchen ──
  e("frying_pan", "kitchen", null, "pan", "pot", "saucepan", "wok", "cooking", "cook dinner", "home cooking", "cook at home", "stove"),
  e("kitchen_knife", "kitchen", null, "knife", "chef knife", "chopping", "chopping board", "cutting board", "meal prep"),
  e("lunch_box", "kitchen", null, "lunchbox", "tiffin", "bento", "packed lunch", "pack lunch", "tupperware", "meal prep container", "food container"),
  e("fruit", "kitchen", null, "fruits", "apple", "banana", "orange", "vegetables", "veggies", "salad", "greens", "five a day", "healthy eating", "healthy food"),
  e("baking", "kitchen", null, "bake", "bread", "dough", "oven", "cake", "rolling pin", "sourdough", "baking tray"),
  e("blender", "kitchen", null, "smoothie", "juicer", "juice", "green smoothie"),

  // ── outdoors ──
  e("hiking_boots", "outdoors", null, "hiking", "hike", "trekking", "trek", "walking boots", "trail", "trail running", "trail shoes", "boots"),
  e("tent", "outdoors", null, "camping", "camp", "sleeping bag", "campfire", "outdoors", "nature"),
  e("binoculars", "outdoors", null, "birdwatching", "bird watching", "stargazing", "telescope"),
  e("fishing_rod", "outdoors", null, "fishing", "fishing pole", "tackle"),
  e("sunrise", "outdoors", null, "sunrise walk", "morning light", "watch the sunrise", "early morning", "wake up early", "5am"),

  // ── sleep ──
  e("alarm_clock", "sleep", null, "alarm", "wake up", "waking up", "wake up on time", "morning routine", "clock", "snooze"),
  e("pillow", "sleep", null, "sleep", "sleeping", "bedtime", "go to bed early", "early bed", "nap", "sleep mask", "eye mask"),

  // ── tech and screens (a phone screen can't be the proof) ──
  e("laptop", "tech", null, "computer", "notebook computer", "macbook", "pc", "desktop", "coding", "code", "programming", "leetcode", "work session", "deep work"),
  e("phone", "tech", null, "smartphone", "mobile", "cell phone", "iphone", "android phone", "phone free", "screen time", "digital detox", "no phone"),
  e("tablet", "tech", null, "ipad", "drawing tablet", "wacom"),
  e("whiteboard", "tech", null, "white board", "blackboard", "chalkboard", "presentation", "public speaking"),
];

export const catalogEntry = (key: string): CatalogEntry | undefined => CATALOG.find((c) => c.key === key);

/**
 * The six objects C2 offers as quick picks: the most common and the most distinct on camera. All eight supported
 * objects stay reachable by search. The model's reading of any of them is unmeasured (BACKEND_GAPS P1-26).
 */
export const QUICK_PICK_OBJECTS: readonly ObjectId[] = ["dumbbell", "book", "water_bottle", "guitar", "running_shoe", "plant"];
