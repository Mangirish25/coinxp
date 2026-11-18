import { describe, expect, it } from 'vitest';
import { activityProjection } from './activityProjection.js';

describe('EVT-012 activity projection',()=>{
  it('projects transaction changes without storing amounts or descriptions',()=>{
    const item=activityProjection('TRANSACTION_UPDATED',{transactionId:8,changedFields:['amountPaise'],before:{type:'expense',amountPaise:100,description:'private'},after:{type:'expense',amountPaise:200,transactionDate:'2026-11-18'}});
    expect(item).toMatchObject({kind:'TRANSACTION',summaryCode:'TRANSACTION_UPDATED',data:{transactionId:8,changedFields:['amountPaise'],transactionDate:'2026-11-18'}});
    expect(item.data).not.toHaveProperty('amountPaise'); expect(item.data).not.toHaveProperty('description');
  });
});
