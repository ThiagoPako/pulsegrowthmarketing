import { uploadFileToVps, getVpsMediaUrl, deleteFileFromVps } from '@/services/vpsApi';
/**
 * VPS Database Client — Drop-in replacement for Supabase JS client
 * Mimics the Supabase chainable API (.from().select().eq().order() etc.)
 * All queries go through the VPS API generic endpoint
 */

const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';
const CITY_KEY = 'pulse:active_city';

function getActiveCity(): string {
  if (typeof window === 'undefined') return 'minacu';
  const inMem = (window as any).__PULSE_ACTIVE_CITY__;
  if (inMem === 'minacu' || inMem === 'uruacu') return inMem;
  const v = localStorage.getItem(CITY_KEY);
  return v === 'uruacu' ? 'uruacu' : 'minacu';
}


function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-pulse-city': getActiveCity(),
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function refreshVpsSession(): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return false;

  try {
    const response = await fetch(`${VPS_API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-pulse-city': getActiveCity(),
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.token) return false;

    localStorage.setItem(TOKEN_KEY, payload.token);
    window.dispatchEvent(new CustomEvent('pulse:auth-token-refreshed', { detail: { token: payload.token } }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Authenticated fetch against the VPS API.
 * Adds JWT + city headers and retries once after refreshing an expired session.
 */
export async function vpsAuthedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${VPS_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const build = (): RequestInit => ({
    ...init,
    headers: { ...getAuthHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });

  let response = await fetch(url, build());
  if (response.status === 401 && (await refreshVpsSession())) {
    response = await fetch(url, build());
  }
  return response;
}



async function executeQuery(body: any): Promise<{ data: any; error: any; count?: number | null }> {
  try {
    let response = await fetch(`${VPS_API_BASE}/db/query`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (response.status === 401 && await refreshVpsSession()) {
      response = await fetch(`${VPS_API_BASE}/db/query`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
    }
    
    const contentType = response.headers.get('content-type') || '';
    let result: any;
    
    if (contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      console.error('VPS API returned non-JSON response:', text.slice(0, 200));
      return { 
        data: null, 
        error: { 
          message: 'O servidor da VPS retornou uma resposta inválida (HTML/Texto). Isso geralmente significa que a API está fora do ar ou o Nginx bloqueou a requisição.' 
        } 
      };
    }
    
    if (!response.ok) {
      console.error('VPS Query Error:', result.error || result.message || 'Unknown error');
      
      const errorMessage = typeof result.error === 'string' ? result.error : (result.error?.message || result.message || `HTTP ${response.status}`);
      if (errorMessage.includes('not allowed')) {
        return { 
          data: null, 
          error: { 
            message: `A tabela "${body.table}" não está liberada na API da sua VPS. Adicione-a ao ALLOWED_TABLES no arquivo server.mjs da VPS e reinicie a API.` 
          } 
        };
      }
      
      return { data: null, error: { message: errorMessage } };
    }
    
    return { data: result.data, error: result.error || null, count: result.count ?? null };
  } catch (error: any) {
    console.error('VPS Network/Execution Error:', error);
    return { data: null, error: { message: 'Erro de conexão com a VPS: ' + (error.message || 'Network error') } };
  }
}




type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in' | 'contains' | 'not' | 'or';

interface Filter {
  column: string;
  op: FilterOp;
  value: any;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
}

class QueryBuilder {
  private _table: string;
  private _operation: string = 'select';
  private _select: string = '*';
  private _filters: Filter[] = [];
  private _order: OrderSpec[] = [];
  private _limit: number | null = null;
  private _single: boolean = false;
  private _head: boolean = false;
  private _data: any = null;
  private _count: 'exact' | null = null;
  private _onConflict: string | null = null;
  private _returning: boolean = false;

  constructor(table: string) {
    this._table = table;
  }

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): this {
    // If called after insert/update/upsert, it means "RETURNING" — don't override operation
    if (this._operation === 'insert' || this._operation === 'update' || this._operation === 'upsert' || this._operation === 'delete') {
      this._returning = true;
      if (columns) this._select = columns;
    } else {
      this._operation = 'select';
      if (columns) this._select = columns;
    }
    if (options?.count) this._count = options.count;
    if (options?.head) this._head = true;
    return this;
  }

  insert(data: any): this {
    this._operation = 'insert';
    this._data = data;
    return this;
  }

  update(data: any): this {
    this._operation = 'update';
    this._data = data;
    return this;
  }

  delete(): this {
    this._operation = 'delete';
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }): this {
    this._operation = 'upsert';
    this._data = data;
    if (options?.onConflict) this._onConflict = options.onConflict;
    return this;
  }

  // Filter methods
  eq(column: string, value: any): this { this._filters.push({ column, op: 'eq', value }); return this; }
  neq(column: string, value: any): this { this._filters.push({ column, op: 'neq', value }); return this; }
  gt(column: string, value: any): this { this._filters.push({ column, op: 'gt', value }); return this; }
  gte(column: string, value: any): this { this._filters.push({ column, op: 'gte', value }); return this; }
  lt(column: string, value: any): this { this._filters.push({ column, op: 'lt', value }); return this; }
  lte(column: string, value: any): this { this._filters.push({ column, op: 'lte', value }); return this; }
  like(column: string, value: any): this { this._filters.push({ column, op: 'like', value }); return this; }
  ilike(column: string, value: any): this { this._filters.push({ column, op: 'ilike', value }); return this; }
  is(column: string, value: any): this { this._filters.push({ column, op: 'is', value }); return this; }
  in(column: string, value: any[]): this { this._filters.push({ column, op: 'in', value }); return this; }
  contains(column: string, value: any): this { this._filters.push({ column, op: 'contains', value }); return this; }

  /** .not('column', 'op', value) — negates a filter */
  not(column: string, op: string, value: any): this {
    this._filters.push({ column, op: 'not' as FilterOp, value: { op, value } });
    return this;
  }

  /** .or('col.eq.val,col2.eq.val2') — Supabase-style OR filter string */
  or(filterString: string): this {
    this._filters.push({ column: '_or', op: 'or' as FilterOp, value: filterString });
    return this;
  }

  // Ordering
  order(column: string, options?: { ascending?: boolean }): this {
    this._order.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  // Limit
  limit(count: number): this {
    this._limit = count;
    return this;
  }

  // Single result
  single(): this {
    this._single = true;
    this._limit = 1;
    return this;
  }

  maybeSingle(): this {
    this._single = true;
    this._limit = 1;
    return this;
  }

  // Execute: the builder is thenable so it works with await
  // Allow 0 args for fire-and-forget `.then()` pattern
  then(resolve?: (value: { data: any; error: any; count?: number | null }) => any, reject?: (reason: any) => any): Promise<any> {
    const p = this._execute();
    if (resolve || reject) {
      return p.then(resolve, reject);
    }
    return p;
  }

  private async _execute(): Promise<{ data: any; error: any; count?: number | null }> {
    const body: any = {
      table: this._table,
      operation: this._operation,
      filters: this._filters.length > 0 ? this._filters : undefined,
    };

    let joinTables: string[] = [];

    if (this._operation === 'select') {
      const { selectStr, joins } = this._parseSelect(this._select);
      body.select = selectStr;
      if (joins.length > 0) {
        body.joins = joins;
        joinTables = joins.map((j: any) => j.table);
      }
      if (this._order.length > 0) body.order = this._order;
      if (this._limit !== null) body.limit = this._limit;
      body.single = this._single;
      if (this._count) body.count = this._count;
      if (this._head) body.head = true;
    } else if (this._operation === 'insert') {
      body.data = this._data;
      if (this._returning) { body.returning = true; body.single = this._single; }
    } else if (this._operation === 'update') {
      body.data = this._data;
      body.filters = this._filters;
    } else if (this._operation === 'upsert') {
      body.data = this._data;
      if (this._onConflict) body.onConflict = this._onConflict;
      if (this._returning) { body.returning = true; body.single = this._single; }
    } else if (this._operation === 'delete') {
      body.filters = this._filters;
    }

    const result = await executeQuery(body);

    // Re-nest flattened join columns: { clients_company_name: 'X' } → { clients: { company_name: 'X' } }
    if (joinTables.length > 0 && result.data && !result.error) {
      const nestRow = (row: any) => {
        if (!row || typeof row !== 'object') return row;
        for (const jt of joinTables) {
          const prefix = `${jt}_`;
          const nested: Record<string, any> = {};
          let hasAny = false;
          for (const key of Object.keys(row)) {
            if (key.startsWith(prefix)) {
              nested[key.slice(prefix.length)] = row[key];
              delete row[key];
              hasAny = true;
            }
          }
          if (hasAny) row[jt] = nested;
        }
        return row;
      };
      if (Array.isArray(result.data)) {
        result.data.forEach(nestRow);
      } else {
        nestRow(result.data);
      }
    }

    // For maybeSingle, don't treat null as error
    if (this._single && result.data === null && !result.error) {
      return { data: null, error: null };
    }

    return result;
  }

  // Known FK column overrides for tables where the simple pattern doesn't work
  private static FK_MAP: Record<string, Record<string, string>> = {
    client_endomarketing_contracts: {
      endomarketing_packages: 'package_id',
      clients: 'client_id',
      profiles: 'partner_id',
    },
    endomarketing_partner_tasks: {
      clients: 'client_id',
      client_endomarketing_contracts: 'contract_id',
      profiles: 'partner_id',
    },
    content_tasks: {
      clients: 'client_id',
      profiles: 'assigned_to',
      scripts: 'script_id',
      recordings: 'recording_id',
    },
    design_tasks: {
      clients: 'client_id',
      profiles: 'assigned_to',
    },
    delivery_records: {
      clients: 'client_id',
      profiles: 'videomaker_id',
      recordings: 'recording_id',
    },
  };

  private _parseSelect(select: string): { selectStr: string; joins: any[] } {
    const joins: any[] = [];
    let selectStr = select;

    // Support both "table(cols)" and "table!fk_hint(cols)" patterns
    const relationPattern = /(\w+)(?:!(\w+))?\(([^)]+)\)/g;
    let match;
    const extraSelects: string[] = [];

    while ((match = relationPattern.exec(select)) !== null) {
      const joinTable = match[1];
      const fkHint = match[2] || null; // e.g. "design_tasks_assigned_to_fkey"
      const joinColumns = match[3].split(',').map(c => c.trim());

      // Resolve FK column: use FK map, then try to extract from FK hint, then fallback
      let fkColumn = QueryBuilder.FK_MAP[this._table]?.[joinTable];
      if (!fkColumn && fkHint) {
        // Extract column from FK hint like "design_tasks_assigned_to_fkey"
        // Pattern: tablename_columnname_fkey
        const hintMatch = fkHint.match(/^\w+?_(.+)_fkey$/);
        if (hintMatch) fkColumn = hintMatch[1];
      }
      if (!fkColumn) fkColumn = `${joinTable.replace(/s$/, '')}_id`;

      joins.push({
        table: joinTable,
        type: 'left',
        leftTable: this._table,
        leftColumn: fkColumn,
        rightTable: joinTable,
        rightColumn: 'id',
      });

      if (joinColumns.length === 1 && joinColumns[0] === '*') {
        // For wildcard joins, select all columns from joined table
        // The server will return them with the table prefix
        extraSelects.push(`${joinTable}.*`);
      } else {
        for (const col of joinColumns) {
          extraSelects.push(`${joinTable}.${col} as ${joinTable}_${col}`);
        }
      }

      selectStr = selectStr.replace(match[0], '').replace(/,\s*,/g, ',').replace(/,\s*$/, '').replace(/^\s*,/, '');
    }

    selectStr = selectStr.trim() || '*';
    if (selectStr === '*' && extraSelects.length > 0) {
      selectStr = `${this._table}.*, ${extraSelects.join(', ')}`;
    } else if (extraSelects.length > 0) {
      selectStr = `${selectStr}, ${extraSelects.join(', ')}`;
    }

    return { selectStr, joins };
  }
}

class RpcBuilder {
  private _functionName: string;
  private _args: any;
  private _single: boolean = false;

  constructor(functionName: string, args?: any) {
    this._functionName = functionName;
    this._args = args || {};
  }

  single(): this {
    this._single = true;
    return this;
  }

  then(resolve?: (value: { data: any; error: any }) => any, reject?: (reason: any) => any): Promise<any> {
    const p = this._execute();
    if (resolve || reject) return p.then(resolve, reject);
    return p;
  }

  private async _execute(): Promise<{ data: any; error: any }> {
    return executeQuery({
      table: '_rpc',
      operation: 'rpc',
      data: { function_name: this._functionName, args: this._args },
      single: this._single,
    });
  }
}

class ChannelBuilder {
  private _name: string;
  private _callbacks: Array<{ event: string; filter: any; callback: (payload: any) => void }> = [];
  private _socket: WebSocket | null = null;

  constructor(name: string) {
    this._name = name;
  }

  on(event: string, filter: any, callback: (payload: any) => void): this {
    this._callbacks.push({ event, filter, callback });
    return this;
  }

  subscribe(): this {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return this;

    // Connect to VPS WebSocket for realtime updates
    // WS URL structure matches the API base
    const wsUrl = VPS_API_BASE.replace('http', 'ws') + '/realtime';
    
    try {
      this._socket = new WebSocket(wsUrl);

      this._socket.onopen = () => {
        if (this._socket?.readyState === WebSocket.OPEN) {
          this._socket.send(JSON.stringify({
            type: 'subscribe',
            channel: this._name,
            token: token,
            events: this._callbacks.map(c => ({ event: c.event, filter: c.filter }))
          }));
        }
      };

      this._socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'broadcast' || payload.type === 'postgres_changes') {
            this._callbacks.forEach(c => {
              // Simple event matching
              if (c.event === '*' || c.event === payload.event) {
                c.callback(payload);
              }
            });
          }
        } catch (e) {
          console.warn('[realtime] Parse error:', e);
        }
      };

      this._socket.onclose = () => {
        // Simple reconnect after 5s
        setTimeout(() => this.subscribe(), 5000);
      };
    } catch (e) {
      console.error('[realtime] Connection error:', e);
    }
    return this;
  }
  
  unsubscribe() {
    if (this._socket) {
      this._socket.close();
      this._socket = null;
    }
  }
}

const activeChannels = new Map<string, ChannelBuilder>();

export const supabase = {
  // ... existing methods ...
  channel(name: string) {
    if (activeChannels.has(name)) return activeChannels.get(name)!;
    const chan = new ChannelBuilder(name);
    activeChannels.set(name, chan);
    return chan;
  },
  removeChannel(channel: ChannelBuilder) {
    channel.unsubscribe();
    // find key by value and delete
    for (const [k, v] of activeChannels.entries()) {
      if (v === channel) {
        activeChannels.delete(k);
        break;
      }
    }
  },
          console.error('WS parse error:', e);
        }
      };

      this._socket.onclose = () => {
        // Reconnect logic could be added here
      };

      this._socket.onerror = (err) => {
        console.error('WS error:', err);
      };

    } catch (e) {
      console.error('WS connection failed:', e);
    }

    return this;
  }

  unsubscribe() {
    if (this._socket) {
      this._socket.close();
      this._socket = null;
    }
  }

  /**
   * Send a broadcast message on this channel.
   * Server relays to all other subscribers of the same channel name.
   * Returns 'ok' if the frame was written, 'queued' if the socket is still connecting.
   */
  send(payload: { type?: string; event: string; payload?: any }): 'ok' | 'queued' | 'error' {
    const msg = JSON.stringify({
      type: 'broadcast',
      channel: this._name,
      event: payload.event,
      payload: payload.payload ?? null,
    });
    if (!this._socket) return 'error';
    if (this._socket.readyState === WebSocket.OPEN) {
      try { this._socket.send(msg); return 'ok'; } catch { return 'error'; }
    }
    if (this._socket.readyState === WebSocket.CONNECTING) {
      const sock = this._socket;
      const onOpen = () => { try { sock.send(msg); } catch { /* ignore */ } sock.removeEventListener('open', onOpen); };
      sock.addEventListener('open', onOpen);
      return 'queued';
    }
    return 'error';
  }
}

/**
 * Invoke a VPS API function (replaces supabase.functions.invoke)
 * Routes to https://agenciapulse.tech/api/<functionName>
 */
async function invokeFunction(functionName: string, options?: { body?: any }): Promise<{ data: any; error: any }> {
  try {
    let response = await fetch(`${VPS_API_BASE}/${functionName}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401 && await refreshVpsSession()) {
      response = await fetch(`${VPS_API_BASE}/${functionName}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
    }

    const data = await response.json();
    if (!response.ok) {
      return { data: null, error: data.error || { message: `HTTP ${response.status}` } };
    }
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message || 'Network error' } };
  }
}

/**
 * VPS Database client — drop-in replacement for Supabase client
 * Usage: import { supabase } from '@/lib/vpsDb';
 */
export const supabase = {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  },

  rpc(functionName: string, args?: any): RpcBuilder {
    return new RpcBuilder(functionName, args);
  },

  channel(name: string): ChannelBuilder {
    return new ChannelBuilder(name);
  },

  removeChannel(_channel: any): void {},

  // Functions namespace — replaces supabase.functions.invoke
  functions: {
    invoke: invokeFunction,
  },


  // Storage namespace — arquivos ficam na própria VPS (/uploads)
  storage: {
    from(bucket: string) {
      const folder = bucket.replace(/^\/+|\/+$/g, '');
      return {
        async upload(path: string, file: File | Blob, _options?: any) {
          try {
            const cleanPath = String(path).replace(/^\/+/, '');
            const parts = cleanPath.split('/');
            const filename = parts.pop() || `file-${Date.now()}`;
            const subFolder = [folder, ...parts].filter(Boolean).join('/');
            const realFile = file instanceof File ? file : new File([file], filename, { type: (file as Blob).type });
            const url = await uploadFileToVps(realFile, subFolder);
            return { data: { path: url, fullPath: url }, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message || 'Upload failed' } };
          }
        },
        getPublicUrl(path: string) {
          const clean = String(path || '').replace(/^\/+/, '');
          const full = clean.startsWith('http') ? clean : getVpsMediaUrl(`${folder}/${clean}`.replace(/^\/+/, ''));
          return { data: { publicUrl: full } };
        },
        async remove(paths: string[]) {
          try {
            for (const path of paths) {
              await deleteFileFromVps(String(path).startsWith('http') ? String(path) : `${folder}/${path}`);
            }
            return { data: null, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message || 'Delete failed' } };
          }
        },
      };
    },
  },

  // Auth namespace
  auth: {
    async getUser(): Promise<{ data: { user: any } | null; error: any }> {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return { data: null, error: { message: 'Not authenticated' } };
        const response = await fetch(`${VPS_API_BASE}/auth/me`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) return { data: null, error: { message: 'Not authenticated' } };
        const user = await response.json();
        return { data: { user }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },

    async getSession(): Promise<{ data: { session: any } | null; error: any }> {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return { data: { session: null }, error: null };
      return { data: { session: { access_token: token } }, error: null };
    },

    onAuthStateChange(callback: (event: string, session: any) => void): { data: { subscription: { unsubscribe: () => void } } } {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        callback('SIGNED_IN', { access_token: token });
      }
      return { data: { subscription: { unsubscribe: () => {} } } };
    },

    async signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user: any; session: any } | null; error: any }> {
      try {
        const response = await fetch(`${VPS_API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : await response.text().catch(() => '');

        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error)
            : response.status >= 500 || !contentType.includes('application/json')
              ? 'Servidor de autenticação indisponível no momento.'
              : 'Login failed';
          return { data: null, error: { message } };
        }

        if (!payload || typeof payload !== 'object' || !('token' in payload)) {
          return { data: null, error: { message: 'Resposta inválida do servidor de autenticação' } };
        }

        const result = payload as { token: string; user?: any; id?: string };
        localStorage.setItem(TOKEN_KEY, result.token);
        return {
          data: {
            user: result.user || { id: result.id, email: credentials.email },
            session: { access_token: result.token },
          },
          error: null,
        };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },

    async signOut(): Promise<{ error: any }> {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('pulse_user');
      return { error: null };
    },
  },
};

export default supabase;
