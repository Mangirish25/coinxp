export type ActivityItem = { id:number; kind:string; refType:string|null; refId:string|null; occurredAt:string; summaryCode:string; data:Record<string,unknown> };
export type ActivityPage = { data:ActivityItem[]; nextCursor:string|null; pageSize:number };
export type NotificationPreference = { category:string; enabled:boolean; mutable:boolean };
