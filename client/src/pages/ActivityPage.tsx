import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity, ChevronDown } from 'lucide-react';
import { activityApi } from '../services/activityApi';

const titles:Record<string,string>={BADGE:'Badge unlocked',MISSION:'Mission update',CHALLENGE:'Challenge update',STREAK:'Streak update',LEVEL:'Level up',PURCHASE:'Shop purchase',XP:'XP update',NOTICE:'Account notice',TRANSACTION:'Transaction'};
export function ActivityPage(){
  const query=useInfiniteQuery({queryKey:['activity'],initialPageParam:null as string|null,queryFn:({pageParam})=>activityApi.list(pageParam),getNextPageParam:(lastPage)=>lastPage.nextCursor??undefined});
  const items=query.data?.pages.flatMap((page)=>page.data)??[];
  return <div className="mx-auto max-w-3xl space-y-6"><header><p className="text-sm font-medium text-brand-700">Your history</p><h1 className="mt-1 text-3xl font-semibold">Activity</h1><p className="mt-2 text-ink-500">A private timeline of your progress and account updates.</p></header>
    {query.isPending?<div className="space-y-3" aria-label="Loading activity">{[1,2,3].map((n)=><div key={n} className="h-20 animate-pulse rounded-2xl bg-white" />)}</div>:query.isError?<div role="alert" className="rounded-2xl bg-white p-5">Could not load activity. <button className="ml-2 text-brand-700 underline" onClick={()=>void query.refetch()}>Retry</button></div>:<>
      <section className="rounded-2xl border border-black/5 bg-white p-5"><ol className="divide-y divide-black/5">{items.map(item=><li key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0"><span className="mt-0.5 rounded-full bg-brand-50 p-2 text-brand-700"><Activity className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="font-medium">{titles[item.kind]??'Account activity'}</p><p className="text-sm text-ink-500">{item.summaryCode.replaceAll('_',' ').toLowerCase()}</p><time className="mt-1 block text-xs text-ink-400">{new Date(item.occurredAt).toLocaleString()}</time></div></li>)}</ol>{items.length===0&&<p className="py-8 text-center text-sm text-ink-500">Your progress updates will appear here.</p>}</section>
      {query.hasNextPage&&<button className="mx-auto flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm" disabled={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()}><ChevronDown className="h-4 w-4"/>{query.isFetchingNextPage?'Loading…':'Load more'}</button>}
    </>}</div>;
}
