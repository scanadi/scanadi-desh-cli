/** Message from CLI server → plugin via WS */
export interface BridgeRequest {
  id: string;
  type: 'exec';
  code: string;
  timeout: number;
}

/** Message from plugin → CLI server via WS */
export interface BridgeResponse {
  id: string;
  type: 'result' | 'error';
  value?: unknown;
  message?: string;
}

/** HTTP request body: CLI command → bridge server */
export interface ExecRequestBody {
  code: string;
  timeout?: number;
}

/** HTTP response body: bridge server → CLI command */
export interface ExecResponseBody {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Server status response */
export interface StatusResponse {
  ok: boolean;
  pluginConnected: boolean;
  uptime: number;
}

/** PID file contents */
export interface PidFile {
  pid: number;
  port: number;
  startedAt: string;
}

export const DEFAULT_BRIDGE_PORT = 9001;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const PID_FILE_DIR = '.desh';
export const PID_FILE_NAME = 'bridge.pid';
