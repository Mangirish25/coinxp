// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GamificationToastHost } from './GamificationToastHost';

describe('NOT-004 toast preferences',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('mutes streak toasts while leaving the preference live-updatable',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({preferences:[{category:'STREAK',enabled:false}]})} as Response)));
    render(<GamificationToastHost userId={10}/>);
    await waitFor(()=>expect(fetch).toHaveBeenCalled());
    window.dispatchEvent(new CustomEvent('coinxp:streak-toast',{detail:{eventId:'streak-1',text:'Streak changed'}}));
    expect(screen.queryByRole('status')).toBeNull();
    window.dispatchEvent(new CustomEvent('coinxp:notification-preferences-changed',{detail:[{category:'STREAK',enabled:true}]}));
    window.dispatchEvent(new CustomEvent('coinxp:streak-toast',{detail:{eventId:'streak-2',text:'Streak changed'}}));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Streak changed'));
  });
});
