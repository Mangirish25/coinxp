export interface HealthResponse {
  status: 'ok';
  db: 'connected';
  time: string;
}

export interface ApiErrorShape {
  error: { code: string; message: string };
}

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
}
