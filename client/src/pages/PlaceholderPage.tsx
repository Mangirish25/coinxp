interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="mx-auto max-w-4xl">
      <p className="text-sm font-medium text-brand-600">CoinXP</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-ink-500">{description}</p>
      <div className="mt-8 rounded-card border border-dashed border-black/15 bg-white p-8 text-sm text-ink-500">
        This page is a foundation placeholder for a later project part.
      </div>
    </section>
  );
}
