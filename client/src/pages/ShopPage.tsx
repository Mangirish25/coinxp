import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Palette, ShieldCheck, ShoppingBag, Snowflake, Sparkles } from 'lucide-react';
import { shopApi } from '../services/shopApi';
import type { ShopItem } from '../types/shop';

const itemNames: Record<string, string> = {
  freeze: 'Streak freeze', theme_midnight: 'Midnight theme', theme_forest: 'Forest theme', theme_sunrise: 'Sunrise theme',
  frame_bronze: 'Bronze frame', frame_silver: 'Silver frame', frame_gold: 'Gold frame',
};

function ItemIcon({ item }: { item: ShopItem }) {
  const Icon = item.type === 'FREEZE' ? Snowflake : item.type === 'THEME' ? Palette : Sparkles;
  return <Icon aria-hidden="true" className="h-5 w-5" />;
}

export function ShopPage() {
  const catalog = useQuery({ queryKey: ['shop', 'catalog'], queryFn: shopApi.catalog });
  const purchases = useQuery({ queryKey: ['shop', 'purchases'], queryFn: shopApi.purchases });
  const purchase = useMutation({ mutationFn: shopApi.purchase });
  const purchasedName = purchase.data ? itemNames[purchase.data.itemSlug] ?? purchase.data.itemSlug : '';
  return <section className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-medium text-brand-600">Spendable XP only</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">XP Shop</h1><p className="mt-2 max-w-2xl text-sm text-ink-500">Purchases use spendable XP. Your lifetime XP and level never go down.</p></header>
    {catalog.isLoading && <div className="h-24 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" aria-label="Loading shop" />}
    {catalog.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">The shop could not load. <button className="underline" onClick={() => void catalog.refetch()}>Retry</button></div>}
    {catalog.data && <>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="XP and freeze balance"><div className="rounded-xl border bg-white p-4"><p className="text-xs text-ink-500">Spendable XP</p><p className="mt-1 text-2xl font-semibold">{catalog.data.spendableXp} XP</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-ink-500">Current level</p><p className="mt-1 text-2xl font-semibold">Level {catalog.data.level}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-ink-500">Streak freezes</p><p className="mt-1 text-2xl font-semibold">{catalog.data.freezes.inventory} / {catalog.data.freezes.inventoryCap}</p><p className="mt-1 text-xs text-ink-500">{catalog.data.freezes.quotaRemaining} purchases left in the rolling 30-day window</p></div></section>
      {purchase.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{purchase.error instanceof Error ? purchase.error.message : 'Purchase could not be completed.'}</p>}
      {purchase.data && <p role="status" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">Purchased {purchasedName} for {purchase.data.costXp} XP. {purchase.data.spendableXp} XP remains spendable.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{catalog.data.items.map((item) => <article key={item.slug} className="flex flex-col rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><ItemIcon item={item} /></span>
        <h2 className="mt-4 text-lg font-semibold">{itemNames[item.slug] ?? item.slug}</h2>
        <p className="mt-1 text-sm text-ink-500">{item.type === 'FREEZE' ? 'Protects one missed tracking day, subject to your inventory cap.' : 'A permanent cosmetic for your private profile.'}</p>
        <div className="mt-4 flex items-center justify-between text-sm"><span className="font-medium">{item.costXp} XP</span><span>Level {item.minLevel} required</span></div>
        <button type="button" disabled={!item.available || purchase.isPending || catalog.data.spendableXp < item.costXp} onClick={() => purchase.mutate(item.slug)} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">
          {item.owned ? <><Check size={16} aria-hidden="true" />Owned</> : item.available ? <><ShoppingBag size={16} aria-hidden="true" />Purchase</> : <><ShieldCheck size={16} aria-hidden="true" />Level {item.minLevel} required</>}
        </button>
        {item.type === 'FREEZE' && (!catalog.data.freezes.quotaRemaining || catalog.data.freezes.inventory >= catalog.data.freezes.inventoryCap) && <p className="mt-2 text-xs text-ink-500">Freeze inventory or rolling purchase limit reached.</p>}
      </article>)}</div>
    </>}
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Recent purchases</h2>{purchases.isLoading ? <p className="mt-3 text-sm text-ink-500">Loading purchase history…</p> : purchases.isError ? <p role="alert" className="mt-3 text-sm text-red-700">Purchase history could not load. <button className="underline" onClick={() => void purchases.refetch()}>Retry</button></p> : purchases.data?.data.length ? <ul className="mt-3 divide-y">{purchases.data.data.map((entry) => <li key={entry.id} className="flex justify-between gap-3 py-3 text-sm"><span>{itemNames[entry.itemSlug] ?? entry.itemSlug}<span className="block text-xs text-ink-500">{new Date(entry.createdAt).toLocaleString()}</span></span><strong>−{entry.costXp} XP</strong></li>)}</ul> : <p className="mt-2 text-sm text-ink-500">No purchases yet.</p>}</section>
  </section>;
}
