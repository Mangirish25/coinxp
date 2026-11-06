export interface HealthResponse {
  status: 'ok';
  db: 'connected';
  time: string;
}

export interface ApiErrorShape {
  error: { code: string; message: string };
}
