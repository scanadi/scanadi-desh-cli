export interface CdpTab {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

export interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: {
    result?: { type?: string; value?: unknown; description?: string };
    exceptionDetails?: {
      text?: string;
      exception?: { value?: unknown; description?: string };
    };
  };
}

export interface EvalOptions {
  timeout?: number;
  awaitPromise?: boolean;
}
