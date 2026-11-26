/**
 * "A test kitchen for your town": the four-step loop (bring → prototype → taste → keep/rework/drop).
 * Icons are 12×12 pixel sprites drawn from string maps: "#" = ink, "o" = lantern accent.
 */

type Step = { title: string; body: string; tag: string };
type Format = { title: string; gloss?: string; meta: string; out: string; before: string; during: string; after: string };
export type Harness = {
  title: string;
  lead: string;
  labels: { before: string; during: string; after: string };
  formats: Format[];
};

const SPRITES: string[][] = [
  // 1. Microphone: the voice interview.
  [
    "....####....",
    "...#oooo#...",
    "...#oooo#...",
    "...#oooo#...",
    "...#oooo#...",
    ".#.#oooo#.#.",
    ".#..####..#.",
    "..#......#..",
    "...######...",
    ".....##.....",
    ".....##.....",
    "...######...",
  ],
  // 2. Pot on the boil: the prototype.
  [
    "...o..o..o..",
    "..o..o..o...",
    "...o..o..o..",
    "............",
    "############",
    ".#oooooooo#.",
    "##oooooooo##",
    ".#oooooooo#.",
    ".#oooooooo#.",
    ".#oooooooo#.",
    "..########..",
    "............",
  ],
  // 3. Tasting spoon: trying it in real work.
  [
    ".......####.",
    "......#oooo#",
    "......#oooo#",
    "......#oooo#",
    ".......####.",
    "......##....",
    ".....##.....",
    "....##......",
    "...##.......",
    "..##........",
    ".##.........",
    "##..........",
  ],
  // 4. Menu card with a check: what stays on the menu.
  [
    ".##########.",
    ".#........#.",
    ".#.######.#.",
    ".#........#.",
    ".#.####...#.",
    ".#........#.",
    ".#......o.#.",
    ".#.....oo.#.",
    ".#.o..oo..#.",
    ".#.oooo...#.",
    ".#..oo....#.",
    ".##########.",
  ],
];

function PixelIcon({ rows }: { rows: string[] }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" shapeRendering="crispEdges" className="h-8 w-8">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === "o" ? "var(--lantern)" : "var(--ink)"} />
          ),
        ),
      )}
    </svg>
  );
}

export function TestKitchen({
  kicker,
  title,
  lead,
  steps,
  loop,
  harness,
}: {
  kicker: string;
  title: string;
  lead: string;
  steps: Step[];
  loop: string;
  harness: Harness;
}) {
  return (
    <section aria-labelledby="kitchen" className="pt-20 sm:pt-24">
      <div className="max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-frost">{kicker}</p>
        <h2 id="kitchen" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-lg text-muted [word-break:auto-phrase]">{lead}</p>
      </div>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex flex-col rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-ice ring-2 ring-ice-strong/70">
                <PixelIcon rows={SPRITES[i]} />
              </span>
              <span className="text-xs font-semibold tabular-nums text-frost">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-ink [word-break:auto-phrase]">{s.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted [word-break:auto-phrase]">{s.body}</p>
            <p className="mt-4 self-start rounded-full bg-ice px-3 py-1 text-xs font-semibold text-frost">{s.tag}</p>
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute -right-3 top-12 z-10 hidden text-lg font-bold text-ice-strong lg:block">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-6 flex items-center gap-3 text-sm font-semibold text-ink">
        <span aria-hidden className="text-lg text-lantern">↻</span>
        {loop}
      </p>

      {/* One harness, any format: the same prep, guardrails and follow-through behind each event type. */}
      <section aria-labelledby="harness" className="mt-14 rounded-3xl bg-ice px-5 py-8 sm:px-8">
        <h3 id="harness" className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {harness.title}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted [word-break:auto-phrase] sm:text-base">{harness.lead}</p>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {harness.formats.map((f) => (
            <li key={f.title} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
              <h4 className="text-lg font-bold text-ink">{f.title}</h4>
              {f.gloss && <p className="text-xs text-muted">{f.gloss}</p>}
              <p className="mt-1 text-xs font-semibold text-frost">{f.meta}</p>
              <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-ink">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 bg-lantern" />
                {f.out}
              </p>
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                {(
                  [
                    [harness.labels.before, f.before],
                    [harness.labels.during, f.during],
                    [harness.labels.after, f.after],
                  ] as const
                ).map(([label, text]) => (
                  <div key={label} className="grid grid-cols-[4.5rem_1fr] gap-2">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-frost">{label}</dt>
                    <dd className="leading-relaxed text-muted [word-break:auto-phrase]">{text}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
