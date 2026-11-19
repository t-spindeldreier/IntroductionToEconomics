# Econ Live

A small web app for running interactive activities with a lecture hall of students on
their own phones. Students scan one QR code; there is no account, no install and no
typing of names. A "stage" page on the tutor's laptop is projected, drives the session
with the arrow keys and shows results live.

The app is an engine plus session files. A session (questions, quiz, prompts, order of
steps) is one YAML file; adding a session means writing a file, not code.

- Static site on GitHub Pages, Cloud Firestore as the only backend, free plans only.
- No student accounts, no names, no analytics, no requests to anyone but Firebase.

## Contents

1. [Try it on your laptop](#try-it-on-your-laptop)
2. [One-time setup](#one-time-setup)
3. [How to run a session](#how-to-run-a-session)
4. [How to write a session file](#how-to-write-a-session-file)
5. [Export and delete data](#export-and-delete-data)
6. [How it works](#how-it-works)
7. [Tests](#tests)
8. [Manual test with two phones](#manual-test-with-two-phones)
9. [Known limits](#known-limits)
10. [Later](#later)

## Try it on your laptop

You need Node 22 or newer and a Java runtime, version 21 or newer, for the Firestore
emulator (`java -version`). If your Java is older, install a private one that only this
project uses: `conda create -p .tools/jdk -c conda-forge openjdk=21`. The npm scripts
find it there by themselves.

```
npm install
npm run emulators      # terminal 1: local Firestore and Auth, nothing touches the cloud
npm run dev            # terminal 2: the site at http://localhost:5173
```

Open `http://localhost:5173/#/stage`, click "Emulator only: sign in as a test host",
then "Emulator only: put me on the host list", then "Load the demo session" and "Create
room". Open the join link in a second window. In the stage window press H and add
simulated students, then walk through the session with the right-arrow key.

To join from a real phone, connect it to the same Wi-Fi and open
`http://<your laptop's IP address>:5173/?r=<CODE>`.

## One-time setup

**1. GitHub.** Create a public repository and push this folder to it. In the repository
go to Settings, Pages, and set Source to "GitHub Actions". Every push to `main` then
builds and publishes the site at `https://<user>.github.io/<repo>/`.

**2. Firebase console** (console.firebase.google.com).

1. Add project. Switch Google Analytics off.
2. Build, Firestore Database, Create database. Choose an EU location such as
   `eur3 (Europe)` or `europe-west3 (Frankfurt)`. It cannot be changed later. Start in
   production mode.
3. Build, Authentication, Get started, Sign-in method: enable Google. Then Settings,
   Authorized domains: add `<user>.github.io`.
4. Project settings (the gear), Your apps, the `</>` icon: register a web app (no
   hosting). Copy the `firebaseConfig` values into `src/firebase-config.ts`.

   These values are not secrets. Every Firebase web app sends them to every visitor;
   they only name the project. The security rules protect the data. Committing the file
   to a public repository is fine and intended.

**3. Deploy the security rules.**

```
npx firebase login
npx firebase use --add          # pick your project, alias "default"
npm run deploy:rules
```

Run the last command again whenever `firestore.rules` changes.

**4. Make yourself a host.** Push, wait for the deployment, open
`https://<user>.github.io/<repo>/#/stage` and sign in with Google. The page says that
the account is not on the host list and shows a user id. In the Firebase console,
Firestore, Start collection: collection id `config`, document id `hosts`, one field
`uids` of type array, with that user id as a string element. Reload the stage page.
The allowlist lives only in the database, so no email address is in the repository.

## How to run a session

1. The day before: open the stage, "Load a session file…", pick the YAML file, "Create room".
2. Rehearse: press H, add 30 simulated students, step through everything with →.
3. Still in the H panel: "Remove simulated students", then "Jump here" on the first step.
   (Or simply create a fresh room for class.)
4. In class: open the stage, "Open stage" on the room, press F for full screen.
5. Students scan the QR code. The count of joined students is on the screen.
6. → (or Space) always does the next sensible thing. The corner says what that is ("next: reveal").
7. ← goes back one state. J shows the join code for latecomers.
8. T starts or pauses a countdown. + adds 30 seconds (also to a running quiz question).
9. H opens the step list to skip or jump. The audience sees it; it shows no answers.
10. Afterwards: H, "Download CSV files" and "Download study slides", then "Close room" or
    "Delete all data of this room".

A room accepts answers for six hours after it was created and then closes by itself.
"Reopen room" in the H panel gives it six more hours.

If the stage is reloaded, or the laptop restarts, open the same room again: it resumes
on the same step. Students whose phones reload, sleep or change network come back with
the same nickname, group and score.

## How to write a session file

Start from `sessions/demo.yaml`. A file has a title, activities, and steps:

```yaml
title: "Week 3: Health"

activities:
  my-quiz:            # the id: lowercase letters, digits and hyphens
    type: choice
    ...

steps:                # the order in class
  - lobby
  - my-quiz
  - end
```

The stage validates a file when you load it and lists every problem with its place
(for example `activities.quiz.items[3].correct: "H" is not one of the options`).
Nothing is uploaded until the file is flawless.

**Never commit real session files: the repository is public and they contain the
answers.** Keep them in `sessions/private/`, which git ignores. The files reach the
database only through the stage page and are readable by hosts only.

### Activity types

**guess**: a numeric guess, optionally with hidden versions ("arms").

| field | meaning |
| --- | --- |
| `stageText` | the neutral question on the projector while answers come in |
| `stageHint` | second line; default "Answer on your phone. Keep your screen to yourself." |
| `part1`, `part1Options` | optional first question with two buttons; `{anchor}` is replaced by the arm's anchor, `**bold**` works |
| `part2` | the guess prompt; `___` marks where the input field goes |
| `arms` | list of `{ label, anchor }`. Leave it out for a plain numeric poll |
| `splitBy` | id of a choice activity: the reveal shows one row per option of that question, so groups that students chose themselves can be compared (not together with `arms`) |
| `takeaway` | one or two sentences shown with the last reveal and in the study slides |
| `before`, `hint`, `hintFor` | a before-and-after game (difference-in-differences), see below |
| `min`, `max`, `exclusiveMin` | allowed range; `exclusiveMin: true` means "greater than min" |
| `axis` | `{ min, max, scale }` of the dot plot; `scale` is `log` (default) or `linear`; default 1 to 10000 |
| `revealHeadline` | headline when the versions are revealed |
| `truth` | optional `{ value, label }` |

Phases: `open`, `closed`, `versions` (with two or more arms), `results`, `truth`.
Each phone gets its arm by a hash of its random id and the activity id. That is as good
as a coin flip, and neither the student nor the tutor can influence it.

**choice**: a question with 2 to 8 options, one or many items.

| field | meaning |
| --- | --- |
| `question` | line shown with every item |
| `options` | options shared by all items; an item may have its own `options` |
| `timed` | seconds per item; leave out for untimed |
| `scored` | `true` for points and a leaderboard; every item then needs `correct` |
| `items` | list of `{ text, correct, explanation, source, options }` |
| `compareBy` | id of a guess with two or more arms. Adds the phase `split`: the answers side by side for the arms, as a balance check of the experiment. `splitHeadline` and `takeaway` set its texts |

`correct` is the option number (1 is the first), its letter, or its exact text.
Phases per item: `open`, `closed`, `reveal`, `leaderboard` (scored only). By default
`closed` is skipped, so one press opens and the next reveals.
Scoring: 500 points for a correct answer plus up to 500 for speed, in proportion to
the time left. Ties are broken by the lower total response time.

**prompt**: a text on stage and phones.

| field | meaning |
| --- | --- |
| `text` | the prompt |
| `timer` | countdown in seconds; `autostart: false` if it should wait for T |
| `reveal` | hidden second text (a model answer, the real study), shown by the next press |
| `revealTitle` | heading of that text; default "Answer" |
| `image`, `revealImage` | file name of a figure shown with the prompt or with the hidden text, on the projector only |
| `mode` | how students work on it, shown as a label on stage and phones: `pair` (with your neighbour), `group`, `discuss` (class discussion), `paper` (on paper, on your own) or `think` |

Guess and choice questions carry the label "On your phone" by themselves.

**lobby**, **podium**, **end** need no declaration; just use them in `steps`.

### Steps

A step is an activity id, or an object when you want less or more than the default:

```yaml
steps:
  - { activity: lobby, collect: anchor }     # lobby while a guess is open for answers
  - { activity: anchor, phases: [closed] }   # close it
  - rf                                       # all items, default phases
  - { activity: anchor, phases: [versions, results, truth] }   # reveal it later
  - { activity: quiz, items: [1, 2, 3] }     # only some items
  - podium
  - end
```

The same activity can appear in several steps, which is how collecting and revealing
are separated.

**Figures.** Write the file name in the session file (`image: fig-methods.jpg`) and
select the image files together with the session file in the "Load a session file…"
dialog (hold Ctrl to pick several). The figures are stored inside the session, which
only hosts can read, and are never sent to phones. Keep a session with its figures
under about 900 kB; JPEG or PNG at 800 to 1200 pixels width is plenty.

**Exam question bank.** A session file may end with a list of open questions and
model answers that only you ever see:

```yaml
exam:
  - question: "Why did the app flip a coin for each student?"
    answer: "Because front and back rows differ in more than the number ..."
    about: "Discussion question on random assignment"
    points: 4
```

**The hint game (difference-in-differences).** Three activities: a choice question
with exactly two options that defines two groups ("Where are you sitting? Front half /
Back half"), a first guess, and a second guess with

```yaml
    splitBy: side            # the choice question
    before: pop1             # the first guess
    hint: "Hint, only for the front half: fewer than 500 thousand."
    hintFor: "Front half"    # the option whose phones show the hint
```

While the second guess is open, only the phones that chose that option show the hint;
the projector shows nothing of it. The second guess then has the phases `change` (first
guess, second guess and change per group, for students who answered both times) and
`did` (the change of one group minus the change of the other, with the `takeaway`),
besides `results` and `truth`. Be aware that the hint text travels to every phone and is
only hidden by the app; a student who inspects the network traffic could read it.

**The bar game (regression discontinuity).** Two guesses of the same quantity. The
second one has

```yaml
    before: mal1             # the first guess
    bar: median              # the class median of the first guesses, or a fixed number
    hint: "Your first guess was in the upper half of the class."
```

While the second guess is open, only phones whose own first guess was above the bar
show the message. The bar is fixed at the moment the second guess opens. The phases are
`open`, `closed`, `scatter` (first against second guess for every student, the bar as a
line, medians of all students below and above) and `band` (the students closest to the
bar on each side, about a third of each side, the jump between their medians, and the
`takeaway`). The study slides and the exam bank contain the same plot and numbers.

**Restaurant game.** `type: restaurant` is the minimum-wage game after Card and Krueger
(1994). Every phone manages one real fast-food restaurant from the study, in New Jersey
(minimum wage raised in April 1992) or in Pennsylvania (no change). Students are dealt
alternately to the two states in the order in which they joined, so the groups are
equally large and no two students share a restaurant (up to 100 + 70 students). Fields: `intro`, `news` (the
headline), `question`, `classTakeaway` (shown if the room's New Jersey managers cut jobs),
`classTakeawayNoCut` (shown if they did not), `takeaway`. Phases: `assign` (a map with one dot
per manager), `news`, `open` and `closed` (managers decide how many employees to have in
November), `class` (the room's plans per state and their difference in differences),
`real` (the same table for the 410 real restaurants, Table 3 of the paper) and `best`
(the five managers whose plan was closest to what their real restaurant did). The
restaurant data comes from the public data set on David Card's website; the dots on the
map are placed at random within the restaurant's region, because the data has no addresses.

**Birthday lottery.** `type: lottery` with a `text` (and optionally `cutoff`, default
195, and `takeaway`): every student picks day and month of their birthday, and the
phone shows the number that birthday drew in the US draft lottery of 1 December 1969
and whether it was called up. The birthday and the number never leave the phone; only
"called up" or "not called" is sent. The reveal shows how many of the room were called.

**Chart.** `type: chart` draws a bar chart from numbers in the session file, for example
the results of a published study: `title`, `labels`, `values` (may be negative),
optional `prefix`/`suffix` ("$", "%"), `marker: { after: label, text }` for a dashed line,
`highlight` (labels whose value is written out), `takeaway` and `source`. With
`revealFrom: label` the chart has two phases: `part` shows only the bars before that
label (under `partTitle`), `all` shows everything, so you can ask for a prediction in
between.

**Logo.** A top-level line `logo: file.jpg` in the session file puts a small logo in the
top right corner of every slide and of the study slides. Select the file together with
the session file.

**Intro.** `type: intro` is a slide about the course and the tutor: `kicker`, `title`,
`subtitle`, `bullets` (a short list), and `person: { name, role, bullets, contact }`,
which is shown on a card.

**Picture.** `type: picture` with `image: file.jpg` shows one figure as large as the
projector allows, for example as the opening slide before the lobby. With `images` (a
list of up to four `{ file, caption }`), `title`, `text` and `credit` it becomes a slide
of captioned figures, which is also included in the study slides. Select the image
file together with the session file, as for other figures.

**Table.** `type: table` shows a comparison table on the projector (phones only show
its title) and in the study slides: `title`, `columns` (2 to 5 headings), `rows` (2 to 8
lists with one text per column), optional `note`, and `stepwise: true` for one key press
per row.

**Sections** give the session an outline, like a presentation:

```yaml
  - { section: "Speed quiz", subtitle: "Eight questions, 25 seconds each" }
```

Each one is a title slide ("Part 4 of 5") that lists all parts and marks the current
one. Every screen after it carries a small "Part 4 of 5 · Speed quiz" marker, and
phones show the title too. A section costs one key press.

## Export and delete data

H, "Download CSV files" saves two files (the browser may ask once whether the site may
download several files):

- `<CODE>_responses.csv`: `room, step, activity, item, participant_id, arm, answer,
  answer_label, part1, correct, response_ms, server_time, simulated`
- `<CODE>_participants.csv`: `room, participant_id, nickname, arm_<activity>, joined_at,
  simulated`

They are plain UTF-8, comma separated, with ISO timestamps in UTC. For choice questions
`answer` is the option number starting at 1. Simulated students are left out unless you
tick the box.

```stata
import delimited "ABCD_responses.csv", encoding(utf-8) clear
```
```r
d <- read.csv("ABCD_responses.csv")
```
```python
d = pandas.read_csv("ABCD_responses.csv")
```

`participant_id` is a random pseudonym that exists only for one room. It cannot be
linked to a person, a device or another week.

### Study slides

H, "Download study slides" saves one file, `<CODE>_study_slides.html`. It has a slide
for every question of the session with the correct answer, the explanation, the model
answers of the prompts, both versions of the guess, and how the class answered (shares
per option, medians per version). Download it before you delete the room, otherwise
the class results are gone.

- To hand it to students: upload the file to the course page as it is, or open it in
  a browser and print to PDF (landscape, no margins); that gives one slide per page.
- To put it into a presentation: print to PDF and insert the pages, or take
  screenshots of single slides.

The file contains all answers. Do not publish it before the session.

### Exam question bank

H, "Download exam question bank" saves `<CODE>_exam_bank.html`, for you only. It lists
the questions and model answers from the `exam` list of the session file, followed by
what happened in this class: medians and group sizes of every guess, shares for every
choice question, and the balance check. Months later you can pick questions from it
and make them concrete with the class's own numbers. Like the study slides, download
it before deleting the room.

H, "Delete all data of this room" removes all answers, participants, results and the
room. It asks you to type the room code first.

## How it works

```
src/core/         pure logic, unit-tested: ids, nicknames, medians, scoring, session compiler, CSV, study slides
src/activities/   one folder per activity type: def.ts (logic), phone.ts, stage.ts
src/data/         the only code that talks to Firestore: phoneClient.ts, hostClient.ts
src/phone/        the student page          src/stage/   the host pages (loaded only on #/stage)
src/strings.ts    every piece of interface text (copy it for a German version)
firestore.rules   the security rules        tests/rules/ a test for each guarantee
sessions/         demo.yaml (public)        sessions/private/ your real files (git-ignored)
```

**Frames.** A session file is compiled into a flat list of frames. One press of → moves
the room from one frame to the next, with one write to the room document. Left goes
back one frame.

**Documents.**

| document | content | who reads it |
| --- | --- | --- |
| `rooms/{code}` | current frame, what phones show, what is open for answers, timer | everyone who knows the code |
| `rooms/{code}/participants/{secret}` | public id, nickname as two list positions, join time | its owner, hosts |
| `rooms/{code}/responses/{key}_{secret}` | public id, answer, server time; create-only | its owner, hosts |
| `rooms/{code}/results/{key}` | aggregates and leaderboard, written at reveal time | everyone, after the reveal |
| `sessions/{id}` | the session file with all answers | hosts |
| `config/hosts` | allowlist of host user ids | hosts |

**Reads.** A phone listens to exactly one document (the room) and reads the leaderboard
document once per scored reveal. It never queries a collection. Only the stage reads
answers, and it computes all aggregates.

**Student identity.** There is no Firebase Authentication for students, because Firebase
allows only 100 new accounts per hour from one IP address and the lecture hall shares
one. A phone generates a random 32-character secret and keeps it in localStorage. The
secret is part of the ids of the documents the phone writes. The public id is the start
of the secret's SHA-256 hash, and the rules recompute it, so nobody can answer under
another student's id.

**Nicknames** are drawn once at random and stored as two numbers (adjective, economist),
never as text. A student cannot change the nickname, and nothing a student types can
reach the projector. If you edit the lists in `src/core/nicknames.ts`,
update the two numbers at the top of `firestore.rules`; a unit test reminds you.

**Time.** Opening times and answer times are server timestamps. The rules reject answers
after the closing time. Phones only use their own clock to draw the countdown, corrected
by the server time of the latest room update.

**Adding an activity type.** Write `def.ts`, `phone.ts` and `stage.ts` in a new folder
under `src/activities/` and register them in `defs.ts`, `phoneViews.ts` and
`stageViews.ts`. The engine does not change as long as the answer is a number or an
option; a new kind of answer also needs a new block in `firestore.rules`.

## Tests

```
npm test              # unit tests: medians, scoring, session validation, CSV
npm run test:rules    # security rules on the emulator, one block per guarantee
npm run simulate      # 100 phones and a stage through the whole session; checks the budget
npm run smoke         # real browser: one stage, three phones, screenshots in smoke-shots/
node scripts/emu.mjs emulators:exec --only firestore,auth "node scripts/smoke-hint.mjs"
                      # real browser: the hint game and the bar game with one phone on each side
node scripts/emu.mjs emulators:exec --only firestore,auth "node scripts/preview.mjs sessions/private/week1.yaml"
                      # proof-read a session: every screen with simulated students, in preview-shots/
npm run build         # type check, build, report the gzipped phone download
```

`npm run simulate` uses the real client code and the real SDK against the emulator. It
fails if a 100-student session needs more than 15,000 reads or 3,000 writes. The free
daily quota is 50,000 reads and 20,000 writes, so a rehearsal on the same day still
fits. Use `npm run simulate -- sessions/demo.yaml 150` for another file or class size.

## Manual test with two phones

Automated tests ran in Chromium only. **iOS Safari has not been tested by anyone but
you.** Ten minutes, two phones (ideally one iPhone, one Android), one laptop, on the
deployed site, with the demo session:

1. Laptop: open the stage, create a room from the demo session, press F.
2. Both phones: scan the QR code with the camera. Each should show a nickname and the
   more/fewer question within a few seconds. No zooming, no sideways scrolling.
3. Both phones: check that the nickname cannot be changed anywhere.
4. Compare the two phones: do they show different numbers in the question? (With two
   phones there is a 50% chance they match. Open a private tab to get another draw.)
5. Phone A: answer, type a guess with a comma ("80,5"). The numeric keypad should
   appear and the page must not zoom. Tap Send twice quickly. It should say "Received"
   once, and the stage count should go up by one.
6. Phone B: lock the screen for 30 seconds, unlock. The question should still be there.
   Answer.
7. Phone A: reload the page. Same nickname, still "Received".
8. Laptop: →. Both phones show "Look at the screen".
9. Laptop: → to open the true/false question. Phone B: switch to flight mode, tap an
   answer (it should say "Sending…"), switch flight mode off. It should turn to
   "Received" by itself.
10. Laptop: → to reveal. Phones show whether they were right.
11. Laptop: reload the stage page in the middle. It must come back on the same step.
12. Laptop: → through the three reveal steps of the guess. Check the plot from the back
    of the room. Phones show which version they had.
13. Laptop: → to the timed quiz. Phones show a countdown that matches the stage within
    about a second. Answer on phone A only; let the time run out on phone B. Phone B
    should say "Time is up".
14. Laptop: → to reveal. Phone A shows points and rank, phone B "No answer".
15. Laptop: → to the end. Then H, download the CSV files and open one. Then delete the
    room. The phones show "This room does not exist".

Things to watch on iOS in particular: the keypad type in step 5, coming back from the
lock screen in step 6, flight mode in step 9, and private browsing (the identity then
lasts only until the tab is closed).

## Known limits

- **Residual risk.** There is no server, so the rules are the only protection. A
  determined student with a script could create many fake participants or flood the
  database with requests during class and exhaust the free daily quota, which would stop
  the session for that day; they cannot read others' answers, see correct answers early,
  or change anything already written.
- A student who opens developer tools can see both versions of the guess question in
  the room document while it is open. This was accepted in the design.
- A student who clears the browser data or uses a second browser is a new participant
  (new nickname, possibly the other version of the guess).
- Two students can get the same nickname. There are 3,072 combinations.
- An answer that is sent in the last instant before a reveal can miss the bars on the
  stage for a moment. The stage corrects the published numbers 1.5 seconds later, and
  scores are recomputed from all answers at every reveal.
- Going back (←) into a question re-opens it. Students who had already answered stay
  locked; the others can still answer.
- The phone countdown relies on the phone's clock until the first live update arrives
  after a page load, so it can be off by a second or two on a phone whose clock is
  wrong. Scoring and closing use server time only and are not affected.
- The stage loads all answers of the room when it opens (up to about 1,500 reads for a
  full session of 100). A few reloads are fine; twenty in one day would be noticeable
  in the quota.
- One stage per room. Opening the same room on two laptops and pressing keys on both is
  not supported.
- The local emulator slows down when a hundred answers arrive within two or three
  seconds; `npm run simulate` therefore spreads answers over five seconds per question.
  The real Firestore has no such limit at this scale.

## Later

Ideas that were deliberately not built:

- More activity types: "guess two thirds of the average", belief elicitation with a
  reveal of true values, a simple market or public-goods game.
- A German version (copy `src/strings.ts`).
- Showing last week's class data inside the app instead of in slides.
- Firebase App Check to make scripted abuse harder.
- A zip file instead of two CSV downloads.
- Study slides as a PowerPoint file instead of HTML/PDF.
- An exactly balanced split between arms instead of independent coin flips.
- A dark theme for the stage.
