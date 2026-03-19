/**
 * VPS Database Client — Drop-in replacement for Supabase JS client
 * Mimics the Supabase chainable API (.from().select().eq().order() etc.)
 * All queries go through the VPS API generic endpoint
 */

const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function executeQuery(body: any): Promise<{ data: any; error: any; count?: number | null }> {
  try {
    const response = await fetch(`${VPS_API_BASE}/db/query`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      return { data: null, error: result.error || { message: `HTTP ${response.status}` } };
    }
    return { data: result.data, error: result.error || null, count: result.count ?? null };
  } catch (error: any) {
    return { data: null, error: { message: error.message || 'Network error' } };
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

  constructor(table: string) {
    this._table = table;
  }

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): this {
    this._operation = 'select';
    if (columns) this._select = columns;
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

    if (this._operation === 'select') {
      const { selectStr, joins } = this._parseSelect(this._select);
      body.select = selectStr;
      if (joins.length > 0) body.joins = joins;
      if (this._order.length > 0) body.order = this._order;
      if (this._limit !== null) body.limit = this._limit;
      body.single = this._single;
      if (this._count) body.count = this._count;
      if (this._head) body.head = true;
    } else if (this._operation === 'insert') {
      body.data = this._data;
    } else if (this._operation === 'update') {
      body.data = this._data;
      body.filters = this._filters;
    } else if (this._operation === 'upsert') {
      body.data = this._data;
      if (this._onConflict) body.onConflict = this._onConflict;
    } else if (this._operation === 'delete') {
      body.filters = this._filters;
    }

    const result = await executeQuery(body);

    // For maybeSingle, don't treat null as error
    if (this._single && result.data === null && !result.error) {
      return { data: null, error: null };
    }

    return result;
  }

  private _parseSelect(select: string): { selectStr: string; joins: any[] } {
    const joins: any[] = [];
    let selectStr = select;

    const relationPattern = /(\w+)\(([^)]+)\)/g;
    let match;
    const extraSelects: string[] = [];

    while ((match = relationPattern.exec(select)) !== null) {
      const joinTable = match[1];
      const joinColumns = match[2].split(',').map(c => c.trim());

      const fkColumn = `${this._table}.${joinTable.replace(/s$/, '')}_id`;
      const on = `${fkColumn} = ${joinTable}.id`;

      joins.push({ table: joinTable, type: 'left', on });

      for (const col of joinColumns) {
        extraSelects.push(`${joinTable}.${col} as ${joinTable}_${col}`);
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

  constructor(name: string) {
    this._name = name;
  }

  on(_event: string, _filter: any, _callback: (payload: any) => void): this {
    return this;
  }

  subscribe(): this {
    return this;
  }
}

/**
 * Invoke a VPS API function (replaces supabase.functions.invoke)
 * Routes to https://agenciapulse.tech/api/<functionName>
 */
async function invokeFunction(functionName: string, options?: { body?: any }): Promise<{ data: any; error: any }> {
  try {
    const response = await fetch(`${VPS_API_BASE}/${functionName}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
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
        const result = await response.json();
        if (!response.ok) {
          return { data: null, error: { message: result.error || 'Login failed' } };
        }
        if (result.token) {
          localStorage.setItem(TOKEN_KEY, result.token);
        }
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
