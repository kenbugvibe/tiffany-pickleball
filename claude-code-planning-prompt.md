# Planning prompt for Claude Code

Send this as your **first** message, together with the design files and the build spec. Do not send any other instruction in the same message.

---

## The prompt

```
I am building a court booking and management system for Tiffany's Pickleball Court,
a 3 court business in Panabo City, Davao del Norte, Philippines.

I am NOT an experienced programmer. I can read code and follow instructions, but I
cannot debug complex problems on my own. Plan accordingly.

## What I have attached

1. An HTML design file exported from Claude Design. This is the visual reference.
2. A build spec document with the stack, database schema, and business rules.
3. Screenshots of the mobile flow and the desktop owner console.

## Your task in THIS message

Do not write any code yet. Not a single file. Your job right now is to read,
understand, and plan.

Do these five things in order:

1. READ the attached design file in full. Then list back to me, in plain language,
   every screen you found and what each one does. If the design contains screens
   that are not covered in the build spec, say so explicitly.

2. READ the build spec. List any place where the spec and the design disagree with
   each other. Do not resolve the conflicts yourself. Just list them and ask me
   which one is correct.

3. List every assumption you would have to make to build this. For each one, say
   whether you are confident about it or guessing. I want the guesses called out
   clearly so I can correct them.

4. List what you still need from me before Phase 1 can start. Be specific. Say
   "I need the Supabase project URL and anon key" rather than "I need credentials".

5. Propose a file and folder structure for the project. Just the tree, with a one
   line note on what each folder holds.

## Rules for this conversation and every one after

- Never invent a fact about the business. If you do not know the operating hours,
  the rates, the payment method, or the court names, ASK ME. Do not fill the gap
  with something plausible.

- Never invent an API, a library method, or a config option. If you are not certain
  a function exists, say "I need to check this" rather than writing it and hoping.

- Never write code for more than one phase at a time. The build spec defines six
  phases. Stop at the end of each one and wait for me to confirm it works.

- When you write code, explain what each file does in one sentence before you
  write it. I need to understand the shape of the project, not just receive it.

- If I ask for something that will cause a problem later, tell me. Do not just
  comply. I would rather be corrected now than debug it in week four.

- If something fails, do not guess at a fix and try again silently. Tell me what
  the error says, what you think it means, and what you want to try.

- Prefer boring and obvious over clever. This project will be handed to a small
  business owner. It needs to be maintainable by someone who is not me.

## What success looks like

At the end of this conversation, I should have a clear picture of what is being
built, what you are unsure about, and what I need to provide. I should NOT have
any code yet.

Begin with step 1.
```

---

## Why each rule is there

**"Do not write any code yet."** Without this, the AI starts generating files in the first reply and the design gets skimmed rather than read. Everything downstream inherits that skim.

**"List every assumption and flag the guesses."** This is the single most effective anti-hallucination instruction. Models will make things up silently but will usually admit uncertainty when explicitly asked to separate confidence levels.

**"List where the spec and the design disagree, do not resolve them."** Left alone, the AI picks one and moves on without telling you. You find out in week three when the rates are wrong.

**"Be specific about what you need from me."** Vague requests like "I need credentials" lead to vague answers and then to placeholder values that ship to production.

**"One phase at a time."** A model asked to build everything will produce a large amount of code that mostly works. Finding the one broken piece inside it is much harder than testing six small pieces.

**"Tell me what the error says."** Non-programmers often paste an error and get a confident wrong fix. Forcing the AI to explain its reading of the error first surfaces when it does not actually understand the failure.

---

## After the planning conversation

Once it has answered all five steps and you have corrected its assumptions, send this:

```
Good. Save that plan to a file called PLAN.md in the project root, including the
corrections I made. From now on, re-read PLAN.md at the start of every session
before writing anything.

Now build Phase 1 only: the database schema. Give me the SQL to run in the
Supabase editor. Do not create any application files yet.
```

The `PLAN.md` file matters more than it looks. AI coding sessions lose context between conversations, and without a written plan in the repo it will quietly drift from the original decisions.
