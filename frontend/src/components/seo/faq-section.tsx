type FaqItem = {
  question: string;
  answer: string;
};

export function FaqSection({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string;
  items: FaqItem[];
}) {
  return (
    <section className="rounded-[28px] border border-border/45 bg-panel/40 p-5 backdrop-blur-sm sm:p-8">
      <div className="max-w-3xl">
        <h2 className="font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {intro ? (
          <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{intro}</p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4">
        {items.map((item) => (
          <article
            key={item.question}
            className="rounded-2xl border border-border/40 bg-bg/45 p-4"
          >
            <h3 className="text-base font-semibold text-text">{item.question}</h3>
            <p className="mt-2 text-sm leading-7 text-muted">{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
