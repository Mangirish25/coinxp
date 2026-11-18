// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityPage } from './ActivityPage';

describe('ActivityPage',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('shows the empty timeline and pages through activity entries',async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:[{id:2,kind:'BADGE',refType:null,refId:null,occurredAt:'2026-11-02T00:00:00Z',summaryCode:'BADGE_UNLOCKED',data:{}}],nextCursor:'2',pageSize:1})}).mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:[],nextCursor:null,pageSize:1})});
    vi.stubGlobal('fetch',fetchMock); const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<QueryClientProvider client={client}><ActivityPage/></QueryClientProvider>);
    await waitFor(()=>expect(screen.getByText('Badge unlocked')).toBeTruthy());
    screen.getByRole('button',{name:'Load more'}).click();
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
    client.clear();
  });
});
